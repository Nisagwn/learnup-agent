import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabase } from '../clients/supabase.js'
import { redis } from '../clients/redis.js'
import { TEMP } from './models.js'
import { routedChat, jsonCoz, type LlmPriority } from './model-router.js'
import { embed, retrieveGrounding, retrieveExemplars, type GroundingChunk, type Exemplar } from './rag.js'
import {
  OSYM_YAZAR_SYSTEM,
  OSYM_DENETCI_SYSTEM,
  denetciIstemi,
  onarimIstemi,
  dersAilesi,
  zorlukAnahtari,
  ZORLUK_TARIFI,
  MEKANIZMALAR,
} from '../persona/osym.charter.js'
import { siklariDuzenle, celdiriciKusatmasi, sikUzunlukSizintisi, sayisalNormalize } from '../utils/shufflers.js'
import { matematigiDuzelt, soruLatexBozuk } from '../utils/latex.js'
import { shingleKumesi, kumeBenzerligi, ozgunlukEsigi, kokBenzerligi } from '../utils/benzerlik.js'
import { esikleriTazele } from './ozgunluk-esik.js'
import { mapLimit } from '../utils/concurrency.js'
import { logger } from '../utils/logger.js'

/** Aynı anda kaç aday DENETLENSİN. Router'ın sağlayıcı-dakika tavanının üstünde ek kat;
 *  makro/büyük count'ta RPM/TPM taşmasını önler. Env ile ayarlanır (varsayılan 4). */
const VERIFY_ESZAMAN = Number(process.env.GEN_VERIFY_CONCURRENCY) || 4

/** Kod kapısı çeldirici kuşatmasını bozuk bulduğunda yazara verilen eleştiri.
 *  Denetçinin kendi cümlesiyle aynı (osym.charter.denetciIstemi) — yazar aynı dili görsün. */
const KUSATMA_ELESTIRISI =
  'çeldiriciler doğru değerin tek yanında toplanmış; en az ikisini doğru değerin altına, ' +
  'en az ikisini üstüne al (aksi hâlde artan sıralamada doğru cevap hep aynı harfe düşer ' +
  've öğrenci soruyu çözmeden tahmin eder)'

/** Kod kapısı doğru şıkkı çeldiricilerden belirgin uzun bulduğunda yazara verilen eleştiri. */
const UZUNLUK_ELESTIRISI =
  'doğru şık çeldiricilerden belirgin biçimde uzun; bu, cevabı konuyu bilmeyen öğrenciye de ' +
  'sızdırır ("en uzun şıkkı işaretle" taktiği). Doğru şıkkı kısaltma pahasına eksiltme — ' +
  'ÇELDİRİCİLERİ doğru şıkla aynı ayrıntı düzeyine çıkar: hepsi aynı kalıpta, yakın uzunlukta olsun'

/** Kod kapısı matematiği öğrencide bozuk bulduğunda yazara verilen eleştiri.
 *  `neden` KaTeX'in KENDİ cümlesini taşır (hangi komut/parantez hatalı) — yazar neyi
 *  düzelteceğini bilsin; "LaTeX'ini düzelt" demek onarımı kör atışa çevirirdi. */
const LATEX_ELESTIRISI = (neden: string): string =>
  `matematik biçimi bozuk — ${neden}. Öğrencinin ekranı KaTeX ile çizilir ve KaTeX yalnız ` +
  `$...$ arasını matematik sayar: dışarıda kalan ya da derlenmeyen formül öğrenciye HAM METİN ` +
  `olarak görünür (öğrenci "\\frac{1}{2}" okur, soruyu çözemez). Kökteki, BEŞ ŞIKTAKİ ve ` +
  `ÇÖZÜMDEKİ her formülü $...$ (satır içi) ya da $$...$$ (blok) arasına al; Unicode matematik ` +
  `(v₀, x², √, ∫, ≤, ·) ve \\(...\\) kullanma`

