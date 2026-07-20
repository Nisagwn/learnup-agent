import { useEffect, useMemo, useRef, useState } from 'react'
import { m } from 'framer-motion'
import { toast } from 'sonner'
import { Captain, Icon, type IconName } from '../ui'
import { cn } from '../lib/cn'
import { NAV_H } from '../lib/layout'
import { useAsync } from '../lib/useAsync'
import { apiGet, streamChat } from '../lib/api.js'
import type { SohbetGecmisi } from '../lib/types'
import { MathMarkdown } from '../components/MathMarkdown'
import { StatusLine } from '../components/ui'

/* ═══════════════════════════════════════════════════════════════════════════
   KOÇ — Kaptan personalı sohbet.
   · SÜREKLİLİK: açılışta son oturum yüklenir (GET /chat/history); "yeni sohbet"
     temiz sessionId açar.
   · Akış SIRASINDA ham metin, bitince MathMarkdown (KaTeX titremesi önlenir —
     yarım "$\fra" her token'da yeniden ayrıştırılırsa formül titrer).
   · Araç çipleri: Koç'un çalışan/tamamlanan araç adımları.
   · Bağlam-duyarlı öneri çipleri: zayıf konu adı gerçek sinyalden enjekte edilir.
   ═══════════════════════════════════════════════════════════════════════════ */

interface Tool { label: string; done: boolean }
interface Msg { id: number; role: 'user' | 'kaptan'; text: string; streaming?: boolean; tools?: Tool[] }

const HOSGELDIN: Msg = {
  id: 0, role: 'kaptan',
  text: 'Merhaba, ben Kaptan. Bugün nereden başlayalım? Planını çıkarabilir, zayıf konularından soru hazırlayabilir ya da sadece moral verebilirim.',
}

const HIZLI_EYLEMLER: Array<{ icon: IconName; ad: string; mesaj: string }> = [
  { icon: 'route', ad: 'Planımı çıkar', mesaj: 'Bugünkü çalışma planımı çıkarır mısın?' },
  { icon: 'target', ad: 'Zayıf konudan soru', mesaj: 'Zayıf konumdan 5 soru hazırla.' },
  { icon: 'history', ad: 'Dünü özetle', mesaj: 'Dünkü çalışmamı özetler misin?' },
  { icon: 'flame', ad: 'Moral ver', mesaj: 'Moralim bozuk, biraz moral verir misin?' },
]

