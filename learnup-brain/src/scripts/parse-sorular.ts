/**
 * ÇIKMIŞ SORULAR (ÖSYM 2018-2025) PDF → JSON.
 *
 * KAYNAK YAPISI (deneysel olarak çıkarıldı, varsayım yok):
 *   • Sayfa İKİ SÜTUNLU. `pdftotext -layout` iki sütunu AYNI SATIRA basar → 1. ve 3. soru
 *     iç içe geçer. Bu yüzden sütunlar AYRI AYRI kırpılarak çıkarılır (bkz. extract-sorular.sh):
 *        <ad>.hdr.txt  → sayfa üstbilgisi (DERS ADI)
 *        <ad>.L.txt    → sol sütun gövdesi
 *        <ad>.R.txt    → sağ sütun gövdesi
 *     Okuma sırası: sayfa başına  SOL sütun tamamı → SAĞ sütun tamamı.
 *   • Soru numarası HER DERSTE 1'den başlar.
 *   • Her sorunun sonunda kaynak etiketi: "2019-TYT" / "2021-AYT".
 *   • CEVAP ANAHTARI belgenin SONUNDA, ders başlıklarıyla: "FİZİK" → "1. E  2. B  3. C …"
 *     (tam sayfa genişliğinde olduğu için sütun kırpımından DEĞİL, ham <ad>.txt'ten okunur.)
 *
 * ⚠️ ŞEKİLLİ SORULAR: pdftotext şekli/grafiği ÇIKARAMAZ. Şekle dayanan soru metne dönünce
 *    sakatlanır ("Yukarıdaki şekle göre…" ama şekil yok). Böyle soruları UYDURMUYORUZ →
 *    KARANTİNAYA alıp ayrı raporluyoruz. Karar kullanıcınındır.
 *
 * ⚠️ ORTAK SORULAR: AYT SAY ile AYT EA'nın Matematik'i, EA ile SÖZ'ün Edebiyat/Tarih/Coğrafya'sı
 *    AYNI sorulardır. Metin bazlı tekilleştirme (dedup) yapılır — aynı soru iki kez basılmaz.
 *
 * 🛡️ DOĞRULAMA: her ders için çıkarılan soru sayısı, belgenin KENDİ cevap anahtarındaki
 *    cevap sayısıyla karşılaştırılır. Tutmazsa JSON ÜRETİLMEZ.
 *
 * KULLANIM:
 *   bun src/scripts/parse-sorular.ts --dir data/questions --out data/sorular.json
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'

const argv = process.argv.slice(2)
const arg = (n: string): string | undefined => {
  const i = argv.indexOf(`--${n}`)
  return i >= 0 ? argv[i + 1] : undefined
}
const DIR = arg('dir') ?? 'data/questions'
const OUT = arg('out') ?? 'data/sorular.json'

// ── Üstbilgideki ders adı → DB'deki subject (curriculum_nodes.subject ile AYNI yazım) ──
const DERS: Record<string, string> = {
  'TÜRKÇE': 'Türkçe',                                     // ⚠ TYT Türkçe — DB'de müfredatı YOK (Edebiyat ayrı ders)
  'TÜRK DİLİ VE EDEBİYATI': 'Türk Dili ve Edebiyatı',
  'TARİH': 'Tarih',
  'COĞRAFYA': 'Coğrafya',
  'FELSEFE': 'Felsefe',
  // AYT Felsefe grubu ayrı ALT TESTLERDEN oluşuyor. Bunları tanımazsam üstbilgi "Felsefe"de
  // kalır ve Sosyoloji/Psikoloji/Mantık soruları Felsefe'nin üstüne yığılır → CEVAPLAR KAYAR.
  // (Müfredatları DB'de henüz yok → kazanım bağlanmaz; ama sorular bozulmaz.)
  'SOSYOLOJİ': 'Sosyoloji',
  'PSİKOLOJİ': 'Psikoloji',
  'MANTIK': 'Mantık',
  'DİN KÜLTÜRÜ VE AHLAK BİLGİSİ': 'Din Kültürü ve Ahlak Bilgisi',
  'MATEMATİK': 'Matematik',
  'GEOMETRİ': 'Matematik',
  'FİZİK': 'Fizik',
  'KİMYA': 'Kimya',
  'BİYOLOJİ': 'Biyoloji',
  'T.C. İNKILAP TARİHİ VE ATATÜRKÇÜLÜK': 'T.C. İnkılap Tarihi ve Atatürkçülük',
}
// ⚠️ Ders adı tespiti — İKİ tuzak var, ikisi de ölçülerek bulundu:
//   1) Üstbilgi ders adını yalnız başına vermiyor: "TYT TÜRKÇE", hatta bozuk dizgiyle
//      "TÜRKÇE TYT MI K TES ÇIK Lİ Lİ TE R MEL YETE" → TAM EŞLEŞME değil, İÇİNDE ARAMA.
//   2) PDF font artefaktı: cevap anahtarında başlık "TARIH" (NOKTASIZ I) yazıyor, "TARİH" değil.
//      Bu yüzden Tarih hiç yakalanmadı ve 40 cevabı Türkçe'ye eklendi (320 soru ↔ 360 cevap).
//      → Karşılaştırma ASCII'ye KATLANARAK yapılır (İ/I, ı/i ayrımı ortadan kalkar).
const TR_FOLD: Record<string, string> = { Ç: 'C', Ğ: 'G', İ: 'I', Ö: 'O', Ş: 'S', Ü: 'U' }
const fold = (s: string): string =>
  [...s.toUpperCase()].map((c) => TR_FOLD[c] ?? c).join('').replace(/\s+/g, ' ').trim()

const DERS_ARAMA = Object.keys(DERS)
  .map((k) => [fold(k), DERS[k]] as const)
  .sort((a, b) => b[0].length - a[0].length)     // en UZUN önce: "TARIH" ⊂ "INKILAP TARIHI…"

const normDers = (h: string): string | null => {
  const k = fold(h)
  if (!k) return null
  for (const [ara, ad] of DERS_ARAMA) if (k.includes(ara)) return ad
  return null
}

// ── Satır sonu tirelemesi onarımı (DÖP parser'ıyla aynı kural) ──
const appendFrag = (acc: string, p: string): string => {
  if (!acc) return p
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]-$/.test(acc)) {
    return /^[a-zçğıöşü]/.test(p) ? acc.slice(0, -1) + p : acc + p
  }
  return acc + ' ' + p
}
const joinLines = (a: string[]): string => a.reduce(appendFrag, '').replace(/\s+/g, ' ').trim()

type Soru = {
  subject: string
  konu: string            // belgenin kendi konu başlığı ("Sözcükte Anlam") — kazanım etiketlemede ipucu
  kaynak: string          // "2019-TYT"
  yil: number
  sinav: string           // TYT | AYT
  no: number              // ders içindeki soru numarası
  question_text: string
  options: Record<string, string>
  correct_option: string
  sekilli: boolean        // şekil/grafik/tablo gerektiriyor mu (karantina)
  pdf: string
}

const RE_YIL = /(\d{4})\s*-\s*(TYT|AYT)/
const RE_SORU = /^\s{0,6}(\d{1,3})\.\s+(\S.*)$/

/**
 * Bu metin GERÇEKTEN bir konu başlığı mı?
 *
 * Soru numarasından önceki her satır başlık DEĞİL. Ölçülen kirlilik:
 *   • Matematik/Kimya'da formüller sayfaya dağınık yerleşiyor, önceki sorunun formül kuyruğu düşüyor:
 *       "Z] ]] 10 - x 2 , x < 0 ]]"  ·  "2 2 sec x - tan x - cos (2x)"  ·  "3r"  ·  "1 1 6 8 9"
 *   • Kapak/üstbilgi süsü sızıyor:
 *       "K TESTİ MIŞ ÇIK Lİ Lİ TE R MEL YETE Hz. Muhammed'in Şahsiyeti"
 *   • Dipnotlar: "* Din Kültürü ve Ahlak Bilgisi dersi yerine"
 * Bunlar DB'ye topic olarak yazılırdı. Reddedilirse bir ÖNCEKİ geçerli başlık korunur.
 */
