import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useAuth } from '../../lib/auth'
import { Icon } from '../../ui'
import type {
  AdminDenetimYaniti, AdminKullaniciDetayi, AdminKullanicilarYaniti,
  RolDegisYanit, SinifAtaYanit,
} from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { Chip, FiltreCipi, GlowButton, SegmentGecis, StatusLine } from '../../components/ui'
import { BosDurum, PanelBaslik, Sayi, StatTile } from '../../components/cekirdek'
import { GlowBorder, Reveal, WaveDivider } from '../../components/fx'
import { SinifBaslik } from '../../components/sinif'
import {
  DenetimAkisi, KullaniciTablosu, RolDegisDialog, RolRozeti, SinifAtaDialog, type RolAdi,
} from '../../components/yonetim'

/**
 * KULLANICILAR — yönetimin insan tarafı.
 *
 * ⚠️ BU EKRAN NEDEN VAR: /admin/kullanicilar ve /admin/ogretmen/:id/onay uçları
 * yazılmıştı ama HİÇBİR ŞEY onları çağırmıyordu. Sonuç: yeni kaydolan her öğretmen
 * `is_approved=false` ile kilitli kalıyordu ve yöneticinin onu onaylayacak bir
 * düğmesi yoktu. Arka uç hazırdı, eksik olan ekrandı.
 *
 * ⚠️ SAYFALAMA SUNUCUDA: kullanıcı sayısı öğrenci havuzuyla birlikte büyüyecek.
 * İstemcide filtrelenen "hepsini çek" kalıbı 1000 satırda PostgREST tarafından
 * SESSİZCE kesilir ve panel eksik listeyi tam sanır.
 */
const SAYFA = 50

