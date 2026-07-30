// Sınav hedef tarihi — TEK kaynak (GOREV-013).
// Çalışma Planı'ndaki geri sayım da Bugün'deki "YKS'ye N gün" çipi de buradan okur;
// iki ekran farklı gün söyleyemez. Kullanıcı tarihi belirler (localStorage),
// seçilmemişse varsayılan bir sonraki ~20 Haziran'dır (eski `yksGun()` sabiti).

const ANAHTAR = 'learnup.hedefTarih'

const AYLAR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
]

/** Bir sonraki YKS varsayılanı: yaklaşık 20 Haziran (geçtiyse gelecek yıl). */
export function varsayilanHedef(): Date {
  const simdi = new Date()
  let yks = new Date(simdi.getFullYear(), 5, 20)
  if (yks.getTime() < simdi.getTime()) yks = new Date(simdi.getFullYear() + 1, 5, 20)
  return yks
}

/** 'YYYY-MM-DD' → yerel gece yarısı Date; bozuksa null. */
function isoCoz(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Yürürlükteki hedef tarih: kayıtlı ve GELECEKTE bir tarih varsa o, yoksa varsayılan.
    (Geçmişte kalan kayıt bayatlamıştır — sessizce varsayılana dönülür.) */
export function hedefTarih(): Date {
  try {
    const raw = localStorage.getItem(ANAHTAR)
    if (raw) {
      const d = isoCoz(raw)
      if (d && d.getTime() >= new Date().getTime() - 86_400_000) return d
    }
  } catch { /* yut — depolama kapalıysa varsayılan */ }
  return varsayilanHedef()
}

/** Hedefi kaydet ('YYYY-MM-DD'). Geçersiz/geçmiş tarih kaydedilmez → false. */
export function hedefTarihYaz(iso: string): boolean {
  const d = isoCoz(iso)
  if (!d || d.getTime() < new Date().getTime() - 86_400_000) return false
  try { localStorage.setItem(ANAHTAR, iso) } catch { /* yut */ }
  return true
}

/** Hedefe kalan tam gün (bugün → en az 0). */
export function kalanGun(hedef: Date = hedefTarih()): number {
  return Math.max(0, Math.ceil((hedef.getTime() - Date.now()) / 86_400_000))
}

/** "20 Haziran 2027" — çip etiketi. */
export function hedefEtiket(hedef: Date = hedefTarih()): string {
  return `${hedef.getDate()} ${AYLAR[hedef.getMonth()]} ${hedef.getFullYear()}`
}

/** <input type="date"> değeri için 'YYYY-MM-DD'. */
export function hedefIso(hedef: Date = hedefTarih()): string {
  const ay = String(hedef.getMonth() + 1).padStart(2, '0')
  const gun = String(hedef.getDate()).padStart(2, '0')
  return `${hedef.getFullYear()}-${ay}-${gun}`
}