// ─────────────────────────────────────────────────────────────────────────
// Dinamik Context Injection — modelin "sıfır beyinle" başlamasını engeller.
// Supabase (user_activities RPC'leri) + Redis (gün-içi durum) → kompakt bağlam bloğu.
// ─────────────────────────────────────────────────────────────────────────
export async function buildStudentContext(userId: string): Promise<string> {
  const [weakRes, trapsRes, ctxRaw] = await Promise.all([
    supabase.rpc('weak_kazanimlar', { p_user_id: userId, p_limit: 4 }),
    supabase.rpc('distractor_traps', { p_user_id: userId, p_limit: 5 }),
    // Redis = hot-path, HAKİKAT DEĞİL. Erişilemezse gün-içi bağlam düşer; zayıf kazanımlar
    // ve çeldirici tuzakları Postgres'ten gelmeye devam eder. Redis yüzünden üretim DURMAZ.
    redis ? redis.get(`user:${userId}:context`).catch(() => null) : Promise.resolve(null),
  ])

  const weak = (weakRes.data ?? []) as Array<{ subject: string; title: string; wrong_rate: number }>
  const traps = (trapsRes.data ?? []) as Array<{
    kazanim_id: number
    selected_option: string
    miss_count: number
  }>
  const daily = ctxRaw ? (JSON.parse(ctxRaw) as { energy?: string; prefer?: string }) : {}

  const weakLines = weak
    .map((w) => `- ${w.subject}/${w.title}: hata %${Math.round(w.wrong_rate * 100)}`)
    .join('\n')
  const trapLines = traps
    .map((t) => `- kazanım#${t.kazanim_id} en sık YANLIŞ şık: ${t.selected_option} (${t.miss_count}×)`)
    .join('\n')

  // KOMPAKT tut: cache_control yok, uzun bağlam maliyeti artırır.
  return [
    '### ÖĞRENCİ BAĞLAMI (kişiselleştirme — soruyu buna göre hedefle)',
    weakLines ? `Zayıf kazanımlar:\n${weakLines}` : 'Zayıf kazanım verisi yok.',
    trapLines ? `Sık düşülen çeldiriciler:\n${trapLines}` : '',
    daily.energy ? `Günlük durum: enerji=${daily.energy}, tercih=${daily.prefer ?? '-'}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

// ─────────────────────────────────────────────────────────────────────────
// Tagged parse — ÖSYM yazar/denetçi kuralları persona/osym.charter.ts'te (tek kaynak).
// ─────────────────────────────────────────────────────────────────────────

export type TaggedQuestion = {
  soru: string
  siklar: Record<'A' | 'B' | 'C' | 'D' | 'E', string>
  dogru: string
  cozum: string
  kazanim: string
  zorluk: string
  /** Zor siparişinde yazarın MEKANİZMA PLANI ("[TASARIM] GİRİŞ GİZLİ + ÖRTÜK VERİ").
   *  ÖĞRENCİYE GİTMEZ (satır yazım yollarının row objelerinde yok), DENETÇİYE GEÇİLMEZ
   *  (verifyQuestion render'ı bu alanı basmaz — hakem mekanizmayı bağımsız tespit eder).
   *  Tek işi: kod kapısına denetlenebilir iz — plansız zor adayı elenir. */
  tasarim?: string
}

/**
 * YAZIM YOLU NORMALİZASYONU (GOREV-031) — depolanan metindeki tire ailesi / kesir-bölü /
 * fullwidth-Arabic rakam karakterlerini ASCII'ye indirger (soru kökü + 5 şık + çözüm).
 *
 * ⚠️ NEDEN AYRI ADIM (matematigiDuzelt'e eklenmedi): latex.ts kasten YALNIZ delimiter çevirisi
 * yapar ("kanıtlanabilir güvenli iş"); tire→ASCII sayısal-tipografik bir dönüşümdür, o dosyanın
 * sözleşmesine girmez. Kapı tarafı zaten `sayiya` içinde normalize ediyor; bu adım DB'ye YAZILAN
 * metni de temizler → KaTeX/ekran tutarlılığı (çözümdeki em/en-dash) + gelecekteki okumalar
 * (öğretmen ödev derleme, benzerlik) tek biçim görür, `sayiya`ya bağımlı kalmaz.
 * Şık düzeninden ÖNCE gelir ki `siklariDuzenle` normalize edilmiş değerleri sıralasın.
 */
const sayisalNormSoru = <T extends TaggedQuestion>(q: T): T => ({
  ...q,
  soru: sayisalNormalize(q.soru),
  siklar: {
    A: sayisalNormalize(q.siklar.A),
    B: sayisalNormalize(q.siklar.B),
    C: sayisalNormalize(q.siklar.C),
    D: sayisalNormalize(q.siklar.D),
    E: sayisalNormalize(q.siklar.E),
  },
  cozum: sayisalNormalize(q.cozum),
})

/**
 * [COZUM] için asgari uzunluk. "Cevap C'dir." (12 krk) çözüm DEĞİLDİR ama parser'ı geçerdi.
 *
 * ⚠️ ÇÖZÜM ZORUNLULUĞU KODDA — prompt'ta dilemek yetmiyor (bu projenin değişmezi: persona/ortak.ts).
 * isComplete eskiden yalnız soru + 5 şık + doğru harf arıyordu; [COZUM] HİÇ kontrol edilmiyordu.
 * Yani model çözümü boş bıraksa soru sessizce havuza yazılırdı (`solution: q.cozum` → ''), öğrenci
 * yanlış yaptığında karşısına BOŞ açıklama çıkardı. Bunu kimse fark etmezdi: soru "doğrulanmış"
 * görünürdü. Sebebi de vardı — stil örneklerinin 1000/1000'inde `solution = null` ve prompt bunu
 * "Çözüm: null" diye basıyordu (düzeltildi: generateQuestions boş çözümü artık hiç yazmıyor).
 * 40 krk bilinçli olarak DÜŞÜK: amaç kısa çözümü elemek değil, çözüm-olmayanı elemek.
 */
const MIN_COZUM = 40

export function parseTagged(text: string): TaggedQuestion[] {
  const out: TaggedQuestion[] = []
  let cur: TaggedQuestion | null = null
  let lastField: 'soru' | 'cozum' | null = null
  let lastSik: 'A' | 'B' | 'C' | 'D' | 'E' | null = null
  // [TASARIM] soru bloğundan ÖNCE gelir (yazar önce plan yapar) — o anda `cur` yok; sonraki
  // [SORU]'ya iliştirilmek üzere bekletilir. Regex'te tanınmasaydı continuation-branch'e düşer,
  // ya sessizce yiter ya bir önceki sorunun çözümüne YAPIŞIRDI (öğrenciye sızma tuzağı).
  let bekleyenTasarim: string | undefined

  const isComplete = (q: TaggedQuestion): boolean =>
    !!q.soru &&
    (['A', 'B', 'C', 'D', 'E'] as const).every((l) => !!q.siklar[l]) &&
    'ABCDE'.includes(q.dogru) &&
    q.cozum.trim().length >= MIN_COZUM
  const commit = (): void => {
    if (cur && isComplete(cur)) out.push(cur)
  }

  for (const raw of text.split(/\r?\n/)) {
    // ⚠️ ETİKETTE SIRA NUMARASINA İZİN VER: `[SORU 1]`, `[SORU2]`, `[SORU-3]` hepsi `[SORU]`dur.
    // ÖLÇÜLDÜ (2026-07-20, gemma-4-26b:free): model KUSURSUZ soru yazdı — 2759 karakter, yedi
    // etiketin tamamı, LaTeX'li şıklar, doğru cevap ve çözüm; `finish:"stop"`, düşünme 0 — ama
    // çoklu soru istendiğinde etiketleri NUMARALADI (`[SORU 1]`). Eski desen numarayı görünce
    // satırı hiç tanımıyordu → sorular continuation-branch'e düşüp SESSİZCE yitiyordu → hücre
    // "0 aday" veriyordu. Yani arıza modelin kalitesinde değil, BİZİM ayrıştırıcımızdaydı ve
    // ucuz modeli haksız yere "beceriksiz" göstermeye çok yaklaştı (v4-pro numaralandırmıyor,
    // bu yüzden pahalı modelde hiç görünmedi — ucuz modele geçiş kararını kirletecekti).
    const m = raw.match(/^\s*\[(SORU|[A-E]|DOGRU|COZUM|KAZANIM|ZORLUK|TASARIM)(?:[\s\-.]*\d+)?\]\s*(.*)$/)
    if (m) {
      const tag = m[1] as 'SORU' | 'A' | 'B' | 'C' | 'D' | 'E' | 'DOGRU' | 'COZUM' | 'KAZANIM' | 'ZORLUK' | 'TASARIM'
      const val = (m[2] ?? '').trim()
      lastField = null
      lastSik = null
      if (tag === 'TASARIM') {
        // HEP bekletilir, asla açık soruya yapıştırılmaz: sözleşme "planı sorudan ÖNCE yaz"
        // der, yani [TASARIM] her zaman SONRAKİ [SORU]'nundur. (İlk sürüm açık soruya
        // iliştiriyordu ve test yakaladı: iki soru arasındaki plan bir ÖNCEKİ soruya yapışmıştı.)
        bekleyenTasarim = val
      } else if (tag === 'SORU') {
        commit()
        cur = {
          soru: val,
          siklar: { A: '', B: '', C: '', D: '', E: '' },
          dogru: '',
          cozum: '',
          kazanim: '',
          zorluk: '',
          tasarim: bekleyenTasarim,
        }
        bekleyenTasarim = undefined
        lastField = 'soru'
      } else if (!cur) {
        continue
      } else if (tag === 'A' || tag === 'B' || tag === 'C' || tag === 'D' || tag === 'E') {
        cur.siklar[tag] = val
        lastSik = tag
      } else if (tag === 'DOGRU') {
        cur.dogru = val.charAt(0).toUpperCase()
      } else if (tag === 'COZUM') {
        cur.cozum = val
        lastField = 'cozum'
      } else if (tag === 'KAZANIM') {
        cur.kazanim = val
      } else {
        cur.zorluk = val
      }
    } else if (cur && raw.trim()) {
      // Çok satırlı içerik: son etiketin devamı.
      if (lastSik) cur.siklar[lastSik] += ' ' + raw.trim()
      else if (lastField) cur[lastField] += ' ' + raw.trim()
    }
  }
  commit()
  return out
}

// ─────────────────────────────────────────────────────────────────────────
// Üretim + Bağımsız doğrulama (routedChat; generate / verify rolleri)
// ─────────────────────────────────────────────────────────────────────────
// ŞIK DÜZENİ (siklariDuzenle) → utils/shufflers.ts'e taşındı: şık karıştırma modelin değil
// KODUN işidir ve saf/test edilebilir olmalı. TaggedQuestion, SikliSoru şeklini yapısal karşılar.

export type GenSpec = {
  userId: string
  subject: string
  paths: string[] // ltree ön-ekleri (retrieval filtresi)
  kazanim: string // kazanım kodu (prompt için)
  topic: string
  difficulty: string
}

export type Verdict = {
  solvedAnswer: string
  matchesMarked: boolean
  singleCorrect: boolean
  curriculumBound: boolean
  /** Soru KÖKÜ kendi içinde tutarlı mı? (çelişen veri · eksik veri · şıklarla uyumsuz birim)
   *  Ölçüldü — bu kapı yokken şu soru 4/5 alıp GEÇTİ: "K ve L … aynı anda tamamen durmaktadır"
   *  dedikten sonra "K'nın çarpışma süresi daha uzundur" diyordu. İkisi aynı anda duramaz.
   *  Cevap yine de doğruydu; denetçi doğru cevabı bulunca yeterli sayıp kökü hiç okumadı. */
  internallyConsistent: boolean
  /** Denetçinin BAĞIMSIZ zorluk derecesi — soruyu sıfırdan çözerken kaç adım harcadığına bakar.
   *  Yazarın [ZORLUK] etiketi bir İDDİADIR; bu, hakemin ölçümüdür. Havuza bu yazılır. */
  actualDifficulty?: 'kolay' | 'orta' | 'zor'
  /** Hakemin soruda GÖRDÜĞÜ zorluk mekanizmaları (kanıt cümlesiyle). "Zor" etiketinin yetkisi
   *  buradan geçer: kanıtlı 2+ mekanizma yoksa kod zor yazmaz (hakemZorluguTuret). */
  mechanisms?: Array<{ ad: string; kanit: string }>
  osymStyleScore: number
  verdict: 'ACCEPT' | 'REPAIR' | 'REJECT'
  critique: string
}

/**
 * TEK ÇAĞRIDA İSTENEBİLECEK EN FAZLA SORU — ve neden bir tavan gerekiyor.
 *
 * `max_tokens` DÜŞÜNMEYİ DE KAPSAR ve `count`'tan BAĞIMSIZ bir sabittir (16000). Model daha çok
 * soru istendiğinde daha çok DÜŞÜNÜR; bütçe önce düşünmeye harcanır, metne sıra gelmeden dolar.
 * Sonuç sessizdir: model 200 sn çalışır, `content` boş döner, parseTagged sıfır soru bulur,
 * `generateVerifiedSet` "0/5 geçti" yazıp susar. Kimse hata görmez — soru üretilmemiştir.
 *
 * ÖLÇÜLDÜ (MAT.10.3.2, zorluk=zor):
 *   count=3 → 3 aday geldi, 3'ü de kapıları geçti  (290 sn)
 *   count=6 → 0 aday geldi, hat boşa döndü         (263 sn)   ← bu tavan olmadan
 * Aynı arıza 8000 tavanında 4 soru için de yaşanmıştı (bkz. max_tokens yorumu): tavan
 * yükseltilerek değil, İSTENEN İŞ KÜÇÜLTÜLEREK çözülür — düşünme yükü count ile büyür.
 *
 * Bölme, tavanı yükseltmeye YEĞLENİR: 16000 "düşünme + 4 tam soru + çözüm" için kalibre edildi;
 * parçaları bu zarfın içinde tutmak, kalibrasyonu her count için yeniden yapmaktan sağlamdır.
 */
const PARCA_TAVANI = 3

/**
 * ZORLUĞA GÖRE PARÇA TAVANI — "zor" düşünmeyi patlatıyor, ÖLÇÜLDÜ.
 *
 * 2026-07-20, MAT.10.1.4, zorluk=zor, count=3 → `finish:"length"`, `icerikUzunluk:0`,
 * `dusunmeToken:16000` (çıkış bütçesinin TAMAMI). Yani model 16.000 token düşünüp TEK HARF
 * yazmadı; çağrı $0.0139 faturalandı, karşılığı sıfır soru. Aynı koşuda kolay 3/3, orta 2/3
 * üretti — arıza zorluğa ÖZEL.
 *
 * SEBEP: "zor" tarifi plan İSTİYOR ("mekanizmalardan İKİSİNİ seç, [TASARIM]'a yaz, soruyu ona
 * göre kur"). Plan yükü soru başına düşünmeyi büyütür ve count ile ÇARPILIR: 3 zor soru =
 * 3 plan + 3 kurgu. Kolay/orta'da plan yok, o yüzden aynı tavanda sığıyor.
 *
 * ÇÖZÜM DOKTRİNİ (bu dosyada iki kez sınandı): tavanı YÜKSELTME, İŞİ KÜÇÜLT. max_tokens'ı
 * büyütmek düşünmeye daha çok yer açar — ve düşünme çıkış fiyatından faturalanır, yani
 * pahalılığı ÇÖZMEZ, BÜYÜTÜR. Ayrıca 16000 "düşünme + 4 tam soru" için kalibreydi; her count
 * için yeniden kalibrasyon gerektirir.
 */
const parcaTavani = (difficulty: string): number => (difficulty === 'zor' ? 1 : PARCA_TAVANI)

/** Kaç parça AYNI ANDA üretilsin — router'ın dakika tavanının altında kalacak kadar. */
const GEN_ESZAMAN = 2

export async function generateQuestions(a: {
  userId: string
  subject: string
  kazanim: string
  topic: string
  difficulty: string
  count: number
  grounding: GroundingChunk[]
  exemplars: Exemplar[]
  /** Hazır bağlam (generateVerifiedSet turlar arası tekrar kurmasın diye bir kez hesaplar). */
  studentCtx?: string
  /** Aynı kazanımın havuzdaki mevcut kökleri — GÖREV'e "bunları tekrarlama" diye basılır. */
  havuzKokleri?: string[]
  priority?: LlmPriority
}): Promise<TaggedQuestion[]> {
  const studentCtx = a.studentCtx ?? (await buildStudentContext(a.userId)) // ← Context Injection

  // BÜYÜK COUNT → PARÇALA. Parçalar tavanı aşmaz, dolayısıyla özyineleme tek düzey.
  // studentCtx yukarıda BİR KEZ kuruldu ve parçalara geçiriliyor — her parça yeniden kurmasın.
  const tavan = parcaTavani(a.difficulty)
  if (a.count > tavan) {
    const parcalar: number[] = []
    for (let kalan = a.count; kalan > 0; kalan -= tavan)
      parcalar.push(Math.min(tavan, kalan))
    logger.info(
      { kazanim: a.kazanim, istenen: a.count, parcalar },
      'büyük count parçalandı — tek çağrıda düşünme bütçesi metni yer',
    )
    const gruplar = await mapLimit(parcalar, GEN_ESZAMAN, (n) =>
      generateQuestions({ ...a, count: n, studentCtx }).catch((err) => {
        // Bir parça düşerse tur BOŞA DÖNMESİN: diğer parçaların soruları sağlamdır.
        logger.warn({ err, kazanim: a.kazanim, parca: n }, 'üretim parçası düştü — diğerleri sürüyor')
        return [] as TaggedQuestion[]
      }),
    )
    return gruplar.flat()
  }

  const grounding = a.grounding
    .map((g, i) => `[BAĞLAM ${i + 1}] ${g.context ?? ''}\n${g.content}`)
    .join('\n\n')
  // ⚠️ BOŞ ÇÖZÜMÜ BASMA. Eskiden `Çözüm: ${e.solution}` koşulsuz yazılıyordu ve çıkmış ÖSYM
  // sorularının ÇÖZÜMÜ YOK (ölçüldü: 1000/1000 satırda solution = null). Yani prompt, modele
  // dört örnek gösterip dördünde de "Çözüm: null" diyordu — sonra ondan [COZUM] yazmasını
  // istiyorduk. Kendi elimizle "çözüm null'dır / boş geçilir" diye örnek veriyorduk.
  // Alan yoksa satırı hiç yazma; çözümün NASIL yazılacağını charter tarif eder (ZORLUK
  // MERDİVENİ'nin yanındaki ÇÖZÜM KURALI) — çünkü burada gösterecek örneğimiz yok.
  // ⚠️ ÖRNEKLER ÇIKTI SÖZLEŞMESİYLE AYNI BİÇİMDE BASILIR — `Şıklar: {json}` YAZMA, GERİ EKLEME.
  // Eski hâli şıkları tek satır JSON basıyordu (`Şıklar: {"A":…,"B":…}`) ve model BUNU kopyalıyordu:
  // istem bir yandan "[A] … [E] etiketlerini kullan" derken, öte yandan 4 örnekte şıkların JSON
  // olarak yazıldığını GÖSTERİYORDU. Model gösterileni taklit etti — zaten ona "biçimi örneklerden
  // al" diyoruz. ÖLÇÜLDÜ (2026-07-24): ayrışmayan 54 çıktının 30'u `Şıklar:` biçimindeydi, yalnız
  // 10'u doğru etiketi kullanmıştı; 32 TAM ve geçerli soru bloğu bu yüzden çöpe gitti. Arıza
  // modelin beceriksizliği gibi görünüyordu ("0 aday döndürdü") ama kaynağı BİZDİK.
  // Etiketli basmak çift kazanç: örnek hem ÖSYM stilini hem hedef biçimi aynı anda öğretir.
  // (Prompt'taki bu etiketler ayrıştırıcıyı KİRLETMEZ — parseTagged yalnız modelin ÇIKTISINA koşar.)
  const style = a.exemplars
    .map((e, i) => {
      // Başlık etiketin DIŞINDA: `[ÖRNEK n] <soru>` yazmak modele soruyu [SORU]'suz yazdırıyordu
      // (ölçüldü — aşağıdaki yoruma bak). Numara ayrı satırda, blok sözleşmeyle birebir aynı.
      //
      // ⚠️ ZORLUK ETİKETİ BAŞLIKTA — silme. Elimizde 1695 çıkmış sorunun TAMAMI zorluk etiketli
      // (etiketleme bitti) ve 0017 sonrası retrieveExemplars istenen zorluğu TUTAN örneği öne
      // sıralıyor; yani doğru örnekler zaten geliyordu ama zorluk bilgisi prompt'a HİÇ basılmıyordu.
      // Model 4 gerçek "orta" sorusu görüp onları zorluğu belirsiz şablon sanıyordu. Etiket, o
      // örnekleri "senin hedef yapın bu" diye görünür kılar. `difficulty` yoksa satır yazılmaz —
      // uydurma etiket basmak, kaçındığımız çelişki sınıfının ta kendisi olurdu.
      const zorlukEtiketi = (e.difficulty ?? '').trim().toLowerCase()
      const baslik = ZORLUKLAR.has(zorlukEtiketi)
        ? `— örnek ${i + 1} · zorluk: ${zorlukEtiketi} —`
        : `— örnek ${i + 1} —`
      const satirlar = [baslik, `[SORU] ${e.question_text}`]
      for (const l of ['A', 'B', 'C', 'D', 'E'] as const) {
        const sik = e.options?.[l]
        if (sik) satirlar.push(`[${l}] ${sik}`)
      }
      satirlar.push(`[DOGRU] ${e.correct_option}`)
      const cozum = (e.solution ?? '').trim()
      if (cozum && cozum !== 'null') satirlar.push(`[COZUM] ${cozum}`)
      return satirlar.join('\n')
    })
    .join('\n\n')

  // ZORLUK-FARKINDA YÖNLENDİRME (rol seçimi): kolay/orta [TASARIM] planı GEREKTİRMEZ (o kapı yalnız
  // zor) → 'generateFree' (Gemini-önce, paralı-yedek; hacmin ~%72'si çoğunlukla $0). zor → 'generate'
  // (v4-pro: kabul-başına en ucuz VE tek [TASARIM] yazan). difficulty router'a girmez; seçim tek yer burası.
  const res = await routedChat(a.difficulty === 'zor' ? 'generate' : 'generateFree', {
    temperature: TEMP.CREATIVE, // tüm sağlayıcılar OpenAI-uyumlu → sıcaklık geçilir
    // max_tokens = DÜŞÜNME + METİN toplamı. Zincir başı deepseek-v4-pro ve DÜŞÜNÜYOR (ölçüldü:
    // reasoning_tokens>0). OpenRouter reasoning'i `content`ten ayırdığı için metin boşalmaz, ama
    // düşünme token'ları bu tavandan yenir. DÜŞÜRME: ölçüldü, 8000'de model bütçenin tamamını
    // düşünmeye harcayıp METİN UZUNLUĞU 0 döndürmüştü → sıfır soru. 16000 hem düşünmeye hem
    // 4 tam soru + çözümüne yetiyor.
    max_tokens: 16000,
    messages: [
      { role: 'system', content: OSYM_YAZAR_SYSTEM }, // stabil → prefix (auto-cache adayı)
      {
        role: 'user',
        content:
          `${studentCtx}\n\n` +
          // ⚠️ BAŞLIK ÖRNEKLERİ KONUYLA ETİKETLEMEZ — bilerek. Eskiden burada
          // "STİL ÖRNEKLERİ (${'$'}{subject}/${'$'}{topic}/…)" yazıyordu ve örnekler konuya göre
          // BİREBİR filtrelendiği için doğruydu. Artık örnekler VEKTÖRLE seçiliyor (bkz.
          // rag.retrieveExemplars: exact-match kazanımların ~%80'ine SIFIR örnek bırakıyordu)
          // → gelen örneğin konusu FARKLI olabilir. ÖLÇÜLDÜ: "koşullu olasılık" kazanımına
          // sayı doğrusu ve ondalık gösterim soruları geliyor. Başlıkta "koşullu olasılık
          // örnekleri" yazsaydı model sayı doğrusunu koşullu olasılık sanırdı — başlık YALAN
          // olurdu. İki bölümün işi ayrı: ÖRNEK = biçim, BAĞLAM = içerik. Bunu açıkça söylüyoruz.
          // ⚠️ "YALNIZ BİÇİM" DEME — charter (ORTAK_KURALLAR) "örneklerin dilini, kurgusunu ve
          // ZORLUĞUNU taklit et" diyor; burada "yalnız biçimi al" demek, zorluk sinyalini system
          // mesajında verip user mesajında SİLMEKTİ. Bugünkü dördüncü aynı-sınıf çelişki: istem
          // kendi sözleşmesiyle yarışıyordu. Yasak KONU/VERİ kopyalamaya aittir (örnek vektörle
          // seçilir, konusu farklı olabilir) — YAPI ve ZORLUK ise tam olarak öğrenilmesi istenen şey.
          `### STİL ÖRNEKLERİ — BİÇİM, YAPI VE ZORLUK İÇİN (${a.subject}, çıkmış ÖSYM soruları)\n` +
          `Bunlar ÖSYM'nin dilini, soru kurgusunu, çeldirici mantığını ve ZORLUK DOKUSUNU gösterir.\n` +
          `Başlığında "zorluk: ${a.difficulty}" yazan örnekler senin HEDEF YAPINDIR: şıklarının\n` +
          `birbirine göre nasıl konumlandığına, öğrenciyi kaç ayrı yargıya zorladığına bak.\n` +
          `⚠️ KONULARI senin yazacağın sorunun konusundan FARKLI olabilir. Konuyu, veriyi veya\n` +
          `kavramı BURADAN ALMA — kopyalanacak şey YAPI, alınmayacak şey İÇERİK.\n` +
          // ⚠️ EKSİK SATIRLARI AÇIKÇA SÖYLE — model örnekte GÖRMEDİĞİ etiketi yazmıyor (ölçüldü).
          // Arşivdeki çıkmış soruların çözümü yok (1000/1000 solution=null) ve kazanım/zorluk
          // alanları da yok; örnek bu üç satırı gösteremiyor. Söylenmezse eksiklik İZİN sanılıyor.
          `⚠️ Örneklerde [COZUM], [KAZANIM] ve [ZORLUK] satırları YOKTUR — çünkü arşivdeki çıkmış\n` +
          `soruların çözümü elimizde yok. Bu bir İZİN DEĞİL, EKSİKLİKTİR: senin çıktında bu üç satır\n` +
          `ZORUNLUDUR ve [COZUM] boş/tek cümle olamaz.\n${style}\n\n` +
          `### BİLGİ BAĞLAMI — SORUNUN İÇERİĞİ YALNIZ BURADAN (kazanım ${a.kazanim})\n${grounding}\n\n` +
          // HAVUZ KÖKLERİ — klasik/tekrar caydırıcısı. Kod kapısı yalnız birebir kopyayı
          // yakalayabilir (ölçüldü: kalıp paylaşımı ÖSYM-normali, eşik onu yakalamaz);
          // ÇEŞİTLİLİĞİ ancak model verebilir, bunun için nelerin zaten var olduğunu görmesi gerek.
          (a.havuzKokleri?.length
            ? `### BU KAZANIMDAN HAVUZDA ZATEN VAR — TEKRARLAMA\n` +
              a.havuzKokleri.map((k) => `- ${k.replace(/\s+/g, ' ').slice(0, 200)}`).join('\n') +
              `\nBunlardan FARKLI bir senaryo kur. Aynı kurgunun sayıları değişmiş hâli KOPYADIR ve kod kapısında elenir.\n\n`
            : '') +
          `### GÖREV\nYukarıdaki BİLGİ BAĞLAMI ve ${a.kazanim} kazanımıyla SINIRLI, ` +
          `${a.difficulty} zorlukta ${a.count} özgün ÖSYM sorusu üret. Konu: ${a.topic}.\n` +
          `${ZORLUK_TARIFI[dersAilesi(a.subject)][zorlukAnahtari(a.difficulty)]}\n` +
          `Biçimi STİL ÖRNEKLERİ'nden, içeriği BİLGİ BAĞLAMI'ndan al. Çıktı sözleşmesine birebir uy.`,
      },
    ],
  }, { priority: a.priority ?? 'P1' })
  // Şık düzeni ÜRETİMDEN HEMEN SONRA, DOĞRULAMADAN ÖNCE uygulanır: denetçi soruyu
  // öğrencinin göreceği SON hâliyle çözsün (aksi hâlde doğruladığı şey servis edilenden
  // farklı olurdu — ve doğru harfin kaydığı bir hata sessizce geçerdi).
  //
  // ⚠️ MATEMATİK NORMALİZESİ ŞIK DÜZENİNDEN ÖNCE GELİR — sıra tesadüf değil.
  // siklariDuzenle şıkkı `sayiya` ile sayıya çevirip ARTAN diziyor; sayiya ise LaTeX sarmalını
  // (`$12$`) soyuyor. Model `\(12\)` yazdıysa normalize onu önce `$12$` yapmalı, yoksa sayiya
  // soyamaz → şık "sayısal değil" görünür → artan sıra Fisher–Yates'e düşer ve çeldirici
  // kuşatması kapısı o soruda hiç çalışmaz. İkisi de SESSİZ arıza olurdu.
  const icerik = res.choices[0]?.message.content ?? ''
  // Sıra: matematik (delimiter) → sayısal normalize (tire/kesir/rakam) → şık düzeni.
  // Normalize şık düzeninden ÖNCE ki `siklariDuzenle` ASCII '-' taşıyan değerleri sıralasın
  // (GOREV-031: en-dash'li şık artık `sayiya` ile ayrışır → kuşatma kapısı gerçekten çalışır).
  const adaylar = parseTagged(icerik).map(matematigiDuzelt).map(sayisalNormSoru).map(siklariDuzenle)

  // ⚠️ SIFIR ADAY = TEŞHİS EDİLEBİLİR OLMALI. Eskiden burada hiçbir iz kalmıyordu: üst katman
  // yalnız "üretim SIFIR aday döndürdü" diyordu ve ARIZANIN CİNSİ ayırt edilemiyordu. Üç ayrı
  // dünya var ve üçünün ilacı farklı:
  //   · content BOŞ + finish=length → düşünme bütçesi metni yedi  → İSTENEN İŞİ KÜÇÜLT
  //     (PARCA_TAVANI düşür; tavanı yükseltmek kalibrasyonu her count için bozar — bkz. yukarı)
  //   · content DOLU ama aday 0     → biçim tutmadı (etiket şeması) → istem/örnek sorunu
  //   · content BOŞ + finish=stop   → model gerçekten susmuş        → sağlayıcı/slug sorunu
  // 2026-07-20'de tam bu ayrım yapılamadığı için bir koşu teşhissiz kaldı (MAT.10.6.2, 4.1 dk,
  // 0 soru): istem o sırada büyümüştü (zorluk tarifleri + [TASARIM] + havuz kökleri) ama
  // count=3 kalibrasyonu istem BÜYÜMEDEN ÖNCE ölçülmüştü — hipotez sınanamadı, çünkü veri yoktu.
  if (!adaylar.length) {
    logger.warn(
      {
        kazanim: a.kazanim, zorluk: a.difficulty, istenen: a.count,
        finish: res.choices[0]?.finish_reason ?? '?',
        icerikUzunluk: icerik.length,
        icerikBasi: icerik.slice(0, 200),
        dusunmeToken: (res.usage as { completion_tokens_details?: { reasoning_tokens?: number } } | undefined)
          ?.completion_tokens_details?.reasoning_tokens ?? null,
        cikisToken: res.usage?.completion_tokens ?? null,
      },
      'ÜRETİM 0 ADAY — arıza cinsi için finish/icerikUzunluk/dusunmeToken alanlarına bak',
    )
    // İÇERİK DOLU AMA AYRIŞMADI → METNİN TAMAMINI DİSKE YAZ. 200 karakterlik log önizlemesi
    // arızanın CİNSİNİ gösteriyor ama SEBEBİNİ göstermiyor: kusur çoğu kez metnin ortasında
    // (şık biçimi, çok satırlı LaTeX, beklenmedik etiket) ve önizlemeye hiç girmiyor.
    // ÖLÇÜLDÜ (2026-07-20): gemma-4-26b "zor" siparişinde [TASARIM]'ı iki mekanizmayla doğru
    // yazıp 3459 karakterlik geçerli görünen bir soru üretti, ayrıştırıcı sıfır aday buldu ve
    // sebep önizlemeden ANLAŞILAMADI. Tahminle desen değiştirmek yerine ham metin saklanır.
    if (icerik.length > 0) {
      try {
        const dizin = fileURLToPath(new URL('../../data/uretim-hata/', import.meta.url))
        mkdirSync(dizin, { recursive: true })
        const ad = `${a.subject}-${(a.kazanim || 'kazanimsiz').replace(/[^\w.-]/g, '_')}-${a.difficulty}-${Date.now()}.txt`
        writeFileSync(join(dizin, ad), icerik)
        logger.info({ dosya: ad }, 'ayrışmayan ham çıktı diske yazıldı — teşhis için')
      } catch { /* teşhis yazımı üretimi ASLA düşürmesin */ }
    }
    // KENDİNİ ONARAN KÜÇÜLTME: düşünme bütçesi metni yediyse (finish=length + içerik BOŞ),
    // hücreyi boşa harcamak yerine işi küçültüp BİR KEZ daha dene. Statik tavan (parcaTavani)
    // ölçülmüş vakayı önler; bu katman ölçmediğimiz vakayı kurtarır — farklı ders/kazanım
    // farklı düşünme yükü getirir ve hepsini önceden kalibre edemeyiz.
    // ⚠️ Yalnız BU arıza cinsinde (finish=length + boş): "model biçim tutturamadı" (içerik DOLU)
    // ya da "model sustu" (finish=stop) küçültmeyle düzelmez, tekrar denemek para yakar.
    // Özyineleme sonlu: count yarılanır ve `> 1` şartı 1'de durdurur.
    if (res.choices[0]?.finish_reason === 'length' && icerik.length === 0 && a.count > 1) {
      const kucuk = Math.max(1, Math.floor(a.count / 2))
      logger.info({ kazanim: a.kazanim, zorluk: a.difficulty, eski: a.count, yeni: kucuk },
        'düşünme bütçesi metni yedi — iş küçültülüp yeniden deneniyor')
      return generateQuestions({ ...a, count: kucuk, studentCtx })
    }
  }
  return adaylar
}

