import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { useReducedMotion } from 'framer-motion'
import { Icon } from '../ui'
import { cn } from '../lib/cn'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import { tarihKisa } from '../lib/format'
import type { OdevListesi, OdevOzeti, HedefliSetOzeti, OdevSorusu } from '../lib/types'
import { Reveal } from '../components/fx'
import { MathMarkdown } from '../components/MathMarkdown'

/* ═══════════════════════════════════════════════════════════════════════════
   ÖDEVLER — öğretmenli öğrencinin panosu (nav'da yalnız teacher_id varsa).
   GOREV-022: sunum FİDAN'a taşındı (onaylı önizleme: docs/design/onizleme/odevler.html).
   · Veri wiring AYNEN: tek istek GET /assignments (assignments + targeted)
   · Davranış AYNEN: sorular CEVAPSIZ gelir (sunucu soyar), cevaplar yerelde
     toplanır, TEK gönderim (Radix onay) → otoriter skor
   · Teslim sayacı: gerçek son-tarihten saf takvim hesabı; ≤2 gün → toprak
     tonlu KELİMELİ rozet + kart çerçevesi (null≠0: tarih yoksa sayaç yok)
   · Sayfada TEK birincil buton: en acil bekleyen ödevdeki "Çözmeye başla"
   · Telif: bu ekranda çıkmış/ÖSYM içeriği ve kehribar YOKTUR
   ═══════════════════════════════════════════════════════════════════════════ */

const HARFLER = ['A', 'B', 'C', 'D', 'E']

type Aktif =
  | { tur: 'sinif'; odev: OdevOzeti; inceleme?: boolean }
  | { tur: 'hedefli'; odev: HedefliSetOzeti; inceleme?: boolean }

/* ── Saf tarih yardımcıları — sayı uydurulmaz, sunucu değerinden hesap ─────── */

/** Takvim günü farkı (bugün→son tarih). Tarih yok/bozuksa null (null ≠ 0). */
function kalanGun(dueDate: string | null): number | null {
  if (!dueDate) return null
  const d = new Date(dueDate)
  if (Number.isNaN(d.getTime())) return null
  const gun = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  return Math.round((gun(d) - gun(new Date())) / 86_400_000)
}

