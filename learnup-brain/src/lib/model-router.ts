import OpenAI from 'openai'
import { openrouter } from '../clients/openrouter.js'
import { redis } from '../clients/redis.js'
import { logger } from '../utils/logger.js'

/**
 * OPSİYONEL ücretsiz sağlayıcı: Groq. Zincir girdisi 'groq:<model>' öneklidir; GROQ_API_KEY
 * .env'de yoksa bu girdiler sessizce atlanır — OpenRouter omurga kalır.
 * NOT: Embeddings (vektörler) HER ZAMAN OpenRouter'dadır (rag.ts) — Groq embedding sunmaz.
 *
 * ⚠️ GROQ'U 'generate'/'generateFree' ZİNCİRİNE EKLEME — ARİTMETİK TUTMUYOR, ÖLÇÜLDÜ (2026-07-24).
 * Groq'un ücretsiz katmanı istek/gün DEĞİL, DAKİKA-TOKEN (TPM) ile sınırlıyor ve sayaca İSTENEN
 * `max_tokens`'ı da katıyor. Bizim üretim istemi ~9.7k GİRDİ + 16k tavan = ~25.7k token/istek:
 *     gpt-oss-120b / gpt-oss-20b / qwen3.6-27b   1000 istek/gün · TPM  8.000 → girdi TEK BAŞINA aşıyor
 *     llama-3.3-70b-versatile                    1000 istek/gün · TPM 12.000 → 413 "Request too large"
 *     llama-3.1-8b-instant                     14.400 istek/gün · TPM  6.000 → aşıyor
 *     groq/compound                               250 istek/gün · TPM 70.000 → max_tokens'ı 8192'de KESİYOR,
 *       ayrıca tek model değil: içeride llama-4-scout'a yönlendiren ajan katmanı ve asıl kotayı
 *       O model dayatıyor (girdi ~5k'da bile 429). Başlıktaki 70k sarmalayıcıya ait, ALTA GEÇMİYOR.
 * "max_tokens'ı düşürüp sığdıralım" ÇIKIŞ DEĞİL: 8000 tavanı ölçüldü ve model bütçenin tamamını
 * düşünmeye harcayıp SIFIR metin döndürdü (bkz. generation.ts, üretim çağrısındaki max_tokens
 * yorumu). Yani Groq'u üretime sokmanın tek yolu, sıfır soru üreten tavana inmektir.
 * Groq ancak KISA istemli roller için düşünülebilir (fast/chat); üretimde darboğaz zaten kota değil.
 */
const groq: OpenAI | null = process.env.GROQ_API_KEY
  ? new OpenAI({ baseURL: 'https://api.groq.com/openai/v1', apiKey: process.env.GROQ_API_KEY })
  : null

/** OPSİYONEL üçüncü ücretsiz sağlayıcı: Google AI Studio (Gemini). OpenAI-uyumlu endpoint
 *  (generativelanguage.googleapis.com/v1beta/openai) → aynı SDK, farklı baseURL. Zincir girdisi
 *  'google:<model>' öneklidir (ör. 'google:gemini-2.5-flash-lite'); GOOGLE_API_KEY yoksa bu
 *  girdiler sessizce atlanır. AI Studio anahtarı ücretsiz kotalıdır (flash-lite gün-içi tavan);
 *  Türkçesi güçlü — sözel/kavramsal üretimde nemotron/gemma'dan üstün (ölçüldü). */