export async function verifyQuestion(
  q: TaggedQuestion,
  grounding: GroundingChunk[],
  priority: LlmPriority = 'P1',
  /** Sipariş edilen zorluk — denetçi "tutmuyorsa dürüst ol" diye uyarılır. Yazarın kendi
   *  etiketi geçilmez: o bir iddiadır, hakemi ona bakmaya davet etmek bağımsızlığı bozar. */
  istenenZorluk?: string,
): Promise<Verdict> {
  const render =
    `[SORU] ${q.soru}\n` +
    (['A', 'B', 'C', 'D', 'E'] as const).map((l) => `[${l}] ${q.siklar[l]}`).join('\n') +
    `\n[İŞARETLİ] ${q.dogru}`
  const evidence = grounding.map((g) => g.content).join('\n---\n')

  const res = await routedChat('verify', {
    temperature: TEMP.STRICT,
    // ⚠️ max_tokens DÜŞÜNMEYİ DE KAPSAR (verify zincirinin başı deepseek-r1 — adanmış muhakeme
    // modeli). Denetçi soruyu SIFIRDAN çözüyor — düşünme payı büyük.
    // Bütçe yetmezse yanıt kesilir, JSON yarım kalır ve soru "denetçi konuşamadı" diye REJECT
    // olur — yani sağlam sorular boşuna elenir. ATLAS'ta bu tam olarak ölçüldü (82 karakter).
    max_tokens: 6000,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: OSYM_DENETCI_SYSTEM }, // → persona/osym.charter.ts
      { role: 'user', content: denetciIstemi(render, evidence, istenenZorluk) },
    ],
  }, { priority })
  // Model boş/yarım JSON dönebilir → jsonCoz fırlatmaz, null döner.
  const v = jsonCoz<Verdict>(res.choices[0]?.message.content)
  if (!v) {
    // Denetçi konuşamadıysa soruyu GEÇİRME. Sessizce ACCEPT saymak, doğrulanmamış soruyu
    // "doğrulandı" diye havuza yazmak olurdu — kapının varlık sebebine aykırı.
    return {
      solvedAnswer: '', matchesMarked: false, singleCorrect: false, curriculumBound: false,
      internallyConsistent: false, osymStyleScore: 0, verdict: 'REJECT',
      critique: 'denetçi geçerli JSON döndürmedi',
    }
  }
  return v
}