function konuTemizle(s: string): string {
  return s
    // Kitapçıkta tekrar eden dipnot; gerçek konu başlığının ÖNÜNE yapışıyor:
    //   "* Din Kültürü ve Ahlak Bilgisi dersi yerine Sosyalleşme" → "Sosyalleşme"
    .replace(/^\*?\s*Din Kültürü ve Ahlak Bilgisi dersi yerine\s*/i, '')
    // Kapak/üstbilgi süsü: baştaki ARDIŞIK BÜYÜK HARFLİ kısa parçalar (≥3 tane).
    //   "K TESTİ MIŞ ÇIK Lİ Lİ TE R MEL YETE Hz. Muhammed'in Şahsiyeti" → "Hz. Muhammed'in Şahsiyeti"
    //   (Gerçek konu başlıkları Başlık Düzeninde yazılır, TAMAMI BÜYÜK harf değildir → güvenli.)
    .replace(/^(?:[A-ZÇĞİÖŞÜ]{1,6}[.,]?\s+){3,}/, '')
    .trim()
}

function konuGecerli(s: string): boolean {
  const t = s.trim()
  if (t.length < 5 || t.length > 80) return false
  if (/[$\][&=<>~^|\\]/.test(t)) return false          // matematik/dizgi sembolü → formül artığı
  if (/^[*•]/.test(t)) return false                    // dipnot
  if (/[A-E]\)/.test(t)) return false                  // şık sızıntısı
  const harf = (t.match(/[A-Za-zÇĞİIÖŞÜçğıöşü]/g) ?? []).length
  if (harf / t.length < 0.7) return false              // sayı/sembol ağırlıklı → başlık değil
  if (!/[a-zçğıöşü]{3}/.test(t)) return false          // hiç gerçek kelime yok (sadece büyük harf artığı)
  // Dekoratif BÖLÜNMÜŞ metin: çok sayıda 1-2 harflik parça ("Lİ Lİ TE R MEL YETE")
  const tok = t.split(/\s+/)
  const kisa = tok.filter((w) => w.length <= 2).length
  if (tok.length >= 4 && kisa / tok.length > 0.35) return false
  return true
}
const RE_SIK_SATIR = /(?:^|\s)([A-E])\)\s/
// Şekil/grafik bağımlılığı — metinde açıkça görsel referansı var mı?
const RE_SEKIL = /(şekil|şekild|grafik|tablo|görsel|çizim|harita|yukarıdaki resim|aşağıdaki resim|diyagram|görselde)/i

