import { z } from 'zod'
import { ORTAK_KURALLAR, sozlesme } from './ortak.js'

/**
 * ATLAS — bilişsel haritacı. Öğrenci-yüzlü DEĞİL: çıktısı yapısal bir teşhistir,
 * öğrenciye giden cümleyi Kaptan kurar. Bu yüzden OGRENCI_YUZLU_KURALLAR taşımaz.
 *
 * ⚠️ TAKSONOMİ BİR SÖZLEŞMEDİR — üç yerde birden yaşıyordu:
 *   (1) TS union tipi, (2) prompt'un içindeki JSON şema dizesi, (3) hiçbir yerde doğrulanmıyordu.
 * Sonuç: model taksonomide OLMAYAN bir değer dönerse (`"dikkatsizlik"`), `as` cast'i onu
 * geçiriyor ve DB'ye yazılıyordu — taxonomy'ye bakan her downstream mantık sessizce şaşırırdı.
 * Artık TEK KAYNAK burası: tip de, prompt metni de, doğrulayıcı da bu objeden türüyor.
 * Yeni kategori eklemek = bu objeye bir satır; prompt ve doğrulayıcı kendiliğinden güncellenir.
 */
export const TAKSONOMI = {
  islem_hatasi: 'yol doğru, hesap yanlış (aritmetik/cebirsel işlem hatası)',
  kavram_karismasi: 'iki kavram birbirine karışmış (ör. hız ↔ ivme, mitoz ↔ mayoz)',
  prosedur_atlama: 'çok adımlı prosedürde bir adım atlanmış',
  temsil_hatasi: 'grafik/şekil/sembol/birim okuma hatası — bilgi var, okuma yanlış',
  onkosul_bosluk: 'asıl hata bir alt basamakta; bu kazanım değil önkoşulu eksik',
} as const

export type Taksonomi = keyof typeof TAKSONOMI
const ANAHTARLAR = Object.keys(TAKSONOMI) as [Taksonomi, ...Taksonomi[]]

/** Onarım mikro-seti — ritim.handleTopup zaten difficulty'yi beyaz listeliyor; burası ilk kapı. */
const MikrosetSemasi = z.object({
  count: z.coerce.number().int().min(1).max(10).catch(4),
  difficulty: z.enum(['kolay', 'orta', 'zor']).catch('kolay'),
})

/**
 * SINIR DOĞRULAMASI. Model ne dönerse dönsün, bu şemadan geçmeyen teşhis DB'ye YAZILMAZ.
 * `.catch()` yalnız İKİNCİL alanlarda (sayı aralığı, zorluk) kullanılıyor — teşhisin kimliğini
 * belirleyen alanlar (id, taxonomy, evidence, hint) toleranssız: yanlışsa teşhis reddedilir.
 * Sessizce 'kavram_karismasi'e düşmek, YANLIŞ bir teşhisi doğruymuş gibi kaydetmek olurdu.
 */
export const TeshisSemasi = z.object({
  misconception_id: z.string().trim().min(1).max(80),
  taxonomy: z.enum(ANAHTARLAR),
  evidence: z.string().trim().min(1),
  confidence: z.coerce.number().min(0).max(1).catch(0.5),
  prereq_hypothesis: z.string().trim().min(1).nullable().catch(null),
  remediation: z
    .object({
      review_kazanim: z.string().trim().min(1).nullable().catch(null),
      then_microset: MikrosetSemasi.catch({ count: 4, difficulty: 'kolay' }),
    })
    .catch({ review_kazanim: null, then_microset: { count: 4, difficulty: 'kolay' } }),
  student_facing_hint: z.string().trim().min(1),
})

export type Teshis = z.infer<typeof TeshisSemasi>

/** Prompt'taki taksonomi listesi de, doğrulayıcı da AYNI objeden — kayma imkânsız. */
const taksonomiTarifi = Object.entries(TAKSONOMI)
  .map(([k, aciklama]) => `  "${k}" → ${aciklama}`)
  .join('\n')

export const ATLAS_SYSTEM = sozlesme(
  `Sen bir bilişsel teşhis uzmanısın (YKS bağlamı).

YÖNTEM:
- Soruları SIFIRDAN kendin çöz. Öğrencinin işaretlediği yanlış şıkkı hangi zihinsel adımın ÜRETECEĞİNİ geriye doğru izle.
- Rastgele dikkatsizlik "teşhis" değildir. Tekrarlanabilir tek bir yanılgı hipotezi kur.
- Önkoşul ustalıkları verildiyse: hata bu kazanımda mı, yoksa bir alt basamakta mı? Ayırt et.`,
  ORTAK_KURALLAR,
  `TAKSONOMİ (taxonomy alanı YALNIZ bu değerlerden biri olabilir):\n${taksonomiTarifi}`,
  `ÇIKTI: yalnız şu şemada geçerli JSON —
{"misconception_id":"kisa_slug","taxonomy":"${ANAHTARLAR.join('|')}",
 "evidence":"yanlış şıkkı üreten zihinsel adım, tek cümle","confidence":0..1,
 "prereq_hypothesis":"ltree path | null",
 "remediation":{"review_kazanim":"kod|null","then_microset":{"count":4,"difficulty":"kolay|orta|zor"}},
 "student_facing_hint":"öğrenciye söylenecek TEK cümle (cevabı verme, açıyı ver)"}`,
)
