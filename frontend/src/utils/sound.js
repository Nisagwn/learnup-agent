// Hafif ses motoru — Web Audio API ile zengin ton sentezler (ikili ses dosyası yok).
// Her efekt çok-katmanlı notalardan oluşur: dalga tipi + ADSR zarfı + tını (shimmer)
// + glide. Master zincirinde yumuşak low-pass filtre sıcaklık katar.
// Ayar localStorage('soundEnabled')'da tutulur; varsayılan açık.

let audioCtx = null;
let masterGain = null;

function getCtx() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioCtx = new AC();
    // Master zinciri: gain → low-pass filtre → çıkış (tiz/sert tonları yumuşatır)
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.5;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 6500;
    lp.Q.value = 0.4;
    masterGain.connect(lp);
    lp.connect(audioCtx.destination);
  }
  return audioCtx;
}

// Nota notaları (Hz)
const N = {
  E3: 164.81, G3: 196.0, A3: 220.0,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, A5: 880.0, B5: 987.77,
  C6: 1046.5, D6: 1174.7, E6: 1318.5, G6: 1568.0,
};

/**
 * Tek bir notayı çalar: ADSR zarflı osilatör + (opsiyonel) bir oktav üst tını katmanı.
 * @param {object} v - { freq, start, dur, type, peak, glideTo, shimmer }
 */
function playVoice(ctx, v) {
  const {
    freq, start, dur,
    type = 'triangle',
    peak = 0.16,
    glideTo = null,
    shimmer = false,
  } = v;
  const t0 = ctx.currentTime + start;
  const t1 = t0 + dur;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t1);

  // ADSR: hızlı atak, üstel sönüm — "pluck/çıngırak" hissi
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t1);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(t0);
  osc.stop(t1 + 0.02);

  // Tını katmanı: bir oktav üstte, kısık sinüs — parıltı/çıngırak rengi
  if (shimmer) {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 2, t0);
    gain2.gain.setValueAtTime(0.0001, t0);
    gain2.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + 0.012);
    gain2.gain.exponentialRampToValueAtTime(0.0001, t1 * 0.92 + t0 * 0.08);
    osc2.connect(gain2);
    gain2.connect(masterGain);
    osc2.start(t0);
    osc2.stop(t1 + 0.02);
  }
}

// Her efekt — voice (nota) dizisi üreten tanım.
const SOUNDS = {
  // Parlak yükselen arpej — çıngırak rengi
  correct: [
    { freq: N.E5, start: 0,    dur: 0.16, type: 'triangle', peak: 0.16, shimmer: true },
    { freq: N.G5, start: 0.08, dur: 0.16, type: 'triangle', peak: 0.16, shimmer: true },
    { freq: N.C6, start: 0.16, dur: 0.30, type: 'triangle', peak: 0.18, shimmer: true },
  ],
  // Yumuşak, alçalan "of" — sert değil
  wrong: [
    { freq: N.G3, start: 0,    dur: 0.34, type: 'sine',     peak: 0.20, glideTo: N.E3 },
    { freq: N.A3, start: 0.04, dur: 0.24, type: 'triangle', peak: 0.07 },
  ],
  // Kısa tiz "jeton" tıkı
  xp: [
    { freq: N.C6, start: 0,    dur: 0.12, type: 'triangle', peak: 0.14, shimmer: true },
  ],
  // Üç notalı yükseliş
  streak: [
    { freq: N.C5, start: 0,    dur: 0.16, type: 'triangle', peak: 0.16 },
    { freq: N.E5, start: 0.10, dur: 0.16, type: 'triangle', peak: 0.16, shimmer: true },
    { freq: N.G5, start: 0.20, dur: 0.30, type: 'triangle', peak: 0.18, shimmer: true },
  ],
  // Zafer arpeji + sonda akor
  levelup: [
    { freq: N.C5, start: 0,    dur: 0.14, type: 'triangle', peak: 0.15 },
    { freq: N.E5, start: 0.10, dur: 0.14, type: 'triangle', peak: 0.15 },
    { freq: N.G5, start: 0.20, dur: 0.14, type: 'triangle', peak: 0.16, shimmer: true },
    { freq: N.C6, start: 0.30, dur: 0.45, type: 'triangle', peak: 0.18, shimmer: true },
    { freq: N.E6, start: 0.30, dur: 0.45, type: 'sine',     peak: 0.10 },
    { freq: N.G5, start: 0.30, dur: 0.45, type: 'sine',     peak: 0.09 },
  ],
  // İki notalı "ding-ding"
  quest: [
    { freq: N.G5, start: 0,    dur: 0.16, type: 'triangle', peak: 0.16, shimmer: true },
    { freq: N.C6, start: 0.11, dur: 0.32, type: 'triangle', peak: 0.18, shimmer: true },
  ],
  // Fanfar — dört nota + parıltı
  league: [
    { freq: N.C5, start: 0,    dur: 0.14, type: 'triangle', peak: 0.15 },
    { freq: N.G5, start: 0.10, dur: 0.14, type: 'triangle', peak: 0.16 },
    { freq: N.C6, start: 0.20, dur: 0.16, type: 'triangle', peak: 0.17, shimmer: true },
    { freq: N.E6, start: 0.32, dur: 0.50, type: 'triangle', peak: 0.19, shimmer: true },
    { freq: N.G6, start: 0.32, dur: 0.50, type: 'sine',     peak: 0.09 },
  ],
};

export function isSoundEnabled() {
  try {
    return localStorage.getItem('soundEnabled') !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on) {
  try {
    localStorage.setItem('soundEnabled', on ? 'true' : 'false');
  } catch {
    /* localStorage kullanılamıyor */
  }
}

/** Verilen efekt tipindeki kısa, zengin tonu çalar (ses kapalıysa sessizce döner). */
export function playSound(type) {
  if (!isSoundEnabled()) return;
  const voices = SOUNDS[type];
  if (!voices) return;
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  voices.forEach((v) => playVoice(ctx, v));
}
