// Havuz sorusu — ÖSYM (yks_questions) ve AI (yks_ai_questions) ORTAK şekli:
// options bir OBJE { A..E }. İkisi ayrı tablo, asla karışmaz; yalnız bu tip aynı
// (Çöz yüzeyi ikisini de render edebilsin diye).
//
// ⚠️ `correct_option` ve `solution` BU TİPTE YOK — GERİ EKLEME.
// Soruyu servis eden uçlar (/questions/ai, /practice/review, /practice/next) doğru şıkkı
// ARTIK GÖNDERMİYOR: öğrenci daha cevaplamadan doğru cevabı okuyabiliyordu. Geri bildirim
// için gereken doğru şık ve çözüm, cevap verildikten SONRA `/answers` yanıtında döner
// (bkz. CevapSonucu). Tek doğruluk kaynağı sunucudur.
export interface HavuzSoru {
  id: string
  subject: string
  kazanim_id?: number | null
  topic?: string | null
  question_text: string
  options: Record<string, string>
  difficulty?: string | null
  quality?: number | null
  exam_year?: number
  exam_label?: string | null
  source_type?: string
}

/** POST /answers yanıtı — cevabın SUNUCUDAKİ hükmü ve geri bildirim malzemesi. */
export interface CevapSonucu {
  success: boolean
  /** Sunucunun hükmü. Soru havuzda çözülemediyse (efemer) null. */
  isCorrect: boolean | null
  /** Doğru şık harfi ('A'..'E') — yalnız cevaptan sonra döner. */
  correctOption: string | null
  /** Çözüm/açıklama metni. */
  solution: string | null
  /** Doğruluk DB'den doğrulanabildi mi (false ise XP verilmez). */
  dogrulandi: boolean
  /** Bu soru bugün zaten cevaplanmıştı → kayıt alındı ama PUANLANMADI. */
  tekrar: boolean
  xpGained: number
}

export type CozKaynak = 'ai' | 'osym' | 'review' | 'antrenman' | 'tanisma' | 'odev' | 'konu'

/**
 * KAPTAN MESAJINA İLİŞTİRİLEN EYLEM BUTONU.
 *
 * Şekil backend ile ORTAKTIR: learnup-brain/src/agents/tools.ts · EylemTarifi
 * Kaynağı `eylem_oner` aracının çıktısıdır — asistan METNİNDEN türetilmez. Metinden
 * parse etmek, arayüzü LLM'in kelime seçimine bağlamak olurdu: model bir gün başka
 * türlü ifade eder, buton sessizce kaybolur ve hata da vermez.
 *
 * ⚠️ Bilinmeyen `tur` SESSİZCE ATLANIR (Kaptan.tsx). Backend yeni bir buton türü
 * eklediğinde eski istemci çökmemeli; buton görünmez, mesaj okunur kalır.
 */
export interface EylemTarifi {
  tur: 'coz' | 'tekrar' | 'antrenman' | 'rota' | 'konular' | 'plan_bekle'
  etiket: string
  kaynak?: CozKaynak
  kazanimId?: number
  subject?: string
  difficulty?: 'kolay' | 'orta' | 'zor'
  baslik?: string
  /** tur='plan_bekle': bu görev yoklanır; bitince buton "Rota'ya git"e dönüşür. */
  taskId?: string
}

/* ═══ GET /questions/ai/konular — ders → konu listesi (0026 konu katmanı) ═══ */
export interface KonuOgesi {
  konuId: number
  ad: string
  sinav: 'TYT' | 'AYT'
  soruSayisi: number
  kolay: number
  orta: number
  zor: number
  /** Öğrencinin bu konuda çözdüğü FARKLI soru adedi. */
  cozulen: number
}
/** Ünite = ders içindeki konu öbeği (0031). Kart olarak gösterilir. */
export interface KonuUnitesi {
  ad: string
  sinav: 'TYT' | 'AYT'
  sira: number
  toplam: number
  /** Öğrencinin bu ünitede çözdüğü farklı soru adedi (ilerleme yüzdesi bundan). */
  cozulen: number
  /** Çözdüklerinin kaçı doğru (başarı yüzdesi bundan). */
  dogru: number
  konular: KonuOgesi[]
}
export interface KonuDersi {
  subject: string
  tyt: boolean
  ayt: boolean
  toplam: number
  konuSayisi: number
  cozulen: number
  dogru: number
  uniteler: KonuUnitesi[]
}
export interface KonularYaniti {
  alan: 'sayisal' | 'sozel' | 'esit_agirlik' | null
  dersler: KonuDersi[]
  toplam: number
}

