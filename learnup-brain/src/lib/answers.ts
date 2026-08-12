import { supabase } from '../clients/supabase.js'
import { logger } from '../utils/logger.js'
import {
  todayISO, gunBaslangiciISO, getWeekId, ensureGamification, generateDailyQuests, xpForAnswer, applyStreak, applyAnswerToQuests,
  evaluateBadges, levelFromCorrect, displayName, isStudent, applySrsAnswer, type SubjectStats,
} from './gamification.js'
import { pushSignal } from './signals.js'
import { updateMastery } from './mastery.js'
import { markActive } from '../agents/katip.js'
import { onAnswer } from '../agents/atlas.js'

/**
 * Birleşik cevap işleme (§B6/§6) — /api/v1/answers'ın motoru.
 * HESAP TypeScript'te (gamification.ts saf fonksiyonları), YAZIM atomik `record_answer`
 * RPC'sinde (user_logs + srs_cards + profiles + league tek transaction). RPC henüz
 * migre edilmemişse legacy doğrudan-yazım yoluna düşer (taş gibi sağlam, kırmaz).
 * Ardından Sinyal penceresi + ATLAS BKT-lite mastery beslenir (her ikisi izole).
 */

export type AnswerBody = {
  questionId?: string | null
  subject?: string
  topic?: string | null
  subTopic?: string | null
  kazanimId?: number | null
  isCorrect?: boolean | null
  isSkipped?: boolean
  attemptNumber?: number
  durationSec?: number
  durationMs?: number | null
  selectedOption?: string | null   // 'A'..'E'
  snapshot?: { question?: string; choices?: unknown[]; answer?: unknown } | null
  attemptId?: string | null
  difficulty?: string | null
  placement?: boolean              // tanışma testi → K=0.3 hızlı yakınsama
}

/**
 * SUNUCU TARAFI CEVAP DOĞRULAMASI.
 *
 * ⚠️ `isCorrect` İSTEMCİDEN GELİYORDU ve doğrudan XP'yi belirliyordu. Yani:
 *     for (;;) POST /api/v1/answers {"isCorrect":true,"attemptNumber":1}
 * her çağrıda 15 XP basıyordu — sınırsız XP, rozet, seri ve league_entries.weekly_xp.
 * Lider tablosu ve garden.routes'un harcadığı coin ekonomisi tamamen sahte olabilirdi.
 * (Ödev akışı — assignments.routes — cevabı ZATEN sunucuda puanlıyor; bu tutarsızlık
 * açıkça bir unutkanlıktı, tasarım tercihi değil.)
 *
 * Soru DB'de bulunabiliyorsa doğruluk SUNUCUDA hesaplanır ve istemcinin iddiası YOK SAYILIR.
 * İki havuz var, ikisi de kontrol edilir:
 *   questions.correct_answer  → şık METNİ  (eski/öğretmen havuzu, options bir dizi)
 *   cevaplanabilir_sorular.correct_option → 'A'..'E' (YKS havuzu)
 *
 * ⚠️ cevaplanabilir_sorular bir VIEW'dir (0013): yks_questions (çıkmış) + yks_ai_questions (AI).
 * AI ve çıkmış sorular FİZİKSEL olarak ayrı tablolarda; ama öğrenci ikisini de çözer ve doğruluk
 * `id` ile bakılır. Tek tabloyu sorgulamak, öbür kaynağın sorusunu "doğrulanamaz → XP=0" yapardı.
 * View ikisini id uzayında birleştirir; buradaki tek okuma her iki kaynağı da çözer.
 *
 * Soru bulunamazsa (efemer/anlık üretilmiş) doğruluk DOĞRULANAMAZ → cevap yine kaydedilir
 * ama XP VERİLMEZ. Doğrulanamayan bir iddia ödüllendirilemez; aksi hâlde saldırgan sadece
 * questionId'yi boş bırakarak aynı sömürüyü sürdürürdü.
 */
