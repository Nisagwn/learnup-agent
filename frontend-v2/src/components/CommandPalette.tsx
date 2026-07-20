import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Command } from 'cmdk'
import { useTheme } from '../lib/theme'
import { apiGet } from '../lib/api.js'
import { dersAnahtar } from '../lib/format'
import { Icon, type IconName } from '../ui'
import { SubjectName } from './ui'
import { useRol } from '../lib/rol'
import { NAV_OGRETMEN, NAV_YONETIM } from '../lib/nav'

/* ⌘K / Ctrl+K komut paleti — sayfalar + eylemler + havuz konuları arası anında
   atlama (Linear dili). Konular İLK açılışta bir kez çekilir (lazy). */

interface Konu { kazanimId: number; title: string; subject: string }

const SAYFALAR: Array<{ to: string; ad: string; icon: IconName }> = [
  { to: '/', ad: 'Genel Bakış', icon: 'today' },
  { to: '/harita', ad: 'Analiz — Bilişsel Röntgen', icon: 'scan' },
  { to: '/rota', ad: 'Çalışma Planı', icon: 'route' },
  { to: '/kaptan', ad: 'Koç', icon: 'anchor' },
  { to: '/arsiv', ad: 'Çıkmış Sorular', icon: 'seal' },
  { to: '/bahce', ad: 'Bahçem', icon: 'sprout' },
  { to: '/ben', ad: 'Profil', icon: 'chart' },
]

interface RosterKisi { studentId: string; name: string | null }

