import { useMemo, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { Badge, Chip, GlowButton, SegmentGecis } from './ui'
import { BosDurum, PanelBaslik, Sayi } from './cekirdek'
import type {
  AdminKullaniciDetayi, AdminKullaniciSatiri, DenetimSatiri, YonetimEylemi,
} from '../lib/types.admin'

/* ═══════════════════════════════════════════════════════════════════════════
   YÖNETİM — KULLANICI & DENETİM BİLEŞENLERİ

   kule.tsx sistemin DURUMUNU çizer (havuz, eval, ajanlar); burası KİŞİLERİ ve
   onlar üzerinde yapılmış işlemleri. Ayrı dosya, aynı admin chunk'ı: öğrenci ve
   öğretmen bu koddan tek bayt indirmez.

   ⚠️ ORTAK KURAL: her yıkıcı eylem Radix Dialog onayından geçer ve sonucun
   denetim defterine yazılıp yazılmadığı KULLANICIYA SÖYLENİR. Sessizce izsiz
   kalan bir yönetici işlemi, olmamış işlemden beterdir.
   ═══════════════════════════════════════════════════════════════════════════ */

export type RolAdi = 'student' | 'teacher' | 'admin'

const ROL_ETIKET: Record<RolAdi, string> = {
  student: 'Öğrenci',
  teacher: 'Öğretmen',
  admin: 'Yönetici',
}

/**
 * Rol rozeti — ASLA yalnız renk: her rozet kelimeyi de taşır.
 * (brass KULLANILMAZ: o ton ÖSYM mührünün kimliğine ayrılmış.)
 */
export function RolRozeti({ rol, onaysiz }: { rol: RolAdi; onaysiz?: boolean }) {
  if (rol === 'admin') return <Badge tone="teal">Yönetici</Badge>
  if (rol === 'teacher') {
    return onaysiz
      ? <Badge tone="amber">Öğretmen · onay bekliyor</Badge>
      : <Badge tone="sky">Öğretmen</Badge>
  }
  return <Badge tone="slate">Öğrenci</Badge>
}

/* ── Kullanıcı tablosu ───────────────────────────────────────────────────── */

export function KullaniciTablosu({ satirlar, seciliId, onSec, onOnay }: {
  satirlar: AdminKullaniciSatiri[]
  seciliId: string | null
  onSec: (id: string) => void
  onOnay: (k: AdminKullaniciSatiri, onayli: boolean) => Promise<void>
}) {
  if (!satirlar.length) {
    return (
      <BosDurum
        baslik="Eşleşen hesap yok"
        aciklama="Arama ya da filtreleri gevşetmeyi dene."
      />
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] border-separate" style={{ borderSpacing: '0 3px' }}>
        <thead>
          <tr className="text-left font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            <th scope="col" className="px-3 py-1.5">Hesap</th>
            <th scope="col" className="px-3 py-1.5">Rol</th>
            <th scope="col" className="px-3 py-1.5 text-right">Sınıf</th>
            <th scope="col" className="px-3 py-1.5 text-right">İşlem</th>
          </tr>
        </thead>
        <tbody>
          {satirlar.map((k) => {
            const secili = k.id === seciliId
            const onayBekliyor = k.role === 'teacher' && !k.isApproved
            return (
              <tr
                key={k.id}
                className={cn(
                  'group transition-colors',
                  secili ? 'bg-sky-500/10' : 'hover:bg-sky-500/5',
                )}
              >
                <td className="rounded-l-xl px-3 py-2">
                  {/* Tıklanabilir <button>, tıklanabilir <tr> DEĞİL: Tab+Enter doğal çalışsın. */}
                  <button
                    type="button"
                    onClick={() => onSec(k.id)}
                    className="cursor-pointer text-left"
                  >
                    <span className="block truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">
                      {k.name ?? 'İsimsiz hesap'}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">
                      {k.email ?? '—'}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-2">
                  <RolRozeti rol={k.role} onaysiz={onayBekliyor} />
                </td>
                <td className="px-3 py-2 text-right">
                  {k.role === 'teacher' ? (
                    <span className="font-mono text-[12px] text-slate-500 dark:text-slate-400">
                      {k.classCode ?? '—'}
                      <span className="ml-2 text-slate-400 dark:text-slate-500">
                        <Sayi value={k.ogrenciSayisi ?? 0} /> öğr.
                      </span>
                    </span>
                  ) : (
                    <span className="font-mono text-[12px] text-slate-300 dark:text-slate-600">—</span>
                  )}
                </td>
                <td className="rounded-r-xl px-3 py-2 text-right">
                  {k.role === 'teacher' && (
                    <OnayDugmesi kullanici={k} onOnay={onOnay} />
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Onay düğmesi.
 *
 * ⚠️ ONAYI GERİ ALMAK YIKICIDIR ve bu yüzden diyalogdan geçer: onayı düşen
 * öğretmen bir sonraki istekte (en geç 60 sn) bütün sınıfını kaybeder. Onay
 * VERMEK yıkıcı değil — tek tık, diyalog yok.
 */
function OnayDugmesi({ kullanici, onOnay }: {
  kullanici: AdminKullaniciSatiri
  onOnay: (k: AdminKullaniciSatiri, onayli: boolean) => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)

  if (!kullanici.isApproved) {
    return (
      <GlowButton
        size="sm"
        icon="check"
        disabled={mesgul}
        onClick={() => {
          setMesgul(true)
          void onOnay(kullanici, true).finally(() => setMesgul(false))
        }}
      >
        Onayla
      </GlowButton>
    )
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <GlowButton size="sm" variant="ghost" className="!text-slate-400">Onayı kaldır</GlowButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] w-[min(92vw,400px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-card">
          <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
            Onay kaldırılsın mı?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            <strong>{kullanici.name ?? 'Bu öğretmen'}</strong> en geç 60 saniye içinde
            öğretmen panelinden çıkar: sınıf listesi, ısı haritası ve öğrenci röntgenleri
            erişilemez olur. Öğrenciler sınıfta kalır — bağ kopmaz, yalnız görüş kapanır.
          </Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <GlowButton size="sm" variant="ghost">Vazgeç</GlowButton>
            </Dialog.Close>
            <Dialog.Close asChild>
              <GlowButton
                size="sm"
                variant="outline"
                disabled={mesgul}
                className="!border-rose-500/40 !text-rose-600 dark:!text-rose-300"
                onClick={() => {
                  setMesgul(true)
                  void onOnay(kullanici, false).finally(() => setMesgul(false))
                }}
              >
                Onayı kaldır
              </GlowButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ── Rol değiştirme ──────────────────────────────────────────────────────── */

/**
 * Rol değiştirme diyaloğu.
 *
 * ⚠️ SONUÇLARI ÖNCEDEN YAZAR. Rol değişimi geri alınabilir görünür ama değildir:
 * öğretmenlikten düşen hesabın sınıfı BOŞALIR ve o bağlar geri gelmez. Yönetici
 * bunu onaydan SONRA öğrenmemeli.
 */
export function RolDegisDialog({ kullanici, kendisiMi, onKaydet }: {
  kullanici: AdminKullaniciDetayi['kullanici']
  kendisiMi: boolean
  onKaydet: (rol: RolAdi) => Promise<void>
}) {
  const [hedef, setHedef] = useState<RolAdi>(kullanici.role)
  const [mesgul, setMesgul] = useState(false)
  const degisti = hedef !== kullanici.role

  if (kendisiMi) {
    return (
      <p className="rounded-xl bg-slate-500/5 px-3 py-2.5 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
        Kendi rolünü değiştiremezsin — sistemin son yöneticisini yanlışlıkla
        yetkisizleştirmek elle SQL gerektiren tek onarılamaz hatadır. Bunu başka
        bir yönetici yapmalı.
      </p>
    )
  }

  const uyari = uyariMetni(kullanici, hedef)

  return (
    <Dialog.Root onOpenChange={(a) => { if (!a) setHedef(kullanici.role) }}>
      <Dialog.Trigger asChild>
        <GlowButton size="sm" variant="outline" icon="shield">Rolü değiştir</GlowButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] w-[min(92vw,440px)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-6 shadow-card">
          <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
            Rol değiştir
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            <strong>{kullanici.name ?? kullanici.email ?? 'Bu hesap'}</strong> şu an{' '}
            {ROL_ETIKET[kullanici.role]}.
          </Dialog.Description>

          <div className="mt-4">
            <SegmentGecis<RolAdi>
              secenekler={[['student', 'Öğrenci'], ['teacher', 'Öğretmen'], ['admin', 'Yönetici']]}
              deger={hedef}
              onDegis={setHedef}
            />
          </div>

          {uyari && (
            <p className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-2.5 text-[12px] leading-relaxed text-amber-700 dark:text-amber-200">
              {uyari}
            </p>
          )}

          <div className="mt-5 flex justify-end gap-2">
            <Dialog.Close asChild>
              <GlowButton size="sm" variant="ghost">Vazgeç</GlowButton>
            </Dialog.Close>
            <Dialog.Close asChild>
              <GlowButton
                size="sm"
                disabled={!degisti || mesgul}
                onClick={() => {
                  if (!degisti) return
                  setMesgul(true)
                  void onKaydet(hedef).finally(() => setMesgul(false))
                }}
              >
                {ROL_ETIKET[hedef]} yap
              </GlowButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Geçişin gerçek bedelini onaydan ÖNCE yazar — sürpriz bırakmaz. */
function uyariMetni(k: AdminKullaniciDetayi['kullanici'], hedef: RolAdi): string | null {
  if (hedef === k.role) return null
  if (k.role === 'teacher') {
    const n = k.ogrenciSayisi ?? 0
    return n > 0
      ? `Bu hesap öğretmenlikten çıkacağı için sınıfındaki ${n} öğrencinin bağı kopar ve ` +
        `sınıf kodu (${k.classCode ?? '—'}) geçersiz olur. Öğrencilerin verisi silinmez, ` +
        'ama yeniden bir sınıfa katılmaları gerekir.'
      : `Sınıf kodu (${k.classCode ?? '—'}) geçersiz olacak.`
  }
  if (hedef === 'teacher') {
    return 'Hesaba yeni bir sınıf kodu üretilecek ve doğrudan onaylı sayılacak — ' +
      'öğretmen panelini hemen kullanmaya başlar.'
  }
  if (hedef === 'admin') {
    return 'Yönetici, havuz ve üretim hattının tamamını görür; öğretmen onaylayabilir, ' +
      'rol değiştirebilir ve öğrenci taşıyabilir. Bu yetkiyi geri almak için başka ' +
      'bir yöneticiye ihtiyaç duyulur.'
  }
  return null
}

/* ── Sınıf ataması ───────────────────────────────────────────────────────── */

/**
 * Öğrenciyi bir öğretmene bağlar/çıkarır.
 *
 * ⚠️ Bu, öğretmenin YAPAMADIĞI iş. /teacher/ogrenci başka sınıftaki öğrenciyi
 * reddediyor: devir meşru olabilir ama kararı devralan öğretmen veremez.
 */
export function SinifAtaDialog({ kullanici, mevcutOgretmenId, ogretmenler, onKaydet }: {
  kullanici: AdminKullaniciDetayi['kullanici']
  mevcutOgretmenId: string | null
  ogretmenler: AdminKullaniciSatiri[]
  onKaydet: (teacherId: string | null) => Promise<void>
}) {
  const [hedef, setHedef] = useState<string | null>(mevcutOgretmenId)
  const [ara, setAra] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const liste = useMemo(() => {
    const q = ara.trim().toLocaleLowerCase('tr')
    // Onaysız öğretmen listede YOK: ona atanan öğrenci hiçbir panelde görünmez,
    // çünkü öğretmen /teacher/* uçlarından 403 alıyor. Sunucu da reddediyor;
    // burada göstermek, reddedilecek bir seçeneği sunmak olurdu.
    const uygun = ogretmenler.filter((o) => o.isApproved)
    if (!q) return uygun.slice(0, 60)
    return uygun
      .filter((o) => `${o.name ?? ''} ${o.email ?? ''} ${o.classCode ?? ''}`.toLocaleLowerCase('tr').includes(q))
      .slice(0, 60)
  }, [ogretmenler, ara])

  const degisti = hedef !== mevcutOgretmenId

  return (
    <Dialog.Root onOpenChange={(a) => { if (!a) { setHedef(mevcutOgretmenId); setAra('') } }}>
      <Dialog.Trigger asChild>
        <GlowButton size="sm" variant="outline" icon="waves">Sınıfı değiştir</GlowButton>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[85] bg-ocean-950/50 backdrop-blur-sm" />
        <Dialog.Content className="glass fixed left-1/2 top-1/2 z-[86] flex max-h-[80vh] w-[min(92vw,460px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-3xl p-6 shadow-card">
          <Dialog.Title className="font-display text-[16px] font-bold text-slate-800 dark:text-slate-100">
            Sınıf ataması
          </Dialog.Title>
          <Dialog.Description className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            <strong>{kullanici.name ?? 'Bu öğrenci'}</strong> hangi öğretmenin sınıfında olsun?
          </Dialog.Description>

          <label className="mt-4 flex items-center gap-2 rounded-xl border border-slate-500/15 px-3 py-2 dark:border-sky-500/15">
            <Icon name="search" size={14} color="currentColor" style={{ opacity: 0.5 }} />
            <input
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder="Öğretmen adı, e-posta ya da sınıf kodu"
              className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
            />
          </label>

          <div className="mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <SecenekSatiri
              secili={hedef === null}
              onSec={() => setHedef(null)}
              baslik="Sınıfsız"
              alt="Öğrenci hiçbir öğretmene bağlı olmaz."
            />
            {liste.map((o) => (
              <SecenekSatiri
                key={o.id}
                secili={hedef === o.id}
                onSec={() => setHedef(o.id)}
                baslik={o.name ?? o.email ?? 'İsimsiz öğretmen'}
                alt={`${o.classCode ?? 'kod yok'} · ${o.ogrenciSayisi ?? 0} öğrenci${o.school ? ` · ${o.school}` : ''}`}
                isaret={o.id === mevcutOgretmenId ? 'şu anki' : undefined}
              />
            ))}
            {!liste.length && (
              <p className="px-2 py-6 text-center text-[12px] text-slate-400">
                Onaylı öğretmen bulunamadı.
              </p>
            )}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Dialog.Close asChild>
              <GlowButton size="sm" variant="ghost">Vazgeç</GlowButton>
            </Dialog.Close>
            <Dialog.Close asChild>
              <GlowButton
                size="sm"
                disabled={!degisti || mesgul}
                onClick={() => {
                  if (!degisti) return
                  setMesgul(true)
                  void onKaydet(hedef).finally(() => setMesgul(false))
                }}
              >
                Kaydet
              </GlowButton>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function SecenekSatiri({ secili, onSec, baslik, alt, isaret }: {
  secili: boolean; onSec: () => void; baslik: string; alt: string; isaret?: string
}) {
  return (
    <button
      type="button"
      onClick={onSec}
      className={cn(
        'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors',
        secili ? 'bg-sky-500/10' : 'hover:bg-sky-500/5',
      )}
    >
      {/* Seçim asla YALNIZ renkle işaretlenmez — ikon da taşır. */}
      <span className={cn('grid size-4 shrink-0 place-items-center', secili ? 'text-sky-500' : 'text-transparent')}>
        <Icon name="check" size={14} color="currentColor" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-slate-700 dark:text-slate-200">{baslik}</span>
        <span className="block truncate font-mono text-[11px] text-slate-400 dark:text-slate-500">{alt}</span>
      </span>
      {isaret && <Chip tone="slate">{isaret}</Chip>}
    </button>
  )
}

/* ── Denetim akışı ───────────────────────────────────────────────────────── */

const EYLEM_METNI: Record<YonetimEylemi, string> = {
  ogretmen_onay: 'öğretmen onayı',
  rol_degis: 'rol değişimi',
  sinif_ata: 'sınıf ataması',
  gorev_yeniden: 'görev yeniden kuyruklandı',
}

export function DenetimAkisi({ kayitlar, defterYok }: {
  kayitlar: DenetimSatiri[]
  defterYok: boolean
}) {
  // ⚠️ "Defter yok" ile "hiç işlem yok" AYRI hâller. 0020 uygulanmadığında boş
  // liste çizmek, denetimsiz bir sistemi "temiz" göstermek olurdu.
  if (defterYok) {
    return (
      <div className="glass-solid rounded-2xl px-5 py-5">
        <PanelBaslik icon="shield">Denetim Defteri</PanelBaslik>
        <p className="mt-2 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
          Defter tablosu henüz yok — <span className="font-mono">0020_yonetim_denetim.sql</span>{' '}
          uygulanmamış. Bu, "hiç yönetim işlemi yapılmadı" demek <strong>değildir</strong>:
          yapılan işlemler kaydedilmiyor. Migration uygulanana kadar rol değişimleri ve
          sınıf atamaları izsiz kalıyor.
        </p>
      </div>
    )
  }

  return (
    <div className="glass-solid rounded-2xl px-5 py-5">
      <PanelBaslik icon="shield">Denetim Defteri</PanelBaslik>
      {!kayitlar.length ? (
        <p className="mt-2 text-[12px] text-slate-400 dark:text-slate-500">
          Henüz yönetim işlemi yapılmamış.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {kayitlar.map((d) => (
            <li key={d.id} className="border-l-2 border-sky-500/25 pl-3">
              <p className="text-[12.5px] leading-snug text-slate-600 dark:text-slate-300">
                <strong className="font-medium">{d.adminAdi ?? 'Bir yönetici'}</strong>
                {' — '}{EYLEM_METNI[d.eylem] ?? d.eylem}
                {d.hedefAdi && <> · <span className="text-slate-500 dark:text-slate-400">{d.hedefAdi}</span></>}
              </p>
              <p className="mt-0.5 font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                {new Date(d.createdAt).toLocaleString('tr-TR')}
                {detayOzeti(d) && <> · {detayOzeti(d)}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Ham jsonb'yi okunur tek satıra indirir — yönetici ham anahtar okumasın. */
function detayOzeti(d: DenetimSatiri): string | null {
  const x = d.detay ?? {}
  if (d.eylem === 'rol_degis') {
    const n = Number(x.serbestBirakilanOgrenci ?? 0)
    return `${x.oncekiRol} → ${x.yeniRol}${n > 0 ? ` · ${n} öğrenci serbest bırakıldı` : ''}`
  }
  if (d.eylem === 'ogretmen_onay') return x.onayli === true ? 'onaylandı' : 'onay kaldırıldı'
  if (d.eylem === 'sinif_ata') return x.yeniOgretmenId ? 'sınıfa atandı' : 'sınıftan çıkarıldı'
  if (d.eylem === 'gorev_yeniden') {
    return `${x.kind ?? 'görev'} · ${x.akisaItildi === true ? 'akışa itildi' : 'bekçiye bırakıldı'}`
  }
  return null
}