type DogrulukSonucu = {
  isCorrect: boolean | null
  dogrulandi: boolean
  /** Doğru şık harfi — CEVAPLANDIKTAN SONRA istemciye geri bildirim olarak döner. */
  correctOption: string | null
  /** Çözüm/açıklama metni — aynı şekilde yalnız cevap sonrası döner. */
  solution: string | null
  /**
   * SORUNUN KENDİ ETİKETLERİ (DB'den).
   *
   * ⚠️ Bunlar eskiden İSTEMCİ GÖVDESİNDEN alınıp doğrudan `updateMastery` ve
   * `user_logs.kazanim_id`'ye yazılıyordu. Doğruluk sunucuda hesaplanıyordu ama sorunun
   * HANGİ KAZANIMA ait olduğu hesaplanmıyordu: öğrenci kolay bir soruyu doğru cevaplarken
   * `kazanimId`'yi istediği zor kazanımla etiketleyebiliyor, ya da yanlışlarını başka bir
   * kazanıma yükleyebiliyordu. Böylece `user_mastery`, `weak_kazanimlar`,
   * `sinif_isi_haritasi` ve `/teacher/sinif/zayif-kazanimlar` — öğretmenin BÜTÜN teşhis
   * yüzeyi — istemci tarafından şekillendirilebiliyordu. Hedefli ödev derlemesi de bu
   * veriden besleniyor, yani yanlış teşhis yanlış ödeve dönüşüyordu.
   */
  kazanimId: number | null
  subject: string | null
  difficulty: string | null
}

async function dogrulukKontrol(
  questionId: string | null,
  selectedOption: string | null,
  istemciIddiasi: boolean | null,
): Promise<DogrulukSonucu> {
  const bos: DogrulukSonucu = {
    isCorrect: istemciIddiasi, dogrulandi: false, correctOption: null, solution: null,
    kazanimId: null, subject: null, difficulty: null,
  }
  if (!questionId) return bos

  // YKS havuzu (şık harfi) — AI + çıkmış birleşik görünüm
  const { data: yks } = await supabase
    .from('cevaplanabilir_sorular')
    .select('correct_option, solution, kazanim_id, subject, difficulty')
    .eq('id', questionId).maybeSingle()
  if (yks?.correct_option) {
    return {
      isCorrect: selectedOption === yks.correct_option,
      dogrulandi: true,
      correctOption: String(yks.correct_option),
      solution: (yks.solution as string | null) ?? null,
      kazanimId: yks.kazanim_id != null ? Number(yks.kazanim_id) : null,
      subject: (yks.subject as string | null) ?? null,
      difficulty: (yks.difficulty as string | null) ?? null,
    }
  }

  // Eski/öğretmen havuzu (şık metni + options dizisi)
  const { data: q } = await supabase
    .from('questions')
    .select('options, correct_answer, explanation, subject, category, difficulty')
    .eq('id', questionId).maybeSingle()
  if (q?.correct_answer != null) {
    const opts = Array.isArray(q.options) ? (q.options as unknown[]) : []
    const idx = selectedOption ? selectedOption.charCodeAt(0) - 65 : -1   // 'A'→0
    const secilen = idx >= 0 && idx < opts.length ? String(opts[idx]) : null
    // Bu havuz cevabı METİN tutar; istemci geri bildirimi harf bekler → metni şıklarda ara.
    const dogruIdx = opts.findIndex((o) => String(o) === String(q.correct_answer))
    return {
      isCorrect: secilen !== null && secilen === String(q.correct_answer),
      dogrulandi: true,
      correctOption: dogruIdx >= 0 ? String.fromCharCode(65 + dogruIdx) : null,
      solution: (q.explanation as string | null) ?? null,
      // Bu havuzda kazanım bağı YOK (legacy şema) → null; istemci değeri de kabul edilmez.
      kazanimId: null,
      subject: ((q.subject ?? q.category) as string | null) ?? null,
      difficulty: (q.difficulty as string | null) ?? null,
    }
  }

  return bos
}