// Çöz ekranına router state ile geçirilen oturum tarifi.
export interface CozSpec {
  source: CozKaynak
  title?: string
  subject?: string
  kazanimId?: number
  konuId?: number           // konu: Konular ekranından seçilen klasik konu (0026)
  year?: number             // osym: yıla göre çöz
  label?: string            // osym: sınav etiketi (TYT / AYT-…) — prova setleri
  difficulty?: 'kolay' | 'orta' | 'zor'
  questions?: HavuzSoru[]   // osym: listeyi doğrudan geçir (tek-soru ucu yok)
  startIndex?: number
  /**
   * Koç sohbetinden gelindiyse O SOHBETİN kimliği — test bitince geri dönüş için taşınır.
   * Olmadan "Koç'a dön" öğrenciyi BOŞ bir sohbete atardı (ekran artık her girişte temiz
   * sohbet açıyor) ve testi öneren konuşma kaybolurdu.
   */
  donusSession?: string
}

/** Testte yanlış yapılan tek soru — Koç'un analiz edeceği ham malzeme. */
export interface TestYanlis {
  soru: string          // kırpılmış kök metni
  subject: string
  konu?: string | null
  secilen: string       // öğrencinin işaretlediği şık ('A'..'E')
  dogruSik: string
}

/**
 * Çöz ekranından Koç'a taşınan test sonucu (nav state).
 *
 * ⚠️ SORU METİNLERİ KIRPILIR ve YALNIZ YANLIŞLAR taşınır. Doğru çözülen 20 sorunun tam
 * metnini sohbete taşımak, analiz için hiçbir şey eklemeden istemi şişirir (ve LLM
 * faturasını). Analizin malzemesi hatadır.
 */
export interface TestOzeti {
  kaynak: CozKaynak
  baslik?: string
  dogru: number
  toplam: number
  dokum: { subject: string; dogru: number; toplam: number }[]
  yanlislar: TestYanlis[]
}

export const TIER_TR: Record<string, string> = {
  bronze: 'Bronz', silver: 'Gümüş', gold: 'Altın', sapphire: 'Safir', diamond: 'Elmas',
}

// GET /api/v1/mastery — bilişsel haritanın tek satırı (bir kazanım).
// mastery ÇÜRÜME UYGULANMIŞ etkin değerdir (backend effectiveMastery'den geçirir);
// istemci onu yeniden hesaplamaz, olduğu gibi boyar.
export interface MasteryNode {
  kazanimId: number
  code: string | null
  title: string
  subject: string
  path: string              // ltree: 'mat.turev.zincir_kurali' → ilk segment = ders kökü
  mastery: number           // 0–1
  attempts: number
  correct: number
  openMisconceptions: number
}

export interface MasteryYanit {
  nodes: MasteryNode[]
  total: number
}

/* ═══ GET /mastery/rontgen — Analiz ekranının tek-istek veri seti ═══ */

export interface RontgenNode extends MasteryNode {
  avgLatencyMs: number | null  // hız analizi ("doğru ama yavaş" kuralının görünür yüzü)
  updatedAt: string            // paslanma rozeti bundan türetilir
}

export interface TrendGunu { date: string; solved: number; correct: number; xp: number }

export interface Tuzak {
  kazanimId: number; title: string; subject: string
  selectedOption: string; missCount: number
}