export function Kullanicilar() {
  const { user } = useAuth()
  const [rol, setRol] = useState<'hepsi' | RolAdi>('hepsi')
  const [bekleyen, setBekleyen] = useState(false)
  const [ara, setAra] = useState('')
  const [sorgu, setSorgu] = useState('')
  const [sayfa, setSayfa] = useState(0)
  const [seciliId, setSeciliId] = useState<string | null>(null)

  // Arama debounce'u: her tuş vuruşunda sunucuya gitmek hem gereksiz hem de
  // useAsync'in bağımlılık dizisini sürekli tetikler.
  useEffect(() => {
    const t = setTimeout(() => { setSorgu(ara.trim()); setSayfa(0) }, 300)
    return () => clearTimeout(t)
  }, [ara])

  const liste = useAsync<AdminKullanicilarYaniti>(
    () => apiGet('/admin/kullanicilar', {
      ...(rol !== 'hepsi' ? { role: rol } : {}),
      ...(bekleyen ? { role: 'teacher', approved: 'false' } : {}),
      ...(sorgu ? { q: sorgu } : {}),
      limit: SAYFA,
      offset: sayfa * SAYFA,
    }),
    // ⚠️ İLKEL bağımlılıklar — nesne geçmek sonsuz refetch üretir (useAsync.ts:19).
    [rol, bekleyen, sorgu, sayfa],
  )

  const detay = useAsync<AdminKullaniciDetayi | null>(
    () => (seciliId ? apiGet(`/admin/kullanici/${seciliId}`) : Promise.resolve(null)),
    [seciliId],
  )

  const denetim = useAsync<AdminDenetimYaniti>(() => apiGet('/admin/denetim', { limit: 12 }), [])

  // Sınıf ataması için onaylı öğretmen listesi — diyalog açıldığında değil, bir kez.
  const ogretmenler = useAsync<AdminKullanicilarYaniti>(
    () => apiGet('/admin/kullanicilar', { role: 'teacher', limit: 200 }),
    [],
  )

  /** Mutasyon sonrası: liste + detay + defter birlikte tazelenir. */
  const tazele = (): void => {
    liste.reload()
    denetim.reload()
    ogretmenler.reload()
    if (seciliId) detay.reload()
  }

  /**
   * Denetim izi tutulamadıysa bunu KULLANICIYA SÖYLE. Sessizce başarı göstermek,
   * izsiz kalmış bir yetki kullanımını normalmiş gibi sunmak olurdu.
   */
  const izUyar = (yazildi: boolean): void => {
    if (!yazildi) {
      toast.warning('İşlem tamam ama denetim defterine yazılamadı — 0020 migration uygulanmamış olabilir.', {
        duration: 9000,
      })
    }
  }

  const onayla = async (k: { id: string; name: string | null }, onayli: boolean): Promise<void> => {
    try {
      const y = await apiPost(`/admin/ogretmen/${k.id}/onay`, { onayli })
      toast.success(onayli ? `${k.name ?? 'Öğretmen'} onaylandı` : `${k.name ?? 'Öğretmen'} onayı kaldırıldı`)
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Onay güncellenemedi')
    }
  }

  const rolDegistir = async (id: string, yeni: RolAdi): Promise<void> => {
    try {
      const y: RolDegisYanit = await apiPost(`/admin/kullanici/${id}/rol`, { rol: yeni })
      // Serbest bırakılan öğrenci sayısı SESSİZ KALMAMALI: bu, geri gelmeyen bir sonuç.
      toast.success(
        y.serbestBirakilanOgrenci > 0
          ? `Rol değişti — ${y.serbestBirakilanOgrenci} öğrencinin sınıf bağı koptu`
          : `Rol değişti: ${y.oncekiRol} → ${y.yeniRol}`,
        { duration: y.serbestBirakilanOgrenci > 0 ? 8000 : 4000 },
      )
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Rol değiştirilemedi', { duration: 7000 })
    }
  }

  const sinifAta = async (id: string, teacherId: string | null): Promise<void> => {
    try {
      const y: SinifAtaYanit = await apiPost(`/admin/kullanici/${id}/sinif`, { teacherId })
      toast.success(teacherId ? 'Öğrenci sınıfa atandı' : 'Öğrenci sınıftan çıkarıldı')
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Sınıf ataması yapılamadı', { duration: 7000 })
    }
  }

  if (liste.loading && !liste.data) return <PanoIskeleti sutun={2} />

  if (liste.error) {
    return (
      <Sayfa>
        <div className="glass-solid mx-auto max-w-md rounded-2xl px-6 py-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">Kullanıcılar alınamadı: {liste.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => liste.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const d = liste.data!
  const sayfaSayisi = Math.max(1, Math.ceil(d.total / SAYFA))

  return (
    <Sayfa>
      <Reveal>
        <SinifBaslik
          ad="Kullanıcılar"
          altBilgi="Hesaplar, roller ve sınıf bağları — sistemdeki her yetkinin tek yönetim noktası."
          sag={
            <StatusLine active={d.bekleyenOnay === 0}>
              {d.bekleyenOnay === 0
                ? `${d.total} hesap · onay bekleyen yok`
                : `${d.bekleyenOnay} öğretmen onay bekliyor`}
            </StatusLine>
          }
        />
      </Reveal>

      <Reveal delay={0.04}>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Sayfanın TEK neonu, bekleyen onay varken: yöneticinin bakması gereken tek sayı. */}
          {d.bekleyenOnay > 0 ? (
            <GlowBorder mode="always">
              <button
                type="button"
                onClick={() => { setBekleyen(true); setRol('hepsi'); setSayfa(0) }}
                className="glass-solid w-full cursor-pointer rounded-2xl px-5 py-4 text-left"
              >
                <p className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  Onay Bekleyen
                </p>
                <p className="mt-1 font-display text-2xl font-bold text-amber-600 dark:text-amber-300">
                  <Sayi value={d.bekleyenOnay} />
                </p>
                <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                  öğretmen panele giremiyor — filtrelemek için tıkla
                </p>
              </button>
            </GlowBorder>
          ) : (
            <StatTile icon="check" label="Onay Bekleyen" alt="tüm öğretmenler panelde">
              <Sayi value={0} />
            </StatTile>
          )}
          <StatTile icon="waves" label="Toplam Hesap" alt="filtresiz">
            <Sayi value={d.total} />
          </StatTile>
          <StatTile icon="chart" label="Bu Sayfada" alt={`${sayfa + 1}/${sayfaSayisi}. sayfa`}>
            <Sayi value={d.users.length} />
          </StatTile>
          <StatTile icon="shield" label="Denetim Kaydı" alt={denetim.data?.defterYok ? 'defter yok' : 'toplam işlem'}>
            {denetim.data?.defterYok ? <span className="text-slate-300 dark:text-slate-600">—</span>
              : <Sayi value={denetim.data?.total ?? 0} />}
          </StatTile>
        </div>
      </Reveal>

      <WaveDivider />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Reveal delay={0.1}>
            <div className="glass-solid rounded-2xl px-5 py-5">
              <PanelBaslik
                icon="waves"
                sag={
                  <SegmentGecis<'hepsi' | RolAdi>
                    secenekler={[['hepsi', 'Hepsi'], ['student', 'Öğrenci'], ['teacher', 'Öğretmen'], ['admin', 'Yönetici']]}
                    deger={rol}
                    onDegis={(v) => { setRol(v); setBekleyen(false); setSayfa(0) }}
                  />
                }
              >
                Hesaplar
              </PanelBaslik>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className="flex min-w-[200px] flex-1 items-center gap-2 rounded-xl border border-slate-500/15 px-3 py-2 dark:border-sky-500/15">
                  <Icon name="search" size={14} color="currentColor" style={{ opacity: 0.5 }} />
                  <input
                    value={ara}
                    onChange={(e) => setAra(e.target.value)}
                    placeholder="Ad ya da e-posta ara"
                    className="w-full bg-transparent text-[13px] text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
                  />
                </label>
                <FiltreCipi
                  aktif={bekleyen}
                  onClick={() => { setBekleyen((b) => !b); setRol('hepsi'); setSayfa(0) }}
                >
                  Yalnız onay bekleyen
                </FiltreCipi>
              </div>

              <div className="mt-4">
                <KullaniciTablosu
                  satirlar={d.users}
                  seciliId={seciliId}
                  onSec={setSeciliId}
                  onOnay={(k, onayli) => onayla(k, onayli)}
                />
              </div>

              {sayfaSayisi > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-500/10 pt-3 dark:border-sky-500/10">
                  <span className="font-mono text-[11px] text-slate-400 dark:text-slate-500">
                    {sayfa * SAYFA + 1}–{Math.min((sayfa + 1) * SAYFA, d.total)} / {d.total}
                  </span>
                  <div className="flex gap-2">
                    <GlowButton size="sm" variant="ghost" disabled={sayfa === 0}
                      onClick={() => setSayfa((s) => Math.max(0, s - 1))}>Önceki</GlowButton>
                    <GlowButton size="sm" variant="ghost" disabled={sayfa + 1 >= sayfaSayisi}
                      onClick={() => setSayfa((s) => s + 1)}>Sonraki</GlowButton>
                  </div>
                </div>
              )}
            </div>
          </Reveal>
        </div>

        <div className="min-w-0 space-y-6">
          <Reveal delay={0.14}>
            <KullaniciDetay
              detay={detay.data ?? null}
              yukleniyor={detay.loading && Boolean(seciliId)}
              kendiId={user?.id ?? null}
              ogretmenler={ogretmenler.data?.users ?? []}
              onRol={rolDegistir}
              onSinif={sinifAta}
              onKapat={() => setSeciliId(null)}
            />
          </Reveal>
          <Reveal delay={0.18}>
            <DenetimAkisi
              kayitlar={denetim.data?.kayitlar ?? []}
              defterYok={denetim.data?.defterYok ?? false}
            />
          </Reveal>
        </div>
      </div>
    </Sayfa>
  )
}

/* ── Seçili kullanıcı ────────────────────────────────────────────────────── */

function KullaniciDetay({ detay, yukleniyor, kendiId, ogretmenler, onRol, onSinif, onKapat }: {
  detay: AdminKullaniciDetayi | null
  yukleniyor: boolean
  kendiId: string | null
  ogretmenler: AdminKullanicilarYaniti['users']
  onRol: (id: string, rol: RolAdi) => Promise<void>
  onSinif: (id: string, teacherId: string | null) => Promise<void>
  onKapat: () => void
}) {
  if (yukleniyor) {
    return <div className="glass-solid h-72 animate-pulse rounded-2xl" />
  }
  if (!detay) {
    return (
      <div className="glass-solid rounded-2xl px-5 py-5">
        <BosDurum
          baslik="Hesap seç"
          aciklama="Soldaki listeden bir hesaba tıkla: rolünü, sınıf bağını ve etkinliğini burada görürsün."
        />
      </div>
    )
  }

  const k = detay.kullanici
  const kendisiMi = k.id === kendiId

  return (
    <div className="glass-solid rounded-2xl px-5 py-5">
      <PanelBaslik
        icon="chart"
        sag={
          <button type="button" onClick={onKapat} aria-label="Paneli kapat"
            className="grid size-6 cursor-pointer place-items-center rounded-lg text-slate-300 hover:text-slate-500 dark:text-slate-600">
            <Icon name="close" size={14} color="currentColor" />
          </button>
        }
      >
        Hesap
      </PanelBaslik>

      <div className="mt-3">
        <p className="font-display text-[15px] font-bold text-slate-800 dark:text-slate-100">
          {k.name ?? 'İsimsiz hesap'}
        </p>
        <p className="mt-0.5 truncate font-mono text-[11.5px] text-slate-400 dark:text-slate-500">
          {k.email ?? '—'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <RolRozeti rol={k.role} onaysiz={k.role === 'teacher' && !k.isApproved} />
          {kendisiMi && <Chip tone="slate">bu sensin</Chip>}
          {k.grade && <Chip tone="slate">{k.grade}. sınıf</Chip>}
          {k.school && <Chip tone="slate">{k.school}</Chip>}
        </div>
      </div>

      {/* ── Sınıf bağı ── */}
      <div className="mt-4 border-t border-slate-500/10 pt-3 dark:border-sky-500/10">
        <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Sınıf
        </p>
        {k.role === 'teacher' ? (
          <p className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300">
            Kod <span className="font-mono">{k.classCode ?? '—'}</span> ·{' '}
            <Sayi value={detay.sinif?.ogrenciSayisi ?? 0} /> öğrenci
          </p>
        ) : k.role === 'student' ? (
          <p className="mt-1 text-[12.5px] text-slate-600 dark:text-slate-300">
            {detay.ogretmen
              ? <>{detay.ogretmen.name ?? 'İsimsiz öğretmen'} · <span className="font-mono">{detay.ogretmen.classCode ?? '—'}</span></>
              : <span className="text-slate-400 dark:text-slate-500">Sınıfa kayıtlı değil</span>}
          </p>
        ) : (
          <p className="mt-1 text-[12.5px] text-slate-400 dark:text-slate-500">
            Yöneticinin sınıfı olmaz.
          </p>
        )}
      </div>

      {/* ── Etkinlik ── */}
      <div className="mt-4 border-t border-slate-500/10 pt-3 dark:border-sky-500/10">
        <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Etkinlik
        </p>
        {/* ⚠️ null = HİÇ KAYIT YOK. Sıfır basmak "0 doğru yapmış" gibi okunurdu. */}
        {!detay.etkinlik ? (
          <p className="mt-1 text-[12.5px] text-slate-400 dark:text-slate-500">
            Hiç soru çözmemiş — ölçülecek veri yok.
          </p>
        ) : (
          <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
            <Satir etiket="Toplam cevap"><Sayi value={detay.etkinlik.toplamCevap} /></Satir>
            <Satir etiket="Son 7 gün"><Sayi value={detay.etkinlik.son7Gun} /></Satir>
            <Satir etiket="Takip edilen kazanım"><Sayi value={detay.etkinlik.takipEdilenKazanim} /></Satir>
            <Satir etiket="Son görülme">
              {detay.etkinlik.sonGorulme
                ? new Date(detay.etkinlik.sonGorulme).toLocaleDateString('tr-TR')
                : <span className="text-slate-300 dark:text-slate-600">—</span>}
            </Satir>
          </div>
        )}
      </div>

      {/* ── Eylemler ── */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-500/10 pt-4 dark:border-sky-500/10">
        <RolDegisDialog
          kullanici={k}
          kendisiMi={kendisiMi}
          onKaydet={(rol) => onRol(k.id, rol)}
        />
        {k.role === 'student' && (
          <SinifAtaDialog
            kullanici={k}
            mevcutOgretmenId={detay.ogretmen?.id ?? null}
            ogretmenler={ogretmenler}
            onKaydet={(teacherId) => onSinif(k.id, teacherId)}
          />
        )}
      </div>

      {/* ── Bu hesap üzerindeki işlemler ── */}
      {detay.denetim.length > 0 && (
        <div className="mt-4 border-t border-slate-500/10 pt-3 dark:border-sky-500/10">
          <p className="font-display text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Bu hesapta yapılanlar
          </p>
          <ul className="mt-2 space-y-1.5">
            {detay.denetim.slice(0, 5).map((x) => (
              <li key={x.id} className="font-mono text-[10.5px] text-slate-400 dark:text-slate-500">
                {new Date(x.createdAt).toLocaleDateString('tr-TR')} · {x.eylem} · {x.adminAdi ?? 'yönetici'}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Satir({ etiket, children }: { etiket: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-slate-400 dark:text-slate-500">{etiket}</span>
      <span className="font-mono text-slate-600 dark:text-slate-300">{children}</span>
    </div>
  )
}