/**
 * TEKRAR KAPISI — aynı soru, aynı öğrenci günü, ikinci kez → PUANLANMAZ.
 *
 * ⚠️ `dogrulukKontrol` istemcinin `isCorrect` iddiasını yok sayıyordu ama TEKRAR kontrolü
 * hiçbir yerde yoktu: aynı questionId ile POST döngüye alındığında her çağrı yeniden
 * 15 XP + weekly_xp + totalSolved + rozet ilerlemesi yazıyordu. `attemptNumber` da
 * istemciden geldiği için ilk-deneme bonusu sınırsız tekrarlanabiliyordu. Lig tablosu,
 * rozetler ve bahçe coin ekonomisi tümüyle manipüle edilebilir durumdaydı.
 *
 * Neden "gün başına" ve neden "ilk cevap" DEĞİL: aralıklı tekrar (SRS) aynı soruyu
 * günler sonra yeniden sorar — bu ürünün çekirdeği. Kalıcı tek-puan kuralı tekrar
 * setlerini tümüyle ödülsüz bırakırdı. Gün sınırı sömürüyü kapatır, SRS'i korur.
 *
 * Dönen `deneme`, `attemptNumber` olarak KULLANILIR: ilk-deneme bonusu artık sunucunun
 * saydığı gerçek deneme sayısına bağlı, istemcinin beyanına değil.
 *
 * Okuma hatasında AÇIK kalır (fail-open): geçici bir DB arızası öğrenciyi hak ettiği
 * XP'den etmemeli — projedeki rateLimit/oturum kapılarıyla aynı takas.
 */
async function gunlukDenemeDurumu(
  userId: string,
  questionId: string | null,
  gun: string,
): Promise<{ tekrar: boolean; deneme: number }> {
  if (!questionId) return { tekrar: false, deneme: 1 }
  const { data, error } = await supabase
    .from('user_logs')
    .select('id')
    .eq('student_id', userId)
    .eq('question_id', questionId)
    .gte('created_at', gunBaslangiciISO(gun))
    .limit(5)
  if (error) {
    logger.warn({ err: error }, 'tekrar kapısı okunamadı (fail-open)')
    return { tekrar: false, deneme: 1 }
  }
  const onceki = (data ?? []).length
  return { tekrar: onceki > 0, deneme: onceki + 1 }
}

