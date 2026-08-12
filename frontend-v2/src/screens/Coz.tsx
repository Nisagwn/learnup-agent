import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, m, useReducedMotion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { MathMarkdown } from '../components/MathMarkdown'
import { MotionRoot } from '../components/fx'
import { apiGet, apiPost } from '../lib/api.js'
import { sesAcikMi, sesToggle, sesDogru, sesYanlis, sesFanfar } from '../lib/ses'
import type { CevapSonucu, CozKaynak, CozSpec, HavuzSoru, TestOzeti, TestYanlis } from '../lib/types'

const HARFLER = ['A', 'B', 'C', 'D', 'E'] as const

/* ═══════════════════════════════════════════════════════════════════════════
   ÇÖZ — odak modu (FİDAN, nav'sız, TEMAYI İZLER — eski "her zaman koyu" KALKTI).
   Kaynaklar:
     ai        → havuzdan kazanım/öneri seti (10)
     osym      → çıkmış sorular (TEST modu: geri bildirim sona kadar SESSİZ)
     review    → SRS vadesi gelen kartlar (pratik: anlık geri bildirim)
     tanisma   → karma yerleştirme seti (placement:true → K=0.3 hızlı yakınsama)
     antrenman → adaptif /practice/next döngüsü (zorluk merdiveni + pedagojik ipucu)
   Sunucu-otoriter puanlama: /answers havuzdan okur; istemci iddiası bağlayıcı değil.
   Klavye: A–E şık seçer · Enter/→ kontrol/devam. Ambiyans SAKİN: yaprak yok, tek güneş lekesi.
   ═══════════════════════════════════════════════════════════════════════════ */

export function Coz() {
  const nav = useNavigate()
  const loc = useLocation()
  const spec = (loc.state as CozSpec | null) ?? null
  const kaynak = spec?.source ?? 'ai'

  // loc.key her gezinmede değişir → köprüden ("tekrar önerilir") yeni set gelince remount.
  if (kaynak === 'antrenman') {
    return <Kabuk><Antrenman key={loc.key} spec={spec} cikis={() => nav('/rota')} /></Kabuk>
  }
  return <Kabuk><SetCozumu key={loc.key} spec={spec} kaynak={kaynak} /></Kabuk>
}

/** FİDAN kabuk — uygulama temasını İZLER (koyu zorlaması yok); tek silik güneş lekesi. */
function Kabuk({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <div className="cz min-h-screen font-sans" style={{ background: 'var(--page-bg)', color: 'var(--metin1)' }}>
        <CozStil />
        <div className="cz-gunes" aria-hidden />
        {children}
      </div>
    </MotionRoot>
  )
}