// ═══════════════════════════════════════════════════════════════════════════
// 1) CEVAP ANAHTARI — ham <ad>.txt'ten (tam sayfa genişliği)
// ═══════════════════════════════════════════════════════════════════════════
type Bolum = { ders: string; cevap: Map<number, string> }

function parseCevaplar(txtPath: string): Bolum[] {
  const t = readFileSync(txtPath, 'utf8')
  // ⚠️ Map<ders, …> OLAMAZ: bir ders sınavda BİRDEN ÇOK BÖLÜM olabiliyor (AYT SÖZ: Tarih-1 ve
  //    Tarih-2, Coğrafya-1 ve Coğrafya-2) ve numaralar her bölümde 1'den başlar. Tek map'te
  //    ikinci bölümün cevapları birincisinin ÜSTÜNE yazar (ölçüldü: gövde 167, anahtar 88).
  //    → Bölümler BELGE SIRASIYLA bir LİSTE'de tutulur; gövdedeki k'ncı Tarih bölümü,
  //      anahtardaki k'ncı Tarih bölümüyle eşleşir.
  const out: Bolum[] = []
  const tumLines = t.split(/\r?\n/)

  // Anahtar bölümünün BAŞLANGICI:
  //   ⚠️ lastIndexOf KULLANILAMAZ — "CEVAP ANAHTARI" anahtar bölümünde HER SAYFADA tekrar eder;
  //      sonuncusuna atlarsak ilk derslerin cevapları kaybolur ve kalan sayı-harf çiftleri
  //      tek derse yığılır (ölçüldü: AYT-EA'da Matematik'e 310 cevap yazıldı).
  //   ⚠️ İLK geçiş de olmaz — İÇİNDEKİLER'de de geçiyor ("CEVAP ANAHTARI ....... 202").
  //      İçindekiler satırı NOKTA DİZİSİYLE belli olur → onu ele, ilk GERÇEK başlığı al.
  const bas = tumLines.findIndex((l) => /CEVAP ANAHTARI/.test(l) && !/\.{4,}/.test(l))
  if (bas < 0) return out

  let cur: Bolum | null = null
  for (const l of tumLines.slice(bas)) {
    const d = normDers(l)
    if (d) {
      // Aynı ders başlığı ARKA ARKAYA tekrar edebilir (sayfa üstbilgisi) → yeni bölüm AÇMA.
      // Yeni bölüm yalnız ders DEĞİŞTİĞİNDE açılır.
      if (!cur || cur.ders !== d) { cur = { ders: d, cevap: new Map() }; out.push(cur) }
      continue
    }
    if (!cur) continue
    // "1. E   2. B   3. C"  (kaynakta "51.. E" gibi dizgi hatası var → nokta tekrarına izin ver)
    for (const m of l.matchAll(/\b(\d{1,3})\.+\s*([A-E])\b/g)) {
      cur.cevap.set(Number(m[1]), m[2])
    }
  }
  return out.filter((b) => b.cevap.size > 0)
}

