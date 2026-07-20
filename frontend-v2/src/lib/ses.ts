/**
 * Ses motoru — WebAudio ile SENTEZLENMİŞ 3 kısa ton (dosya yok, kütüphane yok).
 * Duolingo-vari duyusal geri bildirim: doğru "tık-parıltı", yanlış alçak "pes",
 * blok bitişi küçük arpej. Ayar localStorage'da kalıcı; varsayılan AÇIK.
 * AudioContext İLK KULLANICI JESTİNDE kurulur (tarayıcı autoplay politikası).
 */

const KEY = 'learnup.ses'
let ctx: AudioContext | null = null

export function sesAcikMi(): boolean {
  try { return localStorage.getItem(KEY) !== 'kapali' } catch { return true }
}

export function sesToggle(): boolean {
  const yeni = !sesAcikMi()
  try { localStorage.setItem(KEY, yeni ? 'acik' : 'kapali') } catch { /* yut */ }
  return yeni
}

function baglam(): AudioContext | null {
  if (!sesAcikMi()) return null
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

/** Tek nota: sine osilatör + hızlı zarf (tık sesi değil, yumuşak damla). */
function nota(c: AudioContext, hz: number, t0: number, sure: number, tepe = 0.12, tip: OscillatorType = 'sine') {
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = tip
  osc.frequency.setValueAtTime(hz, t0)
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(tepe, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + sure)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + sure + 0.02)
}

/** Doğru cevap — parlak beşli (C6→G6), kısa ve zarif. */
export function sesDogru(): void {
  const c = baglam()
  if (!c) return
  const t = c.currentTime
  nota(c, 1046.5, t, 0.16, 0.1)
  nota(c, 1568.0, t + 0.07, 0.22, 0.09)
}

/** Yanlış cevap — alçak, yumuşak "pes" (suçlayıcı değil). */
export function sesYanlis(): void {
  const c = baglam()
  if (!c) return
  const t = c.currentTime
  nota(c, 220, t, 0.25, 0.08, 'triangle')
  nota(c, 174.6, t + 0.09, 0.3, 0.07, 'triangle')
}

/** Blok bitişi — küçük yükselen arpej (C-E-G-C). */
export function sesFanfar(): void {
  const c = baglam()
  if (!c) return
  const t = c.currentTime
  const seq = [523.25, 659.25, 783.99, 1046.5]
  seq.forEach((hz, i) => nota(c, hz, t + i * 0.09, 0.28, 0.1))
}