/** "23 Temmuz 23:59" — saat gece yarısıysa yalnız tarih. */
function sonTarihMetni(iso: string): string | null {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const saatVar = d.getHours() !== 0 || d.getMinutes() !== 0
  const saat = saatVar ? ` ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
  return `${tarihKisa(d)}${saat}`
}

/** Kelimeli teslim rozeti metni — yalnız ≤2 gün kala (aciliyet eşiği). */
function sayacMetni(kalan: number): string {
  if (kalan === 0) return 'son gün bugün'
  return `teslime ${kalan} gün`
}

export function Odevler() {
  const liste = useAsync<OdevListesi>(() => apiGet('/assignments'), [])
  const { profile } = useAuth()
  const [aktif, setAktif] = useState<Aktif | null>(null)

  // Öğretmen adı profil satırından (teacher_name cache'i); yoksa GÖSTERİLMEZ — uydurma yok.
  const ogretmenAdi: string | null =
    typeof profile?.teacher_name === 'string' && profile.teacher_name.trim() ? profile.teacher_name.trim() : null

  const v = liste.data

  // Bekleyen sınıf ödevleri — son tarihe göre acilden uzağa (tarihi olmayan sona).
  const bekleyen = useMemo(() => {
    const arr = (v?.assignments ?? []).filter((a) => a.submission == null)
    const k = (a: OdevOzeti) => kalanGun(a.dueDate) ?? Number.MAX_SAFE_INTEGER
    return [...arr].sort((a, b) => k(a) - k(b))
  }, [v])

  const bekleyenHedefli = useMemo(
    () => (v?.targeted ?? []).filter((t) => t.status !== 'completed'),
    [v],
  )

  // Geçmiş: gönderilen sınıf ödevleri + tamamlanan hedefli setler (yeniden eskiye).
  const gecmis = useMemo(() => {
    if (!v) return []
    const sinif = v.assignments
      .filter((a) => a.submission != null)
      .map((a) => ({
        anahtar: `s-${a.id}`,
        ad: a.title,
        skor: a.submission!.score != null && a.submission!.maxScore
          ? { puan: a.submission!.score, max: a.submission!.maxScore } : null,
        tarih: a.submission!.submittedAt,
        hedef: { tur: 'sinif', odev: a, inceleme: true } as Aktif,
      }))
    const hedefli = v.targeted
      .filter((t) => t.status === 'completed')
      .map((t) => ({
        anahtar: `h-${t.id}`,
        ad: t.title,
        skor: t.score != null && t.maxScore ? { puan: t.score, max: t.maxScore } : null,
        tarih: t.completedAt,
        hedef: { tur: 'hedefli', odev: t, inceleme: true } as Aktif,
      }))
    return [...sinif, ...hedefli].sort(
      (x, y) => (y.tarih ? Date.parse(y.tarih) : 0) - (x.tarih ? Date.parse(x.tarih) : 0),
    )
  }, [v])

  if (aktif) {
    return (
      <OdevCoz
        aktif={aktif}
        onKapat={(gonderildi) => {
          setAktif(null)
          if (gonderildi) liste.reload()
        }}
      />
    )
  }

  const bos = v && v.assignments.length === 0 && v.targeted.length === 0
  const aktifVar = bekleyen.length > 0 || bekleyenHedefli.length > 0

  // TEK birincil eylem: en acil ÇÖZÜLEBİLİR bekleyen sınıf ödevi; hiç yoksa ilk çözülebilir
  // hedefli set. `soruSayisi === 0` kaplar aday DEĞİL (birincil eylem çözülemez ödeve gitmez).
  // Hiç çözülebilir bekleyen yoksa birincil = null.
  const ilkCozulebilirSinif = bekleyen.find((a) => a.soruSayisi > 0)
  const ilkCozulebilirHedefli = bekleyenHedefli.find((t) => t.soruSayisi > 0)
  const birincil: { tur: 'sinif' | 'hedefli'; id: string } | null =
    ilkCozulebilirSinif
      ? { tur: 'sinif', id: ilkCozulebilirSinif.id }
      : ilkCozulebilirHedefli
        ? { tur: 'hedefli', id: ilkCozulebilirHedefli.id }
        : null

  // Kart giriş stagger'ı — kadans ≤0.3s (bütçe: FİDAN §9.8).
  let sira = 0
  const gecikme = () => Math.min(0.05 + 0.06 * sira++, 0.3)

  return (
    <div className="mx-auto max-w-[1000px] px-[clamp(16px,3.5vw,44px)] pb-20 pt-9">
      <OdevStil />

      <Reveal>
        <h1 className="od-b1">Ödevler</h1>
        <p className="od-metin2 mt-1">
          Öğretmeninin verdiği ödevler ve sana özel hedefli setler — puanlama sunucuda, tek gönderim.
        </p>
      </Reveal>

      {liste.loading ? (
        <div className="mt-6 space-y-3.5">
          {[0, 1, 2].map((i) => <div key={i} className="od-iskelet motion-safe:animate-pulse" style={{ height: 86 }} />)}
        </div>
      ) : liste.error ? (
        <div className="od-kart mt-6 px-6 py-6 text-center">
          <p className="od-metin2">Ödevler yüklenemedi: {liste.error}</p>
          <button type="button" className="od-btn soluk mt-3" onClick={() => liste.reload()}>Tekrar dene</button>
        </div>
      ) : bos ? (
        /* Boş durumda koyu buton YOK — samimi metin (FİDAN §9.7). */
        <Reveal delay={0.05}>
          <div className="od-kart mt-8 px-7 py-9 text-center">
            <span aria-hidden className="block text-[36px]">🌱</span>
            <h3 className="od-b2 mt-2">Henüz ödevin yok</h3>
            <p className="od-metin2 mx-auto mt-1.5 max-w-sm leading-relaxed">
              Öğretmenin ödev gönderdiğinde burada görünecek. Bu arada Çalışma Planı'ndaki
              bloklarınla ilerleyebilirsin.
            </p>
          </div>
        </Reveal>
      ) : (
        <>
          {/* ── Aktif sınıf ödevleri — acilden uzağa ── */}
          {bekleyen.map((a) => {
            // GOREV-044: `soruSayisi === 0` kap çözülemez — yanıltıcı "Çöz" eylemi ve aciliyet
            // çerçevesi SUNULMAZ; yerine kelimeli dürüst rozet + not. Kap listede GÖRÜNÜR kalır.
            const soruYok = a.soruSayisi === 0
            const kalan = kalanGun(a.dueDate)
            const acil = kalan != null && kalan >= 0 && kalan <= 2
            const gecti = kalan != null && kalan < 0
            const birincilMi = birincil?.tur === 'sinif' && birincil.id === a.id
            const son = a.dueDate ? sonTarihMetni(a.dueDate) : null
            const altParcalar = [
              ...(ogretmenAdi ? [ogretmenAdi] : []),
              `${a.soruSayisi} soru`,
              ...(son ? [`Son: ${son}`] : []),
            ]
            return (
              <OdevSatirKart
                key={a.id}
                delay={gecikme()}
                ikon="📝"
                cerceve={soruYok ? undefined : acil ? 'acil' : gecti ? 'gecti' : undefined}
                baslik={a.title}
                alt={altParcalar.join(' · ')}
                rozet={
                  soruYok ? <span className="od-rozet bos">⏳ şu an soru yok</span>
                    : acil ? <span className="od-rozet acil">⏳ {sayacMetni(kalan)}</span>
                      : gecti ? <span className="od-rozet gecti">⏳ süresi geçti</span>
                        : <span className="od-rozet notr">başlanmadı</span>
                }
                buton={
                  soruYok ? (
                    <span className="od-notyok">öğretmenin güncelleyecek</span>
                  ) : (
                    <button
                      type="button"
                      className={cn('od-btn', birincilMi ? 'birincil' : 'soluk')}
                      onClick={() => setAktif({ tur: 'sinif', odev: a })}
                    >
                      {birincilMi ? 'Çözmeye başla' : 'Çöz'}
                    </button>
                  )
                }
              />
            )
          })}

          {/* ── Hedefli setler — kesikli adaçayı vurgu + "sana özel" ── */}
          {bekleyenHedefli.map((t) => {
            // GOREV-044: 0 soruya düşmüş hedefli set de çözülebilir gösterilmez.
            const soruYok = t.soruSayisi === 0
            const birincilMi = birincil?.tur === 'hedefli' && birincil.id === t.id
            return (
              <OdevSatirKart
                key={t.id}
                delay={gecikme()}
                ikon="🎯"
                cerceve="hedefli"
                baslik={t.title}
                alt={`${t.soruSayisi} soru`}
                rozet={
                  soruYok
                    ? <span className="od-rozet bos">⏳ şu an soru yok</span>
                    : <span className="od-rozet ozel">sana özel</span>
                }
                buton={
                  soruYok ? (
                    <span className="od-notyok">öğretmenin güncelleyecek</span>
                  ) : (
                    <button
                      type="button"
                      className={cn('od-btn', birincilMi ? 'birincil' : 'soluk')}
                      onClick={() => setAktif({ tur: 'hedefli', odev: t })}
                    >
                      {birincilMi ? 'Çözmeye başla' : 'Çöz'}
                    </button>
                  )
                }
              />
            )
          })}

          {/* ── Tek gönderim bilgi şeridi ── */}
          {aktifVar ? (
            <Reveal delay={gecikme()}>
              <div className="od-bilgi">
                <span aria-hidden>💡</span>
                <span>
                  Cevapların <b>hepsi birlikte, tek seferde</b> gönderilir (gönderim öncesi onay
                  sorulur); puan sunucuda hesaplanır. Sorular sana <b>cevap anahtarı olmadan</b> gelir.
                </span>
              </div>
            </Reveal>
          ) : (
            <Reveal delay={gecikme()}>
              <p className="od-metin2 mt-5">Bekleyen ödevin yok — yenisi gelince burada görünecek.</p>
            </Reveal>
          )}

          {/* ── Geçmiş — mini skor halkaları + soru dökümü ── */}
          {gecmis.length > 0 && (
            <Reveal delay={gecikme()}>
              <section className="od-kart mt-7 px-6 py-5" aria-label="Geçmiş ödevler">
                <h2 className="od-b2 mb-2.5">Geçmiş</h2>
                {gecmis.map((g) => (
                  <div key={g.anahtar} className="od-gecmis">
                    {g.skor ? (
                      <MiniHalka
                        oran={g.skor.max > 0 ? g.skor.puan / g.skor.max : 0}
                        etiket={`${g.skor.puan}/${g.skor.max}`}
                      />
                    ) : (
                      /* Skor ölçülmemiş: halka çizilmez, sayı uydurulmaz (null ≠ 0). */
                      <div className="od-halka-yok" aria-hidden>—</div>
                    )}
                    <span className="od-gecmis-ad truncate">{g.ad}</span>
                    <span className="od-rozet tamam">
                      <Icon name="check" size={12} color="currentColor" strokeWidth={2.6} /> tamamlandı
                    </span>
                    {g.tarih && !Number.isNaN(Date.parse(g.tarih)) && (
                      <span className="od-gecmis-tarih">{tarihKisa(new Date(g.tarih))}</span>
                    )}
                    <button type="button" className="od-dokum" onClick={() => setAktif(g.hedef)}>
                      Soru dökümü →
                    </button>
                  </div>
                ))}
              </section>
            </Reveal>
          )}
        </>
      )}
    </div>
  )
}

/* ── Aktif ödev satır kartı — önizlemedeki .odev düzeni ────────────────────── */
function OdevSatirKart({ ikon, baslik, alt, cerceve, rozet, buton, delay }: {
  ikon: string
  baslik: string
  alt: string
  cerceve?: 'acil' | 'gecti' | 'hedefli'
  rozet: ReactNode
  buton: ReactNode
  delay: number
}) {
  return (
    <Reveal delay={delay}>
      <section className={cn('od-kart od-odev', cerceve)}>
        <div className="od-ikon" aria-hidden>{ikon}</div>
        <div className="min-w-0 flex-1">
          <h3 className="od-b3 truncate">{baslik}</h3>
          <div className="od-alt">{alt}</div>
        </div>
        <div className="od-sag">
          {rozet}
          {buton}
        </div>
      </section>
    </Reveal>
  )
}

/* ── Mini skor halkası — yüklenince dolar; hareket-azalt'ta statik ─────────── */
function MiniHalka({ oran, etiket, boyut = 46, kalinlik = 4.5 }: {
  oran: number; etiket: string; boyut?: number; kalinlik?: number
}) {
  const azalt = useReducedMotion()
  const [dolu, setDolu] = useState(!!azalt)
  const gid = useId().replace(/[^a-zA-Z0-9]/g, '')
  useEffect(() => {
    if (azalt) return
    const id = requestAnimationFrame(() => setDolu(true))
    return () => cancelAnimationFrame(id)
  }, [azalt])
  const r = (boyut - kalinlik) / 2
  const cevre = 2 * Math.PI * r
  const hedef = cevre * (1 - Math.min(1, Math.max(0, oran)))
  return (
    <div className="relative shrink-0" style={{ width: boyut, height: boyut }}>
      <svg width={boyut} height={boyut} aria-hidden>
        <defs>
          <linearGradient id={`odh-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--adacayi)" />
            <stop offset="1" stopColor="var(--yaprak)" />
          </linearGradient>
        </defs>
        <circle cx={boyut / 2} cy={boyut / 2} r={r} fill="none" stroke="var(--ic)" strokeWidth={kalinlik} />
        <circle
          cx={boyut / 2} cy={boyut / 2} r={r} fill="none"
          stroke={`url(#odh-${gid})`} strokeWidth={kalinlik} strokeLinecap="round"
          strokeDasharray={cevre} strokeDashoffset={dolu ? hedef : cevre}
          transform={`rotate(-90 ${boyut / 2} ${boyut / 2})`}
          style={{ transition: azalt ? undefined : 'stroke-dashoffset 0.9s cubic-bezier(.4,0,.2,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <span className="font-display font-bold" style={{ fontSize: boyut >= 100 ? 24 : 11, color: 'var(--metin1)' }}>
          {etiket}
        </span>
      </div>
    </div>
  )
}