const google: OpenAI | null = process.env.GOOGLE_API_KEY
  ? new OpenAI({ baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', apiKey: process.env.GOOGLE_API_KEY })
  : null

/**
 * ANTHROPIC KALDIRILDI (bilinçli — geri eklemeden önce oku).
 *
 * Sağlayıcı olarak Anthropic ve Messages API adaptörü tamamen söküldü: LLM trafiğinin tamamı
 * OpenAI-uyumlu (OpenRouter, opsiyonel Groq). Bu yalnız "kullanmıyoruz" değil, bir SADELEŞME:
 * adaptör iki şekil arasında çeviri yapıyordu (thinking/effort, sıcaklık yasağı, stream ve tools
 * desteklememe, `stop_reason` eşlemesi) ve her biri kendi arıza sınıfını üretmişti. Tek şekil
 * kalınca `routedChat`/`routedStream` içindeki sağlayıcı dallanmaları da gitti.
 *
 * Geri eklemek isteyen: bu bir slug değişikliği DEĞİLDİR. Anthropic OpenAI-uyumlu değildir;
 * adaptör, `thinking` bütçe tuzağı (max_tokens = düşünme + metin) ve stream/tools boşlukları
 * geri gelir. Zincire 'anthropic:...' yazmak artık hiçbir şey yapmaz — o önek tanınmıyor,
 * girdi OpenRouter slug'ı sanılır ve 404'e düşer.
 */
type Provider = 'openrouter' | 'groq' | 'google'
const parseEntry = (entry: string): { provider: Provider; model: string } => {
  if (entry.startsWith('groq:')) return { provider: 'groq', model: entry.slice(5) }
  if (entry.startsWith('google:')) return { provider: 'google', model: entry.slice(7) }
  return { provider: 'openrouter', model: entry }
}
const clientOf = (p: Provider): OpenAI | null =>
  p === 'groq' ? groq : p === 'google' ? google : openrouter


/**
 * MODEL YÖNLENDİRİCİ (§5.4) — ücretsiz-önce zincir + bütçe + devre kesici + timeout.
 *   route(role) → [birincil :free, alternatif :free, PAID] sırayla dene;
 *   her deneme: kesici → dakika penceresi → günlük sayaç → çağrı (AbortSignal.timeout).
 * Zincir DAİMA paid slug'da biter: öğrenci sohbet ortasında asla hata görmez.
 * Redis yoksa bütçe/kesici in-memory yaklaşık çalışır (doğruluk değil hassasiyet düşer).
 */

export type LlmRole = 'chat' | 'generate' | 'generateFree' | 'repair' | 'verify' | 'fast'
/** P0 interaktif (Kaptan) · P1 doğrulama/canlı üretim · P2 gece batch. */
export type LlmPriority = 'P0' | 'P1' | 'P2'

/** Ücretsiz slug'lar zamanla değişebilir → env ile ezilebilir (virgülle ayrık zincir).
 *  2026-07-12 canlı katalog doğrulaması: DeepSeek :free varyantları KALKTI (404);
 *  gpt-oss-120b:free 2026-07-19'da KALKTI (404: "paid version available") → yerine nemotron-3-super-120b:free
 *  kondu (aynı gün canlı katalogdan doğrulandı). nemotron:free + qwen3-next:free hâlâ geçerli. */
const CHAINS: Record<LlmRole, string[]> = {
  chat: chainFromEnv('LLM_CHAIN_CHAT', [
    'deepseek/deepseek-v4-flash',             // $0.098/$0.196 MTok — P0 sohbet: düşünmesiz → hızlı
    'deepseek/deepseek-v3.2',
    'nvidia/nemotron-3-super-120b-a12b:free',
    // llama-3.3-70b:free 2026-07-20'de KALKTI (404 "unavailable for free" — canlı sondajla
    // yakalandı). Yerine gemma-4-26b: ölçüldü, 1.4sn + düşünmez — sohbet yedeği için doğru profil.
    'google/gemma-4-26b-a4b-it:free',
  ]),
  /**
   * ÖSYM üretimi — v4-pro. UCUZ SLUG'A GEÇMEDEN ÖNCE BU ÖLÇÜMÜ OKU.
   *
   * Token fiyatı yanıltıcıdır; doğru ölçüt KABUL EDİLEN SORU BAŞINA MALİYET. Gerçek hatta
   * (aynı charter, aynı denetçi kapısı, 3 ders × 4 soru) ölçüldü:
   *   v4-pro    → kabul %92 · ort skor 4.83 · KABUL BAŞINA $0.0089
   *   v4-flash  → kabul %25 · ort skor 3.42 · KABUL BAŞINA $0.0196   (token'da 4.4× ucuz!)
   *   v3.2      → kabul %17 · ort skor 3.27 · KABUL BAŞINA $0.0411   + 4 istenince 8 soru üretti,
   *                bir derste hiç ayrıştırılabilir çıktı vermedi → eleme.
   * (Bu rakamlar sağlayıcı sabitlemesinden ÖNCEki fiyatlarla; kabul ORANLARI hâlâ geçerli,
   *  yalnız fiyat düştü. Sonra iki şey ucuzladı: üretim 3.2× (sağlayıcı → DeepSeek $0.96/MTok)
   *  ve denetim 43× (hakem r1 → v4-flash). Fiyat oranından türetilen bugünkü değer: kabul başına
   *  ~$0.002 — UÇTAN UCA YENİDEN ÖLÇÜLMEDİ, tahmindir. Baskın kalem yine ÜRETİM (~%90).)
   * Flash token'da 4.4× ucuz ama ürettiğinin 3/4'ü kapıdan dönüyor ve REDDEDİLEN soru da tam
   * denetim faturası ödetiyor. Baskın kalem ÜRETİM DEĞİL DENETİM: kusurlu sorular denetçiyi
   * daha çok düşündürdüğü için flash'ın denetim faturası ($0.055) pro'nunkinden ($0.031) YÜKSEK.
   * (Uyarı: pro'nun %92'si kendi kendini denetlediği turdan gelir → şişkin. Yön nettir, sayı değil.)
   */
  /**
   * ⚠️ SIRA 2026-07-24'te TERSİNE ÇEVRİLDİ: v4-pro BAŞTAN SONA alındı. Üstteki ölçüm hâlâ
   * geçerli (pro en iyi yazar) ama ARTIK ZORUNLU DEĞİL — gerekçesi bayatladı.
   *
   * Eski gerekçe: "zor'u free'ye gönderemeyiz, [TASARIM] planını yalnız v4-pro yazar." Bu doğruydu
   * ÇÜNKÜ [TASARIM] çıktı sözleşmesinde YOKTU (osym.charter'daki sözleşme "tam bu etiketlerle"
   * deyip planı saymıyordu) ve zayıf modeller sistem mesajındaki kapalı listeye uyup planı
   * atıyordu — ölçüldü: 26 zor adayının 26'sında tasarim=null. Sözleşme düzeltilince free modeller
   * planı YAZDI ve zor kademesi bedavaya doldu.
   *
   * ÖLÇÜLDÜ (2026-07-24, aynı gün, aynı kapılar):
   *   ücretsiz zincir → 19 zor damgalı soru · $0
   *   v4-pro          →  2 zor damgalı soru · $0.185   (zor damgası başına ~$0.09)
   * Fatura dökümü niye bu kadar yüksek olduğunu da söylüyor: 2 kabul için 8 üretim çağrısı,
   * çıktı token'ının %79'u düşünme, girdi (~9.7k) her çağrıda yeniden gönderiliyor. Yani para
   * kaliteye değil TEKRARA gidiyordu.
   *
   * Paralı uç SİLİNMEDİ, SONA alındı: ücretsiz kota dolunca freeBudgetOk false döner ve zincir
   * kendiliğinden pro'ya düşer. Böylece pro "üretici" değil AÇIK KAPATICI olur — ayrı bir
   * planlayıcı yazmaya gerek kalmadan.
   *
   * ⚠️ v4-flash BİLEREK YAZAR ZİNCİRİNDE DEĞİL: (1) yazar olarak kabul oranı düşük (%25, üstteki
   * ölçüm), (2) denetçi zincirinin ikinci sırasında duruyor — yazar zincirinde de olsaydı ikisi
   * aynı slug'a düştüğünde model KENDİ sorusunu denetlerdi (charter'ın yasağı; ölçüldü: kendini
   * denetleyen model %92 cömertlik gösteriyor).
   */
  generate: chainFromEnv('LLM_CHAIN_GENERATE', [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'google:gemini-2.5-flash-lite', // günde 20 istek — küçük ama bedava katkı
    'deepseek/deepseek-v4-pro',     // AÇIK KAPATICI: yalnız ücretsiz kota bitince girer
  ]),
  /**
   * ÜCRETSİZ-ÖNCE ÜRETİM — YALNIZ kolay/orta siparişi (generateQuestions zorluğa göre seçer;
   * zor BURAYA GELMEZ, o 'generate'te kalır: v4-pro kabul-başına en ucuz + tek [TASARIM] yazan).
   *
   * NEDEN AYRI ZİNCİR: kolay/orta [TASARIM] planı GEREKTİRMEZ (o kapı yalnız zor, generation.ts)
   * ve mekanizma şartı yok → free modeller bu kapıları geçer. v4-pro'ya göndermek, gereksiz yere
   * hacmin ~%72'sine paralı yazar tutmaktı. Sıra free-önce, paralı-yedek (zincir asla "soru yok"
   * demez): Gemini başta (ölçüldü — `[A]` biçimi doğru, Türkçesi güçlü; gemma "A)" yazıp parser'ı
   * boşa düşürüyordu), sonra nemotron:free, EN SONDA paralı yedek (v4-flash ucuz, v4-pro son çare).
   * Free kota dolunca freeBudgetOk false → zincir kendiliğinden paralıya düşer, üretim durmaz.
   */
  generateFree: chainFromEnv('LLM_CHAIN_GENERATE_FREE', [
    // ⚠️ GOOGLE BAŞTA DEĞİL — ücretsiz katmanı MODEL BAŞINA GÜNDE 20 İSTEK (ölçüldü, canlı 429
    // gövdesinden; flash ve flash-lite ikisi de 20). Başa koymak, her hücrenin ilk denemesini
    // 20 çağrı sonrası 429'a çarpan bir slug'a harcamaktı; kesici üstel açılıp hattı dakikalarca
    // öldürüyordu. Omurga OpenRouter (~1000/gün); Google küçük bir bonus olarak ikinci sırada.
    'nvidia/nemotron-3-super-120b-a12b:free',
    'google:gemini-2.5-flash-lite',
    // v4-flash yazar zincirinden ÇIKARILDI (gerekçe 'generate' yorumunda: düşük kabul + denetçiyle
    // çakışma). Paralı yedek tek: pro. Ücretsiz kota dolmadan buraya gelinmez.
    'deepseek/deepseek-v4-pro',
  ]),
  /**
   * ONARIM — ayrı rol, iki sebeple.
   *
   * (1) MALİYET: onarım `'generate'` rolüne gidiyordu, yani paralı v4-pro'ya. LaTeX/çeldirici/
   *     uzunluk onarımları MEKANİK düzeltmelerdir (eleştiri metni tam olarak neyin yanlış
   *     olduğunu söyler) — zayıf modelin en yapabileceği iş sınıfı. ÖLÇÜLDÜ (2026-07-24): tek
   *     hücrede 2 kabul için 8 üretim çağrısı gitti ve bir bölümü onarımdı; her biri tam pro
   *     faturası ödedi.
   * (2) GÖRÜNÜRLÜK: onarım çağrıları logda `role:"generate"` diye görünüyordu, üretimden
   *     AYIRT EDİLEMİYORDU. "8 çağrının kaçı onarımdı" sorusu tahminle cevaplanıyordu; artık
   *     `role:"repair"` diye ayrı sayılır.
   */
  repair: chainFromEnv('LLM_CHAIN_REPAIR', [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'google:gemini-2.5-flash-lite',
    'deepseek/deepseek-v4-flash', // onarımda ucuz paralı yedek yeterli (yazar değil, düzeltici)
  ]),
  /**
   * DENETÇİ — v4-flash. r1'den 43× ucuz; farkı KOD KAPISI kapatıyor.
   *
   * ⚠️ BURAYA generate'İN BAŞINDAKİ SLUG'I YAZMA. Charter'ın kuralı: yazar ve denetçi AYRI LLM
   * (bkz. persona/osym.charter.ts) — tek modele "yaz ve kendini denetle" demek, kendi hatasını
   * göremeyen bir hakem kurmaktır. Bu teorik değil, ÖLÇÜLDÜ: v4-pro kendi sorularını denetleyince
   * %92 kabul verdi; aynı hakem flash'ın sorularına %25 verdi. Kendini denetleyen model cömerttir.
   * .env'de LLM_CHAIN_VERIFY generate ile aynı başlıyorsa kapı çalışıyor GİBİ görünür ama süzmez.
   *
   * ALTIN SET ÖLÇÜMÜ (kusuru önceden bilinen 4 soru — sağlam / işaret yanlış / kök çelişkili /
   * çeldirici tek yanda):
   *   r1        4/4 · denetim başına $0.00513 · 85sn
   *   v3.2      3/4 · $0.00033 · 25sn
   *   v4-flash  3/4 · $0.00012 · 8sn      ← seçilen
   *   v4-flash + reasoning:{enabled:true} → JSON HİÇ DÖNMEDİ (response_format bozuldu) → kullanma.
   * Ucuz hakemlerin kaçırdığı TEK kusur "çeldirici tek yanda"ydı; o artık kodda ve KESİN
   * (utils/shufflers.celdiriciKusatmasi, generation.denetle içinde LLM'den önce çalışır).
   * Yani r1'in tek üstünlüğü satın alınmadı, ÇÖZÜLDÜ.
   *
   * ⚠️ "flash düşünmez" DEMEK YANLIŞ — SAĞLAYICIYA BAĞLI. Ölçüldü: DeepInfra reasoning=0,
   * StreamLake/GMICloud/DeepSeek reasoning>0. Yani yukarıdaki $0.00012 rakamı DeepInfra'da
   * alınmıştı; üretimde GMICloud'a düşüldü ve denetim ~$0.001 oldu (10×). Bu rolde düşünme
   * BİLEREK açık bırakıldı (DUSUNME_KAPALI.verify=false): hakem soruyu sıfırdan çözüyor,
   * çözemezse matchesMarked=false → SAĞLAM soruyu eler → yeniden üretim ~$0.005, yani
   * tasarrufun 5 katı zarar. Denetimde ucuzluk buradan geçmez.
   * İZLE: havuz dolarken `uretilen` vs `yazilan` oranına bak; kabul belirgin düşerse hakemi
   * 'deepseek/deepseek-v3.2' ya da 'deepseek/deepseek-r1' yap — .env'den de ezilebilir.
   *
   * 2026-07-19 — ZİNCİR BAŞI ultra-550b:free OLDU. Denetçilik sınavı (üretim istemiyle birebir,
   * scripts/denetci-sinav.ts, 8 çağrı, $0): çekirdek görevlerin TAMAMI doğru — sağlam kabul,
   * yanlış işareti düzeltilmiş harfle yakalama, kök çelişkisi 2/2 ("birlikte 6 sa > tek başına
   * 4 sa" tuzağı — flash sınıfının tarihsel zaafı), eksik-veri yakalama (kutular; kod kapıları
   * bunu GÖREMEZ, tek savunma denetçi), kolay soruda mekanizma uydurmama. JSON 8/8 ilk denemede,
   * gecikme 18-67sn (flash ~8sn — arka plan üretimi için kabul edilebilir). Tek zayıflık:
   * mekanizma-tarama KARARLILIĞI (Hayber: 1. koşu AYIRT ETME, 2. koşu boş) → türetilen "zor"
   * muhafazakâr kalır; flash'tan kötü değil (flash HİÇ mekanizma bulamıyordu, 0/12 kararlı zor).
   * Flash paralı emniyet ağı olarak 2. sırada: ücretsiz kapasite 502'si / günlük tavan →
   * zincir kendiliğinden paralıya düşer, üretim durmaz.
   */
  verify: chainFromEnv('LLM_CHAIN_VERIFY', [
    'nvidia/nemotron-3-ultra-550b-a55b:free',
    'deepseek/deepseek-v4-flash',
    'deepseek/deepseek-v3.2',
    // ⚠️ BURADA `nemotron-3-super-120b:free` VARDI — 2026-07-24'te ÇIKARILDI. O slug artık YAZAR
    // zincirinin BAŞI (generate/generateFree/repair üçünde de birinci sırada). Denetçi buraya
    // düşseydi model KENDİ yazdığı soruyu denetlerdi — charter'ın açık yasağı ve ölçülmüş arıza
    // (kendini denetleyen model %92 kabul verdi, aynı hakem başkasının sorusuna %25).
    // Yerine nano-omni: ayrı model, muhakemeye ayarlı, hiçbir yazar zincirinde yok.
    // ⚠️ YAZAR ZİNCİRLERİNDEKİ BİR SLUG'I BURAYA EKLEME — src/scripts ile kontrol edilebilir.
    'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  ]),
  fast: chainFromEnv('LLM_CHAIN_FAST', [
    'deepseek/deepseek-v4-flash',             // sınıflama/özet — düşünmesiz slug tam da bu rol için
    'nvidia/nemotron-nano-9b-v2:free',
    'meta-llama/llama-3.2-3b-instruct:free',
  ]),
}

function chainFromEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]
  if (!raw) return fallback
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean)
  return list.length ? list : fallback
}

const isFree = (entry: string): boolean =>
  entry.endsWith(':free') || entry.startsWith('groq:') || entry.startsWith('google:')
/** Rol başına timeout. `generate` 60sn'ydi ve YETMİYORDU: tek çağrıda 4 tam ÖSYM sorusu
 *  + çözümleri (max_tokens 8000) yazılıyor; model bunu 60sn'de bitiremeyip abort ediliyordu.
 *  Üretim interaktif değil (P1 canlı top-up / P2 gece batch) → bekleyebilir. `chat` P0 kalır. */
/**
 * ⚠️ TIMEOUT'U KISMA — kısarsan zincirin BAŞI sessizce devre dışı kalır.
 *
 * `generate` 150sn'ydi ve v4-pro'yu ÖLDÜRÜYORDU. Ölçüldü (gerçek router, gerçek charter):
 * çağrı 221sn sürdü → Pro 150sn'de timeout → kesici açıldı → zincir v4-flash'a düştü ve soruları
 * FLASH yazdı. Yani "üretim modeli v4-pro" derken fiilen %25 kabul oranlı modeli kullanıyorduk;
 * log'a bakmayan bunu FARK ETMEZ, çünkü istek başarıyla döner — sadece kalitesi düşüktür.
 *
 * İki sebep birleşti: (1) Pro adaptif düşünüyor, üretim 88–269sn bandında salınıyor;
 * (2) sağlayıcı `sort:'price'` ile en ucuza sabitlendi ve en ucuz uç nokta aynı zamanda en yavaşı.
 * Bu bilinçli bir takas: üretim interaktif DEĞİL (P1 top-up / P2 gece batch) → beklesin, ucuz olsun.
 * `chat` P0 kalır (45sn) — orada öğrenci ekran başında.
 */
// generateFree kolay/orta içindir → ağır [TASARIM] düşünmesi yok, 120sn yeter (generate 300sn zor için).
// repair: max_tokens 4000 ve iş mekanik → 120sn yeter (generate 300sn zor üretimi içindir).
const TIMEOUT_MS: Record<LlmRole, number> = { chat: 45_000, generate: 300_000, generateFree: 120_000, repair: 120_000, verify: 240_000, fast: 30_000 }
/**
 * Sağlayıcı-başına dakika tavanı.
 *
 * ⚠️ BU KAPI SAĞLAYICININ GERÇEK SINIRININ ALTINDA KALMALI — üstünde kalırsa kapı işe yaramaz,
 * ZARAR VERİR. google 14'tü ve gemini-2.5-flash ücretsiz katmanı 10 RPM: kendi kapımız sağlayıcının
 * izin verdiğinden fazlasını geçiriyordu. ÖLÇÜLDÜ (2026-07-24): günlük tavanın yalnız 70/170'i
 * kullanılmışken gemini kesicisi 10 ARDIŞIK arızayla açıktı ve üstel soğuma tavana (300 sn)
 * dayanmıştı. Yani bütçemiz boşken hat 5 dakikalık kesintiler yaşıyordu; 429'lar kotadan değil
 * DAKİKA sınırından geliyordu ve her biri kesiciyi biraz daha uzatıyordu.
 * 8, 10'un altında bilinçli pay: eşzamanlı hücreler aynı saniyeye denk gelince pencere kayabilir.
 */
const MINUTE_CAP: Record<Provider, number> = { openrouter: 18, groq: 25, google: 8 }
/**
 * Sağlayıcı-başına günlük ücretsiz tavan (env ile ezilebilir).
 * OpenRouter kredisiz hesapta 50/gün → güvenli 45; $10 sonrası OPENROUTER_FREE_DAILY=950 yap.
 *
 * ⚠️ GOOGLE ÜCRETSİZ KATMANI TOPLU ÜRETİM İÇİN KULLANILAMAZ — MODEL BAŞINA GÜNDE 20 İSTEK.
 * Canlı 429 gövdesinden ölçüldü (2026-07-24): quotaId
 * `GenerateRequestsPerDayPerProjectPerModel-FreeTier`, quotaValue **20**. İKİ model de sınandı,
 * ikisi de 20: `gemini-2.5-flash` VE `gemini-2.5-flash-lite`. Yani "lite'ın payı ~1000 RPD"
 * varsayımı bu proje için YANLIŞ; kotayı yükseltmenin yolu model değiştirmek değil, faturalı
 * katmana geçmektir.
 *
 * Buradaki tavan 200'dü — gerçeğin 10 KATI. Sonucu şuydu: sayaç "98/170, yerin var" derken
 * sağlayıcı çoktan 429 veriyor, her ret kesiciyi üstel olarak uzatıyor (30→300 sn) ve hat
 * dakikalarca ölüyordu. Bütçe kapısı koruma değil ZARAR üretiyordu; üstelik arıza "ücretsiz
 * model beceriksiz" gibi görünüyordu. 20 → sayaç sağlayıcıdan ÖNCE durur, 429 hiç yenmez.
 *
 * Ayrıca kota MODEL başına, bu sayaç ise SAĞLAYICI başına: flash'ın yaktığı 20 istek,
 * flash-lite'ın ayrı payını da yemiş gibi görünür. Kalıcı çözüm model-başına sayaç.
 * TOPLU ÜRETİMİN OMURGASI OPENROUTER ÜCRETSİZ SLUG'LARIDIR (~1000/gün); Google yalnız
 * günün ilk ~20 çağrısına yetişen bir bonustur.
 */
const DAY_CAP_BASE: Record<Provider, number> = {
  openrouter: Number(process.env.OPENROUTER_FREE_DAILY) || 45,
  groq: Number(process.env.GROQ_FREE_DAILY) || 900,
  google: Number(process.env.GOOGLE_FREE_DAILY) || 20, // ÖLÇÜLDÜ: model başına 20/gün (yukarı bak)
}
/** Öncelik payı: P0 tam tavan, P1 %95, P2 %85 (interaktifin payı asla yenmez). */
const PRIORITY_FACTOR: Record<LlmPriority, number> = { P0: 1, P1: 0.95, P2: 0.85 }

// ── In-memory fallback (Redis yoksa) ──
const memCounters = new Map<string, { n: number; exp: number }>()
const memInc = (key: string, ttlSec: number): number => {
  const now = Date.now()
  const cur = memCounters.get(key)
  if (!cur || cur.exp < now) {
    memCounters.set(key, { n: 1, exp: now + ttlSec * 1000 })
    return 1
  }
  cur.n += 1
  return cur.n
}
const memGet = (key: string): number => {
  const cur = memCounters.get(key)
  return cur && cur.exp > Date.now() ? cur.n : 0
}
const memSet = (key: string, ttlSec: number): void => {
  memCounters.set(key, { n: 1, exp: Date.now() + ttlSec * 1000 })
}

const dayKey = (p: Provider): string => `lb:llm:day:${p}:${new Date().toISOString().slice(0, 10)}`
const minuteKey = (p: Provider): string => `lb:llm:win:${p}:${Math.floor(Date.now() / 60_000)}`
const cbKey = (slug: string): string => `lb:llm:cb:${slug}`
const cbCountKey = (slug: string): string => `lb:llm:cbn:${slug}`

/**
 * ⚠️ BU KAPILARIN HİÇBİRİ REDIS YÜZÜNDEN İSTEĞİ ÖLDÜREMEZ.
 *
 * Redis hot-path client'ı artık `enableOfflineQueue:false` (bkz. clients/redis.ts) — yani
 * Redis kapalıyken komut BEKLEMEZ, anında REDDEDER. Bu doğru davranış, ama bedeli şu:
 * bu kapılar routedChat'in try bloğunun DIŞINDA çağrılıyor; yakalanmazlarsa reddediş
 * dışarı kaçar ve HİÇBİR SAĞLAYICI DENENMEZ. Redis düşünce sohbet, üretim, doğrulama —
 * hepsi anında ölür. Bu tam olarak "Redis = hot-path, yokluğu yavaşlatır kilitlemez"
 * kuralının ihlali olurdu.
 * → Her Redis dokunuşu yakalanır ve in-memory sayaca düşer. Bütçe hassasiyeti azalır
 *   (process-başına yaklaşık sayım), ama servis AYAKTA kalır. Doğru takas budur.
 */
async function incr(key: string, ttlSec: number): Promise<number> {
  if (!redis) return memInc(key, ttlSec)
  try {
    const n = await redis.incr(key)
    if (n === 1) await redis.expire(key, ttlSec)
    return n
  } catch {
    return memInc(key, ttlSec) // Redis düştü → yaklaşık say, isteği ÖLDÜRME
  }
}

/** Sayacı OKUR, artırmaz. Redis düşerse in-memory'den okur (incr ile aynı takas). */
async function oku(key: string): Promise<number> {
  if (!redis) return memGet(key)
  try {
    const v = await redis.get(key)
    return v ? Number(v) : 0
  } catch {
    return memGet(key) // Redis yok → yaklaşık say, isteği ÖLDÜRME
  }
}

/**
 * Ücretsiz slug için sağlayıcı-başına bütçe kapıları (aşımda false → zincirde ilerle).
 *
 * ⚠️ SAYAÇLARI BURADA ARTIRMA — KAPIYI SORMAK PAY YEMEMELİ. Eski hâli `incr` ile soruyordu,
 * yani çağrı GÖNDERİLMESE bile "gönderebilir miyim?" sorusu dakika payını tüketiyordu. Bu,
 * kendi kendini besleyen kalıcı bir kilit üretiyor ve ÖLÇÜLDÜ (2026-07-27, kredisiz havuz koşusu):
 * geçici bir arızayla hücreler düşmeye başlayınca kuyruk saniyeler içinde dönüyor, her dönüş
 * sayacı birkaç kez artırıyor, sayaç bir daha MINUTE_CAP'in altına İNEMİYOR → sonraki her hücre
 * "model zinciri boş" diye düşüyor. Kanıt: 24 ardışık düşen hücre, 0 kesici, 0 çağrı — istekler
 * sağlayıcıya HİÇ ulaşmadı. Aynı anda doğrudan sondaj: iki ücretsiz uç da 1 sn'de cevap verdi.
 * Yani bütçe kapısı, sağlayıcı bomboşken hattı kendi başına öldürüyordu.
 * havuz-doldur'un 60 sn'lik freni de kurtarmıyor: iki işleyiciden yalnız biri frenler, öteki
 * dönüp sayacı beslemeye devam eder.
 *
 * Pay, çağrı GERÇEKTEN gönderilecekken `freeBudgetTuket` ile düşülür (routedChat/routedStream).
 * Oku-sonra-artır arasında yarış var (iki eşzamanlı çağrı aynı payı görebilir) — bilinçli: bu
 * dosyanın zaten ilan ettiği takas, "bütçe hassasiyeti azalır ama servis AYAKTA kalır".
 */
async function freeBudgetOk(provider: Provider, priority: LlmPriority): Promise<boolean> {
  const dakika = await oku(minuteKey(provider))
  const gunTavan = Math.floor(DAY_CAP_BASE[provider] * PRIORITY_FACTOR[priority])
  const gun = await oku(dayKey(provider))
  const kapali = dakika >= MINUTE_CAP[provider] ? 'dakika' : gun >= gunTavan ? 'gun' : null
  // ⚠️ KAPI SESSİZ KAPANMASIN. Kapandığında çağıran yalnız "model zinciri boş: <rol>" görüyordu;
  // zincirdeki HER slug bu yüzden atlandığında arıza "ücretsiz modeller çalışmıyor" gibi görünür,
  // oysa sağlayıcıya tek istek bile gitmemiştir. ÖLÇÜLDÜ (2026-07-27): 32 ardışık düşen hücre,
  // 0 kesici, 0 HTTP durumu — sebep bu kapıydı ve hangi sayacın dolduğu LOGDAN OKUNAMIYORDU.
  if (kapali) logger.warn({ provider, priority, sebep: kapali, dakika, dakikaTavan: MINUTE_CAP[provider], gun, gunTavan }, 'ücretsiz bütçe kapısı kapattı')
  return !kapali
}

/** Kapıdan geçen ve fiilen gönderilecek çağrı için payı düş (yalnız ücretsiz slug'larda). */
async function freeBudgetTuket(provider: Provider): Promise<void> {
  await incr(minuteKey(provider), 120)
  await incr(dayKey(provider), 172_800)
}

async function breakerOpen(slug: string): Promise<boolean> {
  if (!redis) return memGet(cbKey(slug)) > 0
  try {
    return (await redis.exists(cbKey(slug))) === 1
  } catch {
    return memGet(cbKey(slug)) > 0 // Redis yok → kesiciyi in-memory'den oku (fail-open)
  }
}

/** 429/5xx/ağ/timeout'ta kesiciyi aç — üstel soğuma 30s→5dk. */
async function tripBreaker(slug: string): Promise<void> {
  const n = await incr(cbCountKey(slug), 3600)
  const cooldown = Math.min(300, 30 * 2 ** Math.max(0, n - 1))
  memSet(cbKey(slug), cooldown) // her hâlükârda in-memory (Redis düşerse tek dayanak bu)
  if (redis) await redis.set(cbKey(slug), '1', 'EX', cooldown).catch(() => {})
  logger.warn({ slug, cooldown }, 'model kesicisi açıldı')
}

async function resetBreaker(slug: string): Promise<void> {
  memCounters.delete(cbKey(slug))
  memCounters.delete(cbCountKey(slug))
  if (redis) await redis.del(cbCountKey(slug)).catch(() => {})
}

/**
 * SDK hatasının GERÇEK sınıf adı.
 *
 * ⚠️ OpenAI SDK'sı (Stainless üretimi) hata sınıflarında
 * `this.name` ATAMIYOR. `class APIConnectionError extends APIError` yazmak err.name'i
 * DEĞİŞTİRMEZ — 'Error' kalır. Ampirik doğrulandı:
 *     new OpenAI.APIConnectionError({message:'boom'})  →  name: "Error", status: undefined
 * Sonuç: isRetryable'ın `name === 'APIConnectionError'` kontrolü HİÇ EŞLEŞMEDİ. Ağ kopması,
 * DNS/TLS hatası, socket hang-up → retryable değil, skippable değil → throw → ZİNCİR ÇÖKÜYOR.
 * Fallback zinciri, tam da var olma sebebi olan durumda (sağlayıcının ağı bozuk) ölüydü.
 * Gerçek ad yalnız constructor.name'de yaşıyor.
 */
const errName = (err: unknown): string => {
  const e = err as { name?: string; constructor?: { name?: string } }
  return e?.name && e.name !== 'Error' ? e.name : (e?.constructor?.name ?? 'Error')
}

/** Geçici arıza (429/5xx/ağ/timeout) → kesiciyi aç + zincirde ilerle.
 *  APIUserAbortError BİLEREK yok: o, öğrencinin akışı iptal etmesidir; yeniden denemek
 *  iptal edilmiş isteği tekrar çağırmak olur. Bizim timeout'umuz withTimeout() içinde
 *  açıkça TimeoutError'a çevriliyor. */
const RETRY_NAMES = new Set([
  'AbortError',
  'TimeoutError',
  'APIConnectionError',
  'APIConnectionTimeoutError',
  'InternalServerError',
  'RateLimitError',
])
const isRetryable = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status
  if (status === 429 || (typeof status === 'number' && status >= 500)) return true
  return RETRY_NAMES.has(errName(err))
}