export async function processAnswer(userId: string, body: AnswerBody) {
  const {
    questionId = null, topic = null, subTopic = null,
    isSkipped = false, durationSec = 0,
    snapshot = null, attemptId = null,
  } = body
  // body.attemptNumber BİLEREK okunmuyor: deneme sayısı sunucuda sayılır (gunlukDenemeDurumu).
  // body.kazanimId / subject / difficulty de bilerek okunmuyor — soru satırından gelirler.
  const istemciSubject = typeof body.subject === 'string' && body.subject ? body.subject : 'Genel'
  const istemciKazanimId = typeof body.kazanimId === 'number' ? body.kazanimId : null
  const istemciDifficulty = body.difficulty ?? null
  const selectedOption =
    typeof body.selectedOption === 'string' && /^[A-E]$/.test(body.selectedOption)
      ? body.selectedOption
      : null
  const durationMs =
    typeof body.durationMs === 'number' && body.durationMs > 0
      ? Math.round(body.durationMs)
      : Number(durationSec) > 0
        ? Math.round(Number(durationSec) * 1000)
        : null

  // ── 0) DOĞRULUK SUNUCUDA BELİRLENİR — istemcinin isCorrect iddiası bağlayıcı değil ──
  // 1) Profil ve YKS/legacy doğruluk paralel okunur (birbirinden bağımsız).
  const qid = questionId ? String(questionId) : null
  const [dogrulukSonucu, { data: profile }] = await Promise.all([
    dogrulukKontrol(
      qid,
      selectedOption,
      typeof body.isCorrect === 'boolean' ? body.isCorrect : null,
    ),
    supabase.from('profiles').select('*').eq('id', userId).single(),
  ])
  const { isCorrect, dogrulandi, correctOption, solution } = dogrulukSonucu

  // ETİKETLER SORUDAN GELİR; istemci değeri yalnız soru ÇÖZÜLEMEDİĞİNDE (efemer) kullanılır.
  // Doğrulanmış bir soruda istemcinin etiketi bağlayıcı olsaydı, doğruluk kontrolü
  // teşhis verisini korumazdı — cevap doğru ama kazanım yanlış yazılabilirdi.
  const kazanimId = dogrulandi ? dogrulukSonucu.kazanimId : istemciKazanimId
  const subject = (dogrulandi ? dogrulukSonucu.subject : null) ?? istemciSubject
  const difficulty = (dogrulandi ? dogrulukSonucu.difficulty : null) ?? istemciDifficulty

  const today = todayISO()
  const weekId = getWeekId()
  const userData: any = profile || {}
  const g = ensureGamification(userData.gamification, today, weekId)

  // ── 0.5) TEKRAR KAPISI — aynı soru bugün ikinci kez puanlanmaz ──
  const { tekrar, deneme } = await gunlukDenemeDurumu(userId, qid, today)

  // Doğrulanamayan cevap XP KAZANDIRMAZ. Aksi hâlde saldırgan questionId'yi boş bırakıp
  // {"isCorrect":true} yollayarak sınırsız XP basmaya devam ederdi.
  // Aynı gün tekrarlanan cevap da puanlanmaz — sayaçların TAMAMI kapıdan geçer, yoksa
  // XP kapalıyken rozet/görev/ustalık ilerlemesi hâlâ döngüye alınabilirdi.
  const puanlanabilir = dogrulandi && !tekrar
  const xpGained = puanlanabilir
    ? xpForAnswer({ isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber: deneme })
    : 0
  g.xp = (g.xp || 0) + xpGained
  if (puanlanabilir) {
    g.totalSolved = (g.totalSolved || 0) + 1
    if (isCorrect === true) g.correctAnswers = (g.correctAnswers || 0) + 1

    const subjKey = String(subject).toLowerCase().trim()
    const sub: SubjectStats = g.subjects[subjKey] || { solved: 0, correct: 0 }
    sub.solved = (sub.solved || 0) + 1
    if (isCorrect === true) sub.correct = (sub.correct || 0) + 1
    g.subjects[subjKey] = sub
  }

  const streakResult = applyStreak(g.streak, today)
  g.streak = streakResult.streak

  // ⚠️ Kapı çağrının DIŞINDA: applyAnswerToQuests(null) `dailyQuests: null` döner ve bir
  // alt satırdaki `?? generateDailyQuests(today)` o günün ilerlemesini sıfırdan üretirdi.
  const questResult = puanlanabilir
    ? applyAnswerToQuests(g.dailyQuests, {
      isCorrect: isCorrect === true, isSkipped: !!isSkipped, attemptNumber: deneme, subject,
    })
    : { dailyQuests: g.dailyQuests, completedNow: [] as string[] }
  g.dailyQuests = questResult.dailyQuests ?? generateDailyQuests(today)
  g.league.weeklyXP = (g.league.weeklyXP || 0) + xpGained

  const masteryScores: Record<string, { score: number }> = {}
  Object.entries(g.subjects).forEach(([k, v]) => {
    const solved = v.solved || 0
    const correct = v.correct || 0
    masteryScores[k] = { score: solved > 0 ? Math.round((correct / solved) * 100) : 0 }
  })
  const level = levelFromCorrect(g.correctAnswers)
  const earnedBadges = evaluateBadges({
    streakDays: g.streak.count, totalSolved: g.totalSolved,
    level, masteryScores,
  })
  const persistedBadges = Object.keys(userData.unlocked_badges || {})
  const newBadges = earnedBadges.filter((id) => !persistedBadges.includes(id))
  const nowIso = new Date().toISOString()
  const unlocked = { ...(userData.unlocked_badges || {}) }
  newBadges.forEach((id) => { unlocked[id] = nowIso })

  // ── 2) SRS kartı (önceki kart okunur; hesap saf) ──
  let srsRow: Record<string, unknown> | null = null
  if (questionId && isCorrect !== null && isCorrect !== undefined) {
    try {
      const { data: prevCard } = await supabase
        .from('srs_cards').select('*').eq('user_id', userId).eq('question_id', String(questionId)).maybeSingle()
      if (!prevCard || prevCard.last_attempt_id == null || prevCard.last_attempt_id !== attemptId || attemptId == null) {
        const now = Date.now()
        const nextC = applySrsAnswer(prevCard, { isCorrect: isCorrect === true, now })
        srsRow = {
          question_id: String(questionId),
          box: nextC.box,
          consecutive_correct: nextC.consecutiveCorrect,
          total_attempts: nextC.totalAttempts,
          next_review_at: new Date(nextC.nextReviewAtMs).toISOString(),
          last_reviewed_at: new Date(nextC.lastReviewedAtMs).toISOString(),
          subject,
          topic: topic || null,
          sub_topic: subTopic || topic || null,
        }
        if (attemptId != null) srsRow.last_attempt_id = attemptId
        if (snapshot && snapshot.question && Array.isArray(snapshot.choices) && snapshot.choices.length >= 4) {
          srsRow.snapshot = { question: String(snapshot.question), choices: snapshot.choices, answer: snapshot.answer ?? null }
        }
      }
    } catch (srsErr) {
      logger.warn({ err: srsErr }, 'SRS hesaplanamadı (izole)')
    }
  }

  // ── 3) Yazım payload'ları ──
  const logRow = {
    teacher_id: userData.teacher_id || null,
    subject,
    sub_topic: subTopic || topic || 'Genel',
    question_id: questionId ? String(questionId) : null,
    is_correct: isCorrect === true,
    is_skipped: !!isSkipped,
    time_spent: Number(durationSec) || (durationMs ? Math.round(durationMs / 1000) : 0),
    attempt_number: deneme,
    xp: xpGained,
    difficulty,
    kazanim_id: kazanimId,
    selected_option: selectedOption,
    duration_ms: durationMs,
  }
  const leagueRow = isStudent(userData)
    ? { week_id: weekId, name: displayName(userData), tier: g.league.tier, weekly_xp: g.league.weeklyXP, role: 'student' }
    : null

  // ── 4) Atomik yazım (record_answer RPC) → yoksa legacy fallback ──
  const { error: rpcError } = await supabase.rpc('record_answer', {
    p_user_id: userId,
    p_log: logRow,
    p_srs: srsRow,
    p_gamification: g,
    p_mastery_scores: null,
    p_stats: null,
    p_unlocked_badges: unlocked,
    p_league: leagueRow,
  })
  if (rpcError) {
    // PGRST202 = fonksiyon yok (0004 henüz uygulanmadı) → legacy doğrudan yazım.
    if (rpcError.code === 'PGRST202') {
      logger.warn('record_answer RPC yok — legacy yazım yolu (0004 migration bekleniyor)')
      await legacyWrites(userId, logRow, srsRow, g, unlocked, leagueRow)
    } else {
      throw rpcError
    }
  }

  // ── 5) Sinyal + bilişsel graf (her ikisi izole; cevabı asla düşürmez) ──
  await pushSignal(userId, {
    t: Date.now(),
    questionId: questionId ? String(questionId) : null,
    kazanimId,
    correct: isCorrect === null || isCorrect === undefined ? null : isCorrect === true,
    skipped: !!isSkipped,
    durationMs,
    selectedOption,
  }).catch((err) => logger.warn({ err }, 'sinyal yazılamadı (izole)'))
  await markActive(userId).catch(() => {}) // Kâtip oturum-sonu taraması için

  // Ustalık/BKT de tekrar kapısından geçer: aynı soruyu gün içinde döngüye alarak ustalığı
  // 1.0'a itmek, öğretmenin teşhis yüzeyini (zayıf kazanımlar, sınıf ısı haritası, hedefli
  // ödev derlemesi) doğrudan sahteleştirirdi.
  if (puanlanabilir && kazanimId !== null && isCorrect !== null && isCorrect !== undefined && !isSkipped) {
    await updateMastery({
      userId, kazanimId,
      correct: isCorrect === true,
      durationMs,
      placement: body.placement === true,
    })
    // ATLAS tetik kararı: tuzak eşiği (teşhis) / kapanış adayı (doğrulama) — izole.
    await onAnswer({ userId, kazanimId, correct: isCorrect === true, selectedOption })
  }

  // ── 6) Yanıt (/api/practice/record ile birebir aynı sözleşme) ──
  //
  // ⚠️ isCorrect/correctOption/solution BURADAN döner — soruyu SERVİS eden uçlardan değil.
  // Eskiden doğru cevap soruyla BİRLİKTE gidiyordu (practice.routes shapeQuestion,
  // /questions/ai listesi): istemci daha cevaplamadan doğru şıkkı okuyabiliyordu. Anlık
  // geri bildirim ürün vaadi olduğu için alanı tümden kaldırmak yetmez — cevabı verdikten
  // SONRA sunucudan dönmesi gerekir. Tek doğruluk kaynağı budur.
  return {
    success: true,
    isCorrect,
    correctOption,
    solution,
    dogrulandi,
    /** Aynı soru bugün zaten cevaplanmıştı → bu cevap kaydedildi ama PUANLANMADI. */
    tekrar,
    xpGained,
    totalXp: g.xp,
    level,
    streak: {
      count: g.streak.count,
      milestone: streakResult.milestone,
      freezeUsed: streakResult.freezeUsed,
      freezeEarned: streakResult.freezeEarned,
      freezesAvailable: g.streak.freezesAvailable,
    },
    questsCompleted: questResult.completedNow,
    dailyQuests: g.dailyQuests,
    newBadges,
    league: { tier: g.league.tier, weeklyXP: g.league.weeklyXP },
  }
}