export function CommandPalette() {
  const nav = useNavigate()
  const { toggle, theme } = useTheme()
  const rol = useRol()
  const [acik, setAcik] = useState(false)
  const [konular, setKonular] = useState<Konu[] | null>(null)
  const [roster, setRoster] = useState<RosterKisi[] | null>(null)

  // Global kısayol
  useEffect(() => {
    const dinle = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAcik((a) => !a)
      }
    }
    window.addEventListener('keydown', dinle)
    return () => window.removeEventListener('keydown', dinle)
  }, [])

  // Konular ilk açılışta (bir kez) — yalnız ÖĞRENCİ: /coz akışına gider,
  // öğretmenin/adminin orada işi yok.
  useEffect(() => {
    if (!acik || konular !== null || rol !== 'student') return
    apiGet('/questions/ai/topics')
      .then((r: any) => setKonular((r?.subjects ?? []).flatMap((s: any) => s.topics)))
      .catch(() => setKonular([]))
  }, [acik, konular, rol])

  // Sınıf mevcudu — YALNIZ öğretmen ("röntgene atla"). Admin bu uçtan 403 alır,
  // boşuna istek atmıyoruz.
  useEffect(() => {
    if (!acik || roster !== null || rol !== 'teacher') return
    apiGet('/teacher/sinif')
      .then((r: any) => setRoster(r?.students ?? []))
      .catch(() => setRoster([]))
  }, [acik, roster, rol])

  const git = (fn: () => void) => { setAcik(false); fn() }

  return (
    <Command.Dialog
      open={acik}
      onOpenChange={setAcik}
      label="Komut paleti"
      className="fixed left-1/2 top-[18vh] z-[95] w-[min(92vw,560px)] -translate-x-1/2"
      overlayClassName="fixed inset-0 z-[94] bg-ocean-950/45 backdrop-blur-sm"
    >
      <div className="glass overflow-hidden rounded-2xl shadow-card">
        <div className="flex items-center gap-2.5 border-b border-slate-500/10 px-4 dark:border-sky-500/10">
          <Icon name="search" size={16} color="currentColor" style={{ opacity: 0.5 }} />
          <Command.Input
            placeholder="Sayfa, konu ya da eylem ara…"
            className="w-full bg-transparent py-3.5 text-[14px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <kbd className="shrink-0 rounded-md border border-slate-300/50 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 dark:border-ocean-700">esc</kbd>
        </div>
        <Command.List className="max-h-[46vh] overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-display [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-slate-400">
          <Command.Empty className="py-8 text-center text-[13px] text-slate-400">
            Sonuç yok — başka bir şey dene.
          </Command.Empty>

          {/* Rol grupları ÖNCE: öğretmen/admin en çok bunları arar.
              Sınıf grubu YALNIZ öğretmende: admin /teacher/* uçlarından 403 alır,
              onu oraya götüren bir palet satırı çalışmayan bir kısayol olurdu. */}
          {rol === 'teacher' && (
            <Command.Group heading="Sınıf">
              {NAV_OGRETMEN.map((n) => (
                <Satir key={n.to} onSelect={() => git(() => nav(n.to))} icon={n.icon}>{n.label}</Satir>
              ))}
            </Command.Group>
          )}

          {rol === 'admin' && (
            <Command.Group heading="Kule">
              {NAV_YONETIM.map((n) => (
                <Satir key={n.to} onSelect={() => git(() => nav(n.to))} icon={n.icon}>{n.label}</Satir>
              ))}
            </Command.Group>
          )}

          {rol === 'student' && (
            <Command.Group heading="Sayfalar">
              {SAYFALAR.map((s) => (
                <Satir key={s.to} onSelect={() => git(() => nav(s.to))} icon={s.icon}>{s.ad}</Satir>
              ))}
            </Command.Group>
          )}

          <Command.Group heading="Eylemler">
            <Satir icon={theme === 'light' ? 'moon' : 'sun'} onSelect={() => git(toggle)}>
              Temayı değiştir — {theme === 'light' ? 'Gece Vardiyası' : 'Güverte'}
            </Satir>
          </Command.Group>

          {/* KASITLI DIŞLAMA: mutasyon yok. "Ödev yayınla" gibi yıkıcı bir eylemi
              bulanık aramanın arkasına koymak ayak kurşunudur. Palet gezinme + tema. */}
          {(roster?.length ?? 0) > 0 && (
            <Command.Group heading="Öğrenciler — röntgene atla">
              {roster!.slice(0, 40).map((o) => (
                <Command.Item
                  key={o.studentId}
                  value={o.name ?? o.studentId}
                  onSelect={() => git(() => nav(`/sinif/ogrenci/${o.studentId}`))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] text-slate-600 data-[selected=true]:bg-sky-500/10 data-[selected=true]:text-sky-700 dark:text-slate-300 dark:data-[selected=true]:text-sky-300"
                >
                  <Icon name="waves" size={15} color="currentColor" />
                  {o.name ?? 'İsimsiz öğrenci'}
                </Command.Item>
              ))}
            </Command.Group>
          )}

          {rol === 'student' && (
          <Command.Group heading="Öğrenci eylemleri">
            <Satir icon="scan" onSelect={() => git(() => nav('/coz', { state: { source: 'tanisma', title: 'Tanışma Sınavı' } }))}>
              Tanışma Sınavı'nı başlat
            </Satir>
            <Satir icon="bolt" onSelect={() => git(() => nav('/coz', { state: { source: 'antrenman' } }))}>
              Adaptif antrenman başlat
            </Satir>
            <Satir icon="history" onSelect={() => git(() => nav('/coz', { state: { source: 'review', title: 'Tekrar Zamanı' } }))}>
              SRS tekrarını başlat
            </Satir>
          </Command.Group>
          )}

          {(konular?.length ?? 0) > 0 && (
            <Command.Group heading="Konular — çözmeye atla">
              {konular!.slice(0, 60).map((k) => (
                <Command.Item
                  key={k.kazanimId}
                  value={`${k.subject} ${k.title}`}
                  onSelect={() => git(() => nav('/coz', { state: { source: 'ai', kazanimId: k.kazanimId, subject: k.subject, title: k.title } }))}
                  className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-slate-600 aria-selected:bg-sky-500/10 aria-selected:text-slate-800 dark:text-slate-300 dark:aria-selected:text-slate-100"
                >
                  <SubjectName subject={k.subject} anahtar={dersAnahtar(k.subject)} className="w-24 shrink-0 !text-[11px]" />
                  <span className="truncate">{k.title}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
        </Command.List>
      </div>
    </Command.Dialog>
  )
}

function Satir({ icon, children, onSelect }: {
  icon: IconName; children: React.ReactNode; onSelect: () => void
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] text-slate-600 aria-selected:bg-sky-500/10 aria-selected:text-slate-800 dark:text-slate-300 dark:aria-selected:text-slate-100"
    >
      <Icon name={icon} size={15} color="currentColor" style={{ opacity: 0.6 }} />
      {children}
    </Command.Item>
  )
}