/**
 * TIMEOUT'U KENDİ ABORT'UMUZLA KUR — sonra onu açıkça TimeoutError'a çevir.
 *
 * NEDEN böyle: `AbortSignal.timeout()` kullanınca SDK `APIUserAbortError`
 * fırlatıyor; adı ne 'AbortError' ne 'TimeoutError' → isRetryable FALSE dönüyordu →
 * routedChat `throw err` yapıp ZİNCİRİ ÇÖKERTİYORDU. Yani birincil sağlayıcı zaman
 * aşımına uğradığı anda Groq/OpenRouter'a hiç geçilmiyordu — fallback'in tam olarak
 * gerektiği durumda devre dışıydı. (Ölçüldü: gen-smoke, üretim 60sn'yi aştı → script öldü.)
 *
 * "APIUserAbortError'ı da retryable say" demek YANLIŞ olurdu: o hata öğrenci akışı
 * iptal ettiğinde de fırlar; onu yeniden denemek iptal edilen isteği tekrar çağırmak olur.
 * Ayrımı ancak abort'a KİMİN sebep olduğunu bilerek yapabiliriz → kendi controller'ımız.
 */
async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), ms)
  try {
    return await fn(ac.signal)
  } catch (err) {
    if (ac.signal.aborted) {
      const e = new Error(`model zaman aşımı (${ms} ms)`)
      e.name = 'TimeoutError' // → isRetryable → kesici açılır, zincirde ilerlenir
      throw e
    }
    throw err
  } finally {
    clearTimeout(timer)
  }
}

