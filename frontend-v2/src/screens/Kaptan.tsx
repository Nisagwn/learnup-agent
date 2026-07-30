import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { m, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import { Icon, type IconName } from '../ui'
import { cn } from '../lib/cn'
import { NAV_H } from '../lib/layout'
import { useAsync } from '../lib/useAsync'
import { apiGet, streamChat } from '../lib/api.js'
import type { SohbetGecmisi } from '../lib/types'
import { MathMarkdown } from '../components/MathMarkdown'

/* ═══════════════════════════════════════════════════════════════════════════
   KOÇ — sohbet ekranı (onaylı önizleme: docs/design/onizleme/koc.html — GOREV-014).
   Inline FİDAN deseni (GOREV-007 emsali) — ui.tsx'e yazılmaz.
   KORUNAN DAVRANIŞLAR (sunum değişti, davranış değişmedi):
   · SÜREKLİLİK: açılışta son oturum yüklenir (GET /chat/history); "yeni sohbet"
     temiz sessionId açar.
   · Akış SIRASINDA ham metin, bitince MathMarkdown (KaTeX titremesi önlenir —
     yarım "$\fra" her token'da yeniden ayrıştırılırsa formül titrer).
   · Araç etiketi ("Verilerine bakıyor"): yalnız GERÇEK araç olayında görünür.
   · Bağlam-duyarlı öneri çipleri: zayıf konu adı gerçek sinyalden enjekte edilir
     (sabitlenmedi — önizlemedeki üç sabit çipten iyidir, karar kartta).
   · Soru bağlamı çipi [HAZIR köprü — GOREV-008 tarafı]: nav('/kaptan', { state:
     { soruBaglami: { ozet, istem } } }) ile gelinirse toprak-tonlu çip görünür ve
     ilk istemin başına bağlam eklenir; bağlam yoksa çip HİÇ render edilmez.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Tool { label: string; done: boolean }
interface Msg {
  id: number; role: 'user' | 'kaptan'; text: string
  streaming?: boolean; tools?: Tool[]; baglamOzet?: string
}

/** Sonuç ekranındaki "Bu soruyu açıkla" köprüsünün nav-state sözleşmesi. */
interface SoruBaglami { ozet: string; istem: string }

const HOSGELDIN = {
  baslik: 'Merhaba, ben Koç!',
  metin: 'Çalışma verilerini görebilirim — ne çalışacağını, nerede zorlandığını birlikte bulalım. Planını çıkarabilir, zayıf konularından soru hazırlayabilir ya da sadece moral verebilirim.',
}

const HIZLI_EYLEMLER: Array<{ icon: IconName; ad: string; mesaj: string }> = [
  { icon: 'route', ad: 'Planımı çıkar', mesaj: 'Bugünkü çalışma planımı çıkarır mısın?' },
  { icon: 'target', ad: 'Zayıf konudan soru', mesaj: 'Zayıf konumdan 5 soru hazırla.' },
  { icon: 'history', ad: 'Dünü özetle', mesaj: 'Dünkü çalışmamı özetler misin?' },
  { icon: 'flame', ad: 'Moral ver', mesaj: 'Moralim bozuk, biraz moral verir misin?' },
]

export function Kaptan() {
  const azalt = useReducedMotion()
  const location = useLocation()
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [gecmisYuklendi, setGecmisYuklendi] = useState(false)
  const [gecmisVar, setGecmisVar] = useState(false)
  const [baglam, setBaglam] = useState<SoruBaglami | null>(() => {
    const b = (location.state as { soruBaglami?: Partial<SoruBaglami> } | null)?.soruBaglami
    return b?.ozet && b?.istem ? { ozet: String(b.ozet), istem: String(b.istem) } : null
  })
  const endRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef<string>((globalThis.crypto?.randomUUID?.() ?? String(Date.now())))
  const abortRef = useRef<AbortController | null>(null)

  // Bağlam-duyarlı çip: zayıf konu adı gerçek sinyalden (DİNAMİK — sabitlenmez)
  const oneri = useAsync<any>(() => apiGet('/practice/suggest'), [])
  const zayifKonu = oneri.data?.reason === 'weak' ? oneri.data?.kazanim?.title : null

  const cipler = useMemo(() => {
    const liste = ['Bugünkü planım', 'Dünü özetle', 'Moralim bozuk']
    if (zayifKonu) liste.unshift(`${zayifKonu} konusundan 5 soru`)
    else liste.unshift('Zayıf konudan 5 soru')
    return liste
  }, [zayifKonu])

  // SÜREKLİLİK — son oturumu yükle (bir kez)
  useEffect(() => {
    let alive = true
    apiGet('/chat/history')
      .then((g: SohbetGecmisi) => {
        if (!alive || !g?.sessionId || !g.messages?.length) return
        sessionId.current = g.sessionId
        setGecmisVar(true)
        setMsgs(
          g.messages.map((mesaj, i) => ({
            id: i + 1,
            role: mesaj.role === 'user' ? 'user' as const : 'kaptan' as const,
            text: mesaj.content,
          })),
        )
      })
      .catch(() => { /* geçmiş yoksa temiz başla */ })
      .finally(() => { if (alive) setGecmisYuklendi(true) })
    return () => { alive = false }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: azalt ? 'auto' : 'smooth' }) }, [msgs, azalt])
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (text: string) => {
    const mesaj = text.trim()
    if (!mesaj || gonderiliyor) return
    setInput('')
    setGonderiliyor(true)

    // Soru bağlamı (varsa) yalnız İSTEMİN başına eklenir; balonda çip olarak görünür.
    const aktifBaglam = baglam
    if (aktifBaglam) setBaglam(null)
    const istem = aktifBaglam ? `${aktifBaglam.istem}\n\n${mesaj}` : mesaj

    const kaptanId = Date.now() + 1
    setMsgs((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', text: mesaj, baglamOzet: aktifBaglam?.ozet },
      { id: kaptanId, role: 'kaptan', text: '', streaming: true, tools: [] },
    ])

    const guncelle = (fn: (msg: Msg) => Msg) =>
      setMsgs((prev) => prev.map((msg) => (msg.id === kaptanId ? fn(msg) : msg)))

    abortRef.current = new AbortController()
    try {
      await streamChat(
        { sessionId: sessionId.current, message: istem },
        (type: string, data: any) => {
          if (type === 'token') guncelle((msg) => ({ ...msg, text: msg.text + (typeof data === 'string' ? data : '') }))
          else if (type === 'tool') guncelle((msg) => ({ ...msg, tools: [...(msg.tools ?? []).map((x) => ({ ...x, done: true })), { label: araçEtiketi(data), done: false }] }))
          else if (type === 'done') guncelle((msg) => ({ ...msg, streaming: false, tools: (msg.tools ?? []).map((x) => ({ ...x, done: true })) }))
          else if (type === 'error') {
            // Önce `message` (Türkçe), sonra `error` (kod) — lib/api.js sözleşmesiyle aynı sıra.
            const detay = String((data && typeof data === 'object' ? (data.message || data.error) : data) || '')
            guncelle((msg) => ({
              ...msg, streaming: false,
              text: msg.text
                ? `${msg.text}\n\n_Bağlantı koptu — devamı gelmedi. Son mesajını yeniden gönderebilirsin._`
                : `Bağlantı koptu — son mesajını yeniden gönderebilirsin.${detay ? ` (${detay})` : ''}`,
            }))
          }
        },
        abortRef.current.signal,
      )
      guncelle((msg) => ({ ...msg, streaming: false, text: msg.text || 'Yanıt alınamadı — yeniden dener misin?', tools: (msg.tools ?? []).map((x) => ({ ...x, done: true })) }))
    } catch (err: any) {
      if (err?.name !== 'AbortError') guncelle((msg) => ({ ...msg, streaming: false, text: msg.text || `Koç'a şu an ulaşılamadı${err?.message ? ` (${err.message})` : ''} — birazdan yeniden deneyebilirsin.` }))
    } finally {
      setGonderiliyor(false)
    }
  }

  const yeniSohbet = () => {
    abortRef.current?.abort()
    sessionId.current = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    setMsgs([])
    setGecmisVar(false)
    toast('Yeni sohbet açıldı', { description: 'Önceki konuşma güvende — Koç hatırlamaya devam eder.' })
  }

  const salt = msgs.length === 0 && gecmisYuklendi

  return (
    <div className="flex flex-col" style={{ height: `calc(100vh - ${NAV_H}px)` }}>
      <style>{`
        .kc-avatar { width: 42px; height: 42px; border-radius: 14px; display: grid; place-items: center;
          font-size: 20px; flex: none; position: relative;
          background: linear-gradient(135deg, var(--adacayi), var(--yaprak)); }
        .kc-avatar::after { content: ''; position: absolute; right: -2px; bottom: -2px; width: 11px; height: 11px;
          border-radius: 50%; background: var(--yaprak); border: 2.5px solid var(--grad-a); }
        .kc-avatar-buyuk { width: 64px; height: 64px; border-radius: 20px; font-size: 30px; }
        .kc-mini { width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center;
          font-size: 14px; flex: none; margin-top: 2px;
          background: linear-gradient(135deg, var(--adacayi), var(--yaprak)); }
        .kc-balon { padding: 11px 15px; border-radius: 16px; font-size: 13.5px; line-height: 1.6; color: var(--metin1); }
        .kc-koc { background: var(--mat); border: 1px solid var(--cam-kenar); border-top-left-radius: 6px; }
        .kc-ben { background: #DDEBE0; border-top-right-radius: 6px; }
        .dark .kc-ben { background: #23402C; }
        .kc-arac { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 600;
          color: var(--vurgu); background: var(--v1); padding: 4px 11px; border-radius: 12px; width: max-content; }
        .kc-arac i { width: 6px; height: 6px; border-radius: 50%; background: var(--yaprak); font-style: normal; opacity: .7; flex: none; }
        .kc-baglam { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 600;
          color: #8A6134; background: rgba(212, 163, 115, .20); padding: 5px 12px; border-radius: 12px; width: max-content; }
        .dark .kc-baglam { color: #DDB27F; }
        .kc-nokta { display: inline-flex; gap: 5px; padding: 3px 0; vertical-align: middle; }
        .kc-nokta i { width: 7px; height: 7px; border-radius: 50%; background: var(--adacayi); opacity: .6; }
        .kc-imlec { display: inline-block; width: 2px; height: 16px; margin-left: 2px; border-radius: 2px;
          background: currentColor; vertical-align: text-bottom; }
        .kc-cip { font-size: 12px; font-weight: 600; color: var(--vurgu); background: transparent;
          border: 1.5px dashed var(--adacayi); border-radius: 12px; padding: 7px 14px; cursor: pointer;
          transition: background .2s; white-space: nowrap; flex: none; }
        .kc-cip:hover:not(:disabled) { background: var(--v1); }
        .kc-cip:disabled { opacity: .5; cursor: default; }
        .kc-eylem { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 10px 14px;
          border: 1.5px dashed var(--adacayi); border-radius: 12px; background: transparent; color: var(--vurgu);
          font-size: 12.5px; font-weight: 600; cursor: pointer; text-align: left; transition: background .2s; }
        .kc-eylem:hover { background: var(--v1); }
        .kc-eylem-ikon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 10px;
          background: var(--v1); flex: none; }
        .kc-kutu { flex: 1; min-width: 0; font-size: 13.5px; color: var(--metin1); background: var(--ic);
          border: 1.5px solid var(--cam-kenar); border-radius: 14px; padding: 12px 16px; outline: none;
          transition: border-color .2s, box-shadow .2s; }
        .kc-kutu:focus { border-color: var(--yaprak); box-shadow: 0 0 0 3px rgba(79, 165, 111, .15); outline: none; }
        .kc-kutu::placeholder { color: var(--metin3); }
        .kc-kutu:disabled { opacity: .6; }
        .kc-gonder { font-weight: 600; font-size: 13.5px; background: var(--cta); color: #F2F7F3; border: none;
          border-radius: 12px; padding: 12px 22px; min-height: 44px; cursor: pointer; flex: none;
          display: inline-flex; align-items: center; gap: 7px; box-shadow: 0 6px 16px rgba(30, 70, 32, .25); transition: filter .2s; }
        .kc-gonder:hover:not(:disabled) { filter: brightness(1.12); }
        .kc-gonder:disabled { background: var(--ic); color: var(--metin3); box-shadow: none; cursor: default; }
        .kc-not { margin-left: auto; font-size: 11.5px; color: var(--metin3); background: var(--v0);
          padding: 5px 11px; border-radius: 12px; white-space: nowrap; }
        @media (prefers-reduced-motion: no-preference) {
          .kc-nokta i { animation: kc-zipla 1.2s ease-in-out infinite; }
          .kc-nokta i:nth-child(2) { animation-delay: .15s; }
          .kc-nokta i:nth-child(3) { animation-delay: .3s; }
          @keyframes kc-zipla { 0%, 60%, 100% { transform: none; opacity: .45; } 30% { transform: translateY(-4px); opacity: 1; } }
          .kc-arac i { animation: kc-parla 1.2s ease-in-out infinite; }
          @keyframes kc-parla { 0%, 100% { opacity: .4; } 50% { opacity: 1; } }
          .kc-imlec { animation: kc-yanip 1s step-end infinite; }
          @keyframes kc-yanip { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        }
      `}</style>

      {/* ── Başlık — FİDAN koç avatarı + tanım + geçmiş notu ── */}
      <div className="glass rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="kc-avatar" aria-hidden>🌿</span>
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--metin1)' }}>Koç</div>
            <div className="truncate text-[12px]" style={{ color: 'var(--metin3)' }}>Çalışma verilerini görebilen kişisel rehberin</div>
          </div>
          {gecmisVar && msgs.length > 0 && <span className="kc-not">↑ yukarı kaydır: eski mesajlar</span>}
          <button
            onClick={yeniSohbet}
            title="Yeni sohbet"
            aria-label="Yeni sohbet"
            className="grid size-11 cursor-pointer place-items-center rounded-xl transition-colors"
            style={{ background: 'var(--v0)', border: '1px solid var(--cam-kenar)', color: 'var(--metin2)' }}
          >
            <Icon name="edit" size={16} color="currentColor" />
          </button>
        </div>
      </div>

      {/* ── Mesajlar ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3.5 px-4 py-5">
          {msgs.map((msg) => <Balon key={msg.id} msg={msg} />)}

          {/* Geçmiş boş: karşılama görünümü (sahte konuşma render edilmez — null≠0) */}
          {salt && (
            <m.div
              initial={azalt ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: azalt ? 0 : 0.1 }}
              className="flex flex-col items-center px-4 pt-8 text-center"
            >
              <span className="kc-avatar kc-avatar-buyuk" aria-hidden>🌿</span>
              <h2 className="mt-3 text-[17px] font-bold" style={{ fontFamily: 'Outfit, sans-serif', color: 'var(--metin1)' }}>
                {HOSGELDIN.baslik}
              </h2>
              <p className="mt-1.5 max-w-md text-[12.5px] leading-relaxed" style={{ color: 'var(--metin2)' }}>
                {HOSGELDIN.metin}
              </p>
              <div className="mt-5 grid w-full max-w-md grid-cols-1 gap-2.5 sm:grid-cols-2">
                {HIZLI_EYLEMLER.map((e) => (
                  <button key={e.ad} onClick={() => send(e.mesaj)} className="kc-eylem">
                    <span className="kc-eylem-ikon"><Icon name={e.icon} size={15} color="currentColor" /></span>
                    {e.ad}
                  </button>
                ))}
              </div>
            </m.div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* ── Giriş alanı — öneri çipleri (dinamik) + soru bağlamı çipi + yaz satırı ── */}
      <div className="glass rounded-none border-x-0 border-b-0">
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-3">
          {baglam && (
            <div className="mb-2.5 flex items-center gap-2">
              <span className="kc-baglam">📎 Soru bağlamı: {baglam.ozet}</span>
              <button
                onClick={() => setBaglam(null)}
                aria-label="Soru bağlamını kaldır"
                className="cursor-pointer rounded-lg px-1.5 text-[14px] leading-none"
                style={{ color: 'var(--metin3)' }}
              >
                ×
              </button>
            </div>
          )}
          <div className="mb-2.5 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
            {cipler.map((c) => (
              <button key={c} onClick={() => send(c)} disabled={gonderiliyor} className="kc-cip">
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(input) } }}
              disabled={gonderiliyor}
              placeholder="Koç'a yaz… (matematik yazımı desteklenir)"
              className="kc-kutu"
            />
            {/* Sayfanın TEK birincil eylemi */}
            <button onClick={() => send(input)} disabled={!input.trim() || gonderiliyor} className="kc-gonder">
              Gönder <Icon name="send" size={15} color="currentColor" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function araçEtiketi(name: any): string {
  const s = String(name || '')
  const map: Record<string, string> = {
    get_student_snapshot: 'Verilerine bakıyor',
    generate_practice: 'Sorular hazırlanıyor',
    search_curriculum: 'Müfredatı tarıyor',
    save_to_canvas: 'Nota işliyor',
  }
  return map[s] || (s ? `${s}…` : 'Çalışıyor')
}

