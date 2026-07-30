import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import { HttpHatasi } from './hata.js'

/**
 * HAVUZ → ÖDEV DERLEYİCİSİ.
 *
 * ⚠️ NEDEN KOPYALAMA VAR (doğrudan havuz id'si yazmak neden ÇALIŞMAZ):
 * Öğrenci ödev sorularını YALNIZ app `questions` tablosundan okur
 * (assignments.routes.ts:119,144) ve puanlama `options[idx] === correct_answer`
 * metin karşılaştırmasıyla yapılır (assignments.routes.ts:22). Beyin havuzu
 * (`yks_questions` / `yks_ai_questions`) ise AYRI tablo ve AYRI şekildedir:
 *
 *   havuz:      options = {"A":"…","B":"…"}   correct_option = 'C'   (harf)
 *   questions:  options = ["…","…"]           correct_answer = "…"   (METİN)
 *
 * Havuz UUID'sini doğrudan `question_ids`'e yazsaydık öğrenci ödevi açtığında
 * SIFIR soru görürdü — hata da almadan. Bu yüzden seçilen sorular `questions`'a
 * ŞEKLİ ÇEVRİLEREK kopyalanır (emsal: supabase/functions/save-ai-questions).
 *
 * ⚠️ KOPYA = ANLIK GÖRÜNTÜ, kusur değil: ödev verildikten sonra havuzdaki soru
 * düzeltilse/silinse bile öğrencinin ödevi bozulmaz. Ödev değişmez olmalıdır.
 */

const SIK_SIRASI = ['A', 'B', 'C', 'D', 'E'] as const

/** 'osym' tipte KALIR ama artık yalnız AÇIK HATA için ayırt edilir (telif kararı 2026-07-22):
 *  istemci gönderirse havuzdanSec 400 `cikmis_kaynak_kapali` fırlatır. 'karisik' fiilen 'ai'. */
export type HavuzKaynak = 'osym' | 'ai' | 'karisik'

export type HavuzSatiri = {
  id: string
  kaynak: 'osym' | 'ai'
  subject: string
  topic: string | null
  kazanim_id: number | null
  question_text: string
  options: Record<string, string>
  correct_option: string
  solution: string | null
  difficulty: string | null
}

export type SecimFiltresi = {
  kaynak: HavuzKaynak
  subject?: string | null
  topic?: string | null
  kazanimIds?: number[] | null
  difficulty?: string | null
  adet: number
  /** Verilirse bu öğrenciye DAHA ÖNCE atanmış havuz soruları elenir. */
  studentId?: string | null
  /** Öğretmen tarafından elle seçilmiş havuz id'leri — verilirse filtre yerine BUNLAR kullanılır. */
  secilenIds?: string[] | null
}

const SUTUNLAR =
  'id, subject, topic, kazanim_id, question_text, options, correct_option, solution, difficulty'