// ═══════════════════════════════════════════════════════════════════════════
// 2) SÜTUN FARKINDALIKLI GÖVDE AKIŞI — sayfa başına: üstbilgi + SOL + SAĞ
// ═══════════════════════════════════════════════════════════════════════════
type Sayfa = { no: number; ders: string | null; lines: string[] }

function buildStream(base: string): Sayfa[] {
  const pages = (p: string): string[] => readFileSync(p, 'utf8').split('\f')
  const H = pages(`${base}.hdr.txt`)
  const L = pages(`${base}.L.txt`)
  const R = pages(`${base}.R.txt`)
  const n = Math.max(H.length, L.length, R.length)
  const out: Sayfa[] = []
  let basladi = false                                // en az bir ders sayfası gördük mü?
  for (let i = 0; i < n; i++) {
    const hdr = (H[i] ?? '').replace(/\s+/g, ' ').trim()
    const govde = `${L[i] ?? ''}\n${R[i] ?? ''}`

    // ⛔ CEVAP ANAHTARI sayfalarında DUR — içerikleri "1. E   2. B   3. C" biçiminde,
    //    soru başlangıcı regexine benzer ve akışı kirletir. (Anahtar ham .txt'ten okunuyor.)
    //    ⚠️ Metinde "CEVAP ANAHTARI" ifadesini ARAMAK YETMEZ: İÇİNDEKİLER sayfasında da geçiyor
    //       ("CEVAP ANAHTARI ....... 364") ve akışı daha BAŞLAMADAN keser. Bu yüzden:
    //       (a) yalnız gövde başladıktan sonra bak, (b) ölçüt = cevap deseni YOĞUNLUĞU.
    const cevapDeseni = [...govde.matchAll(/\b\d{1,3}\.+\s+[A-E]\b/g)].length
    if (basladi && cevapDeseni >= 8) break           // soru sayfasında bu yoğunluk oluşmaz
    if (normDers(hdr)) basladi = true

    out.push({
      no: i + 1,
      ders: normDers(hdr),
      lines: [...(L[i] ?? '').split(/\r?\n/), ...(R[i] ?? '').split(/\r?\n/)],
    })
  }
  return out
}