function Balon({ msg }: { msg: Msg }) {
  const azalt = useReducedMotion()

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(msg.text)
      toast('Kopyalandı')
    } catch { toast.error('Kopyalanamadı') }
  }

  if (msg.role === 'user') {
    return (
      <m.div initial={azalt ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-end gap-1.5">
        {msg.baglamOzet && <span className="kc-baglam">📎 Soru bağlamı: {msg.baglamOzet}</span>}
        <div className="kc-balon kc-ben max-w-[78%] whitespace-pre-wrap">{msg.text}</div>
      </m.div>
    )
  }

  return (
    <m.div initial={azalt ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group flex items-start gap-2.5">
      <span className="kc-mini" aria-hidden>🌿</span>
      <div className="min-w-0 max-w-[78%]">
        {/* Araç etiketi — YALNIZ gerçek araç olayında; çalışırken nabızlı nokta, bitince kelime+ikon */}
        {!!msg.tools?.length && (
          <div className="mb-1.5 flex flex-col gap-1.5">
            {msg.tools.map((tool, i) => (
              <span key={i} className="kc-arac">
                {tool.done
                  ? <Icon name="check" size={11} color="currentColor" strokeWidth={2.4} />
                  : <i aria-hidden />}
                {tool.label}
              </span>
            ))}
          </div>
        )}
        <div className="kc-balon kc-koc">
          {/* Akış sırasında HAM METİN — yarım formül her token'da yeniden ayrıştırılırsa
              KaTeX görünür titreme yapar. Akış bitince tam metin bir kez render edilir. */}
          {msg.text && (msg.streaming
            ? <span className="whitespace-pre-wrap">{msg.text}</span>
            : <MathMarkdown>{msg.text}</MathMarkdown>
          )}
          {msg.streaming && !msg.text && (
            <span className="kc-nokta" role="status" aria-label="Koç yazıyor"><i /><i /><i /></span>
          )}
          {msg.streaming && msg.text && <span className="kc-imlec" aria-hidden />}
        </div>
        {!msg.streaming && msg.text && (
          <button
            onClick={kopyala}
            className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
            style={{ color: 'var(--metin3)' }}
          >
            <Icon name="copy" size={11} color="currentColor" />kopyala
          </button>
        )}
      </div>
    </m.div>
  )
}