export function Kaptan() {
  const [msgs, setMsgs] = useState<Msg[]>([HOSGELDIN])
  const [input, setInput] = useState('')
  const [gonderiliyor, setGonderiliyor] = useState(false)
  const [gecmisYuklendi, setGecmisYuklendi] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef<string>((globalThis.crypto?.randomUUID?.() ?? String(Date.now())))
  const abortRef = useRef<AbortController | null>(null)

  // Bağlam-duyarlı çip: zayıf konu adı gerçek sinyalden
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
        setMsgs([
          HOSGELDIN,
          ...g.messages.map((mesaj, i) => ({
            id: i + 1,
            role: mesaj.role === 'user' ? 'user' as const : 'kaptan' as const,
            text: mesaj.content,
          })),
        ])
      })
      .catch(() => { /* geçmiş yoksa temiz başla */ })
      .finally(() => { if (alive) setGecmisYuklendi(true) })
    return () => { alive = false }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [msgs])
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = async (text: string) => {
    const mesaj = text.trim()
    if (!mesaj || gonderiliyor) return
    setInput('')
    setGonderiliyor(true)

    const kaptanId = Date.now() + 1
    setMsgs((prev) => [
      ...prev,
      { id: Date.now(), role: 'user', text: mesaj },
      { id: kaptanId, role: 'kaptan', text: '', streaming: true, tools: [] },
    ])

    const guncelle = (fn: (msg: Msg) => Msg) =>
      setMsgs((prev) => prev.map((msg) => (msg.id === kaptanId ? fn(msg) : msg)))

    abortRef.current = new AbortController()
    try {
      await streamChat(
        { sessionId: sessionId.current, message: mesaj },
        (type: string, data: any) => {
          if (type === 'token') guncelle((msg) => ({ ...msg, text: msg.text + (typeof data === 'string' ? data : '') }))
          else if (type === 'tool') guncelle((msg) => ({ ...msg, tools: [...(msg.tools ?? []).map((x) => ({ ...x, done: true })), { label: araçEtiketi(data), done: false }] }))
          else if (type === 'done') guncelle((msg) => ({ ...msg, streaming: false, tools: (msg.tools ?? []).map((x) => ({ ...x, done: true })) }))
          else if (type === 'error') guncelle((msg) => ({ ...msg, streaming: false, text: msg.text || `Bir sorun oluştu: ${data}` }))
        },
        abortRef.current.signal,
      )
      guncelle((msg) => ({ ...msg, streaming: false, text: msg.text || 'Yanıt alınamadı.', tools: (msg.tools ?? []).map((x) => ({ ...x, done: true })) }))
    } catch (err: any) {
      if (err?.name !== 'AbortError') guncelle((msg) => ({ ...msg, streaming: false, text: msg.text || `Koç'a ulaşılamadı: ${err?.message ?? ''}` }))
    } finally {
      setGonderiliyor(false)
    }
  }

  const yeniSohbet = () => {
    abortRef.current?.abort()
    sessionId.current = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    setMsgs([HOSGELDIN])
    toast('Yeni sohbet açıldı', { description: 'Önceki konuşma güvende — Koç hatırlamaya devam eder.' })
  }

  const salt = msgs.length === 1 && gecmisYuklendi

  return (
    <div className="flex flex-col" style={{ height: `calc(100vh - ${NAV_H}px)` }}>
      {/* Başlık */}
      <div className="glass-solid border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Captain size={38} ring />
          <div className="min-w-0 flex-1">
            <div className="font-display text-[15px] font-bold text-slate-800 dark:text-slate-100">Koç</div>
            <StatusLine className="mt-0.5">seninle · araçları hazır</StatusLine>
          </div>
          <button
            onClick={yeniSohbet}
            title="Yeni sohbet"
            className="glass-solid grid size-9 cursor-pointer place-items-center rounded-xl text-slate-500 transition-colors hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          >
            <Icon name="edit" size={16} color="currentColor" />
          </button>
        </div>
      </div>

      {/* Mesajlar */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-5">
          {msgs.map((msg) => <Balon key={msg.id} msg={msg} />)}

          {/* İlk açılış: hızlı eylem ızgarası */}
          {salt && (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="grid grid-cols-2 gap-2.5 pl-10"
            >
              {HIZLI_EYLEMLER.map((e) => (
                <button
                  key={e.ad}
                  onClick={() => send(e.mesaj)}
                  className="glass-solid flex cursor-pointer items-center gap-2.5 rounded-xl px-3.5 py-3 text-left transition-all hover:-translate-y-px hover:border-sky-500/30 hover:shadow-card dark:hover:border-sky-400/25"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-300">
                    <Icon name={e.icon} size={15} color="currentColor" />
                  </span>
                  <span className="font-display text-[12.5px] font-semibold text-slate-600 dark:text-slate-300">{e.ad}</span>
                </button>
              ))}
            </m.div>
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Besteci */}
      <div className="glass border-x-0 border-b-0 rounded-none">
        <div className="mx-auto max-w-3xl px-4 pb-4 pt-2.5">
          <div className="flex gap-1.5 overflow-x-auto pb-2.5 [scrollbar-width:none]">
            {cipler.map((c) => (
              <button
                key={c}
                onClick={() => send(c)}
                disabled={gonderiliyor}
                className={cn(
                  'shrink-0 cursor-pointer whitespace-nowrap rounded-full border border-slate-300/50 px-3.5 py-1.5 text-[12px] text-slate-500 transition-colors',
                  'hover:border-sky-500/40 hover:text-slate-700 dark:border-ocean-700 dark:text-slate-400 dark:hover:text-slate-200',
                  gonderiliyor && 'opacity-50',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5">
            <div className="flex-1 rounded-2xl border border-slate-300/60 bg-white/70 px-4 py-2.5 transition-colors focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-500/15 dark:border-ocean-700 dark:bg-ocean-950/50 dark:focus-within:border-sky-400">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); send(input) } }}
                placeholder="Koç'a yaz…"
                className="w-full bg-transparent text-[14px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-600"
              />
            </div>
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || gonderiliyor}
              className={cn(
                'grid size-11 shrink-0 place-items-center rounded-full transition-all',
                input.trim() && !gonderiliyor
                  ? 'cursor-pointer bg-sky-600 text-white shadow-glow-sky hover:bg-sky-500 dark:bg-sky-500 dark:text-ocean-950'
                  : 'bg-slate-200 text-slate-400 dark:bg-ocean-800 dark:text-slate-600',
              )}
            >
              <Icon name="send" size={18} color="currentColor" />
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
    get_student_snapshot: 'Seyir defterine bakıyor',
    generate_practice: 'Sorular hazırlanıyor',
    search_curriculum: 'Müfredatı tarıyor',
    save_to_canvas: 'Nota işliyor',
  }
  return map[s] || (s ? `${s}…` : 'Çalışıyor')
}

function Balon({ msg }: { msg: Msg }) {
  const [blink, setBlink] = useState(true)
  useEffect(() => {
    if (!msg.streaming) return
    const i = setInterval(() => setBlink((b) => !b), 500)
    return () => clearInterval(i)
  }, [msg.streaming])

  const kopyala = async () => {
    try {
      await navigator.clipboard.writeText(msg.text)
      toast('Kopyalandı')
    } catch { toast.error('Kopyalanamadı') }
  }

  if (msg.role === 'user') {
    return (
      <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-end">
        <div className="max-w-[80%] whitespace-pre-wrap rounded-[18px_18px_5px_18px] bg-sky-600 px-4 py-2.5 text-[14px] leading-relaxed text-white dark:bg-sky-500 dark:text-ocean-950">
          {msg.text}
        </div>
      </m.div>
    )
  }

  return (
    <m.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="group flex items-start gap-2.5">
      <Captain size={30} />
      <div className="min-w-0 flex-1">
        <div className="glass-solid rounded-[5px_18px_18px_18px] px-4 py-3 text-[14px] leading-relaxed text-slate-700 dark:text-slate-200">
          {!!msg.tools?.length && (
            <div className={cn('flex flex-col gap-1.5', msg.text && 'mb-2.5')}>
              {msg.tools.map((tool, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
                    tool.done
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-teal-500/30 bg-teal-500/10 text-teal-600 dark:text-teal-300',
                  )}
                >
                  {tool.done
                    ? <Icon name="check" size={12} color="currentColor" strokeWidth={2.4} />
                    : <span className="size-2 animate-[pulse_1s_infinite] rounded-full bg-teal-500" />}
                  {tool.label}
                </span>
              ))}
            </div>
          )}
          {/* Akış sırasında HAM METİN — yarım formül her token'da yeniden ayrıştırılırsa
              KaTeX görünür titreme yapar. Akış bitince tam metin bir kez render edilir. */}
          {msg.text && (msg.streaming
            ? <span className="whitespace-pre-wrap">{msg.text}</span>
            : <MathMarkdown>{msg.text}</MathMarkdown>
          )}
          {msg.streaming && (
            <span className={cn('ml-0.5 inline-block h-4 w-0.5 rounded-full bg-current align-text-bottom', blink ? 'opacity-100' : 'opacity-0')} />
          )}
        </div>
        {!msg.streaming && msg.text && msg.id !== 0 && (
          <button
            onClick={kopyala}
            className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[10px] text-slate-400 opacity-0 transition-opacity hover:text-slate-600 group-hover:opacity-100 dark:hover:text-slate-300"
          >
            <Icon name="copy" size={11} color="currentColor" />kopyala
          </button>
        )}
      </div>
    </m.div>
  )
}