/** Hakemin zorluk derecesi geçerli mi? Zayıf model uydurabilir/boş bırakabilir → o zaman
 *  yazarın etiketine düşeriz (eskisi gibi), ama sessizce: bu bir gerileme, hata değil. */
const ZORLUKLAR = new Set(['kolay', 'orta', 'zor'])
const hakemZorlugu = (v: Verdict): 'kolay' | 'orta' | 'zor' | null => {
  const d = String(v.actualDifficulty ?? '').trim().toLowerCase()
  return ZORLUKLAR.has(d) ? (d as 'kolay' | 'orta' | 'zor') : null
}

/**
 * ZORLUK MEKANİZMADAN TÜRETİLİR — "zor" artık içgözlem değil, denetlenebilir iddia.
 *
 * NEDEN: içgözlemli hakem ("bu soru zor mu?") ÖLÇÜLDÜ ve iflas etti — 81 gerçek ÖSYM
 * sorusunun SIFIRINA zor dedi; kademe fiilen ölüydü. Model öğrenci değil: hiçbir yerde
 * tıkanmadığı için "zorluk hissi" diye bir verisi yok. Gözlemlenebilir mekanizma sayması
 * ("örtük veri VAR MI? kanıtı ne?") ise cevaplanabilir bir soru.
 *
 * Kural: KANITLI mekanizma ≥2 → zor (cetveldeki "EN AZ İKİSİ" şartının kod hâli).
 * Değilse içgözlem yalnız kolay/orta sınırında dinlenir; "zor" DİYEMEZ (mekanizmasız zor
 * iddiası orta'ya iner).
 *
 * ⚠️ Kod kanıtın yalnız VARLIĞINI ve asgari uzunluğunu zorlar (boş/tek-kelime kanıt sayılmaz
 * — ucuz halüsinasyon önlemi); kanıtın DOĞRULUĞUNU kod bilemez, onu eval'in kredili
 * tutarlılık sınavı (2d) ölçer.
 */