/** Kalıcı slug arızası (model kalktı/kredi yok: 400/402/404) → kesicisiz atla, zincirde ilerle.
 *  Yalnız 401 (auth) anında fırlatılır — zincirle çözülemez. */
const isSkippable = (err: unknown): boolean => {
  const status = (err as { status?: number })?.status
  return status === 400 || status === 402 || status === 404
}

type ChatParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming, 'model'>
type StreamParams = Omit<OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming, 'model' | 'stream'>

/**
 * OPENROUTER SAĞLAYICI TERCİHİ — sessiz 4× fazla ödemeyi kapatır. SİLME.
 *
 * Bir OpenRouter slug'ı TEK bir sağlayıcı değildir: deepseek-v4-pro'yu 16 firma sunuyor ve
 * fiyatları 4× ayrışıyor (çıktı/MTok): DeepSeek resmi $0.87 · StreamLake $1.43 · DeepInfra $2.60
 * · Fireworks/Together $3.48. Varsayılan yönlendirme bunlar arasında dolaşır.
 *
 * ÖLÇÜLDÜ (v4-pro, aynı istem, canlı):
 *   tercih yok  → Alibaba    $3.10/MTok   ← eski hâl
 *   sort:price  → DeepSeek   $0.96/MTok   ← şimdiki hâl, 3.2× ucuz
 * Çağrıdan çağrıya token başına fiyat 4× oynuyordu — "model aynı, fatura farklı" gürültüsünün
 * kaynağı buydu.
 *
 * İkinci ve daha sinsi kısım: PAHALI sağlayıcıların çoğu fp8/fp4 KUANTİZE, yani aynı model
 * daha düşük hassasiyette. Rastgele yönlendirme hem fazla ödetiyor hem soru kalitesini
 * sessizce düşürüyordu — ölçülemeyen bir kalite kaybı, çünkü slug adı değişmiyor.
 * DeepSeek'in kendi uç noktası hem en ucuz HEM kuantize olmayan tek uç nokta → çifte kazanç.
 *
 * ⚠️ BU FİYAT KODA DEĞİL, HESAP AYARINA BAĞLI. DeepSeek'in kendi uç noktası OpenRouter'ın
 * gizlilik/veri politikası ayarıyla ENGELLENEBİLİR ("No endpoints available matching your
 * guardrail restrictions and data policy" → openrouter.ai/settings/privacy). Engelliyse bu kod
 * sessizce StreamLake'e ($1.53/MTok) düşer — hata vermez, sadece fatura ~1.6× artar. Yani
 * üretim maliyeti aniden yükseldiyse önce KODA DEĞİL, o ayara bak.
 * (Takas bilinçli: DeepSeek istemleri eğitimde kullanabilir. Havuz üretimi öğrenci verisi
 *  GÖNDERMEZ — gece demirhanesi nötr `00000000-…` kullanıcısıyla üretir, içerik saf müfredattır.)
 *
 * `sort: 'price'` en ucuzu seçer; ayar açıkken bu DeepSeek'tir, kapalıyken sıradaki en ucuz.
 * `allow_fallbacks` açık kalır: en ucuz sağlayıcı düşerse OpenRouter sıradakine geçer, istek
 * ölmez (zincirin devre kesicisi zaten üstte duruyor).
 */