// ═══════════════════════════════════════════════════════════════════════════
// 3) SORU AYRIŞTIRMA
// ═══════════════════════════════════════════════════════════════════════════
function parseSorular(sayfalar: Sayfa[], bolumler: Bolum[], pdfAd: string): {
  sorular: Soru[]
  cevapsiz: string[]
  numaraCakismasi: string[]
  sikBozuk: Map<string, number>       // ders → şıkları çıkarılamayan soru sayısı (KARANTİNA)
} {
  const sorular: Soru[] = []
  const cevapsiz: string[] = []
  const sikBozuk = new Map<string, number>()
  // Sıra (okuma sırası) ile belgedeki soru numarası tutmuyorsa → hizalama bozuk, cevaplar KAYAR.
  // Bu, sessizce yanlış cevap basmanın tek yolu; bu yüzden AYRI raporlanır ve BLOKLAR.
  const numaraCakismasi: string[] = []

  // ═══════════════════════════════════════════════════════════════════════
  // BLOK SINIRI = YIL ETİKETİ ("2019-TYT"), soru numarası DEĞİL.
  //
  // NEDEN: numara sırasına dayanmak KIRILGAN — tek bir soru kaçırılınca dersin GERİ KALANI
  //   tamamen düşüyordu (ölçüldü: Tarih 17'de koptu → 39 sorunun 23'ü kayboldu; Matematik
  //   153'te koptu → 166 soru kayboldu). Ayrıca soru İÇİNDEKİ tablolar ("1. Kat") numara
  //   sanılıyordu (Biyoloji'de 47 gerçek soruya karşı 239 sahte "numara").
  //
  // Yıl etiketi ise HER sorunun sonunda var ve sayısı cevap anahtarıyla BİREBİR tutuyor:
  //   Matematik 319=319 · Fizik 56=56 · Kimya 54=54 · Biyoloji 47=47 · Coğrafya 40=40 …
  // Okuma sırası (sol sütun → sağ sütun) cevap anahtarı sırasıyla aynı olduğundan,
  // bir dersin k'ncı bloğu = k'ncı sorusudur. Numara yalnız ÇAPRAZ KONTROL için okunur.
  // ═══════════════════════════════════════════════════════════════════════
  // ⚠️ BÖLÜM kavramı şart: bir ders sınavda BİRDEN ÇOK bölüm olabiliyor (AYT SÖZ'de Tarih-1 ve
  //    Tarih-2, Coğrafya-1 ve Coğrafya-2). Numara her bölümde 1'den başlar. Gövdedeki k'ncı
  //    "Tarih" bölümü, cevap anahtarındaki k'ncı "Tarih" bölümüyle eşlenir.
  let ders: string | null = null
  type Blok = { ders: string; bolumIdx: number; sira: number; lines: string[]; konu: string }
  const bloklar: Blok[] = []
  let buf: string[] = []
  let sira = 0
  let bolumIdx = -1                                     // gövdedeki kaçıncı bölümdeyiz
  const gorulenBolum = new Map<string, number>()        // ders → kaç kez bölüm açıldı

  let sonKonu = ''            // "Sözcükte Anlam", "20. Yüzyıl Başlarında Osmanlı Devleti ve Dünya"…

  const kapat = (d: string): void => {
    if (!buf.length) return
    const hedef = sira + 1

    // ⚠️ Blok başında KONU BAŞLIĞI olabiliyor ve o da numarayla başlayabiliyor:
    //      "20. Yüzyıl Başlarında Osmanlı Devleti ve Dünya"   ← başlık
    //      "49. Aşağıda Mustafa Kemal Atatürk'ün okuduğu…"    ← gerçek soru
    //    "ilk numaralı satır" kuralı başlığı soru sanar → hem sahte numara çakışması üretir
    //    hem BAŞLIK METNİNİ SORUYA YAPIŞTIRIR. Sıra zaten biliniyor → BEKLENEN numarayı ara.
    const RE_HEDEF = new RegExp(`^\\s{0,6}${hedef}\\.\\s`)
    let bas = buf.findIndex((l) => RE_HEDEF.test(l))
    if (bas < 0) bas = buf.findIndex((l) => RE_SORU.test(l))   // bulunamazsa eski kural (çakışma raporlanır)

    // Soru numarasından ÖNCEKİ satırlar = konu başlığı (belge "konulara göre düzenlenmiş").
    // ⚠️ AMA her önceki satır başlık DEĞİL. Matematik/Kimya sayfalarında formüller sayfaya dağınık
    //    yerleşiyor ve önceki sorunun formül kuyruğu buraya düşüyordu. Ölçüldü — üretilen "konular":
    //      "Z] ]] 10 - x 2 , x < 0 ]]"  ·  "2 2 sec x - tan x - cos (2x)"  ·  "13"  ·  "3r"
    //      "* Din Kültürü ve Ahlak Bilgisi dersi yerine"   ← dipnot
    //    Bunlar DB'ye topic olarak yazılırdı. Başlık gibi GÖRÜNMEYENİ reddet, öncekini koru.
    if (bas > 0) {
      const ham = buf.slice(0, bas)
      let basl = konuTemizle(joinLines(ham))
      // ⚠️ Matematik'te başlık ÇOK SATIRLI ve HİYERARŞİK:
      //      "Denklem ve Eşitsizlikler" / "• Sayı Kümeleri" / "• Temel İşlemler" / …
      //    Hepsi birleşince 80 krk sınırını aşıyor ve elenip konu BOŞ kalıyordu
      //    (ölçüldü: 154 Matematik sorusu konusuz). Birleşik hâli geçersizse ÜST DÜZEY satırı al.
      if (!konuGecerli(basl) && ham.length) basl = konuTemizle(ham[0].trim())
      if (basl && konuGecerli(basl)) sonKonu = basl
    }

    const lines = bas >= 0 ? buf.slice(bas) : buf
    bloklar.push({ ders: d, bolumIdx, sira: ++sira, lines, konu: sonKonu })
    buf = []
  }

  for (const s of sayfalar) {
    if (s.ders && s.ders !== ders) {                    // YENİ BÖLÜM
      buf = []                                          // yarım kalan artık atılır
      ders = s.ders
      sira = 0                                          // numara bölüm başında 1'den başlar
      // ⚠️ KONU BAŞLIĞI DA SIFIRLANMALI. Aksi hâlde önceki dersin son konusu yeni derse taşınır:
      //    ölçüldü — 154 MATEMATİK sorusu "20. Yüzyıl Filozoflarının Görüşleri" (Felsefe konusu)
      //    etiketiyle çıkmıştı. Yeni dersin ilk konu başlığı gelene kadar konu BOŞ kalır.
      sonKonu = ''
      bolumIdx = gorulenBolum.get(ders) ?? 0
      gorulenBolum.set(ders, bolumIdx + 1)
    }
    if (!ders) continue

    for (const raw of s.lines) {
      const txt = raw.trim()
      if (!txt) continue
      if (/^\d{1,3}\s+YKS Çıkmış Sorular$/.test(txt)) continue      // sayfa altbilgisi
      buf.push(raw)
      if (RE_YIL.test(txt)) kapat(ders)                             // yıl etiketi → soru bitti
    }
  }

  /** Anahtardaki k'ncı <ders> bölümünü bul. */
  const cevapBolumu = (d: string, k: number): Map<number, string> | null => {
    const ayni = bolumler.filter((b) => b.ders === d)
    return ayni[k]?.cevap ?? null
  }

  // Blokları soru + şık + cevaba çevir
  for (const b of bloklar) {
    const full = joinLines(b.lines)

    const yil = RE_YIL.exec(full)
    // Belgedeki soru numarası — ÇAPRAZ KONTROL için (sıra ile tutmalı). Gövdeden de temizlenir.
    const noM = /^\s*(\d{1,3})\.\s+/.exec(full)
    const belgeNo = noM ? Number(noM[1]) : 0
    if (belgeNo && belgeNo !== b.sira) numaraCakismasi.push(`${b.ders}: sıra ${b.sira} ↔ belge #${belgeNo}`)

    const govde = full.replace(RE_YIL, '').replace(/^\s*\d{1,3}\.\s+/, '').trim()

    // Şıkları ayır: ilk "A)" işaretinden itibaren
    const aIdx = govde.search(/(?:^|\s)A\)\s/)
    if (aIdx < 0) { sikBozuk.set(b.ders, (sikBozuk.get(b.ders) ?? 0) + 1); continue }   // şık hiç çıkmadı
    const stem = govde.slice(0, aIdx).trim()
    const sikBolge = govde.slice(aIdx)

    const options: Record<string, string> = {}
    const parcalar = [...sikBolge.matchAll(/(?:^|\s)([A-E])\)\s*/g)]
    for (let i = 0; i < parcalar.length; i++) {
      const harf = parcalar[i][1]
      const bas = parcalar[i].index! + parcalar[i][0].length
      const son = i + 1 < parcalar.length ? parcalar[i + 1].index! : sikBolge.length
      options[harf] = sikBolge.slice(bas, son).trim()
    }
    // 5 şık tam değilse → KARANTİNA. (Formül/sembol ağırlıklı Matematik-Fizik sorularında
    // pdftotext şıkları bozuyor. Bunlar hata değil, kullanılamaz veri → sayılır, uydurulmaz.)
    if (!['A', 'B', 'C', 'D', 'E'].every((h) => options[h])) {
      sikBozuk.set(b.ders, (sikBozuk.get(b.ders) ?? 0) + 1)
      continue
    }

    const dogru = cevapBolumu(b.ders, b.bolumIdx)?.get(b.sira)
    if (!dogru) { cevapsiz.push(`${b.ders} #${b.sira}`); continue }     // cevap yok → BASILMAZ

    sorular.push({
      subject: b.ders,
      konu: b.konu,
      kaynak: yil ? `${yil[1]}-${yil[2]}` : '',
      yil: yil ? Number(yil[1]) : 0,
      sinav: yil ? yil[2] : '',
      no: b.sira,
      question_text: stem,
      options,
      correct_option: dogru,
      sekilli: RE_SEKIL.test(stem),
      pdf: pdfAd,
    })
  }
  return { sorular, cevapsiz, numaraCakismasi, sikBozuk }
}