/** 0004 uygulanana dek eski (atomik olmayan) yazım — davranış /record ile birebir. */
async function legacyWrites(
  userId: string,
  logRow: Record<string, unknown>,
  srsRow: Record<string, unknown> | null,
  g: unknown,
  unlocked: Record<string, string>,
  leagueRow: Record<string, unknown> | null,
): Promise<void> {
  // Yeni kolonlar (kazanim_id/selected_option/duration_ms) migration öncesi DB'de olmayabilir → çıkar.
  const { kazanim_id: _k, selected_option: _s, duration_ms: _d, ...legacyLog } = logRow
  await supabase.from('user_logs').insert({ student_id: userId, ...legacyLog })
  if (srsRow) {
    await supabase.from('srs_cards')
      .upsert({ user_id: userId, ...srsRow }, { onConflict: 'user_id,question_id' })
      .then(({ error }) => { if (error) logger.warn({ err: error }, 'SRS legacy yazım hatası') })
  }
  await supabase.from('profiles').update({ gamification: g, unlocked_badges: unlocked }).eq('id', userId)
  if (leagueRow) {
    await supabase.from('league_entries').upsert(
      { uid: userId, ...leagueRow, updated_at: new Date().toISOString() },
      { onConflict: 'week_id,uid' },
    )
  }
}