/* ═══ Çözüm akışı — GOREV-008 odak kabuğu diliyle; TEK gönderim + Radix onay AYNEN ═══ */
function OdevCoz({ aktif, onKapat }: { aktif: Aktif; onKapat: (gonderildi: boolean) => void }) {
  const inceleme = aktif.inceleme === true
  const yol = aktif.tur === 'sinif'
    ? `/assignments/${aktif.odev.id}/questions`
    : `/assignments/targeted/${aktif.odev.id}/questions`
  const sorular = useAsync<{ title: string; questions: OdevSorusu[] }>(() => apiGet(yol), [yol])
  const [cevaplar, setCevaplar] = useState<Record<string, number>>({})
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [sonuc, setSonuc] = useState<{ dogru: number; toplam: number } | null>(null)

  const qs = sorular.data?.questions ?? []
  const cevapli = Object.keys(cevaplar).length

  // İnceleme modunda skor liste verisinden (gerçek sonuç; yoksa gösterilmez).
  const skor = aktif.tur === 'sinif'
    ? (aktif.odev.submission && aktif.odev.submission.score != null && aktif.odev.submission.maxScore
        ? `${aktif.odev.submission.score}/${aktif.odev.submission.maxScore}` : null)
    : (aktif.odev.score != null && aktif.odev.maxScore ? `${aktif.odev.score}/${aktif.odev.maxScore}` : null)

  const gonder = async () => {
    if (gonderiliyor) return
    setGonderiliyor(true)
    try {
      // ⚠️ BOŞ SORULAR PAKETE KONMAZ.
      // Eskiden boşlar `selectedIndex: -1` ile gidiyordu; sunucu şeması ise
      // `selectedIndex: z.number().int().min(0)` — zod -1'i reddedip 400 döndürüyordu.
      // Yani arayüzün açıkça teşvik ettiği şey ("8/10 cevaplandı — boşlar yanlış sayılır",
      // onay modalı "2 soru boş") sunucuda kesin hatayla sonuçlanıyor, öğrenci ödevi
      // HİÇBİR ŞEKİLDE gönderemiyordu; tek çıkış her soruyu işaretlemekti.
      // Boşu hiç göndermemek doğru davranış: maxScore sunucuda ödevin KENDİ soru sayısından
      // hesaplanıyor (assignments.routes), dolayısıyla boşlar doğal olarak yanlış sayılır.
      const answers = qs
        .filter((q) => cevaplar[q.id] != null)
        .map((q) => ({ questionId: q.id, selectedIndex: cevaplar[q.id] }))
      const r = aktif.tur === 'sinif'
        ? await apiPost('/assignments/submit', { assignmentId: aktif.odev.id, answers })
        : await apiPost('/assignments/targeted/submit', { targetedAssignmentId: aktif.odev.id, answers })
      setSonuc({ dogru: Number(r?.correctCount ?? r?.autoScore ?? 0), toplam: Number(r?.maxScore ?? qs.length) })
    } catch (e: any) {
      toast.error('Gönderilemedi', { description: e?.message })
    } finally {
      setGonderiliyor(false)
    }
  }

  if (sonuc) {
    const yuzde = sonuc.toplam ? Math.round((sonuc.dogru / sonuc.toplam) * 100) : 0
    return (
      <div className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-6">
        <OdevStil />
        <div className="text-center">
          <div className="mx-auto w-fit">
            <MiniHalka oran={sonuc.toplam ? sonuc.dogru / sonuc.toplam : 0} etiket={`%${yuzde}`} boyut={120} kalinlik={9} />
          </div>
          <h2 className="od-b2 mt-5" style={{ fontSize: 20 }}>Ödev gönderildi</h2>
          <p className="od-metin2 mt-1.5">{sonuc.dogru}/{sonuc.toplam} doğru — sonuç öğretmenine iletildi.</p>
          <button type="button" className="od-btn birincil mt-6" onClick={() => onKapat(true)}>Panoya dön</button>
        </div>
      </div>
    )
  }

  const ilerlemeYuzde = qs.length ? (cevapli / qs.length) * 100 : 0

  return (
    <div className="mx-auto max-w-3xl px-[clamp(16px,3.5vw,44px)] pb-28 pt-6">
      <OdevStil />

      {/* Üst şerit: ödev adı + SORU n/N (+ ilerleme) */}
      <div className="od-serit">
        <button
          type="button"
          onClick={() => onKapat(false)}
          className="od-cik"
          title="Panoya dön"
          aria-label="Panoya dön"
        >
          <Icon name="close" size={16} color="currentColor" />
        </button>
        <h1 className="od-serit-ad min-w-0 flex-1 truncate">
          {sorular.data?.title ?? aktif.odev.title}
        </h1>
        {inceleme ? (
          skor && <span className="od-sayac">SKOR {skor}</span>
        ) : (
          <span className="od-sayac">SORU {cevapli}/{qs.length}</span>
        )}
        {!inceleme && qs.length > 0 && (
          <div
            className="od-ilerleme"
            role="progressbar"
            aria-label="Cevaplanan soru"
            aria-valuemin={0}
            aria-valuemax={qs.length}
            aria-valuenow={cevapli}
          >
            <i style={{ width: `${ilerlemeYuzde}%` }} />
          </div>
        )}
      </div>

      {inceleme && (
        <div className="od-bilgi">
          <span aria-hidden>📋</span>
          <span>Bu döküm, ödevdeki soruları gösterir — cevap anahtarı sunucuda kalır, puanın yukarıda.</span>
        </div>
      )}

      {sorular.loading ? (
        <div className="mt-5 space-y-4">
          {[0, 1, 2].map((i) => <div key={i} className="od-iskelet motion-safe:animate-pulse" style={{ height: 160 }} />)}
        </div>
      ) : sorular.error ? (
        <div className="od-kart mt-5 px-6 py-6 text-center">
          <p className="od-metin2">Sorular yüklenemedi: {sorular.error}</p>
          <div className="mt-3 flex justify-center gap-2.5">
            <button type="button" className="od-btn soluk" onClick={() => onKapat(false)}>Geri dön</button>
            <button type="button" className="od-btn soluk" onClick={() => sorular.reload()}>Tekrar dene</button>
          </div>
        </div>
      ) : qs.length === 0 ? (
        /* GOREV-044: 0 soruya düşmüş kap — ölü/boş ekran yerine dürüst boş-durum.
           Gönderim şeridi/onay modalı zaten `qs.length > 0` ile kapalı; burada da çıkmaz. */
        <div className="od-kart mt-5 px-7 py-9 text-center">
          <span aria-hidden className="block text-[36px]">🌱</span>
          <h3 className="od-b2 mt-2">Bu ödevde şu an soru yok</h3>
          <p className="od-metin2 mx-auto mt-1.5 max-w-sm leading-relaxed">
            Öğretmenin güncelleyecek — şimdilik burada gösterilecek bir soru yok. Panona dönebilirsin.
          </p>
          <button type="button" className="od-btn birincil mt-6" onClick={() => onKapat(false)}>Panoya dön</button>
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {qs.map((q, qi) => (
            <div key={q.id} className="od-soru">
              <div className="od-soru-metin">
                <span className="font-display font-bold">Soru {qi + 1}.</span>{' '}
                <MathMarkdown inline>{q.question_text}</MathMarkdown>
              </div>
              <div className="mt-3.5 space-y-2.5">
                {q.options.map((secenek, i) => {
                  const secildi = cevaplar[q.id] === i
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={inceleme}
                      onClick={inceleme ? undefined : () => setCevaplar((c) => ({ ...c, [q.id]: i }))}
                      className={cn('od-sik', !inceleme && 'secilebilir', secildi && 'secili')}
                    >
                      <span className="od-harf">{HARFLER[i] ?? i + 1}</span>
                      <span className="text-[13.5px] font-medium leading-normal">
                        <MathMarkdown inline>{String(secenek)}</MathMarkdown>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Gönderim şeridi — TEK gönderim + Radix onay (davranış AYNEN) */}
      {!inceleme && qs.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 px-3">
          <div className="od-altbar mx-auto flex max-w-3xl items-center gap-4">
            <span className="od-altbar-metin flex-1">
              {cevapli}/{qs.length} cevaplandı{cevapli < qs.length ? ' — boşlar yanlış sayılır' : ''}
            </span>
            <Dialog.Root>
              <Dialog.Trigger asChild>
                <button type="button" className="od-btn birincil" disabled={cevapli === 0 || gonderiliyor}>
                  {gonderiliyor ? 'Gönderiliyor…' : 'Gönder'}
                </button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="od-overlay" />
                <Dialog.Content className="od-modal" aria-describedby="od-onay-aciklama">
                  <Dialog.Title className="od-modal-baslik">Ödevi gönder?</Dialog.Title>
                  <Dialog.Description id="od-onay-aciklama" className="od-modal-metin">
                    Cevaplanan: {cevapli}/{qs.length}. Bu ödev tek gönderimlik — gönderdikten sonra
                    cevaplar değiştirilemez.
                    {cevapli < qs.length && ` ${qs.length - cevapli} soru boş — boşlar yanlış sayılır.`}
                  </Dialog.Description>
                  <div className="od-modal-aksiyon">
                    <Dialog.Close asChild>
                      <button type="button" className="od-btn soluk">Dön</button>
                    </Dialog.Close>
                    <Dialog.Close asChild>
                      <button type="button" className="od-btn birincil" onClick={gonder}>Evet, gönder</button>
                    </Dialog.Close>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══ FİDAN stil bloğu — .od-* (odevler.html v1 portu; index.css değişkenleri) ═══ */
function OdevStil() {
  return (
    <style>{`
      .od-b1 { font-family: var(--font-display); font-weight: 800; font-size: 26px; letter-spacing: -0.02em; color: var(--metin1); }
      .od-b2 { font-family: var(--font-display); font-weight: 700; font-size: 17px; color: var(--metin1); }
      .od-b3 { font-family: var(--font-display); font-weight: 700; font-size: 15.5px; color: var(--metin1); }
      .od-metin2 { font-size: 13px; color: var(--metin2); }

      .od-kart { position: relative; background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge);
        transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease; }
      .od-kart:hover { transform: translateY(-2px); box-shadow: var(--golge-h); }

      .od-odev { display: flex; align-items: center; gap: 18px; padding: 20px 24px; margin-top: 14px; flex-wrap: wrap; }
      .od-odev.acil { border-color: color-mix(in srgb, var(--toprak) 75%, transparent); }
      .od-odev.gecti { border-color: color-mix(in srgb, var(--uyari) 55%, transparent); }
      .od-odev.hedefli { border: 1.5px dashed var(--adacayi); background: var(--ic); backdrop-filter: none; -webkit-backdrop-filter: none; }

      .od-ikon { width: 46px; height: 46px; border-radius: 14px; background: var(--v1);
        display: grid; place-items: center; font-size: 20px; flex: none; }
      .od-odev.acil .od-ikon { background: color-mix(in srgb, var(--toprak) 22%, transparent); }

      .od-alt { font-size: 12px; color: var(--metin3); margin-top: 3px; }
      .od-sag { display: flex; flex-direction: column; align-items: flex-end; gap: 8px; flex: none; margin-left: auto; }

      .od-rozet { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600;
        padding: 4px 11px; border-radius: 12px; }
      .od-rozet.notr { background: var(--v1); color: var(--metin2); }
      .od-rozet.bos { background: var(--v1); color: var(--metin2); }
      .od-rozet.acil { background: color-mix(in srgb, var(--toprak) 22%, transparent); color: color-mix(in srgb, var(--toprak) 60%, var(--metin1)); }
      .od-rozet.gecti { background: color-mix(in srgb, var(--uyari) 16%, transparent); color: var(--uyari); }
      .od-rozet.ozel { border: 1.5px dashed var(--adacayi); color: var(--vurgu); background: transparent; }
      .od-rozet.tamam { background: color-mix(in srgb, var(--yaprak) 16%, transparent); color: var(--vurgu); }

      .od-btn { border: none; cursor: pointer; border-radius: 12px; min-height: 44px; padding: 10px 20px;
        font-family: var(--font-sans); font-weight: 600; font-size: 13.5px;
        display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        transition: box-shadow .2s, background .15s, transform .15s, border-color .15s, color .15s; }
      .od-btn:active:not(:disabled) { transform: scale(.98); }
      .od-btn:disabled { opacity: .5; cursor: default; }
      .od-btn.birincil { background: var(--cta); color: #fff; box-shadow: 0 6px 16px rgba(30, 70, 32, .25); }
      .od-btn.birincil:hover:not(:disabled) { box-shadow: var(--parilti); transform: translateY(-1px); }
      .od-btn.soluk { background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
      .od-btn.soluk:hover:not(:disabled) { color: var(--metin1); border-color: var(--adacayi); }

      /* GOREV-044: 0 soruya düşmüş kapta buton yerine kelimeli dürüst not (eylem yok). */
      .od-notyok { font-size: 12px; font-weight: 500; color: var(--metin3); text-align: right; max-width: 160px; }

      .od-bilgi { display: flex; gap: 10px; align-items: flex-start; padding: 13px 18px; margin-top: 14px;
        background: var(--ic); border: 1px solid var(--cam-kenar); border-radius: 14px;
        font-size: 12.5px; color: var(--metin2); line-height: 1.55; }
      .od-bilgi b { color: var(--metin1); font-weight: 600; }

      .od-gecmis { display: flex; align-items: center; gap: 14px; padding: 10px 0; min-height: 44px;
        border-top: 1px solid var(--cizgi); font-size: 13px; flex-wrap: wrap; }
      .od-gecmis:first-of-type { border-top: none; }
      .od-gecmis-ad { flex: 1; min-width: 120px; font-weight: 600; color: var(--metin1); }
      .od-gecmis-tarih { color: var(--metin3); font-size: 12px; }
      .od-dokum { background: none; border: none; cursor: pointer; font-size: 12.5px; color: var(--vurgu);
        font-weight: 600; padding: 10px 6px; border-radius: 8px; }
      .od-dokum:hover { text-decoration: underline; }
      .od-halka-yok { width: 46px; height: 46px; border-radius: 50%; border: 1.5px dashed var(--cam-kenar);
        display: grid; place-items: center; color: var(--metin3); font-size: 12px; flex: none; }

      .od-iskelet { background: var(--ic); border-radius: 20px; }

      /* ── Çözüm görünümü ── */
      .od-serit { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 14px;
        background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--cam-kenar); border-radius: 16px; box-shadow: var(--golge); }
      .od-cik { width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--cam-kenar);
        background: transparent; color: var(--metin2); display: grid; place-items: center; cursor: pointer;
        flex: none; transition: background .15s; }
      .od-cik:hover { background: var(--ic); }
      .od-serit-ad { font-family: var(--font-display); font-weight: 700; font-size: 16px; color: var(--metin1); }
      .od-sayac { font-family: var(--font-mono); font-size: 11.5px; letter-spacing: .06em; color: var(--metin2);
        background: var(--ic); padding: 6px 10px; border-radius: 10px; white-space: nowrap; }
      .od-ilerleme { flex-basis: 100%; height: 6px; border-radius: 12px; background: var(--ic); overflow: hidden; }
      .od-ilerleme > i { display: block; height: 100%; border-radius: 12px;
        background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }

      .od-soru { background: var(--mat); border: 1px solid var(--cam-kenar); border-radius: 20px;
        box-shadow: var(--golge); padding: 18px 20px; }
      .od-soru-metin { font-size: 15px; line-height: 1.65; color: var(--metin1); }

      .od-sik { display: flex; align-items: center; gap: 13px; width: 100%; min-height: 44px; text-align: left;
        padding: 12px 15px; border-radius: 12px; border: 1.5px solid var(--cam-kenar); background: transparent;
        color: var(--metin1); transition: border-color .15s, background .15s; }
      .od-sik.secilebilir { cursor: pointer; }
      .od-sik.secilebilir:hover { border-color: color-mix(in srgb, var(--vurgu) 40%, transparent); background: var(--ic); }
      .od-sik.secili { border-color: var(--vurgu); background: color-mix(in srgb, var(--vurgu) 8%, transparent); }
      .od-harf { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex: none;
        font-family: var(--font-display); font-weight: 700; font-size: 13.5px; background: var(--ic);
        color: var(--metin2); transition: background .15s, color .15s; }
      .od-sik.secili .od-harf { background: var(--vurgu); color: #fff; }

      .od-altbar { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--cam-kenar); border-bottom: none; border-radius: 16px 16px 0 0;
        box-shadow: var(--golge); padding: 12px 18px; }
      .od-altbar-metin { font-family: var(--font-mono); font-size: 11.5px; color: var(--metin2); }

      .od-overlay { position: fixed; inset: 0; z-index: 85; background: rgba(12, 18, 14, .45); }
      .od-modal { position: fixed; z-index: 86; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: min(400px, calc(100vw - 32px)); background: var(--cam);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); padding: 22px; }
      .od-modal-baslik { font-family: var(--font-display); font-weight: 800; font-size: 18px; color: var(--metin1); }
      .od-modal-metin { margin-top: 8px; font-size: 13.5px; color: var(--metin2); line-height: 1.6; }
      .od-modal-aksiyon { margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end; }

      .od-btn:focus-visible, .od-sik:focus-visible, .od-cik:focus-visible, .od-dokum:focus-visible {
        outline: 2px solid var(--yaprak); outline-offset: 2px; }

      @media (prefers-reduced-motion: reduce) {
        .od-kart, .od-btn, .od-sik, .od-cik { transition: none; }
        .od-kart:hover, .od-btn:hover:not(:disabled) { transform: none; }
      }
      @media (prefers-reduced-motion: no-preference) {
        .od-ilerleme > i { transition: width .4s ease; }
      }
    `}</style>
  )
}