// ═══════════════════════════════════════════════════════════════════════════
// ÇALIŞTIR
// ═══════════════════════════════════════════════════════════════════════════
const pdfler = readdirSync(DIR).filter((f) => f.endsWith('.pdf')).map((f) => basename(f, '.pdf'))
if (!pdfler.length) { console.error(`⛔ ${DIR} içinde PDF yok.`); process.exit(1) }

const hepsi: Soru[] = []
const rapor: Array<{ pdf: string; ders: string; cikan: number; bozuk: number; cevap: number; durum: string }> = []
const tumCevapsiz: string[] = []
const tumCakisma: string[] = []
let toplamBozuk = 0

for (const p of pdfler) {
  const base = join(DIR, p)
  const bolumler = parseCevaplar(`${base}.txt`)
  const sayfalar = buildStream(base)
  const { sorular, cevapsiz, numaraCakismasi, sikBozuk } = parseSorular(sayfalar, bolumler, p)
  tumCevapsiz.push(...cevapsiz.map((c) => `${p}: ${c}`))
  tumCakisma.push(...numaraCakismasi.map((c) => `${p}: ${c}`))

  // DÜRÜST MUHASEBE: çıkan + şık-bozuk(karantina) = cevap anahtarındaki soru sayısı olmalı.
  // Aksi hâlde SESSİZ kayıp/fazla var demektir → JSON üretilmez.
  const cikanSay = new Map<string, number>()
  for (const s of sorular) cikanSay.set(s.subject, (cikanSay.get(s.subject) ?? 0) + 1)
  const anahtarSay = new Map<string, number>()
  for (const b of bolumler) anahtarSay.set(b.ders, (anahtarSay.get(b.ders) ?? 0) + b.cevap.size)

  for (const [ders, beklenen] of anahtarSay) {
    const cikan = cikanSay.get(ders) ?? 0
    const bozuk = sikBozuk.get(ders) ?? 0
    toplamBozuk += bozuk
    const fark = cikan + bozuk - beklenen
    rapor.push({
      pdf: p, ders, cikan, bozuk, cevap: beklenen,
      durum: fark === 0 ? '✓' : `✗ ${fark > 0 ? '+' : ''}${fark}`,
    })
  }
  hepsi.push(...sorular)
}