/**
 * PARTİ-İÇİ İKİZ SÜZGECİ — modelin AYNI ÇAĞRIDA kendini tekrarlamasına karşı.
 *
 * NEDEN VAR: özgünlük kapısı (denetle içinde) adayı yalnız STİL ÖRNEKLERİ ve HAVUZLA
 * karşılaştırır; aynı partide doğan kardeşler henüz havuzda OLMADIĞI için birbirleriyle hiç
 * karşılaştırılmıyordu. ÖLÇÜLDÜ (2026-07-20): v4-pro tek hücrede "A(a,2)↔B(1,-1)" ve
 * "A(2,a)↔B(-1,2)" ikizlerini yazdı (benzerlik 0.620), ikisi de kapılardan geçip havuza
 * yazıldı. İkizlerin ANA kaynağı havuz değil, partinin kendisi — model bir istemde 3 soru
 * yazarken şablonu sayı değiştirerek çoğaltıyor (gemma'da da aynı desen: 0.317'lik dönüşüm
 * ikizleri). Süzgeç saf fonksiyon: LLM'siz, DB'siz, testli.
 *
 * Elenen aday DENETİME HİÇ GİTMEZ → ikiz başına bir denetçi çağrısı da tasarruf edilir.
 * `oncekiler` bu koşuda ZATEN kabul edilmiş soruları taşır (onlar da havuza henüz yazılmadı).
 */