const OR_SAGLAYICI = { sort: 'price', allow_fallbacks: true } as const

/**
 * DÜŞÜNMEYİ ROL BAZINDA KAPAT — faturayı sağlayıcı değil, TOKEN SAYISI belirliyor.
 *
 * ⚠️ AYNI SLUG, SAĞLAYICIYA GÖRE FARKLI MODEL GİBİ DAVRANIYOR. deepseek-v4-flash, ölçüldü:
 *     DeepInfra  $0.090/$0.180  reasoning=0  ← düşünmez   · StreamLake $0.097/$0.193  düşünür
 *     GMICloud   $0.098/$0.196  düşünür      · DeepSeek   $0.140/$0.280  düşünür (flash'ta EN PAHALI!)
 * Token fiyatları %8 ayrışıyor ama FATURA ~10× ayrışıyor: düşünen sağlayıcıda aynı istek
 * 70 token, düşünmeyende 8. `sort:price` bunu göremez — fiyat ETİKETİNE bakar, DAVRANIŞA değil.
 * Bu yüzden doğruladığımız model çalışan model DEĞİLDİ: altın set ölçümü (flash hakem 3/4,
 * $0.00012/denetim) DeepInfra'da yapılmıştı; üretimde GMICloud'a düşüldü ve denetim ~$0.001 oldu.
 *
 * ⚠️ DÜŞÜNMEYİ İSTEK PARAMETRESİYLE KAPATAMIYORUZ — DENENDİ, ÜÇÜ DE YOK SAYILDI.
 * Sağlayıcı GMICloud'a SABİTLENİP ölçüldü (parametrenin etkisini sağlayıcı seçiminden ayırmak
 * için — aksi hâlde "DeepInfra'ya düştü" ile "parametre çalıştı" karışır, bir kez karıştı):
 *     parametre yok            → reasoning=29
 *     reasoning:{enabled:false}→ reasoning=30   ← etkisiz
 *     reasoning:{exclude:true} → reasoning=29   ← etkisiz
 *     reasoning_effort:'minimal' → düşündü      ← etkisiz
 * Yani düşünüp düşünmemeyi SAĞLAYICI belirliyor, istek değil. Tek kaldıraç sağlayıcı seçimi.
 *
 * ROL BAZINDA SAĞLAYICI — çünkü "en ucuz" her rolde doğru cevap değil:
 *   chat/fast → DeepInfra: hem en ucuz hem düşünmez (~10× az token) hem en hızlı. Bu roller
 *               sınıflama/sohbet; düşünme bedeli boşa. Kalite kapısı da yok.
 *   verify    → DeepInfra HARİÇ, sonra en ucuz: hakem soruyu SIFIRDAN çözüyor, düşünme işin
 *               TA KENDİSİ. DeepInfra ~$0.0009/denetim kazandırır ama çözemediği SAĞLAM soruyu
 *               reddeder → yeniden üretim ~$0.005: tasarruf, kaybın 5'te biri.
 *               ⚠️ `ignore` ŞART, yoksa sort:price hakemi de DeepInfra'ya yollar (ÖLÇÜLDÜ) ve
 *               DeepInfra 429 verdiği anda düşünen sağlayıcıya kayar → KAPININ SERTLİĞİ ŞANSA
 *               KALIR: aynı soru bir koşuda düşünen, ötekinde düşünmeyen hakemden geçer.
 *               Belirsiz kapı, iki seçenekten de kötüdür. Hakem hep aynı cinsten olmalı.
 *   generate  → sort:price → DeepSeek (v4-pro'da en ucuz VE kuantize olmayan tek uç nokta).
 * DeepInfra fp4 kuantize ve bize 429 veriyor → chat/fast'te allow_fallbacks AÇIK: müsait değilse
 * zincir düşünen bir sağlayıcıya kayar, istek ölmez (fatura artar; log'da `provider`a bak).
 */