// ── TEKİLLEŞTİRME: aynı soru birden çok PDF'de (AYT SAY ↔ EA Matematik, EA ↔ SÖZ Edebiyat…) ──
const key = (s: Soru): string =>
  createHash('sha1').update(s.question_text.toLowerCase().replace(/[^a-zçğıöşü0-9]/gi, '')).digest('hex')
const gorulen = new Map<string, Soru>()
let tekrar = 0
for (const s of hepsi) {
  const k = key(s)
  if (gorulen.has(k)) { tekrar++; continue }
  gorulen.set(k, s)
}
const benzersiz = [...gorulen.values()]

// ═══════════════════════════════════════════════════════════════════════════
// RAPOR
// ═══════════════════════════════════════════════════════════════════════════
console.log('\n=== ÇIKMIŞ SORULAR — AYRIŞTIRMA RAPORU ===\n')
console.log('PDF                                  DERS                           ÇIKAN  BOZUK  ANAHTAR  DURUM')
console.log('-'.repeat(96))
for (const r of rapor) {
  console.log(`${r.pdf.slice(0, 36).padEnd(36)} ${r.ders.slice(0, 30).padEnd(30)} ${String(r.cikan).padStart(5)} ${String(r.bozuk).padStart(6)} ${String(r.cevap).padStart(8)}  ${r.durum}`)
}