export const partiIkizSuz = <T extends { soru: string }>(
  adaylar: T[],
  oncekiler: ReadonlyArray<{ soru: string }>,
  subject: string,
): { essiz: T[]; elenen: Array<{ soru: string; benzerlik: number }> } => {
  const esik = ozgunlukEsigi(subject)
  const essiz: T[] = []
  const elenen: Array<{ soru: string; benzerlik: number }> = []
  for (const aday of adaylar) {
    const enYakin = Math.max(
      0,
      ...essiz.map((e) => kokBenzerligi(e.soru, aday.soru)),
      ...oncekiler.map((e) => kokBenzerligi(e.soru, aday.soru)),
    )
    if (enYakin >= esik) elenen.push({ soru: aday.soru, benzerlik: enYakin })
    else essiz.push(aday)
  }
  return { essiz, elenen }
}

const MEKANIZMA_KANIT_MIN = 20
export const hakemZorluguTuret = (v: Verdict): 'kolay' | 'orta' | 'zor' | null => {
  const gecerli = new Set<string>(MEKANIZMALAR)
  const kanitli = new Set(
    (v.mechanisms ?? [])
      .filter((m) => m && gecerli.has(String(m.ad ?? '').trim()) && String(m.kanit ?? '').trim().length >= MEKANIZMA_KANIT_MIN)
      .map((m) => String(m.ad).trim()),
  ).size
  if (kanitli >= 2) return 'zor'
  const icgozlem = hakemZorlugu(v)
  return icgozlem === 'zor' ? 'orta' : icgozlem
}

async function repairQuestion(
  q: TaggedQuestion,
  critique: string,
  grounding: GroundingChunk[],
  priority: LlmPriority = 'P1',
): Promise<TaggedQuestion> {
  const render =
    `[SORU] ${q.soru}\n` +
    (['A', 'B', 'C', 'D', 'E'] as const).map((l) => `[${l}] ${q.siklar[l]}`).join('\n') +
    `\n[DOGRU] ${q.dogru}`
  // ⚠️ ROL 'repair' — 'generate' DEĞİL. Onarım paralı v4-pro'ya gidiyordu ve her LaTeX/çeldirici/
  // uzunluk düzeltmesi tam bir pro faturası ödüyordu; üstelik logda üretimden ayırt edilemiyordu.
  // Onarım MEKANİK bir iştir (eleştiri neyin yanlış olduğunu açıkça söyler) → ücretsiz-önce zincir.
  const res = await routedChat('repair', {
    temperature: TEMP.DERIVE,
    max_tokens: 4000,
    messages: [
      { role: 'system', content: OSYM_YAZAR_SYSTEM }, // → persona/osym.charter.ts
      {
        role: 'user',
        content: onarimIstemi(render, critique, grounding.map((g) => g.content).join('\n')),
      },
    ],
  }, { priority })
  // ⚠️ Onarım da şık düzeninden VE matematik normalizesinden geçmeli: onarılan soru YENİ bir
  // sorudur (çeldiriciler ve formüller değişmiş olabilir). Aksi halde denetçinin "çeldiriciler
  // tek yanda" eleştirisiyle düzeltilen soru artan sıraya dizilmeden havuza gider; aynı şekilde
  // onarım sırasında `\(...\)` biçimine kayan bir formül normalize edilmeden öğrenciye ulaşırdı.
  // Sıra üretimdekiyle AYNI (önce matematik, sonra şık düzeni) — gerekçesi generateQuestions'ta.
  const onarilan = parseTagged(res.choices[0]?.message.content ?? '')[0]
  return onarilan ? siklariDuzenle(sayisalNormSoru(matematigiDuzelt(onarilan))) : q
}

/**
 * RET SEBEBİ — hangi ölçüt düştü? Ölçülemeyen kapı ayarlanamaz.
 *
 * ⚠️ Bu bilgi HİÇ KAYDEDİLMİYORDU: `denetle` kabul etmediği adayı sessizce `null` döndürüyordu.
 * Sonuç: "hakem çok mu eliyor?" sorusu bir gün boyunca TAHMİNLE tartışıldı — 118 kabul sayılabildi
 * ama kaç ret olduğu ve NEDEN olduğu kayıtlarda yoktu. Oysa karar buna bağlı: hakem fazla katıysa
 * boşa üretim ödüyoruz (üretim faturanın %92'si), değilse tıkanma üretim tarafındadır.
 * `isAccepted` ile aynı ölçütleri aynı sırada döker — biri değişirse ikisi birlikte değişmeli.
 */
const retSebepleri = (v: Verdict): string[] => {
  const s: string[] = []
  if (v.verdict !== 'ACCEPT') s.push(`verdict=${v.verdict}`)
  if (!v.matchesMarked) s.push('matchesMarked') // hakem başka şıkkı doğru buldu
  if (!v.singleCorrect) s.push('singleCorrect') // birden fazla / hiç doğru şık
  if (!v.curriculumBound) s.push('curriculumBound') // kazanım dışına taştı
  if (v.internallyConsistent === false) s.push('internallyConsistent') // kök kendi içinde çelişkili
  if (!(v.osymStyleScore >= 4)) s.push(`osymStyleScore=${v.osymStyleScore}`)
  return s
}

const isAccepted = (v: Verdict): boolean =>
  v.verdict === 'ACCEPT' &&
  v.matchesMarked &&
  v.singleCorrect &&
  v.curriculumBound &&
  // `!== false`: eski/zayıf model alanı hiç döndürmezse soruyu sessizce ELEME —
  // ama açıkça false derse GEÇİRME. (Zincirin başı düşerse aşağıdaki zayıf modeller devreye
  // giriyor; onlar şemayı eksik doldurabilir. Eksik alan "kusurlu" demek değildir.)
  v.internallyConsistent !== false &&
  v.osymStyleScore >= 4

/**
 * GENERATE → bağımsız VERIFY → REPAIR (≤1) → TOP-UP (≤3 tur) do-loop.
 * Yalnız tüm kapıları geçen sorular döner (havuza `verified:true` yazılır).
 *
 * ── OPTİMİZASYON (ölçüldü: 2 soru / 97-199 sn) ─────────────────────────────
 * Kalite kapıları AYNEN duruyor; değişen yalnızca ne zaman ve kaç kez iş yaptığımız.
 *
 * 1) RETRIEVAL DÖNGÜNÜN DIŞINA ÇIKTI. Sorgu dizesi yalnız spec'e bağlı → her turda BİREBİR
 *    AYNI. Eskiden 3 turda 3 kez grounding + 3 kez exemplar çekiliyordu; sonuçlar aynıydı.
 * 2) TEK EMBED. Grounding ve exemplar aynı dizeyi AYRI AYRI embed ediyordu (tur başına 2 →
 *    toplam 6). Artık bir kez embed edilip ikisine de veriliyor.
 * 3) ÖĞRENCİ BAĞLAMI da tur başına yeniden kuruluyordu (2 Supabase RPC + Redis). Bir kez.
 * 4) DOĞRULAMA PARALEL. Baskın maliyet buydu: adaylar TEK TEK denetleniyordu, her biri
 *    120 sn'ye kadar. Bağımsız işler; Promise.all ile aynı anda. Onarım+yeniden doğrulama da.
 * 5) FAZLA SORULAR ARTIK ATILMIYOR. `slice(0, targetCount)` kapılardan geçmiş, parası ödenmiş
 *    soruları çöpe atıyordu. Hepsi döner; çağıran havuza yazar (servis tarafı kendi keser).
 */