const OR_SAGLAYICI_ROL: Partial<Record<LlmRole, object>> = {
  chat: { order: ['deepinfra'], allow_fallbacks: true },
  fast: { order: ['deepinfra'], allow_fallbacks: true },
  verify: { ignore: ['deepinfra'], sort: 'price', allow_fallbacks: true },
}

/** OpenRouter'a giden gövdeye sağlayıcı tercihini ekler; Groq'a EKLEMEZ (o alanı bilmez). */
const saglayiciEkle = <T extends object>(p: Provider, rol: LlmRole, govde: T): T =>
  p === 'openrouter'
    ? ({ ...govde, provider: OR_SAGLAYICI_ROL[rol] ?? OR_SAGLAYICI } as T)
    : govde

/**
 * ── DOLAR SAYACI + SERT TAVAN ──
 *
 * Router ücretsiz İSTEK sayıyordu ama harcanan PARAYI saymıyordu; "20 senti geçince dur" gibi
 * bir sınır bu yüzden hiçbir yerde zorlanamıyordu. Sayaç varsayılan olarak KAPALIDIR
 * (tavan = Infinity) — normal üretim davranışı değişmez; yalnız `maliyetTavani(usd)` çağıran
 * script'ler için işler.
 *
 * ⚠️ Tavan aşımı, çağrı GÖNDERİLMEDEN önce fırlatır — "bir tık aşarsa dursun" değil,
 * "aşacaksa hiç gitmesin". Zincirde ilerlemez de (sonraki slug de para yakardı).
 *
 * ⚠️ FİYATLAR KODDA SABİT (aşağıdaki tablo). Sağlayıcı fiyatı değiştirirse sayaç YANILIR;
 * bilinmeyen paralı slug için bilerek YÜKSEK varsayılan kullanılır (az tahmin edip tavanı
 * sessizce aşmaktansa, fazla tahmin edip erken durmak yeğdir).
 */