/** Çıkış onayı — Radix Dialog (frontend.md-6: yıkıcı eylem asla window.confirm). */
function CikisOnay({ onCik, onAcikDegisti, children }: {
  onCik: () => void
  /** Açıklık durumu YUKARI taşınır: klavye dinleyicisi modal açıkken kapatılmalı. */
  onAcikDegisti?: (acik: boolean) => void
  children: React.ReactNode
}) {
  return (
    <Dialog.Root onOpenChange={onAcikDegisti}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="cz-overlay" />
        <Dialog.Content className="cz-modal" aria-describedby="cz-cik-aciklama">
          <Dialog.Title className="cz-modal-baslik">Testten çık?</Dialog.Title>
          <Dialog.Description id="cz-cik-aciklama" className="cz-modal-metin">
            Bu oturumdaki ilerlemen kaydedilmez. Çıkmak istediğine emin misin?
          </Dialog.Description>
          <div className="cz-modal-aksiyon">
            <Dialog.Close asChild>
              <button type="button" className="cz-btn dis">Devam et</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button type="button" className="cz-btn tehlike" onClick={onCik}>Çık</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ═══ SET AKIŞI — ai / osym / review / tanisma ═══════════════════════════════ */

function SetCozumu({ spec, kaynak }: { spec: CozSpec | null; kaynak: CozKaynak }) {
  const nav = useNavigate()
  const azalt = useReducedMotion()
  const [sorular, setSorular] = useState<HavuzSoru[]>([])
  const [yukleniyor, setYukleniyor] = useState(true)
  const [hata, setHata] = useState('')
  const [idx, setIdx] = useState(spec?.startIndex ?? 0)
  const [secili, setSecili] = useState<string | null>(null)
  const [asama, setAsama] = useState<'soru' | 'geri'>('soru')
  const [dogruMu, setDogruMu] = useState(false)
  // Geri bildirim malzemesi SUNUCUDAN gelir (soru artık doğru şıkkı taşımıyor).
  const [dogruSik, setDogruSik] = useState<string | null>(null)
  const [cozum, setCozum] = useState<string | null>(null)
  const [kontrolEdiliyor, setKontrolEdiliyor] = useState(false)
  const [gonderimHatasi, setGonderimHatasi] = useState('')
  const [cikisAcik, setCikisAcik] = useState(false)
  const [istatistik, setIstatistik] = useState({ dogru: 0, toplam: 0, xp: 0 })
  const [sonXp, setSonXp] = useState(0)
  const [sesli, setSesli] = useState(sesAcikMi)
  const basladi = useRef(Date.now())
  const [gecen, setGecen] = useState(0)
  // Per-ders döküm — GERÇEK cevaplardan biriktirilir (özet ekranı); uydurma yok.
  const dersDurum = useRef<Map<string, { dogru: number; toplam: number }>>(new Map())
  /**
   * Yanlış yapılan sorular — Koç analizinin ham malzemesi.
   *
   * ⚠️ YALNIZ YANLIŞLAR ve KIRPILMIŞ metin tutulur. Doğru çözülen soruların tam metnini
   * biriktirmek, analize hiçbir şey katmadan sohbete taşınacak istemi (ve LLM faturasını)
   * şişirirdi. Analizin konusu hatadır.
   */
  const yanlislar = useRef<TestYanlis[]>([])

  const testModu = kaynak === 'osym' // ÖSYM = test: geri bildirim sona kadar SESSİZ

  // Soru kronometresi — mono sayaç (saniyede bir)
  useEffect(() => {
    const t = setInterval(() => setGecen(Math.floor((Date.now() - basladi.current) / 1000)), 1000)
    return () => clearInterval(t)
  }, [])

  // Soruları yükle
  useEffect(() => {
    let alive = true
    setYukleniyor(true); setHata('')

    const yukle = async (): Promise<HavuzSoru[]> => {
      if (spec?.questions?.length) return spec.questions
      if (kaynak === 'osym') {
        const r = await apiGet('/questions/osym', {
          subject: spec?.subject, year: spec?.year, label: spec?.label, limit: 10,
        })
        return r.questions ?? []
      }
      // Konular ekranından gelen seçim: konu → kazanımlar → sorular (sunucu çözer).
      // subject GÖNDERİLMEZ: konu zaten tek derse ait; ders adında harf farkı olursa
      // AND filtresi havuzu sessizce boşaltırdı (aynı tuzak kazanimId dalında da var).
      if (kaynak === 'konu' && spec?.konuId) {
        const r = await apiGet('/questions/ai', { konuId: spec.konuId, limit: 20 })
        return r.questions ?? []
      }
      if (kaynak === 'review') {
        const r = await apiGet('/practice/review')
        return r.questions ?? []
      }
      if (kaynak === 'tanisma') {
        // Karma yerleştirme: havuzdan geniş çek, ders başına dengeli 10 soru örnekle
        const r = await apiGet('/questions/ai', { limit: 50 })
        const hepsi: HavuzSoru[] = r.questions ?? []
        const gruplar = new Map<string, HavuzSoru[]>()
        for (const q of hepsi) {
          const g = gruplar.get(q.subject) ?? []
          g.push(q)
          gruplar.set(q.subject, g)
        }
        const secilen: HavuzSoru[] = []
        const listeler = [...gruplar.values()]
        for (let tur = 0; secilen.length < 10 && listeler.some((l) => l.length); tur++) {
          for (const l of listeler) {
            const q = l.shift()
            if (q) secilen.push(q)
            if (secilen.length >= 10) break
          }
        }
        return secilen
      }
      // ai: kazanım varsa ona göre, yoksa öneriye düş
      let kazanimId = spec?.kazanimId
      let subject = spec?.subject
      if (!kazanimId) {
        const s = await apiGet('/practice/suggest')
        if (s?.kazanim) { kazanimId = s.kazanim.kazanimId; subject = s.kazanim.subject }
      }
      // kazanimId varken subject'i EKLEME: harf uyuşmazlığında AND filtresi havuzu boşaltır.
      const r = await apiGet('/questions/ai', kazanimId ? { kazanimId, limit: 10 } : { subject, limit: 10 })
      return r.questions ?? []
    }

    yukle()
      .then((qs) => { if (alive) { setSorular(qs); setYukleniyor(false); basladi.current = Date.now() } })
      .catch((e) => { if (alive) { setHata(e?.message || 'Sorular yüklenemedi'); setYukleniyor(false) } })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const soru = sorular[idx]
  const geri = asama === 'geri'

  /**
   * Yarım blok kaydı — Bugün'deki "Devam Et" kartının kaynağı.
   *
   * ⚠️ SORULARIN KENDİSİ DE KAYDEDİLİR. Eskiden yalnız `{ spec, idx, toplam }` yazılıyordu;
   * "devam" tıklandığında sorular SIFIRDAN yeniden çekiliyor ve `startIndex` o TAZE listeye
   * uygulanıyordu. Kaynak 'ai' ve `kazanimId` yoksa (öneriden gelmiş set) `/practice/suggest`
   * yeniden çağrılıp BAŞKA bir kazanım önerebiliyordu: öğrenci "5/10 kaldığın yerden" deyip
   * tıklıyor, hiç görmediği bir setin 6. sorusuyla karşılaşıyordu. Sunucu daha az soru
   * döndürdüğünde (startIndex >= uzunluk) ekran anında "Test bitti — 0/0" özetine düşüyordu.
   * Soru listesi taşınınca devam GERÇEKTEN kaldığı yerden sürer (yükleyici `spec.questions`
   * doluysa ağa hiç gitmez). Sorular artık doğru şık taşımadığı için saklamak da güvenli.
   */
  useEffect(() => {
    try {
      if (!sorular.length) return
      if (idx > 0 && idx < sorular.length) {
        localStorage.setItem('learnup.devam', JSON.stringify({
          spec: { ...spec, source: kaynak, startIndex: undefined, questions: sorular },
          idx, toplam: sorular.length, zaman: Date.now(),
        }))
      } else if (idx >= sorular.length) {
        localStorage.removeItem('learnup.devam')
      }
    } catch { /* yut — kota dolabilir; devam kartı kritik değil */ }
  }, [idx, sorular, spec, kaynak])

  /**
   * Sunucu-otoriter puanlama VE doğruluk hükmü (havuzdan okur, LLM yok).
   *
   * ⚠️ Artık yalnız "puanlama" değil: doğru/yanlış kararı da buradan gelir. Soru nesnesi
   * `correct_option` taşımıyor (uçlar göndermiyor) — çünkü öğrenci daha cevaplamadan
   * doğru şıkkı okuyabiliyordu. Karşılığında geri bildirim bir sunucu turu bekler.
   */
  const puanla = async (q: HavuzSoru, sik: string): Promise<CevapSonucu | null> => {
    try {
      return await apiPost('/answers', {
        questionId: q.id,
        subject: q.subject,
        kazanimId: q.kazanim_id ?? null,
        selectedOption: sik,
        durationSec: Math.round((Date.now() - basladi.current) / 1000),
        difficulty: q.difficulty ?? null,
        // Tanışma = yerleştirme: BKT K=0.3 (hızlı yakınsama) — harita ilk setten belirir
        placement: kaynak === 'tanisma' || undefined,
      }) as CevapSonucu
    } catch { return null }
  }

  const dersEkle = (q: HavuzSoru, dogru: boolean) => {
    const dm = dersDurum.current
    const cur = dm.get(q.subject) ?? { dogru: 0, toplam: 0 }
    dm.set(q.subject, { dogru: cur.dogru + (dogru ? 1 : 0), toplam: cur.toplam + 1 })
  }

  const kontrol = async () => {
    if (!secili || !soru || geri || kontrolEdiliyor) return
    setKontrolEdiliyor(true)
    const r = await puanla(soru, secili)
    setKontrolEdiliyor(false)

    // Sunucuya ulaşılamadı ya da doğruluk çözülemedi → HÜKÜM VERMEYİZ.
    // Eskiden doğruluk istemcide hesaplandığı için ağ hatası bile "sonuç" üretiyordu;
    // artık uydurulmuş bir doğru/yanlış göstermektense öğrenciden tekrar denemesini isteriz.
    if (!r || r.isCorrect == null) {
      // ⚠️ `hata` DEĞİL: o durum tam ekran hata dalını çizip öğrenciyi sorudan atardı.
      // Bu şerit sorunun üstünde belirir, "Kontrol Et" tıklanabilir kalır.
      setGonderimHatasi('Cevabın kaydedilemedi — bağlantını kontrol edip tekrar dene.')
      return
    }
    setGonderimHatasi('')

    const dogru = r.isCorrect === true
    setIstatistik((s) => ({
      ...s, dogru: s.dogru + (dogru ? 1 : 0), toplam: s.toplam + 1, xp: s.xp + (r.xpGained || 0),
    }))
    dersEkle(soru, dogru)
    if (!dogru) {
      yanlislar.current.push({
        soru: soru.question_text.slice(0, 160),
        subject: soru.subject,
        konu: soru.topic ?? null,
        secilen: secili,
        dogruSik: r.correctOption ?? '?',
      })
    }

    if (testModu) {
      // TEST modu: ses YOK, şık rengi YOK, açıklama YOK — sessizce kaydet ve ilerle.
      ilerle()
      return
    }
    // PRATİK modu: anlık geri bildirim (malzeme sunucudan)
    setDogruMu(dogru); setDogruSik(r.correctOption); setCozum(r.solution)
    setSonXp(r.xpGained || 0); setAsama('geri')
    if (dogru) sesDogru(); else sesYanlis()
  }

  const ilerle = () => {
    setSonXp(0); setDogruSik(null); setCozum(null); setGonderimHatasi('')
    if (idx + 1 >= sorular.length) { setIdx(sorular.length); return } // özet
    setIdx((i) => i + 1); setSecili(null); setAsama('soru'); basladi.current = Date.now(); setGecen(0)
  }

  const cikis = () => nav(kaynak === 'osym' ? '/arsiv' : kaynak === 'tanisma' ? '/harita' : '/')

  // Klavye: A–E seç · Enter/→ kontrol/devam (input yok — köşe durumları için yine korunur)
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if (yukleniyor || !soru || idx >= sorular.length) return
      // ⚠️ MODAL AÇIKKEN KLAVYE SUSAR. Dinleyici window'a bağlı ve çıkış onayı açıkken de
      // çalışıyordu: öğrenci ✕'e basıp "Testten çık?" diyaloğunda kararsız kalıp Enter'a
      // bastığında (odak "Devam et" butonundadır) arkadaki soru CEVAPLANIYOR, /answers'a
      // POST gidiyor ve sayaç artıyordu — diyalog Enter'ı yutamadığı için kullanıcı ne
      // olduğunu görmüyordu.
      if (cikisAcik) return
      const hedef = e.target as HTMLElement | null
      if (hedef && (hedef.tagName === 'INPUT' || hedef.tagName === 'TEXTAREA')) return
      const k = e.key.toUpperCase()
      if (!geri && (HARFLER as readonly string[]).includes(k) && soru.options?.[k] != null) { setSecili(k); return }
      if (e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); geri ? ilerle() : void kontrol() }
      // ArrowLeft: doğrusal set akışında geri-düzenleme yok — bilinçli olarak devre dışı.
    }
    window.addEventListener('keydown', dinle)
    return () => window.removeEventListener('keydown', dinle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yukleniyor, soru, geri, secili, idx, sorular.length, cikisAcik])

  /* ── Durumlar ── */
  if (yukleniyor) return <Merkez><Spinner /><p className="mt-3.5 text-[13px]" style={{ color: 'var(--metin3)' }}>Sorular hazırlanıyor…</p></Merkez>
  if (hata) return (
    <Merkez>
      <span className="grid size-13 place-items-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--yanlis) 12%, transparent)' }}>
        <Icon name="refresh" size={26} color="var(--yanlis)" />
      </span>
      <p className="mt-3.5 text-sm font-semibold" style={{ color: 'var(--metin1)' }}>{hata}</p>
      <button type="button" className="cz-btn dis mt-5" onClick={cikis}>Geri dön</button>
    </Merkez>
  )
  if (!sorular.length) return (
    <Merkez>
      <span className="grid size-13 place-items-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--yaprak) 15%, transparent)' }}>
        <Icon name="sprout" size={26} color="var(--yaprak)" />
      </span>
      <p className="mt-3.5 font-display text-[15px] font-bold" style={{ color: 'var(--metin1)' }}>
        {kaynak === 'review' ? 'Vadesi gelen kart yok' : 'Bu konuda soru bulunamadı'}
      </p>
      <p className="mt-1.5 max-w-70 text-center text-xs leading-relaxed" style={{ color: 'var(--metin3)' }}>
        {kaynak === 'ai' ? 'Havuz bu kazanım için henüz boş. Koç doldurunca burada belirir.'
          : kaynak === 'review' ? 'Aralıklı tekrar motoru kartların vadesini bekliyor — çözmeye devam.'
          : kaynak === 'tanisma' ? 'Havuz henüz boş — Koç doldurunca tanışma sınavı açılır.'
          : 'Bu derste çıkmış soru bulunamadı.'}
      </p>
      <button type="button" className="cz-btn dis mt-5" onClick={cikis}>Geri dön</button>
    </Merkez>
  )

  /* ── Özet ── */
  if (idx >= sorular.length) {
    return (
      <Ozet
        istatistik={istatistik}
        kaynak={kaynak}
        dokum={[...dersDurum.current.entries()].map(([subject, s]) => ({ subject, ...s }))}
        onTekrar={() => {
          setIdx(0); setSecili(null); setAsama('soru')
          setIstatistik({ dogru: 0, toplam: 0, xp: 0 })
          dersDurum.current = new Map()
          yanlislar.current = []   // ⚠️ yoksa ikinci turun yanlışları birincininkilere eklenir
          basladi.current = Date.now()
        }}
        onBitir={cikis}
        onDersTekrar={(subject) => nav('/coz', { state: { source: 'ai', subject, title: subject } })}
        /**
         * Koç'a dönüş — YALNIZ sohbetten gelindiyse (spec.donusSession dolu).
         * Başka yerden (Arşiv, Rota, komut paleti) gelen öğrenciye "Koç'a dön" demek,
         * hiç açılmamış bir konuşmaya "dön" demek olurdu.
         */
        onKoca={spec?.donusSession ? () => nav('/kaptan', {
          state: {
            donusSession: spec.donusSession,
            testOzeti: {
              kaynak,
              baslik: spec?.title,
              dogru: istatistik.dogru,
              toplam: istatistik.toplam,
              dokum: [...dersDurum.current.entries()].map(([subject, s]) => ({ subject, ...s })),
              // Uzun bir testte 20 yanlışın tamamını taşımak istemi şişirir; ilk 8'i
              // örüntüyü göstermeye yeter (Koç zaten "ortak hata nedir" diye bakıyor).
              yanlislar: yanlislar.current.slice(0, 8),
            } satisfies TestOzeti,
          },
        }) : undefined}
      />
    )
  }

  const yuzdeIlerleme = ((idx + (geri ? 1 : 0)) / sorular.length) * 100

  return (
    <div className="flex min-h-screen flex-col">
      {/* Üst ince cam şerit: çık(onay) + ilerleme + süre + ses */}
      <div className="cz-serit">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4" style={{ height: 56 }}>
          <CikisOnay onCik={cikis} onAcikDegisti={setCikisAcik}>
            <button type="button" className="cz-cik grid size-9 cursor-pointer place-items-center rounded-xl" title="Testten çık" aria-label="Çık">
              <Icon name="close" size={17} color="currentColor" />
            </button>
          </CikisOnay>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="shrink-0 font-mono text-[11.5px]" style={{ color: 'var(--metin2)' }}>SORU {idx + 1}/{sorular.length}</span>
            <div className="cz-ilerleme flex-1" role="progressbar" aria-valuenow={idx + 1} aria-valuemin={0} aria-valuemax={sorular.length}>
              <i style={{ width: `${yuzdeIlerleme}%` }} />
            </div>
          </div>
          <span className="cz-sure shrink-0 rounded-xl px-3 py-1.5 text-[12.5px] tabular-nums">
            {Math.floor(gecen / 60)}:{String(gecen % 60).padStart(2, '0')}
          </span>
          <button
            type="button"
            onClick={() => setSesli(sesToggle())}
            title={sesli ? 'Sesi kapat' : 'Sesi aç'}
            className="cz-cik grid size-9 cursor-pointer place-items-center rounded-xl"
          >
            <Icon name={sesli ? 'volume' : 'volumeOff'} size={16} color="currentColor" />
          </button>
        </div>
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-6">
        {/* Kaynak kimliği — ÖSYM: kehribar mühür (sayfadaki TEK kehribar); diğerleri sakin çip */}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          {testModu ? (
            <span className="cz-muhur">
              <Icon name="seal" size={15} color="currentColor" />
              ÖSYM ÇIKMIŞ SORU{(soru.exam_label || soru.exam_year) ? ` · ${soru.exam_label || soru.exam_year}` : ''}
            </span>
          ) : (
            <span className="cz-kazanim" style={{ background: 'color-mix(in srgb, var(--adacayi) 20%, transparent)', color: 'var(--vurgu)' }}>
              <Icon name={kaynak === 'review' ? 'history' : kaynak === 'tanisma' ? 'scan' : 'sparkle'} size={14} color="currentColor" />
              {kaynak === 'review' ? 'Tekrar · aralıklı hafıza' : kaynak === 'tanisma' ? 'Tanışma sınavı · yerleştirme' : 'Koç pratiği · adaptif'}
            </span>
          )}
          {soru.subject && (
            <span className="cz-kazanim" style={{ background: 'var(--ic)', color: 'var(--metin2)' }}>
              {soru.subject}{soru.topic ? ` · ${soru.topic}` : ''}
            </span>
          )}
        </div>

        {/* Gönderim hatası — sorunun ÜSTÜNDE şerit; öğrenci soruda kalır, tekrar deneyebilir */}
        {gonderimHatasi && (
          <div
            className="mb-3.5 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px]"
            role="alert"
            style={{
              background: 'color-mix(in srgb, var(--yanlis) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--yanlis) 30%, transparent)',
              color: 'var(--metin2)',
            }}
          >
            <Icon name="refresh" size={15} color="var(--yanlis)" />
            {gonderimHatasi}
          </div>
        )}

        {/* Soru kartı + şıklar */}
        <AnimatePresence mode="wait">
          <m.div
            key={idx}
            initial={azalt ? false : { opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={azalt ? { opacity: 0 } : { opacity: 0, x: -18 }}
            transition={{ duration: azalt ? 0 : 0.22, ease: [0.21, 0.65, 0.32, 1] }}
          >
            <div className={cn('cz-kart px-5 py-5', testModu && 'cz-osym')}>
              <div className="text-[16px] leading-relaxed" style={{ color: 'var(--metin1)' }}>
                <span className="font-display font-bold">Soru {idx + 1}.</span>{' '}
                <MathMarkdown inline>{soru.question_text}</MathMarkdown>
              </div>
            </div>

            <div className="mt-3.5 space-y-2.5">
              {HARFLER.filter((L) => soru.options?.[L] != null).map((L) => {
                // Doğru şık sunucudan gelir; çözülemediyse (dogruSik null) hiçbir şık
                // "doğru" boyanmaz — yanlış bir şıkkı yeşile boyamaktansa boyamamak yeğdir.
                const buDogru = dogruSik != null && L === dogruSik
                const secildi = secili === L
                const durum = geri
                  ? (buDogru ? 'dogru' : secildi ? 'yanlis' : 'soluk')
                  : (secildi ? 'secili' : '')
                return (
                  <button
                    key={L}
                    type="button"
                    onClick={() => !geri && setSecili(L)}
                    disabled={geri}
                    className={cn('cz-sik', !geri && 'cz-sik-secilebilir', durum)}
                  >
                    <span className="cz-harf">
                      {geri && buDogru ? <Icon name="check" size={16} color="currentColor" strokeWidth={2.6} />
                        : geri && secildi && !buDogru ? <Icon name="close" size={15} color="currentColor" strokeWidth={2.6} />
                        : L}
                    </span>
                    {/* Şık metni KaTeX'ten geçer — havuz "$12$" yazar, ham basılmaz */}
                    <span className="text-[14.5px] font-medium leading-normal">
                      <MathMarkdown inline>{soru.options[L]}</MathMarkdown>
                    </span>
                    {geri && buDogru && <span className="cz-durum-yazi" style={{ color: 'var(--dogru)' }}>Doğru</span>}
                    {geri && secildi && !buDogru && <span className="cz-durum-yazi" style={{ color: 'var(--yanlis)' }}>Yanlış</span>}
                  </button>
                )
              })}
            </div>

            {/* "Neden?" açıklama kutusu — yalnız pratik geri bildiriminde (motive dil, teşhis yok) */}
            {geri && (
              <div className="cz-aciklama">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="grid size-6 place-items-center rounded-full"
                    style={{ background: dogruMu ? 'color-mix(in srgb, var(--dogru) 20%, transparent)' : 'color-mix(in srgb, var(--yanlis) 20%, transparent)', color: dogruMu ? 'var(--dogru)' : 'var(--yanlis)' }}
                  >
                    <Icon name={dogruMu ? 'check' : 'close'} size={14} color="currentColor" strokeWidth={2.6} />
                  </span>
                  <b style={{ color: dogruMu ? 'var(--dogru)' : 'var(--yanlis)' }}>
                    {dogruMu ? 'Doğru!' : dogruSik ? `Doğru cevap: ${dogruSik}` : 'Yanlış'}
                  </b>
                  {dogruMu && sonXp > 0 && (
                    <m.span
                      className="cz-odul ml-auto"
                      style={{ padding: '4px 11px', fontSize: 12.5 }}
                      initial={azalt ? false : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                    >
                      <Icon name="sparkle" size={13} color="currentColor" /> +{sonXp} XP
                    </m.span>
                  )}
                </div>
                {cozum ? (
                  <>
                    <b>Neden?</b>
                    <div className="mt-1 max-h-56 overflow-y-auto">
                      <MathMarkdown>{cozum}</MathMarkdown>
                    </div>
                  </>
                ) : (
                  <span>{dogruMu ? 'Güzel — bu kazanımı bir adım daha pekiştirdin 🌱' : 'Sorun değil, yanlıştan öğrenilir — çözmeye devam et.'}</span>
                )}
              </div>
            )}
          </m.div>
        </AnimatePresence>
      </div>

      {/* Alt eylem barı — görünüm başına TEK birincil buton */}
      <div className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-6">
        {!geri ? (
          <button type="button" className="cz-btn birincil cz-btn-full" disabled={!secili || kontrolEdiliyor} onClick={kontrol}>
            {kontrolEdiliyor ? 'Kontrol ediliyor…'
              : testModu ? (idx + 1 >= sorular.length ? 'Cevapla ve bitir' : 'Cevapla') : 'Kontrol Et'}
            <span className="font-mono text-[11px] opacity-60">↵</span>
          </button>
        ) : (
          <button type="button" className="cz-btn birincil cz-btn-full" onClick={ilerle}>
            {idx + 1 >= sorular.length ? 'Bitir' : 'Sonraki Soru'}
            <Icon name="arrowRight" size={16} color="currentColor" />
          </button>
        )}
      </div>
    </div>
  )
}

/* ═══ ANTRENMAN — adaptif /practice/next döngüsü ════════════════════════════ */

/** ⚠️ correct_answer/explanation YOK — /practice/next artık cevabı göndermiyor (bkz. HavuzSoru). */
interface AntrenmanSoru {
  id: string | null
  question_text: string
  options: string[]
  subject: string | null
  difficulty: string | null
  kazanim_id?: number | null
}

function Antrenman({ spec, cikis }: { spec: CozSpec | null; cikis: () => void }) {
  const azalt = useReducedMotion()
  const [soru, setSoru] = useState<AntrenmanSoru | null>(null)
  const [seviye, setSeviye] = useState(2)
  const [ipucu, setIpucu] = useState<string | null>(null)
  const [secili, setSecili] = useState<number | null>(null)
  const [asama, setAsama] = useState<'yukleniyor' | 'soru' | 'geri'>('yukleniyor')
  const [dogruMu, setDogruMu] = useState(false)
  const [istatistik, setIstatistik] = useState({ dogru: 0, toplam: 0 })
  const [hata, setHata] = useState('')
  // Geri bildirim malzemesi SUNUCUDAN (soru artık cevabı taşımıyor)
  const [dogruSik, setDogruSik] = useState<string | null>(null)
  const [cozum, setCozum] = useState<string | null>(null)
  const [kontrolEdiliyor, setKontrolEdiliyor] = useState(false)
  /** Havuz tükendi: mevcut soru cevaplandı ama SIRADAKİ yok → akış dürüstçe biter. */
  const [havuzBitti, setHavuzBitti] = useState(false)
  const basladi = useRef(Date.now())
  const subject = spec?.subject ?? 'Matematik'

  const getir = async (cevap?: { isCorrect: boolean; givenAnswer: string }) => {
    setAsama('yukleniyor')
    setIpucu(null)
    try {
      const r = await apiPost('/practice/next', {
        subject,
        topic: spec?.title ?? subject,
        questionId: soru?.id ?? null,
        questionText: soru?.question_text ?? null,
        duration: Math.round((Date.now() - basladi.current) / 1000),
        ...(cevap ? { isCorrect: cevap.isCorrect, givenAnswer: cevap.givenAnswer } : {}),
      })
      if (r?.pedagogicalHint) setIpucu(String(r.pedagogicalHint))
      if (typeof r?.stats?.currentLevel === 'number') setSeviye(r.stats.currentLevel)
      if (r?.nextQuestion) {
        setHata('')          // başarılı çağrı önceki hatayı TEMİZLER (eskiden hiç temizlenmiyordu)
        setHavuzBitti(false)
        setSoru(r.nextQuestion as AntrenmanSoru)
        setSecili(null)
        setAsama(cevap ? 'geri' : 'soru')
        if (!cevap) basladi.current = Date.now()
      } else {
        // ⚠️ Eskiden burada `setAsama('soru')` vardı: ekran AYNI soruyu eski seçimiyle
        // yeniden gösteriyor, "Kontrol Et" tıklanabilir kalıyordu. Öğrenci aynı soruyu
        // tekrar cevaplıyor, sayaç ikinci kez artıyor ve /answers'a ikinci POST gidiyordu.
        // Yazılan hata metni ise hiç görünmüyordu (hata ekranı yalnız `!aktifSoru` iken çizilir).
        setHata('Havuzda uygun soru kalmadı — Koç yenilerini hazırlıyor.')
        setHavuzBitti(true)
        setAsama(cevap ? 'geri' : 'soru')
      }
    } catch (e: any) {
      setHata(e?.message || 'Antrenman başlatılamadı')
      setHavuzBitti(!!cevap)
      setAsama(cevap ? 'geri' : 'soru')
    }
  }

  // İlk soru
  useEffect(() => { void getir() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [aktifSoru, setAktifSoru] = useState<AntrenmanSoru | null>(null)
  useEffect(() => { if (asama === 'soru' && soru) setAktifSoru(soru) }, [asama, soru])

  const kontrol = async () => {
    // ⚠️ Eski koşul `!aktifSoru?.correct_answer` idi: cevabı boş gelen soruda fonksiyon
    // SESSİZCE dönüyor, buton ise aktif kalıyordu (disabled correct_answer'a bakmıyordu).
    // Öğrenci tıklıyor, hiçbir şey olmuyordu — akış tümüyle kilitleniyordu.
    if (secili == null || !aktifSoru || kontrolEdiliyor) return
    const verilen = aktifSoru.options[secili]

    // Doğruluk hükmü SUNUCUDAN (soru artık cevabı taşımıyor).
    setKontrolEdiliyor(true)
    let r: CevapSonucu | null = null
    try {
      r = await apiPost('/answers', {
        questionId: aktifSoru.id,
        subject: aktifSoru.subject ?? subject,
        kazanimId: aktifSoru.kazanim_id ?? null,
        selectedOption: HARFLER[secili] ?? null,
        durationSec: Math.round((Date.now() - basladi.current) / 1000),
        difficulty: aktifSoru.difficulty ?? null,
      }) as CevapSonucu
    } catch { r = null }
    setKontrolEdiliyor(false)

    if (!r || r.isCorrect == null) {
      setHata('Cevabın kaydedilemedi — bağlantını kontrol edip tekrar dene.')
      return
    }
    setHata('')

    const dogru = r.isCorrect === true
    setDogruMu(dogru)
    setDogruSik(r.correctOption)
    setCozum(r.solution)
    setIstatistik((s) => ({ dogru: s.dogru + (dogru ? 1 : 0), toplam: s.toplam + 1 }))
    if (dogru) sesDogru(); else sesYanlis()
    // Sıradaki soru + ipucu (yanlışta) arka planda gelir; "geri" aşaması gösterilir
    void getir({ isCorrect: dogru, givenAnswer: String(verilen) })
  }

  const devamEt = () => {
    setDogruSik(null); setCozum(null)
    setAsama('soru')
    basladi.current = Date.now()
  }

  if (hata && !aktifSoru) {
    return (
      <Merkez>
        <span className="grid size-13 place-items-center rounded-2xl" style={{ background: 'color-mix(in srgb, var(--yaprak) 15%, transparent)' }}>
          <Icon name="sprout" size={26} color="var(--yaprak)" />
        </span>
        <p className="mt-3.5 max-w-75 text-center text-sm font-semibold" style={{ color: 'var(--metin1)' }}>{hata}</p>
        <button type="button" className="cz-btn dis mt-5" onClick={cikis}>Geri dön</button>
      </Merkez>
    )
  }

  const geri = asama === 'geri'
  const gosterilen = geri ? aktifSoru : (asama === 'soru' ? aktifSoru : null)

  return (
    <div className="flex min-h-screen flex-col">
      {/* Üst şerit: çık(onay) + kimlik + zorluk merdiveni + doğruluk */}
      <div className="cz-serit">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4" style={{ height: 56 }}>
          <CikisOnay onCik={cikis}>
            <button type="button" className="cz-cik grid size-9 cursor-pointer place-items-center rounded-xl" title="Antrenmandan çık" aria-label="Çık">
              <Icon name="close" size={17} color="currentColor" />
            </button>
          </CikisOnay>
          <span className="cz-kazanim shrink-0" style={{ background: 'color-mix(in srgb, var(--adacayi) 20%, transparent)', color: 'var(--vurgu)' }}>
            <Icon name="bolt" size={14} color="currentColor" /> Antrenman · adaptif
          </span>
          <div className="ml-auto flex items-center gap-1.5" title={`Zorluk kademesi ${seviye}/3`}>
            <span className="font-mono text-[10.5px]" style={{ color: 'var(--metin3)' }}>zorluk</span>
            {[1, 2, 3].map((s) => (
              <span key={s} className="h-2 w-5 rounded-full" style={{ background: s <= seviye ? 'var(--yaprak)' : 'var(--ic)' }} />
            ))}
          </div>
          <span className="font-mono text-[11.5px]" style={{ color: 'var(--metin2)' }}>
            {istatistik.dogru}/{istatistik.toplam}
          </span>
        </div>
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-3xl flex-1 px-4 pb-6 pt-6">
        {asama === 'yukleniyor' && !gosterilen ? (
          <div className="grid min-h-60 place-items-center">
            <div className="text-center">
              <Spinner />
              <p className="mt-3.5 text-[13px]" style={{ color: 'var(--metin3)' }}>Koç soru hazırlıyor…</p>
            </div>
          </div>
        ) : gosterilen ? (
          <>
            <div className="cz-kart px-5 py-5">
              <div className="text-[16px] leading-relaxed" style={{ color: 'var(--metin1)' }}>
                <MathMarkdown inline>{gosterilen.question_text}</MathMarkdown>
              </div>
            </div>
            <div className="mt-3.5 space-y-2.5">
              {gosterilen.options.map((secenek, i) => {
                // Doğru şık sunucudan HARF olarak gelir; çözülemediyse hiçbir şık boyanmaz.
                const buDogru = geri && dogruSik != null && HARFLER[i] === dogruSik
                const secildi = secili === i
                const durum = buDogru ? 'dogru' : (geri && secildi && !buDogru) ? 'yanlis' : (geri && !secildi) ? 'soluk' : secildi ? 'secili' : ''
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => !geri && setSecili(i)}
                    disabled={geri}
                    className={cn('cz-sik', !geri && 'cz-sik-secilebilir', durum)}
                  >
                    <span className="cz-harf">{HARFLER[i] ?? i + 1}</span>
                    <span className="text-[14.5px] font-medium">
                      <MathMarkdown inline>{String(secenek)}</MathMarkdown>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Pedagojik ipucu balonu — yanlışta Koç'tan gelir */}
            {geri && ipucu && (
              <m.div
                initial={azalt ? false : { opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="cz-ipucu mt-4 flex items-start gap-2.5 rounded-xl px-4 py-3"
              >
                <Icon name="lightbulb" size={16} color="var(--bilgi)" style={{ marginTop: 2, flexShrink: 0 }} />
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--metin2)' }}>{ipucu}</p>
              </m.div>
            )}

            {geri && cozum && (
              <div className="cz-aciklama">
                <b>Neden?</b>
                <div className="mt-1"><MathMarkdown>{cozum}</MathMarkdown></div>
              </div>
            )}

            {/* Havuz tükendi / ağ hatası — soru ekranındayken de GÖRÜNÜR şerit.
                Eskiden bu metin yalnız `!aktifSoru` iken çizildiği için hiç görünmüyordu. */}
            {hata && (
              <div
                className="mt-4 flex items-center gap-2.5 rounded-xl px-4 py-3 text-[13px]"
                role="alert"
                style={{
                  background: 'color-mix(in srgb, var(--uyari) 12%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--uyari) 30%, transparent)',
                  color: 'var(--metin2)',
                }}
              >
                <Icon name="sprout" size={15} color="var(--uyari)" />
                {hata}
              </div>
            )}
          </>
        ) : null}
      </div>

      <div className="relative z-[1] mx-auto w-full max-w-3xl px-4 pb-6">
        {!geri ? (
          <button type="button" className="cz-btn birincil cz-btn-full" disabled={secili == null || asama === 'yukleniyor' || kontrolEdiliyor} onClick={kontrol}>
            {kontrolEdiliyor ? 'Kontrol ediliyor…' : 'Kontrol Et'}
          </button>
        ) : havuzBitti ? (
          // Sıradaki soru YOK: "Devam" göstermek yalanı sürdürürdü — tek dürüst eylem çıkıştır.
          <button type="button" className="cz-btn birincil cz-btn-full" onClick={cikis}>
            Bitir
            <Icon name="arrowRight" size={16} color="currentColor" />
          </button>
        ) : (
          <div className="flex gap-2.5">
            <button type="button" className="cz-btn dis" onClick={cikis}>Bitir</button>
            <button type="button" className="cz-btn birincil cz-btn-full" disabled={asama !== 'geri' && !soru} onClick={devamEt}>
              {dogruMu ? 'Devam — zorluk artıyor' : 'Devam'}
              <Icon name="arrowRight" size={16} color="currentColor" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ═══ ÖZET ═══════════════════════════════════════════════════════════════════ */

const KAYNAK_ETIKET: Record<string, string> = {
  ai: 'Koç pratiği', osym: 'ÖSYM çıkmış soru', review: 'Tekrar seti', tanisma: 'Tanışma sınavı',
}

function Ozet({ istatistik, kaynak, dokum, onTekrar, onBitir, onDersTekrar, onKoca }: {
  istatistik: { dogru: number; toplam: number; xp: number }
  kaynak: string
  dokum: { subject: string; dogru: number; toplam: number }[]
  onTekrar: () => void
  onBitir: () => void
  onDersTekrar: (subject: string) => void
  /** Sohbetten gelindiyse dolu; yoksa "Koç'a dön" butonu HİÇ çizilmez. */
  onKoca?: () => void
}) {
  const azalt = useReducedMotion()
  const yuzde = istatistik.toplam ? Math.round((istatistik.dogru / istatistik.toplam) * 100) : 0
  const [doldur, setDoldur] = useState(false)

  useEffect(() => {
    sesFanfar()
    // Yaprak konfetisi — v1.2 renkleri (adaçayı/yaprak/toprak); hareket-azalt'ta atlanır.
    if (yuzde >= 70 && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      void import('canvas-confetti').then(({ default: confetti }) => {
        confetti({ particleCount: 90, spread: 75, origin: { y: 0.6 }, colors: ['#84A98C', '#4FA56F', '#D4A373', '#6FA57F'] })
      })
    }
    const id = requestAnimationFrame(() => setDoldur(true))
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const circ = 402.1 // 2π·64
  const offset = doldur ? circ * (1 - yuzde / 100) : circ

  return (
    <Merkez>
      <div className={cn('cz-kart relative z-[1] w-full max-w-md px-6 py-7 text-center', !azalt && 'cz-canlan')}>
        <h2 className="font-display text-[22px] font-extrabold" style={{ color: 'var(--metin1)' }}>
          {kaynak === 'tanisma' ? 'Analizin hazır 🌿' : 'Test bitti — güzel iş 🌿'}
        </h2>
        <p className="mt-1 text-[13.5px]" style={{ color: 'var(--metin2)' }}>
          {KAYNAK_ETIKET[kaynak] ?? 'Pratik'} · {istatistik.toplam} soru
        </p>

        {/* Dolarak canlanan skor halkası (adaçayı→yaprak) */}
        <div className="relative mx-auto my-4" style={{ width: 150, height: 150 }}>
          <svg width="150" height="150" viewBox="0 0 150 150">
            <defs>
              <linearGradient id="cz-sg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--adacayi)" />
                <stop offset="1" stopColor="var(--yaprak)" />
              </linearGradient>
            </defs>
            <circle cx="75" cy="75" r="64" fill="none" stroke="var(--ic)" strokeWidth="10" />
            <circle
              cx="75" cy="75" r="64" fill="none" stroke="url(#cz-sg)" strokeWidth="10" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={offset} transform="rotate(-90 75 75)"
              style={{ transition: azalt ? 'none' : 'stroke-dashoffset 1s cubic-bezier(.4,0,.2,1)' }}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            <div>
              <b className="block font-display text-[30px] font-extrabold leading-none" style={{ color: 'var(--metin1)' }}>{istatistik.dogru}/{istatistik.toplam}</b>
              <span className="text-[11.5px]" style={{ color: 'var(--metin3)' }}>doğru</span>
            </div>
          </div>
        </div>

        {/* Ödül — yalnız GERÇEK veri: XP (coin/seri /answers yanıtında yok → uydurulmaz) */}
        {istatistik.xp > 0 && (
          <div className="mt-1 flex flex-wrap justify-center gap-2.5">
            <span className="cz-odul"><Icon name="sparkle" size={15} color="currentColor" /> +{istatistik.xp} XP</span>
          </div>
        )}

        {/* Kazanım/ders dökümü — kelimeli rozet; "tekrar önerilir" o dersten pratiğe köprü */}
        {dokum.length > 0 && (
          <div className="mx-auto mt-4 max-w-sm text-left">
            {dokum.map((d) => {
              const oran = d.toplam ? d.dogru / d.toplam : 0
              const zayif = oran < 0.7
              return (
                <div key={d.subject} className="cz-dokum-satir">
                  <span style={{ color: 'var(--metin1)' }}>{d.subject}</span>
                  {zayif ? (
                    <button type="button" className="cz-rozet uyari" onClick={() => onDersTekrar(d.subject)} title="Bu dersten tekrar pratiği başlat">
                      <Icon name="refresh" size={12} color="currentColor" /> {d.dogru}/{d.toplam} — tekrar önerilir
                    </button>
                  ) : (
                    <span className="cz-rozet dogru"><Icon name="check" size={12} color="currentColor" strokeWidth={2.6} /> {d.dogru}/{d.toplam} doğru</span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {kaynak === 'tanisma' && (
          <p className="mx-auto mt-3 max-w-xs text-xs leading-relaxed" style={{ color: 'var(--metin3)' }}>
            Motor seni tanıdı — Analizler'de ustalık haritan artık canlı.
          </p>
        )}

        {/* Görünüm başına TEK birincil eylem.
            ⚠️ Sohbetten gelindiyse BİRİNCİL eylem "Koç'a dön" olur, "Bugüne dön" ikincile
            düşer: öğrenciyi buraya Koç gönderdi, dönüş yolu da oraya bakmalı. Yoksa
            konuşma yarım kalır — testi öneren Koç sonucu hiç öğrenmez. */}
        <div className="mt-6 flex flex-wrap justify-center gap-2.5">
          {kaynak !== 'tanisma' && (
            <button type="button" className="cz-btn dis" onClick={onTekrar}>Tekrar çöz</button>
          )}
          {onKoca && (
            <button type="button" className="cz-btn birincil" onClick={onKoca}>
              Koç'a dön
              <Icon name="chat" size={16} color="currentColor" />
            </button>
          )}
          <button type="button" className={cn('cz-btn', onKoca ? 'dis' : 'birincil')} onClick={onBitir}>
            {kaynak === 'tanisma' ? 'Analizlere git' : 'Bugüne dön'}
            <Icon name="arrowRight" size={16} color="currentColor" />
          </button>
        </div>
      </div>
    </Merkez>
  )
}

function Merkez({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-[1] flex min-h-screen flex-col items-center justify-center px-6">
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div
      className="mx-auto size-9 animate-spin rounded-full border-[3px]"
      style={{ borderColor: 'color-mix(in srgb, var(--yaprak) 22%, transparent)', borderTopColor: 'var(--yaprak)' }}
    />
  )
}

/* ═══ FİDAN stil bloğu — .cz-* (önizleme soru-coz.html v1 portu; animasyonlar hareket-azalt kapılı) ═══ */

function CozStil() {
  return (
    <style>{`
      .cz { --kehribar: #B8863B; }
      .dark .cz { --kehribar: #D9B267; }

      /* Odak modunda ambiyans SAKİN: yaprak yok, tek silik güneş lekesi */
      .cz-gunes { position: fixed; pointer-events: none; z-index: 0; border-radius: 50%; filter: blur(70px);
        width: 640px; height: 420px; top: -160px; left: 50%; transform: translateX(-50%); background: rgba(132,169,140,0.14); }
      .dark .cz-gunes { background: rgba(132,169,140,0.10); }

      .cz-serit { position: sticky; top: 0; z-index: 10; background: var(--cam);
        backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid var(--cizgi); }
      .cz-cik { border: 1px solid var(--cam-kenar); background: transparent; color: var(--metin2); transition: background .15s; }
      .cz-cik:hover { background: var(--ic); }
      .cz-ilerleme { height: 7px; border-radius: 12px; background: var(--ic); overflow: hidden; }
      .cz-ilerleme > i { display: block; height: 100%; border-radius: 12px; background: linear-gradient(90deg, var(--adacayi), var(--yaprak)); }
      .cz-sure { font-family: var(--font-mono); background: var(--ic); color: var(--metin2); font-weight: 500; }

      .cz-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }

      .cz-kazanim { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px; border-radius: 12px; font-size: 12.5px; font-weight: 600; }

      .cz-sik { display: flex; align-items: center; gap: 14px; width: 100%; text-align: left; padding: 13px 16px;
        border-radius: 12px; border: 1.5px solid var(--cam-kenar); background: transparent; color: var(--metin1);
        transition: border-color .15s, background .15s, transform .12s; }
      .cz-sik-secilebilir { cursor: pointer; }
      .cz-sik-secilebilir:hover { border-color: color-mix(in srgb, var(--vurgu) 40%, transparent); background: var(--ic); }
      .cz-sik .cz-harf { width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto;
        font-family: var(--font-display); font-weight: 700; font-size: 14px; background: var(--ic); color: var(--metin2); transition: background .15s, color .15s; }
      .cz-sik.secili { border-color: var(--vurgu); background: color-mix(in srgb, var(--vurgu) 7%, transparent); }
      .cz-sik.secili .cz-harf { background: var(--vurgu); color: #fff; }
      .cz-sik.dogru { border-color: var(--dogru); background: color-mix(in srgb, var(--dogru) 8%, transparent); }
      .cz-sik.dogru .cz-harf { background: var(--dogru); color: #fff; }
      .cz-sik.yanlis { border-color: var(--yanlis); background: color-mix(in srgb, var(--yanlis) 7%, transparent); }
      .cz-sik.yanlis .cz-harf { background: var(--yanlis); color: #fff; }
      .cz-sik.soluk { opacity: .5; }
      .cz-durum-yazi { margin-left: auto; font-size: 12.5px; font-weight: 700; }

      .cz-aciklama { margin-top: 16px; padding: 15px 18px; border-radius: 12px; background: var(--ic);
        border-left: 3px solid var(--yaprak); font-size: 14px; color: var(--metin2); line-height: 1.6; }
      .cz-aciklama b { color: var(--metin1); }

      .cz-ipucu { border: 1px solid color-mix(in srgb, var(--bilgi) 30%, transparent); background: color-mix(in srgb, var(--bilgi) 8%, transparent); }

      .cz-btn { border: none; cursor: pointer; border-radius: 12px; padding: 12px 22px; font-family: var(--font-sans);
        font-weight: 600; font-size: 14.5px; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
        transition: box-shadow .2s, background .15s, transform .12s; }
      .cz-btn:active:not(:disabled) { transform: scale(.97); }
      .cz-btn.birincil { background: var(--cta); color: #fff; }
      .cz-btn.birincil:hover:not(:disabled) { box-shadow: var(--parilti); transform: translateY(-1px); }
      .cz-btn.dis { background: transparent; color: var(--vurgu); border: 1px solid color-mix(in srgb, var(--vurgu) 35%, transparent); }
      .cz-btn.dis:hover:not(:disabled) { background: var(--ic); }
      .cz-btn.tehlike { background: color-mix(in srgb, var(--yanlis) 14%, transparent); color: var(--yanlis); }
      .cz-btn.tehlike:hover:not(:disabled) { background: color-mix(in srgb, var(--yanlis) 22%, transparent); }
      .cz-btn:disabled { opacity: .5; cursor: default; }
      .cz-btn-full { width: 100%; }

      .cz-muhur { display: inline-flex; align-items: center; gap: 8px; padding: 5px 13px; border-radius: 12px;
        font-family: var(--font-mono); font-size: 11px; letter-spacing: .08em; font-weight: 500;
        background: color-mix(in srgb, var(--kehribar) 14%, transparent); color: var(--kehribar);
        border: 1px solid color-mix(in srgb, var(--kehribar) 35%, transparent); }
      .cz-osym { border-color: color-mix(in srgb, var(--kehribar) 45%, transparent) !important; }

      .cz-odul { display: inline-flex; align-items: center; gap: 7px; padding: 7px 15px; border-radius: 12px; font-weight: 700; font-size: 14px;
        background: color-mix(in srgb, var(--toprak) 18%, transparent); color: color-mix(in srgb, var(--toprak) 75%, var(--metin1)); }
      .cz-dokum-satir { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-top: 1px solid var(--cizgi); font-size: 14px; }
      .cz-dokum-satir:first-child { border-top: none; }
      .cz-rozet { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; border: none; }
      .cz-rozet.dogru { background: color-mix(in srgb, var(--dogru) 14%, transparent); color: var(--dogru); }
      .cz-rozet.uyari { background: color-mix(in srgb, var(--uyari) 16%, transparent); color: var(--uyari); cursor: pointer; }

      .cz-overlay { position: fixed; inset: 0; z-index: 60; background: rgba(12,18,14,0.45); }
      .cz-modal { position: fixed; z-index: 61; left: 50%; top: 50%; transform: translate(-50%, -50%);
        width: min(400px, calc(100vw - 32px)); background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); padding: 22px; }
      .cz-modal-baslik { font-family: var(--font-display); font-weight: 800; font-size: 18px; color: var(--metin1); }
      .cz-modal-metin { margin-top: 8px; font-size: 14px; color: var(--metin2); line-height: 1.6; }
      .cz-modal-aksiyon { margin-top: 18px; display: flex; gap: 10px; justify-content: flex-end; }

      @media (prefers-reduced-motion: no-preference) {
        .cz-ilerleme > i { transition: width .4s ease; }
        .cz-sik.dogru { animation: cz-onay .35s ease; }
        @keyframes cz-onay { 0% { transform: scale(1) } 40% { transform: scale(1.015) } 100% { transform: scale(1) } }
        .cz-canlan { opacity: 0; transform: translateY(14px); animation: cz-belir .45s ease-out forwards; }
        @keyframes cz-belir { to { opacity: 1; transform: none } }
      }
    `}</style>
  )
}
