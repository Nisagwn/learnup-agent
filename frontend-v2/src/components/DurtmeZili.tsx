import { useState } from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import { useNavigate } from 'react-router-dom'
import { useAsync } from '../lib/useAsync'
import { apiGet, apiPost } from '../lib/api.js'
import type { Nudge } from '../lib/types'
import { Icon } from '../ui'
import { gunEtiketi } from './rontgen'

/** Dürtme zili — Koç'un proaktif mesaj defteri (nudges).
    Menü AÇILINCA görüldü işaretlenir (PENDING→SENT) → rozet söner. */
export function DurtmeZili() {
  const nav = useNavigate()
  const nudges = useAsync<{ nudges: Nudge[] }>(() => apiGet('/agents/nudges'), [])
  const [goruldu, setGoruldu] = useState(false)

  const liste = nudges.data?.nudges ?? []
  const rozet = !goruldu && liste.length > 0

  const acildi = (open: boolean) => {
    if (open && liste.length && !goruldu) {
      setGoruldu(true)
      apiPost('/agents/nudges/seen', { ids: liste.map((n) => n.id) }).catch(() => { /* sessiz */ })
    }
  }

  return (
    <Dropdown.Root onOpenChange={acildi}>
      <Dropdown.Trigger asChild>
        <button
          title="Koç'un mesajları"
          className="relative grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-500 transition-colors hover:bg-sky-500/10 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-sky-400/10 dark:hover:text-slate-200"
        >
          <Icon name="bell" size={17} color="currentColor" />
          {rozet && (
            <span className="absolute right-1.5 top-1.5 grid size-4 place-items-center rounded-full bg-rose-500 font-mono text-[9px] font-bold text-white ring-2 ring-white/80 dark:ring-ocean-900/80">
              {liste.length}
            </span>
          )}
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={8}
          className="glass z-[70] w-[min(92vw,340px)] overflow-hidden rounded-2xl shadow-card"
        >
          <div className="border-b border-slate-500/10 px-4 py-3 dark:border-sky-500/10">
            <span className="font-display text-[13px] font-bold text-slate-700 dark:text-slate-200">Koç'un Mesajları</span>
          </div>
          {liste.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-slate-400 dark:text-slate-500">
              Yeni mesaj yok — Koç seni izliyor, gerekince seslenir.
            </p>
          ) : (
            <div className="max-h-72 overflow-y-auto">
              {liste.map((n) => (
                <div key={n.id} className="flex items-start gap-2.5 border-b border-slate-500/5 px-4 py-3 last:border-0 dark:border-sky-500/5">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-600 to-cyan-600">
                    <Icon name="anchor" size={12} color="#fff" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300">{n.message}</p>
                    <span className="mt-1 block font-mono text-[9.5px] text-slate-400 dark:text-slate-500">
                      {gunEtiketi(n.created_at.slice(0, 10))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <Dropdown.Item
            onSelect={() => nav('/kaptan')}
            className="cursor-pointer border-t border-slate-500/10 px-4 py-2.5 text-center font-display text-[12px] font-semibold text-sky-600 outline-none hover:bg-sky-500/5 dark:border-sky-500/10 dark:text-sky-300"
          >
            Koç'la konuş
          </Dropdown.Item>
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  )
}
