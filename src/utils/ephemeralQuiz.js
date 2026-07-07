// Efemeral (havuza yazılmayan) AI quiz oturumunu sayfalar arası taşır.
// Sorular pool-id ile değil, sessionStorage'da bir oturum id'siyle taşınır
// → refresh'e dayanıklı; /student/quiz?mode=ai&sid=... ile okunur.

const keyFor = (sid) => `learnup.aiquiz.${sid}`;

// Oturumu yaz, sid döndür. session: { questions, subject, count, difficulty, source, grade }
export function saveEphemeralQuiz(session) {
  const rand = Math.floor(Math.random() * 1e6).toString(36);
  const sid = `${session?.source || 'ai'}_${Date.now()}_${rand}`;
  try {
    sessionStorage.setItem(keyFor(sid), JSON.stringify(session));
  } catch (e) {
    console.warn('Efemeral quiz kaydedilemedi:', e);
  }
  return sid;
}

export function loadEphemeralQuiz(sid) {
  if (!sid) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(sid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearEphemeralQuiz(sid) {
  if (!sid) return;
  try { sessionStorage.removeItem(keyFor(sid)); } catch { /* yoksay */ }
}
