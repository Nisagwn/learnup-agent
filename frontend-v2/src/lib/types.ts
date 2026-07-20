// Havuz sorusu — ÖSYM (yks_questions) ve AI (yks_ai_questions) ORTAK şekli:
// options bir OBJE { A..E }, correct_option bir HARF. İkisi ayrı tablo, asla karışmaz;
// yalnız bu tip aynı (Çöz yüzeyi ikisini de render edebilsin diye).
export interface HavuzSoru {
  id: string
  subject: string
  kazanim_id?: number | null
  topic?: string | null
  question_text: string
  options: Record<string, string>
  correct_option: string
  solution?: string | null
  difficulty?: string | null
  quality?: number | null
  exam_year?: number
  exam_label?: string | null
  source_type?: string
}

export type CozKaynak = 'ai' | 'osym' | 'review' | 'antrenman' | 'tanisma' | 'odev'

// Çöz ekranına router state ile geçirilen oturum tarifi.
export interface CozSpec {
  source: CozKaynak
  title?: string
  subject?: string
  kazanimId?: number
  year?: number             // osym: yıla göre çöz
  label?: string            // osym: sınav etiketi (TYT / AYT-…) — prova setleri
  difficulty?: 'kolay' | 'orta' | 'zor'
  questions?: HavuzSoru[]   // osym: listeyi doğrudan geçir (tek-soru ucu yok)
  startIndex?: number
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

export interface ReviewYaniti { count: number; questions: HavuzSoru[] }

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

export interface SohbetGecmisi {
  sessionId: string | null
  messages: { role: 'user' | 'assistant'; content: string; created_at: string }[]
}