const hatali = rapor.filter((r) => r.durum !== '✓')
console.log('-'.repeat(88))
console.log(`Ham soru       : ${hepsi.length}`)
console.log(`Tekrar (ortak) : ${tekrar}   ← AYT SAY/EA Matematik, EA/SÖZ Edebiyat vb.`)
console.log(`BENZERSİZ      : ${benzersiz.length}`)

const sekilli = benzersiz.filter((s) => s.sekilli)
console.log(`\nŞEKİL/GRAFİK gerektiren (KARANTİNA): ${sekilli.length}`)
const sekilDers = new Map<string, number>()
for (const s of sekilli) sekilDers.set(s.subject, (sekilDers.get(s.subject) ?? 0) + 1)
for (const [d, n] of [...sekilDers.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${d.padEnd(32)} ${n}`)

const temiz = benzersiz.filter((s) => !s.sekilli)
console.log(`\nMETİN-YETERLİ (basılabilir)        : ${temiz.length}`)

if (tumCevapsiz.length) {
  console.log(`\n⚠ CEVABI BULUNAMAYAN (BASILMADI)  : ${tumCevapsiz.length}`)
  tumCevapsiz.slice(0, 8).forEach((c) => console.log(`    ${c}`))
  if (tumCevapsiz.length > 8) console.log(`    … +${tumCevapsiz.length - 8}`)
}

if (tumCakisma.length) {
  console.error(`\n⛔ ${tumCakisma.length} soruda OKUMA SIRASI ile BELGEDEKİ NUMARA tutmuyor.`)
  console.error('   Bu, cevapların KAYMASI demektir — yanlış cevap basmaktansa hiç basmam.')
  tumCakisma.slice(0, 10).forEach((c) => console.error(`    ${c}`))
  if (tumCakisma.length > 10) console.error(`    … +${tumCakisma.length - 10}`)
  process.exit(1)
}

if (hatali.length) {
  console.error(`\n⛔ ${hatali.length} ders/PDF'te soru sayısı cevap anahtarıyla UYUŞMUYOR.`)
  console.error('   Sessizce eksik/fazla veri yazmamak için JSON ÜRETİLMEDİ.')
  process.exit(1)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(benzersiz, null, 2), 'utf8')
console.log(`\n✓ JSON yazıldı → ${OUT}  (${benzersiz.length} benzersiz soru)`)
