import { z } from 'zod'
import { ORTAK_KURALLAR, TESHIS_DILI_YOK, sozlesme } from './ortak.js'

/**
 * NABIZ — empati nöbetçisi. Öğrenciyle KONUŞMAZ; duyguyu ETİKETLER ve koça ton talimatı verir.
 * Ama etiketi brief üzerinden Kaptan'ın ağzına kadar gider → TESHIS_DILI_YOK burada da geçerli.
 *
 * ⚠️ Durum listesi de taksonomi gibi bir SÖZLEŞMEYDİ ve aynı hatayı taşıyordu:
 * tip ayrı, prompt dizesi ayrı, doğrulayan yok. `JSON.parse(raw) as AffectState` kör bir cast:
 * model "panik" veya "burned_out" dönse tip sistemi susar, değer `lb:affect:<id>` cache'ine ve
 * Kaptan'ın ton mantığına akardı. Artık tek kaynak burası + sınırda zod doğrulaması.
 */
export const DUYGU_DURUMLARI = {
  motive: 'enerjik, akışta — üstüne git',
  nötr: 'olağan çalışma hali',
  hüsran: 'arka arkaya hata; sinirlenme/vazgeçme eğilimi',
  kaygı: 'sınav/yetişememe korkusu baskın',
  tükenmiş: 'enerji bitmiş; zorlamak geri teper',
} as const

export type DuyguDurumu = keyof typeof DUYGU_DURUMLARI
const DURUMLAR = Object.keys(DUYGU_DURUMLARI) as [DuyguDurumu, ...DuyguDurumu[]]

/** Yük tavanı: bugünkü çalışma hacminin üst sınırı — planner bunu okur. */
export const YUK_TAVANLARI = ['micro', 'normal'] as const
export type YukTavani = (typeof YUK_TAVANLARI)[number]

/**
 * SINIR DOĞRULAMASI. Şemadan geçmeyen sınıflama cache'e ve brief'e YAZILMAZ.
 * Burada `.catch()` YOK: duygu durumu yanlış okunursa Kaptan'ın TONU yanlış olur.
 * Tükenmiş bir öğrenciye "hadi bastır" demek, teşhis üretememekten daha kötüdür —
 * o yüzden şüphede sınıflamayı reddedip nötr-güvenli varsayılana düşüyoruz (bkz. nabiz.ts).
 */
export const AffectSemasi = z.object({
  state: z.enum(DURUMLAR),
  evidence: z.string().trim().min(1),
  coaching_stance: z.string().trim().min(1),
  load_cap: z.enum(YUK_TAVANLARI),
})

export type AffectState = z.infer<typeof AffectSemasi>

/** Sınıflama üretilemediğinde kullanılan güvenli varsayılan — asla "iyi" varsayma, nötr kal. */
export const NOTR_AFFECT: AffectState = {
  state: 'nötr',
  evidence: 'sınıflama üretilemedi — varsayılan',
  coaching_stance: 'nötr-destekleyici',
  load_cap: 'normal',
}

const durumTarifi = Object.entries(DUYGU_DURUMLARI)
  .map(([k, aciklama]) => `  "${k}" → ${aciklama}`)
  .join('\n')

export const NABIZ_SYSTEM = sozlesme(
  `Sen öğrenci duygu-durumu sınıflandırıcısısın (YKS bağlamı).
Sana davranış sinyalleri (hata serisi, gecikme z-skoru, gece çalışması, oturumu terk) ve varsa
öğrencinin SOHBET cümlesi verilir. Bunlardan tek bir duygu durumu etiketle ve koça ton talimatı ver.`,
  ORTAK_KURALLAR,
  TESHIS_DILI_YOK,
  `DURUMLAR (state alanı YALNIZ bunlardan biri):\n${durumTarifi}`,
  `ÇIKTI: yalnız şu şemada geçerli JSON —
{"state":"${DURUMLAR.join('|')}",
 "evidence":"etiketi hangi sinyal doğuruyor, tek cümle",
 "coaching_stance":"koça TEK cümlelik ton talimatı (öğrenciye değil koça yazıyorsun)",
 "load_cap":"${YUK_TAVANLARI.join('|')}"}`,
)

/**
 * NUDGE NİYETLERİ — Nabız/zamanlayıcı bir niyet seçer, cümleyi KAPTAN kurar (persona/voice.ts).
 * Uzmanlar asla kendi cümlesini kurmaz: tek ses ilkesi.
 */
export const NUDGE_NIYETLERI = {
  comeback:
    'Dün zor bir gündü; bugün küçük ve garantili bir galibiyetle (10 dk kolay set) yeniden başlamaya davet et.',
  morning_plan: 'Bugünün planını tek cümleyle duyur ve ilk bloğa davet et.',
  closure_praise:
    'Öğrenci uzun süredir düştüğü bir tuzağı kırdı — kısa, somut bir tebrik + kalıcılaştırma önerisi.',
  streak_save: 'Serisi risk altında — bugün 5 dakikalık mini setle seriyi kurtarmaya çağır.',
} as const

export type NudgeNiyeti = keyof typeof NUDGE_NIYETLERI