export interface RontgenYanit {
  nodes: RontgenNode[]
  total: number
  curriculum: { subject: string; total: number }[]
  trend: TrendGunu[]
  zorluk: { kolay: number; orta: number; zor: number }
  traps: Tuzak[]
}

/* ═══ GET /questions/ai/kalite — Havuz Güvencesi (yapisal-eval şeffaflığı) ═══ */

export interface KaliteYanit {
  havuz: {
    toplam: number
    osymReferans: number
    ortKalite: number | null
    zorluk: Record<string, number>
    dersler: { subject: string; count: number }[]
  }
  yapisal: {
    sizinti: { osym: number | null; ai: number | null }
    kusatma: { osym: number | null; ai: number | null }
    sayiYogunlugu: { subject: string; osym: number | null; ai: number | null }[]
    gorselGonderme: number
  }
  ozgunluk: {
    esikler: { subject: string; esik: number }[]
    snapshot: { tarih: string; nnKopya: number; nnP90: number } | null
  }
  olcumZamani: string
}

/* ═══ GET /garden ═══ */

export interface BahceYaniti {
  coins: number
  inventory: { item_id: string; kind: string; count: number }[]
  plants: { id: string; item_id: string; x: number | null; y: number | null; scale: number | null }[]
  catalog: { itemId: string; price: number; kind: string; unlockBadge: string | null; rarity: string | null }[]
  badges: string[]
}

/* ═══ GET /gamification/league ═══ */

export interface LigYaniti {
  weekId: string
  tier: string
  top: { rank: number; name: string; weeklyXP: number; ben: boolean }[]
  benimSira: number | null   // ilk 50'de değilse null → "50+"
  benimXP: number
  katilimci: number
}

/* ═══ GET /practice/review — SRS tekrar seti ═══ */

/**
 * ⚠️ `count` = `questions.length` (SERVİS EDİLEBİLEN soru sayısı) — vadeli kart sayısı DEĞİL.
 * Ekranda basılan her sayı bundan gelir; `vadeliKart` (vadesi gelen ham kart adedi) yalnız
 * teşhis içindir: kartların bir kısmı çıkmış/karantina elemesinde düşer ve gösterilemez.
 */
export interface ReviewYaniti { count: number; vadeliKart: number; questions: HavuzSoru[] }

/* ═══ GET /agents/roadmap + /agents/nudges ═══ */

/** Pusula planı — lib/planner.ts Plan şekli (roadmaps.steps'e upsert edilir). */
export interface PlanBlok {
  kazanim_id: number; title: string; subject: string
  kind: 'srs' | 'remediation' | 'yeni' | 'tekrar' | string
  count: number; difficulty: string
}
export interface PlanGunu { day: string; blocks: PlanBlok[]; tactic_notes: string[] }
export interface RoadmapYaniti {
  steps: { days: PlanGunu[]; generated_at?: string; inputs?: Record<string, unknown> } | null
  updatedAt: string | null
}

export interface Nudge { id: number; kind: string; message: string; created_at: string }

/* ═══ GET /questions/osym/matrix ═══ */

export interface MatrisYaniti {
  toplam: number
  cells: { subject: string; year: number | null; label: string | null; count: number }[]
  subjects: { subject: string; count: number }[]
  years: { year: number; count: number }[]
}

/* ═══ GET /assignments ═══ */

export interface OdevOzeti {
  id: string; title: string; createdAt: string | null; dueDate: string | null
  soruSayisi: number
  submission: { score: number | null; maxScore: number | null; submittedAt: string | null } | null
}
export interface HedefliSetOzeti {
  id: string; title: string; createdAt: string | null; status: string
  soruSayisi: number; score: number | null; maxScore: number | null; completedAt: string | null
}
export interface OdevListesi { teacherId: string | null; assignments: OdevOzeti[]; targeted: HedefliSetOzeti[] }

/** Ödev sorusu — cevapsız (correct_answer sunucuda kalır; puanlama otoriter). */
export interface OdevSorusu {
  id: string; question_text: string; options: string[]
  subject: string | null; topic: string | null; difficulty: string | null
}