/** Fisher–Yates — pencere içindeki sırayı bozar (aynı offset'te bile çeşitlilik). */
function karistir<T>(a: T[]): T[] {
  const d = [...a]
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

/**
 * Bu öğrenciye daha önce atanmış havuz id'leri.
 *
 * `questions.kaynak_soru_id` (0018) üstünden gider: kopyanın kökeni. Bu iz olmadan
 * geniş havuzda aynı soru aynı öğrenciye defalarca giderdi.
 */
/**
 * KÖKEN İZİ KOLONU VAR MI (0018 uygulandı mı)?
 *
 * Kod migration'a SERT BAĞLI OLMAMALI: kolon yokken insert 42703 ile patlar ve
 * ödev oluşturma tamamen kırılırdı. Bir kez tespit edip belleğe alıyoruz.
 *
 * Kolon yoksa: ödev yine oluşur, ama tekrar-eleme ÇALIŞMAZ ve bu SESSİZ KALMAZ —
 * log'a uyarı düşer, yanıtta `izYok` bayrağı döner.
 */
let izVarMi: boolean | null = null

export async function kokenIziVarMi(): Promise<boolean> {
  if (izVarMi !== null) return izVarMi
  const { error } = await supabase.from('questions').select('kaynak_soru_id').limit(1)
  izVarMi = !error
  if (error) {
    logger.warn(
      { code: error.code },
      'questions.kaynak_soru_id yok (0018 uygulanmamış) — tekrar-eleme devre dışı, ödev oluşturma sürüyor',
    )
  }
  return izVarMi
}

async function ogrenciyeGidenler(studentId: string): Promise<Set<string>> {
  // İz yoksa eleyecek bir şey de yok. Boş küme = "eleme yapılmadı", hata değil.
  if (!(await kokenIziVarMi())) return new Set()
  const setler = await Promise.all([
    supabase.from('assignments').select('question_ids, teacher_id'),
    supabase.from('targeted_assignments').select('question_ids').eq('student_id', studentId),
  ])
  const qIds = new Set<string>()
  // Hedefli setler doğrudan öğrenciye ait.
  for (const r of (setler[1].data ?? []) as Array<{ question_ids: unknown }>) {
    for (const id of Array.isArray(r.question_ids) ? r.question_ids : []) qIds.add(String(id))
  }
  // Sınıf ödevleri: öğrencinin öğretmeninden gelenler (roster üstünden filtrelemek
  // pahalı; ödev sayısı sınıf ölçeğinde küçük kaldığı için tümü taranır).
  for (const r of (setler[0].data ?? []) as Array<{ question_ids: unknown }>) {
    for (const id of Array.isArray(r.question_ids) ? r.question_ids : []) qIds.add(String(id))
  }
  if (!qIds.size) return new Set()

  const { data } = await supabase
    .from('questions')
    .select('kaynak_soru_id')
    .in('id', [...qIds])
    .not('kaynak_soru_id', 'is', null)
  return new Set((data ?? []).map((r) => String((r as { kaynak_soru_id: unknown }).kaynak_soru_id)))
}

/** AI havuzunda (yks_ai_questions) rastgele pencereyle örnekleme.
 *  TELİF KARARI (2026-07-22): yks_questions (çıkmış) derleme yüzeyinden TAMAMEN çıkarıldı —
 *  parametreyle bile seçilemez; kapı havuzdanSec'te, tablo adı burada sabit. */
async function tablodanOrnekle(
  f: SecimFiltresi,
  kazanimIds: number[] | null,
  adet: number,
): Promise<HavuzSatiri[]> {
  if (adet <= 0) return []

  const kur = (sayimIcin: boolean) => {
    let q = sayimIcin
      ? supabase.from('yks_ai_questions').select('id', { count: 'exact', head: true })
      : supabase.from('yks_ai_questions').select(SUTUNLAR)
    // ⚠️ İKİ FİLTRE BİRLİKTE (0025): `verified` doğrulama hattının kararı, `karantina`
    // yöneticinin. Biri olmadan diğeri havuzu yalan gösterir — karantinaya alınmış bozuk
    // soru ödeve girerse karantina hiçbir şey ifade etmemiş olur.
    q = q.eq('verified', true).eq('karantina', false)
    if (f.subject) q = q.eq('subject', f.subject)
    if (f.topic) q = q.eq('topic', f.topic)
    if (kazanimIds?.length) q = q.in('kazanim_id', kazanimIds)
    if (f.difficulty) q = q.eq('difficulty', f.difficulty)
    return q
  }

  const { count, error: sayimHata } = await kur(true)
  if (sayimHata) throw new HttpHatasi(500, 'havuz_okunamadi', 'Soru havuzu okunamadı.')
  const toplam = count ?? 0
  if (toplam === 0) return []

  // RASTGELE PENCERE: `order by random()` geniş tabloda tam tarama demektir.
  // Bunun yerine rastgele bir offset'ten geniş bir pencere çekip JS'te karıştırıyoruz —
  // maliyet sabit, çeşitlilik gerçek. (Küçük havuzda pencere zaten tabloyu kapsar.)
  const pencere = Math.min(toplam, Math.max(adet * 5, 50))
  const enBuyukOffset = Math.max(0, toplam - pencere)
  const offset = enBuyukOffset > 0 ? Math.floor(Math.random() * (enBuyukOffset + 1)) : 0

  const { data, error } = await kur(false).range(offset, offset + pencere - 1)
  if (error) throw new HttpHatasi(500, 'havuz_okunamadi', 'Soru havuzu okunamadı.')

  return karistir((data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({ ...r, kaynak: 'ai' }) as unknown as HavuzSatiri,
  )
}

/**
 * İstenen adede kadar doğrulanmış havuz sorusu seçer. Yetmezse AZ döner — UYDURMAZ.
 *
 * GENİŞ HAVUZ SÖZLEŞMESİ:
 *  - Rastgele pencere + karıştırma → iki öğretmen aynı filtreyle aynı seti almaz,
 *    aynı öğretmen ikinci kez atadığında da aynı sorular gelmez.
 *  - Kazanım başına KOTA → 5 zayıf kazanımlı bir sette tek kazanım kümeyi yutmaz.
 *  - `studentId` verilirse daha önce o öğrenciye gitmiş sorular elenir.
 */
export async function havuzdanSec(f: SecimFiltresi): Promise<HavuzSatiri[]> {
  // TELİF KARARI (2026-07-22): çıkmış ÖSYM sorusu ödeve DERLENMEZ — ödev de servis yüzeyidir
  // (öğrenci ödevi açınca soruyu görür). Açık 'osym' isteği açık hatayla döner; sessizce AI'ya
  // düşmek öğretmene "ÖSYM verdim" yalanı söyletirdi. 'karisik' ise açık çıkmış talebi değildir
  // → aşağıda fiilen yalnız AI havuzundan örneklenir.
  if (f.kaynak === 'osym') {
    throw new HttpHatasi(
      400,
      'cikmis_kaynak_kapali',
      'Çıkmış ÖSYM soruları telif kararı gereği ödevlere eklenemez. Kaynak olarak AI havuzunu seçin.',
    )
  }
  // Elle seçim: filtre mantığı devre dışı, öğretmenin seçtikleri aynen getirilir.
  if (f.secilenIds?.length) return secilenleriGetir(f.secilenIds)

  const gidenler = f.studentId ? await ogrenciyeGidenler(f.studentId) : new Set<string>()
  const kazanimlar = f.kazanimIds?.length ? f.kazanimIds : null

  // Kazanım başına kota: çok kazanımlı seti dengeli dağıt. Artan kısım (adet % n)
  // ilk kazanımlara dağıtılır; hiçbiri sıfır kalmaz.
  const gruplar: Array<{ ids: number[] | null; adet: number }> = []
  if (kazanimlar && kazanimlar.length > 1) {
    const taban = Math.floor(f.adet / kazanimlar.length)
    const artan = f.adet % kazanimlar.length
    kazanimlar.forEach((k, i) => {
      const pay = taban + (i < artan ? 1 : 0)
      if (pay > 0) gruplar.push({ ids: [k], adet: pay })
    })
  } else {
    gruplar.push({ ids: kazanimlar, adet: f.adet })
  }

  const secilen: HavuzSatiri[] = []
  const alinan = new Set<string>()

  const ekle = (satirlar: HavuzSatiri[], tavan: number): number => {
    let n = 0
    for (const s of satirlar) {
      if (n >= tavan) break
      if (alinan.has(s.id) || gidenler.has(s.id)) continue
      alinan.add(s.id)
      secilen.push(s)
      n += 1
    }
    return n
  }

  for (const g of gruplar) {
    if (g.adet > 0) ekle(await tablodanOrnekle(f, g.ids, g.adet), g.adet)
  }

  // Bazı kazanımlar kotasını dolduramadıysa açığı kalanlardan tamamla —
  // "5 istendi, 3 geldi" demek yerine havuzda varsa 5'e tamamla.
  if (secilen.length < f.adet && kazanimlar && kazanimlar.length > 1) {
    ekle(await tablodanOrnekle(f, kazanimlar, f.adet - secilen.length), f.adet - secilen.length)
  }

  return secilen.slice(0, f.adet)
}

/** Öğretmenin elle seçtiği havuz id'lerini getirir — TELİF gereği YALNIZ AI havuzundan. */
async function secilenleriGetir(ids: string[]): Promise<HavuzSatiri[]> {
  // Eski listelerden/istemciden kalan bir id çıkmış havuzu işaret edebilir. Sessizce elemek
  // "5 seçtim, 3 geldi" muamması bırakır → çıkmış id yakalanırsa AÇIK Türkçe hata.
  // (Sayım sorgusu içerik döndürmez; hata da döndürmezse en kötü sonuç sessiz ELEME olur —
  // çıkmış soru hiçbir koşulda ödeve giremez, çünkü aşağıda yalnız yks_ai_questions okunur.)
  const { count: cikmisAdedi } = await supabase
    .from('yks_questions')
    .select('id', { count: 'exact', head: true })
    .in('id', ids)
  if ((cikmisAdedi ?? 0) > 0) {
    throw new HttpHatasi(
      400,
      'cikmis_kaynak_kapali',
      'Seçilen sorulardan bazıları çıkmış ÖSYM havuzuna ait; telif kararı gereği ödevlere eklenemez.',
    )
  }

  // Elle seçim de kapılardan geçer: öğretmenin id'siyle istediği soru karantinadaysa sete girmez.
  const { data } = await supabase
    .from('yks_ai_questions').select(SUTUNLAR).in('id', ids)
    .eq('verified', true).eq('karantina', false)
  const out: HavuzSatiri[] = ((data ?? []) as Array<Record<string, unknown>>).map(
    (r) => ({ ...r, kaynak: 'ai' }) as unknown as HavuzSatiri,
  )
  // Öğretmenin seçim SIRASINI koru — listede gördüğü sırayla ödeve girsin.
  const sira = new Map(ids.map((id, i) => [id, i]))
  return out.sort((a, b) => (sira.get(a.id) ?? 0) - (sira.get(b.id) ?? 0))
}

/** Şıkları A→E sırasıyla diziye açar; boş/eksik şıkları atar. */
function sikDizisi(options: Record<string, string>): string[] {
  const varsa = SIK_SIRASI.filter((h) => typeof options?.[h] === 'string' && options[h].trim() !== '')
  // Beklenen 5 şık; azsa da olduğu kadarını taşırız (veri kaybetmemek için).
  return varsa.map((h) => options[h])
}

export type DerlemeSonucu = {
  questionIds: string[]
  kaynakDagilimi: { osym: number; ai: number }
  /** Şekli bozuk olduğu için atlananlar — sessizce düşmesin diye AYRI sayılır. */
  atlanan: number
  /** true → 0018 uygulanmamış, tekrar-eleme yapılamadı. Sessiz kalmaması için taşınır. */
  izYok: boolean
}

/**
 * Seçilen havuz sorularını `questions` tablosuna kopyalar ve yeni id'leri döner.
 * `teacherId` sahiplik için ZORUNLU: RLS politikaları (0002) teacher_id'ye bakar.
 */
export async function sorulariMaterialize(
  satirlar: HavuzSatiri[],
  teacherId: string,
  grade: string | null,
): Promise<DerlemeSonucu> {
  if (!satirlar.length) return { questionIds: [], kaynakDagilimi: { osym: 0, ai: 0 }, atlanan: 0, izYok: false }
  const izVar = await kokenIziVarMi()

  const rows: Array<Record<string, unknown>> = []
  const dagilim = { osym: 0, ai: 0 }
  let atlanan = 0

  for (const s of satirlar) {
    const sik = sikDizisi(s.options)
    const dogruMetin = s.options?.[s.correct_option]

    // Doğru şıkkın METNİ yoksa bu soru puanlanamaz (scoreAnswers metin karşılaştırır).
    // Ödeve koymak "her zaman yanlış" bir soru vermek olurdu → ATLA, ama SAY.
    if (!dogruMetin || sik.length < 2 || !sik.includes(dogruMetin)) {
      atlanan += 1
      continue
    }

    dagilim[s.kaynak] += 1
    rows.push({
      teacher_id: teacherId,
      category: s.subject,
      subject: s.subject,
      subject_tr: s.subject,
      topic: s.topic,
      sub_topic: s.topic,
      question_text: s.question_text,
      options: sik,                    // ← DİZİ (havuzdaki nesne değil)
      correct_answer: dogruMetin,      // ← METİN (harf değil)
      explanation: s.solution ?? '',
      difficulty: s.difficulty,
      grade,
      // Havuzdan geldi ve doğrulama kapılarından geçti → verified.
      verified: true,
      is_ai_generated: s.kaynak === 'ai',
      source_type: s.kaynak === 'osym' ? 'osym_cikmis' : 'ai_generated',
      // KÖKEN İZİ (0018): tekrar atamayı elemenin tek dayanağı. Kolon henüz yoksa
      // alanı HİÇ göndermeyiz — aksi hâlde insert 42703 ile patlar ve ödev kurulamaz.
      ...(izVar ? { kaynak_soru_id: s.id } : {}),
    })
  }

  if (!rows.length) return { questionIds: [], kaynakDagilimi: dagilim, atlanan, izYok: !izVar }

  const { data, error } = await supabase.from('questions').insert(rows).select('id')
  if (error) throw new HttpHatasi(500, 'soru_kopyalanamadi', 'Sorular ödeve aktarılamadı.')

  return {
    questionIds: (data ?? []).map((r) => String((r as { id: unknown }).id)),
    kaynakDagilimi: dagilim,
    atlanan,
    izYok: !izVar,
  }
}

/** Eksik/atlanan varsa dürüst uyarı metni; her şey tamsa null. */
export function uyariMetni(istenen: number, bulunan: number, atlanan: number): string | null {
  if (bulunan >= istenen && atlanan === 0) return null
  const parcalar: string[] = []
  if (bulunan < istenen) {
    parcalar.push(`Havuzda bu kriterlere uyan ${bulunan} soru bulundu (${istenen} istenmişti).`)
  }
  if (atlanan > 0) {
    parcalar.push(`${atlanan} soru şıkları eksik/bozuk olduğu için ödeve alınmadı.`)
  }
  return parcalar.join(' ')
}