export async function generateVerifiedSet(
  spec: GenSpec,
  targetCount: number,
  priority: LlmPriority = 'P1', // canlı top-up P1 · gece demirhanesi P2
): Promise<Array<TaggedQuestion & { quality: number }>> {
  const accepted: Array<TaggedQuestion & { quality: number }> = []

  // Özgünlük eşiklerini DB'den tazele (0025) — 60sn önbellekli, pratikte bedelsiz.
  // Panelden yapılan bir eşik değişimi bir sonraki üretimde YÜRÜRLÜĞE girmeli; deploy
  // beklemesi, eşiği yönetilebilir kılmanın bütün amacını ortadan kaldırırdı.
  // DB'ye ulaşılamazsa sessizce kod tablosuna düşer — üretim DURMAZ (lib/ozgunluk-esik.ts).
  await esikleriTazele()

  // ── Turlar arasında DEĞİŞMEYEN her şey: bir kez ──
  const query = `${spec.subject} ${spec.topic} ${spec.kazanim} ${spec.difficulty}`
  const [qvec] = await embed([query])
  const [grounding, exemplars, studentCtx, havuz] = await Promise.all([
    retrieveGrounding({ subject: spec.subject, paths: spec.paths, query, qvec }),
    retrieveExemplars({
      subject: spec.subject,
      topic: spec.topic,
      difficulty: spec.difficulty,
      query,
      qvec,
    }),
    buildStudentContext(spec.userId),
    // ÖZGÜNLÜK EVRENİ: aynı DERSİN havuzdaki soruları — aynı-kazanım evreni DAR (model
    // senaryoyu komşu kazanımda da tekrarlar); havuz küçükken tüm ders ucuz. Hata olursa boş
    // evrenle devam: özgünlük kapısı o turda ölçemez ama üretim DURMAZ (kapı > üretim değil).
    (async (): Promise<Array<{ question_text: string; kazanim_id: number | null }>> => {
      try {
        const { data } = await supabase
          .from('yks_ai_questions')
          .select('question_text, kazanim_id')
          .eq('verified', true)
          .eq('subject', spec.subject)
          .limit(2000)
        return (data ?? []) as Array<{ question_text: string; kazanim_id: number | null }>
      } catch {
        return []
      }
    })(),
  ])

  // ── ÖZGÜNLÜK KAPISININ KARŞILAŞTIRMA KÜMELERİ (bir kez kurulur) ──
  // İki evren: (a) prompt'a giden stil örnekleri — GÖSTERİLEN soruyu kopyalamak kategorik
  // kusur; (b) aynı dersin havuzdaki soruları — sayı-değişik tekrar havuzu tekdüzeleştirir.
  // Eşik DERS-BAZLI ve gerçek ÖSYM'nin NN p99'undan türetildi (utils/benzerlik tablosu):
  // global 0.30 denendi, Matematik'te gerçek ÖSYM'nin %34'ünü yakacaktı — ÖSYM kalıp tekrar
  // eder; kapının hedefi yalnız SAYI-DEĞİŞİK BİREBİR kopya.
  const ozgunlukKumeleri: Array<{ kaynak: string; kume: Set<string> }> = [
    ...exemplars.map((e, i) => ({ kaynak: `stil örneği ${i + 1}`, kume: shingleKumesi(e.question_text) })),
    ...havuz.map((h) => ({ kaynak: 'havuz', kume: shingleKumesi(h.question_text) })),
  ]
  const OZGUNLUK = ozgunlukEsigi(spec.subject)
  const sayisalAile = dersAilesi(spec.subject) === 'sayisal'

  // GÖREV'e basılacak mevcut kökler: AYNI KAZANIMIN havuzdaki soruları — "bunlar var, YENİ
  // senaryo kur". Klasik/tekrar sorununa bedava caydırıcı (garanti değil: kapı yalnız birebir
  // kopyayı yakalar, klasiği yakalayamaz — bkz. utils/benzerlik dürüst sınır).
  const { data: kNode } = await supabase
    .from('curriculum_nodes').select('id').eq('code', spec.kazanim).maybeSingle()
  const havuzKokleri = kNode?.id
    ? havuz.filter((h) => h.kazanim_id === kNode.id).map((h) => h.question_text).slice(0, 5)
    : []

  /** Bir adayı denetle; REPAIR ise bir kez onar ve yeniden denetle. Kabul edilirse döner.
   *  ⚠️ HİÇ FIRLATMAZ: tek bir adayın geçici doğrulama hatası (429/timeout) TÜM turun
   *  doğrulanmış sorularını düşürmemeli. Hata → o aday null (elenir), diğerleri yaşar. */
  const denetle = async (
    q: TaggedQuestion,
  ): Promise<(TaggedQuestion & { quality: number }) | null> => {
    try {
      let aday = q

      // ── [TASARIM] PLANI: ARTIK KAPI DEĞİL, İZ — plansız zor adayı ATILMAZ, hakeme bırakılır.
      // Eskiden burada `return null` vardı (plansız zor → çöp). Kaldırıldı çünkü zorluğu ZATEN
      // HAKEM bağımsız türetiyor (hakemZorluguTuret: kanıtlı 2+ mekanizma → zor, değilse orta/
      // kolay) ve `damgala` dürüst etiketle KAYDEDİYOR, atmıyor — "ZORLUK ETİKETİ HAKEMDEN GELİR"
      // doktriniyle aynı. Plansız aday çoğu kez geçerli bir ORTA sorudur; çöpe atıp yeniden PARALI
      // üretmek yerine hakeme yollamak (bir ÜCRETSİZ verify çağrısı) hem ucuz hem havuzun ~%44
      // orta ihtiyacını besler. Kaliteyi zaten `isAccepted` (osymStyleScore>=4) süzer.
      // (v4-pro zor'da [TASARIM]'ı zaten yazar → bu dal nadiren tetiklenir; asıl fayda zor
      //  free-model'e düştüğünde boşa giden üretimi orta olarak kurtarmaktır.)
      if (spec.difficulty === 'zor') {
        const plan = (aday.tasarim ?? '').toLocaleUpperCase('tr')
        const planli = MEKANIZMALAR.filter((m) => plan.includes(m)).length
        if (planli < 2) {
          logger.info(
            { kazanim: spec.kazanim, tasarim: aday.tasarim ?? null },
            'zor siparişinde [TASARIM] planı yok/eksik — atılmıyor, gerçek zorluğu hakem belirleyecek',
          )
        }
      }

      // ── LATEX KAPISI — HAKEMİN GÖREMEDİĞİ TEK KUSUR ──
      // Denetçi bir LLM'dir ve `\frac{1}{2}`yi ZATEN OKUR; soruyu kusursuz bulur. Bozulma
      // hakemde değil, ÖĞRENCİNİN TARAYICISINDA olur: KaTeX yalnız $...$ arasını çizer, gerisini
      // ham basar. Yani bu, hakeme sorulması ANLAMSIZ olan bir kusur — ölçmenin tek yolu
      // frontend'in kullandığı KaTeX'i burada çalıştırmak (utils/latex).
      //
      // ⚠️ DİĞER İKİ KAPIDAN ÖNCE — sıra tesadüf değil. Onlar şıkkı `sayiya` ile sayıya çeviriyor
      // ve sayiya LaTeX sarmalını soyuyor. Yarım/bozuk sarmal ("$12" gibi) soyulamaz → şık
      // "sayısal değil" görünür → iki kapı da o soruda SESSİZCE kenara çekilir. Matematiği önce
      // sağlama almak, sonraki kapıların doğru ölçmesini sağlar.
      // `sayisalAile` bayrağı ham ^/_ kaçağını da açar (x^2 sarmalsız — yalnız sayısal
      // derste anlamlı; sözelde matematik yok, kontrol gürültü olur). Bkz. latex.hamMatematikKacagi.
      const latexNeden = soruLatexBozuk(aday, sayisalAile)
      if (latexNeden) {
        aday = await repairQuestion(aday, LATEX_ELESTIRISI(latexNeden), grounding, priority)
        const kalan = soruLatexBozuk(aday, sayisalAile)
        if (kalan) {
          // Onarım tutmadı → ELE. Ham LaTeX gösteren soru öğrenci için ÇÖZÜLEMEZDİR ve
          // yanlış işaretlenir; sistem bunu "kavram yanılgısı" diye kaydeder (kirli teşhis).
          // Aynı gerekçe utils/soru-saglik'te: okunamayan soru servis edilmez.
          logger.info(
            { kazanim: spec.kazanim, neden: kalan },
            'LaTeX onarımı tutmadı — soru elendi (öğrencide ham formül görünürdü)',
          )
          return null
        }
      }

      // ── KOD KAPISI (LLM'den ÖNCE) — bedava, anlık, KESİN ──
      // Çeldirici kuşatması saf aritmetik; hakeme para ödeyip olasılıksal yakalatmanın anlamı yok.
      // ÖLÇÜLDÜ: ucuz hakemler (v4-flash/v3.2) tam da bu kusuru kaçırıyor, diğerlerini buluyor.
      // Burada yakalayınca doğrudan onarıma gideriz → boşa bir doğrulama çağrısı da ödemeyiz.
      if (celdiriciKusatmasi(aday) === 'tek-yanda') {
        aday = siklariDuzenle(
          await repairQuestion(aday, KUSATMA_ELESTIRISI, grounding, priority),
        )
        // Onarım tutmadıysa ELE: artan sırada doğru cevabı hep aynı harfe düşüren soru,
        // öğrenciye çözmeden tahmin ettirir — havuza girmemeli.
        if (celdiriciKusatmasi(aday) === 'tek-yanda') return null
      }

      // ŞIK UZUNLUĞU SIZINTISI — yine saf aritmetik, yine LLM'den ÖNCE.
      // ÖLÇÜLDÜ: metinsel şıklı sorularda doğru cevap gerçek ÖSYM'de %24 en uzun şık (rastgele
      // %20 → sızıntı yok), bizim havuzda %52. Yani havuzun yarısında öğrenci konuyu bilmeden
      // "en uzun şıkkı işaretle" ile doğruyu buluyor. Hakem bunu kaçırır (uzunluk saymaz);
      // kod asla kaçırmaz. Onarım TEK sefer denenir — tutmazsa soru ELENİR.
      if (sikUzunlukSizintisi(aday) === 'sizinti') {
        aday = siklariDuzenle(
          await repairQuestion(aday, UZUNLUK_ELESTIRISI, grounding, priority),
        )
        if (sikUzunlukSizintisi(aday) === 'sizinti') return null
      }

      // ── KÖK UZUNLUĞU ÖN-KAPISI — eşik gerçek ÖSYM'den (eval 2b: p1=7 / p99=117 kelime),
      // paylar geniş (5/135) ki yanlış alarm ~0 olsun. Aşan kök ya bozuk parse ya saçmalama.
      const kokKelime = aday.soru.trim().split(/\s+/).filter(Boolean).length
      if (kokKelime < 5 || kokKelime > 135) {
        logger.info({ kazanim: spec.kazanim, kokKelime }, 'kök uzunluğu ÖSYM aralığı dışında — aday elendi')
        return null
      }

      // ── ÖZGÜNLÜK KAPISI — SAYI-DEĞİŞİK BİREBİR KOPYA; onarımsız ELE.
      // Onarım BİLEREK yok: kopya üreten model ruttadır, "senaryoyu değiştir" paraphrase
      // döndürür ve çağrı israf olur; top-up döngüsü (3 tur) eksiği zaten telafi eder.
      // NOT — AÇILMAYAN İKİ KAPI (taban ölçümü kirli çıktı, plan kuralı: kirli taban → kapı
      // kapalı): (1) "sayısal kökte sıfır sayı" — gerçek ÖSYM'nin %21.1'i sayısız kök taşıyor;
      // (2) "çeldirici-küme 5/5 çakışması" — gerçek ÖSYM'de 37 meşru çakışan çift var.
      // İkisi de eval'de metrik olarak yaşıyor; kapıya bağlanmadı.
      const adayKume = shingleKumesi(aday.soru)
      for (const { kaynak, kume } of ozgunlukKumeleri) {
        const s = kumeBenzerligi(adayKume, kume)
        if (s >= OZGUNLUK) {
          logger.info(
            { kazanim: spec.kazanim, kaynak, benzerlik: Number(s.toFixed(3)), esik: OZGUNLUK },
            'özgünlük kapısı: sayı-değişik kopya — aday elendi',
          )
          return null
        }
      }

      // ZORLUK ETİKETİ HAKEMDEN GELİR, YAZARDAN DEĞİL.
      // `q.zorluk` yazarın İDDİASIDIR ve ölçüldü: havuzun %89'u "orta" çıktı, "zor" %3'te kaldı —
      // yazar zor yazamayınca kolayı "orta" diye etiketliyordu. Hakem soruyu SIFIRDAN çözüyor;
      // kaç adım harcadığını BİLİYOR. Damgayı ona vurdurmak, yazar≠denetçi ilkesinin aynısı.
      // Çağıranlar (`q.zorluk || spec.difficulty`) değişmeden dürüst etiketi alır — 4 yerde.
      const damgala = (soru: TaggedQuestion, hukum: Verdict): TaggedQuestion & { quality: number } => {
        const olculen = hakemZorluguTuret(hukum) // zor = kanıtlı 2+ mekanizma; içgözlem yalnız kolay/orta
        if (olculen && olculen !== spec.difficulty) {
          // Sipariş tutmadı: soruyu ATMIYORUZ (geçerli ve doğrulanmış), dürüst etiketle havuza
          // koyuyoruz. Hücre ince kalır ve bir sonraki turda yeniden denenir — bu GÖRÜNÜR olsun.
          logger.info(
            { kazanim: spec.kazanim, istenen: spec.difficulty, olculen },
            'zorluk siparişi tutmadı — soru hakemin dürüst etiketiyle yazılıyor',
          )
        }
        return { ...soru, zorluk: olculen ?? soru.zorluk, quality: hukum.osymStyleScore }
      }

      const v = await verifyQuestion(aday, grounding, priority, spec.difficulty)
      if (isAccepted(v)) return damgala(aday, v)
      if (v.verdict !== 'REPAIR') {
        logger.info(
          { kazanim: spec.kazanim, zorluk: spec.difficulty, asama: 'ilk', sebep: retSebepleri(v),
            skor: v.osymStyleScore, critique: (v.critique ?? '').slice(0, 160) },
          'hakem RED — aday elendi',
        )
        return null
      }
      const repaired = await repairQuestion(aday, v.critique, grounding, priority)
      const v2 = await verifyQuestion(repaired, grounding, priority, spec.difficulty)
      if (isAccepted(v2)) return damgala(repaired, v2)
      // Onarım denendi ve TUTMADI — bu ayrı bir olgu: onarımın işe yarama oranını ölçer
      // (paralı/ücretsiz onarım kararı buna bakacak).
      logger.info(
        { kazanim: spec.kazanim, zorluk: spec.difficulty, asama: 'onarim-sonrasi', sebep: retSebepleri(v2),
          skor: v2.osymStyleScore, ilkSebep: retSebepleri(v) },
        'hakem RED — onarım tutmadı, aday elendi',
      )
      return null
    } catch (err) {
      logger.warn({ err }, 'aday denetimi başarısız — aday elendi (tur sürüyor)')
      return null
    }
  }

  for (let round = 0; accepted.length < targetCount && round < 3; round++) {
    const need = targetCount - accepted.length
    // TAMPON +2 → +1. Neden: +2, kabul oranı DÜŞÜK bir model için ölçülmüştü. Zincirin başı
    // artık v4-pro (kabul ~%92) → +2 neredeyse her turda AŞIRI üretiyordu ve fazlalar da
    // havuza yazıldığı için tek kazanımdan 7 soru çıkıyordu (ÖLÇÜLDÜ: 12 kazanım, MEDYAN 7 —
    // hedef PER_CELL=5 iken 5+2=7). Bu, havuzu derin ve DAR yapıyordu: 1210 kazanımın 12'si.
    // Amaç genişlik: az kazanımdan çok soru değil, çok kazanımdan az soru.
    const candidates = await generateQuestions({
      ...spec,
      count: need + 1,
      grounding,
      exemplars,
      studentCtx,
      havuzKokleri,
      priority,
    })
    // Model hiç AYRIŞTIRILABİLİR soru vermedi. Bu SESSİZ bir arızaydı: çağıran yalnız
    // "0/5 geçti" görüyor ve bunu "denetçi eledi" sanıyordu — oysa hiç aday ÜRETİLMEMİŞTİ.
    // İki ayrı dünya: kalite kapısı elemesi (beklenen) vs üretimin boş dönmesi (arıza).
    if (!candidates.length) {
      logger.warn(
        { kazanim: spec.kazanim, zorluk: spec.difficulty, istenen: need + 1, tur: round },
        'üretim SIFIR aday döndürdü — denetçi elemesi DEĞİL, model hiç geçerli soru yazmadı',
      )
      break
    }

    // PARTİ-İÇİ İKİZ SÜZGECİ — kardeşler birbirine ve bu koşuda kabul edilmişlere karşı
    // (havuz karşılaştırması denetle'de zaten var; oradaki evrende kardeşler YOK — yukarı bak).
    const { essiz, elenen } = partiIkizSuz(candidates, accepted, spec.subject)
    for (const e of elenen) {
      logger.info(
        { kazanim: spec.kazanim, benzerlik: Number(e.benzerlik.toFixed(3)), esik: ozgunlukEsigi(spec.subject), kok: e.soru.slice(0, 80) },
        'parti-içi ikiz elendi — model aynı çağrıda şablon tekrarladı (denetime gitmedi)',
      )
    }

    // Adaylar BAĞIMSIZ ama SINIRLI eşzamanlılıkla denetlenir: aynı anda hepsini ateşlemek
    // (Promise.all) makro/büyük count'ta sağlayıcının RPM/TPM sınırını aşardı. mapLimit uçuştaki
    // doğrulama sayısını VERIFY_ESZAMAN ile tavanlar (router'ın dakika tavanı + kesicisi üstünde).
    const sonuclar = await mapLimit(essiz, VERIFY_ESZAMAN, denetle)
    for (const q of sonuclar) if (q) accepted.push(q)
  }

  return accepted
}