/* ═══ GET /chat/history ═══ */

/**
 * GET /chat/oturumlar — geçmiş sohbet listesi (0035 · sohbet_oturumlari RPC aynası).
 * `baslik` sunucuda oturumun ilk KULLANICI mesajından türetilir (80 karakter kırpma);
 * asistan mesajı başlık olamaz — her sohbet "Merhaba, ben Koç!" ile başlar ve liste
 * tek tip görünürdü.
 */
export interface SohbetOzeti {
  session_id: string
  baslik: string
  mesaj_sayisi: number
  ilk_mesaj_at: string
  son_mesaj_at: string
}

export interface SohbetGecmisi {
  sessionId: string | null
  messages: {
    role: 'user' | 'assistant'
    content: string
    created_at: string
    /** 0034 — mesaja iliştirilmiş butonlar. Yalnız assistant satırlarında; migration
     *  basılmadıysa alan hiç gelmez → opsiyonel. */
    eylemler?: EylemTarifi[] | null
  }[]
}

/* ═══ GET /oturum · /oturum/liste ═══
   Sunucu tarafı oturum defteri (learnup-brain/src/lib/oturum.ts aynası). */

export interface OturumSatiri {
  sid: string
  /** UA'dan türetilen kaba etiket ("Chrome · Windows"). Tanınmazsa null. */
  cihaz: string | null
  ip: string | null
  userAgent: string | null
  ilkGiris: string | null
  sonGorulme: string | null
  /** İsteği yapan cihazın kendisi mi — listede "bu cihaz" işareti. */
  buCihaz: boolean
}

/**
 * `/oturum/liste` satırı — birim OTURUM değil CİHAZ.
 *
 * ⚠️ Supabase her girişte yeni `session_id` basar ve eskisini kapatmaz; sunucu aynı
 * user-agent'ı tek satırda toplar (learnup-brain/src/lib/oturum.ts `cihazGruplari`).
 * `sidler` o cihazın bütün açık girişleridir — "çıkar" hepsini kapatmalı, yoksa satır
 * listeden düşer ama oturumların bir kısmı yaşamaya devam eder.
 */
export interface CihazSatiri extends OturumSatiri {
  sidler: string[]
  oturumSayisi: number
  /** Gruptaki HANGİ oturum şu an kullanılan — "eski girişleri kapat" bunu listeden çıkarır. */
  buSid: string | null
}

/**
 * ⚠️ `katmanAcik:false` ile BOŞ LİSTE aynı şey DEĞİLDİR: ilki "defter kapalı"
 * (SESSION_REDIS_URL yok), ikincisi "kayıtlı cihaz yok". Arayüz ikisini ayrı çizmek
 * zorunda — kapalı defteri "hiçbir yerde açık değilsin" diye göstermek, kullanıcıya
 * olmayan bir güvenlik hissi satmaktır.
 */
export interface OturumListesiYaniti { katmanAcik: boolean; oturumlar: CihazSatiri[] }

export interface OturumOzetYaniti {
  katmanAcik: boolean
  /** Token'da `session_id` talebi var mı — yoksa bu cihaz deftere yazılamaz. */
  oturumKimligiVar: boolean
  aktif: OturumSatiri | null
  /** Açık OTURUM adedi (giriş sayısı). */
  toplam: number
  /** Bu oturumların dağıldığı CİHAZ adedi — `toplam`dan küçük olabilir, arıza değil. */
  cihazSayisi: number
}

export interface OturumCikisYaniti { kapatildi: boolean; supabaseCikisi: boolean }
export interface OturumHepsiYaniti { kapatilan: number; supabaseCikisi: boolean }
/** POST /oturum/cihaz-cikis — bir cihazın tüm (ya da seçili) oturumları. */
export interface CihazCikisYaniti { kapatilan: number; buCihaz: boolean; supabaseCikisi: boolean }