const FIYAT: Record<string, { g: number; c: number }> = {
  // $/MTok — 2026-07-19 canlı katalogdan
  'deepseek/deepseek-v4-pro': { g: 0.435, c: 0.870 },
  'deepseek/deepseek-v4-flash': { g: 0.098, c: 0.196 },
  'deepseek/deepseek-v3.2': { g: 0.269, c: 0.400 },
  'openai/gpt-oss-120b': { g: 0.037, c: 0.170 },
  'nvidia/nemotron-3-super-120b-a12b': { g: 0.085, c: 0.400 },
}
const FIYAT_BILINMEYEN = { g: 1.0, c: 3.0 } // temkinli üst sınır

let harcananUsd = 0
let maliyetTavaniUsd = Number.POSITIVE_INFINITY

export class MaliyetTavaniAsildi extends Error {
  constructor(harcanan: number, tavan: number) {
    super(`maliyet tavanı aşıldı: $${harcanan.toFixed(4)} ≥ $${tavan.toFixed(4)}`)
    this.name = 'MaliyetTavaniAsildi'
  }
}

/** Tavanı kurar ve sayacı sıfırlar. Tavansız çağrı (argümansız) sayacı yalnız sıfırlar. */
export const maliyetTavani = (usd = Number.POSITIVE_INFINITY): void => {
  maliyetTavaniUsd = usd
  harcananUsd = 0
}
export const maliyetHarcanan = (): number => harcananUsd

const maliyetEkle = (
  slug: string,
  role: LlmRole,
  usage?: { prompt_tokens?: number; completion_tokens?: number; completion_tokens_details?: { reasoning_tokens?: number } },
): void => {
  if (isFree(slug)) return // :free slug → $0, sayaca girmez
  const f = FIYAT[slug] ?? FIYAT_BILINMEYEN
  const girdi = usage?.prompt_tokens ?? 0
  const cikti = usage?.completion_tokens ?? 0
  const dusunme = usage?.completion_tokens_details?.reasoning_tokens ?? 0
  const girdiUsd = (girdi * f.g) / 1e6
  const ciktiUsd = (cikti * f.c) / 1e6
  harcananUsd += girdiUsd + ciktiUsd
  // ⚠️ ÇAĞRI BAŞINA DÖKÜM — "fatura neden yüksek?" sorusu tahminle cevaplanmasın.
  // ÖLÇÜLDÜ (2026-07-20): tek bir "zor" üretim çağrısı 16.000 çıktı token'ının TAMAMINI
  // düşünmeye harcayıp SIFIR metin üretti ($0.0139, karşılığı yok). Düşünme, çıktı fiyatından
  // faturalanır; yani asıl maliyet kalemi ÜRETİLEN METİN DEĞİL, MODELİN DÜŞÜNMESİDİR.
  // Bu satır olmadan kalem ayrımı yapılamıyordu (toplam sayaç "nereye gitti"yi söylemez).
  logger.info(
    { slug, role, girdi, cikti, dusunme, dusunmeOran: cikti ? Math.round((100 * dusunme) / cikti) : 0,
      girdiUsd: Number(girdiUsd.toFixed(5)), ciktiUsd: Number(ciktiUsd.toFixed(5)),
      cagriUsd: Number((girdiUsd + ciktiUsd).toFixed(5)), toplamUsd: Number(harcananUsd.toFixed(4)) },
    'maliyet: çağrı dökümü',
  )
}

/** Zincirden uygun slug'ları sırayla dener; hepsi düşerse son hatayı fırlatır. */
export async function routedChat(
  role: LlmRole,
  params: ChatParams,
  opts: { priority?: LlmPriority } = {},
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const priority = opts.priority ?? 'P1'
  let lastErr: unknown = new Error(`model zinciri boş: ${role}`)
  for (const slug of CHAINS[role]) {
    const { provider, model } = parseEntry(slug)
    const client = clientOf(provider)
    if (!client) continue // GROQ_API_KEY yoksa groq atlanır
    // Tavan dolduysa PARALI slug'a hiç gitme (ücretsiz slug bedava, o sürebilir).
    //
    // ⚠️ DENETİM (verify) TAVANDAN MUAF — bilerek. Tavan denetimi de kesince şu oluyordu:
    // parası ÖDENMİŞ adaylar denetlenemiyor, `verifyQuestion` "denetçi konuşamadı" deyip REJECT
    // veriyor ve uçuştaki tüm üretim çöpe gidiyordu. ÖLÇÜLDÜ (2026-07-24, v4-flash yazar denemesi):
    // adaylar biçim olarak sağlam üretildi, ücretsiz hakem kotası o sırada tükendi, tavan da paralı
    // hakemi kapattı → 0 kabul, $0.027 KARŞILIKSIZ. Tavanın amacı harcamayı sınırlamaktı; sonucu
    // harcamayı ÇÖPE ÇEVİRMEK oldu.
    // Muafiyetin bedeli önemsiz: denetim faturanın %8'i (ölçüldü) ve denetim başına ~$0.001.
    // Tavan asıl kalemi (üretim, %92) kesmeye devam eder — yani sınır işlevini korur.
    if (role !== 'verify' && !isFree(slug) && harcananUsd >= maliyetTavaniUsd) {
      throw new MaliyetTavaniAsildi(harcananUsd, maliyetTavaniUsd)
    }
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(provider, priority))) continue // bütçe → sıradaki
    if (isFree(slug)) await freeBudgetTuket(provider) // pay burada düşer: çağrı GİDİYOR
    try {
      // ⚠️ HTTP 200 + HATA GÖVDESİ — OpenRouter'ın SESSİZ arıza biçimi. Sağlayıcı kapasitesi
      // dolduğunda gövde `{error:{...}}` döner ve `choices` HİÇ GELMEZ. Durum kodu 200 olduğu
      // için SDK fırlatmaz, kesici açılmaz, zincir ilerlemez — çağıran `res.choices[0]` derken
      // TypeError alır. ÖLÇÜLDÜ (2026-07-20 A/B koşusu): denetçi başı ultra:free iken HER aday
      // "denetim başarısız" diye elendi; paralı üretim para yakarken havuza sıfır soru yazıldı.
      // Arıza denetçide görünüyordu ama yeri BURASI: geçersiz yanıtı geçerli sayan router.
      //
      // ⚠️ ÜCRETSİZ UÇTA ÖNCE YERİNDE TEKRAR DENE, hemen zincire düşme. ÖLÇÜLDÜ (aynı gün,
      // ultra:free'ye 3 ardışık çağrı): 1 başarısız + 2 başarılı; başarısız olan 1 SANİYEDE
      // dönüyor ("Worker local total request limit reached") — yani geçici kapasite dalgası.
      // Tek dalgada kesici açmak ücretsiz denetçiyi 30-120 sn devre dışı bırakır ve TÜM trafik
      // paralı yedeğe akar: bedava hat, bedava olmayan bir sebeple kaybedilir. Tekrar bedava
      // ve saniyelik; kesici ancak ısrarlı arızada açılır.
      const dene = isFree(slug) ? 3 : 1
      let res: OpenAI.Chat.Completions.ChatCompletion | null = null
      let bosGovde: string | undefined
      for (let d = 1; d <= dene; d++) {
        const aday = await withTimeout(TIMEOUT_MS[role], (signal) =>
          client.chat.completions.create(saglayiciEkle(provider, role, { ...params, model }), { signal }),
        )
        if (aday?.choices?.length) { res = aday; break }
        bosGovde = (aday as unknown as { error?: { message?: string } })?.error?.message
        if (d < dene) await new Promise((r) => setTimeout(r, 1_500))
      }
      if (!res) {
        lastErr = new Error(`yanıtta choices yok (200+hata gövdesi): ${slug}`)
        logger.warn({ slug, role, deneme: dene, hata: bosGovde }, 'geçersiz yanıt (choices yok) — zincirde ilerleniyor')
        await tripBreaker(slug)
        continue
      }
      void resetBreaker(slug)
      maliyetEkle(slug, role, res.usage)
      return res
    } catch (err) {
      lastErr = err
      if (isRetryable(err)) {
        await tripBreaker(slug)
        continue
      }
      if (isSkippable(err)) {
        logger.warn({ slug, status: (err as { status?: number })?.status }, 'slug kalıcı arızalı — zincirde ilerleniyor')
        continue
      }
      throw err // 401 vb. — zincirle çözülmez
    }
  }
  throw lastErr
}

/**
 * Stream varyantı (Kaptan SSE). Fallback yalnız BAŞLATMA hatasında işler;
 * akış ortası kopmalar çağıranın sorumluluğudur (mesaj yine persist edilir).
 *
 * NOT: Anthropic sökülene kadar bu döngü zincirin BAŞINI atlıyordu ('anthropic:' girdilerinin
 * stream adaptörü yoktu) — yani P0 sohbet, routedChat'in kullandığı modelden BAŞKA bir modele
 * düşüyordu. Artık tüm sağlayıcılar OpenAI-uyumlu: stream ve non-stream aynı slug'ı kullanır.
 */
export async function routedStream(
  role: LlmRole,
  params: StreamParams,
  opts: { priority?: LlmPriority } = {},
): Promise<{ stream: AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>; model: string }> {
  const priority = opts.priority ?? 'P0'
  let lastErr: unknown = new Error(`model zinciri boş: ${role}`)
  for (const slug of CHAINS[role]) {
    const { provider, model } = parseEntry(slug)
    const client = clientOf(provider)
    if (!client) continue
    if (await breakerOpen(slug)) continue
    if (isFree(slug) && !(await freeBudgetOk(provider, priority))) continue
    if (isFree(slug)) await freeBudgetTuket(provider) // pay burada düşer: çağrı GİDİYOR
    try {
      // withTimeout: (1) timeout'u TimeoutError'a çevirir → zincir çökmez, sonraki sağlayıcıya
      // geçer (routedChat'teki düzeltmenin aynısı; burada eksikti — P0 sohbet yolu bu).
      // (2) Zamanlayıcı create() dönünce finally'de TEMİZLENİR. Eski AbortSignal.timeout(45sn)
      // akışa bağlı kalıyordu: 45sn'den uzun süren bir cevap ORTASINDAN kesiliyordu. Artık
      // timeout yalnız BAŞLATMAYA (ilk bayta kadar) uygulanır — akışın süresi sınırsız.
      const stream = await withTimeout(TIMEOUT_MS[role], (signal) =>
        client.chat.completions.create(saglayiciEkle(provider, role, { ...params, model, stream: true }), { signal }),
      )
      void resetBreaker(slug)
      return { stream, model: slug }
    } catch (err) {
      lastErr = err
      if (isRetryable(err)) {
        await tripBreaker(slug)
        continue
      }
      if (isSkippable(err)) {
        logger.warn({ slug, status: (err as { status?: number })?.status }, 'slug kalıcı arızalı — zincirde ilerleniyor')
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/**
 * LLM ÇIKTISINDAN JSON — model çıktısı ASLA güvenilir değildir.
 *
 * ⚠️ Kod şöyleydi: `JSON.parse(res.choices[0]?.message.content ?? '{}')`
 * Ama `??` yalnız null/undefined'ı yakalar — BOŞ STRING'İ YAKALAMAZ. Model boş içerik
 * döndürürse `JSON.parse('')` fırlatır. Yarım JSON (max_tokens'a takılmış yanıt) da fırlatır.
 * Ölçüldü: ATLAS'ın teşhis görevi tam olarak böyle öldü — "JSON Parse error: Unexpected EOF"
 * ve görev FAILED oldu; öğrencinin yanılgısı hiç teşhis edilmedi.
 *
 * Üç savunma: boş kontrolü · markdown çiti soyma (```json … ```) · ilk {…} bloğunu çıkarma.
 * Başarısızlıkta FIRLATMAZ, null döner — çağıran "teşhis üretilemedi" deyip zarifçe biter.
 */
export function jsonCoz<T>(icerik: string | null | undefined): T | null {
  const ham = (icerik ?? '').trim()
  if (!ham) return null

  const cit = ham.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const aday = (cit?.[1] ?? ham).trim()

  try {
    return JSON.parse(aday) as T
  } catch {
    // Model JSON'un başına/sonuna laf eklemiş olabilir → ilk dengeli {…} bloğunu dene.
    const bas = aday.indexOf('{')
    const son = aday.lastIndexOf('}')
    if (bas < 0 || son <= bas) return null
    try {
      return JSON.parse(aday.slice(bas, son + 1)) as T
    } catch {
      return null
    }
  }
}

/** Kısayol: tek metin yanıtı (questions-ai.llmChat halefi). */
export async function routedText(
  role: LlmRole,
  params: ChatParams,
  opts: { priority?: LlmPriority } = {},
): Promise<string> {
  const res = await routedChat(role, params, opts)
  return res.choices[0]?.message?.content ?? ''
}
