import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPatch, apiPost } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { useAuth } from '../../lib/auth'
import { cn } from '../../lib/cn'
import { Icon } from '../../ui'
import type {
  AdminDenetimYaniti, AdminKullaniciDetayi, AdminKullanicilarYaniti,
  AskiYanit, BasvuruReddetYanit, HesapOlusturYanit, ProfilDuzeltYanit,
  RolDegisYanit, SifreSifirlaYanit, SinifAtaYanit,
} from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton } from '../../components/ui'
import { CanliSayi, Sayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import {
  AskiDialog, DenetimAkisi, HesapAcDialog, KullaniciTablosu, ProfilDuzeltDialog,
  RolDegisDialog, RolRozeti, SinifAtaDialog, type RolAdi,
} from '../../components/yonetim'

/**
 * KULLANICILAR — yönetimin insan tarafı (FİDAN v1.2 inline desen; onaylı önizleme:
 * docs/design/onizleme/kullanicilar.html, 2026-07-23).
 *
 * ⚠️ BU EKRAN NEDEN VAR: /admin/kullanicilar ve /admin/ogretmen/:id/onay uçları
 * yazılmıştı ama HİÇBİR ŞEY onları çağırmıyordu. Sonuç: yeni kaydolan her öğretmen
 * `is_approved=false` ile kilitli kalıyordu ve yöneticinin onu onaylayacak bir
 * düğmesi yoktu. Arka uç hazırdı, eksik olan ekrandı.
 *
 * ⚠️ SAYFALAMA SUNUCUDA: kullanıcı sayısı öğrenci havuzuyla birlikte büyüyecek.
 * İstemcide filtrelenen "hepsini çek" kalıbı 1000 satırda PostgREST tarafından
 * SESSİZCE kesilir ve panel eksik listeyi tam sanır.
 *
 * ⚠️ STİL: ekranın (ve yonetim.tsx bileşenlerinin) tüm `ku-*` sınıfları aşağıdaki
 * tek <style> bloğunda; renkler index.css CSS değişkenlerinden → iki tema otomatik.
 */
const SAYFA = 50

export function Kullanicilar() {
  const { user } = useAuth()
  const [rol, setRol] = useState<'hepsi' | RolAdi>('hepsi')
  const [bekleyen, setBekleyen] = useState(false)
  // Öğretmen BAŞVURUSU bekleyen öğrenciler (0021) — is_approved bekleyen öğretmenden AYRI kuyruk.
  const [basvuruBekleyen, setBasvuruBekleyen] = useState(false)
  // Askıdaki hesaplar (0025) — üçüncü ve AYRI kuyruk: onay/başvuru ile karıştırılmaz.
  const [askidakiler, setAskidakiler] = useState(false)
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
      ...(basvuruBekleyen ? { basvuru: 'bekliyor' } : {}),
      ...(askidakiler ? { askida: 'true' } : {}),
      ...(sorgu ? { q: sorgu } : {}),
      limit: SAYFA,
      offset: sayfa * SAYFA,
    }),
    // ⚠️ İLKEL bağımlılıklar — nesne geçmek sonsuz refetch üretir (useAsync.ts:19).
    [rol, bekleyen, basvuruBekleyen, askidakiler, sorgu, sayfa],
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

  /* ── Hesap yaşam döngüsü (0025) ── */

  const hesapAc = async (v: {
    email: string; name: string; rol: 'student' | 'teacher'; school: string | null
  }): Promise<void> => {
    try {
      const y: HesapOlusturYanit = await apiPost('/admin/kullanici', v)
      // ⚠️ SMTP yoksa uç 502 döner ve catch'e düşer; buraya gelmişse davet gerçekten gitti.
      toast.success(`${v.name} için davet gönderildi (${v.email})`)
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Davet gönderilemedi', { duration: 9000 })
    }
  }

  const profilDuzelt = async (id: string, yama: Record<string, string | null>): Promise<void> => {
    try {
      const y: ProfilDuzeltYanit = await apiPatch(`/admin/kullanici/${id}`, yama)
      const n = Object.keys(y.degisenler).length
      toast.success(`${n} alan güncellendi`)
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Künye güncellenemedi')
    }
  }

  const sifreSifirla = async (id: string, ad: string | null): Promise<void> => {
    try {
      const y: SifreSifirlaYanit = await apiPost(`/admin/kullanici/${id}/sifre-sifirla`, {})
      toast.success(`Kurtarma bağlantısı ${y.email} adresine gönderildi`)
      izUyar(y.denetimYazildi)
    } catch (e: any) {
      toast.error(e?.message ?? `${ad ?? 'Kullanıcı'} için şifre sıfırlanamadı`, { duration: 9000 })
    }
  }

  const askiDegistir = async (id: string, askida: boolean, neden: string | null): Promise<void> => {
    try {
      const y: AskiYanit = await apiPost(`/admin/kullanici/${id}/aski`, { askida, neden })
      toast.success(
        askida
          ? 'Hesap askıya alındı — tüm ekranlar anında kapandı'
          : 'Askı kaldırıldı — hesap yeniden çalışıyor',
      )
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Askı durumu değiştirilemedi', { duration: 7000 })
    }
  }

  const basvuruReddet = async (id: string): Promise<void> => {
    try {
      const y: BasvuruReddetYanit = await apiPost(`/admin/basvuru/${id}/reddet`, {})
      toast.success('Başvuru reddedildi — rol değişmedi')
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Başvuru reddedilemedi')
    }
  }

  if (liste.loading && !liste.data) return <PanoIskeleti sutun={2} />

  if (liste.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Kullanıcılar alınamadı: {liste.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => liste.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const d = liste.data!
  const sayfaSayisi = Math.max(1, Math.ceil(d.total / SAYFA))
  const bekleyenVar = d.bekleyenOnay > 0
  const durumMetin = [
    d.bekleyenOnay > 0 ? `${d.bekleyenOnay} öğretmen onay bekliyor` : null,
    d.bekleyenBasvuru > 0 ? `${d.bekleyenBasvuru} başvuru bekliyor` : null,
    d.askidaSayisi > 0 ? `${d.askidaSayisi} hesap askıda` : null,
  ].filter(Boolean).join(' · ') || `${d.total} hesap · bekleyen yok`
  const durumSakin = d.bekleyenOnay === 0 && d.bekleyenBasvuru === 0 && d.askidaSayisi === 0

  return (
    <Sayfa>
      <style>{`
        .ku-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }

        /* Başlık */
        .ku-baslik { padding: 16px 22px; }
        .ku-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px); color: var(--metin1); }
        .ku-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 560px; }
        .ku-durum { float: right; font-family: 'JetBrains Mono', monospace; font-size: 10.5px; padding: 5px 12px;
          border-radius: 11px; background: color-mix(in srgb, var(--uyari) 14%, transparent); color: var(--uyari); }
        .ku-durum.ku-sakin { background: var(--v0); color: var(--metin3); }

        /* Stat şeridi */
        .ku-statlar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 22px; }
        @media (max-width: 980px) { .ku-statlar { grid-template-columns: repeat(2, 1fr); } }
        button.ku-stat { display: block; width: 100%; font: inherit; }
        .ku-stat { padding: 15px 18px; text-align: left; }
        .ku-stat.ku-neon { border: 1.5px solid var(--uyari); cursor: pointer; }
        .ku-stat .etiket { font-size: 10px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--metin3); }
        .ku-stat .deger { font-family: Outfit, sans-serif; font-size: 23px; font-weight: 800; line-height: 1; margin-top: 5px; color: var(--metin1); }
        .ku-stat .deger.uyari { color: var(--uyari); }
        .ku-stat .alt { margin-top: 4px; font-size: 10.5px; color: var(--metin3); }

        /* Ana ızgara */
        .ku-izgara { display: grid; grid-template-columns: 1.9fr 1fr; gap: 14px; margin-top: 20px; align-items: start; }
        @media (max-width: 1020px) { .ku-izgara { grid-template-columns: 1fr; } }
        .ku-kolon { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

        /* Panel başlığı + segment */
        .ku-panel-ic { padding: 18px 22px; }
        .ku-panel-bas { display: flex; align-items: center; gap: 9px; margin-bottom: 13px; flex-wrap: wrap; }
        .ku-panel-bas h3 { font-family: Outfit, sans-serif; font-size: 14px; font-weight: 700; color: var(--metin1); }
        .ku-panel-bas .sag-mono { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--metin3); }
        .ku-segment { margin-left: auto; display: inline-flex; background: var(--v0); border: 1px solid var(--cam-kenar);
          border-radius: 12px; padding: 3px; gap: 2px; }
        .ku-segment.ku-segment-genis { margin-left: 0; margin-top: 16px; display: flex; }
        .ku-segment.ku-segment-genis button { flex: 1; }
        .ku-segment button { font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; color: var(--metin3);
          background: transparent; border: none; border-radius: 9px; padding: 6px 12px; cursor: pointer; }
        .ku-segment button.ku-aktif { background: var(--mat); color: var(--vurgu); box-shadow: 0 2px 8px rgba(24,49,33,.08); }

        /* Araç çubuğu */
        .ku-arac { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .ku-ara { flex: 1; min-width: 200px; display: flex; align-items: center; gap: 8px; border: 1.5px solid var(--cam-kenar);
          border-radius: 12px; padding: 9px 13px; color: var(--metin3); }
        .ku-ara input { flex: 1; min-width: 0; border: none; background: transparent; outline: none; font-size: 13px; color: var(--metin1); }
        .ku-ara input::placeholder { color: var(--metin3); }
        .ku-filtre-cip { font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; color: var(--metin2);
          background: transparent; border: 1.5px solid var(--cam-kenar); border-radius: 12px; padding: 8px 13px; cursor: pointer; min-height: 44px; }
        .ku-filtre-cip.ku-aktif { color: var(--vurgu); background: var(--v1); border-color: var(--adacayi); }

        /* Tablo */
        .ku-utablo { width: 100%; border-collapse: collapse; font-size: 12.5px; }
        .ku-utablo th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 9.5px; letter-spacing: .1em;
          text-transform: uppercase; color: var(--metin3); font-weight: 500; padding: 7px 10px; border-bottom: 1px solid var(--cam-kenar); }
        .ku-utablo td { padding: 10px; border-bottom: 1px solid var(--cam-kenar); color: var(--metin2); vertical-align: middle; }
        .ku-utablo tr.ku-secili td { background: var(--v1); }
        .ku-utablo tbody tr:hover td { background: var(--v0); }
        .ku-utablo tr.ku-secili:hover td { background: var(--v1); }
        .ku-utablo .ad-btn { display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: 0; }
        .ku-utablo .ad-btn b { display: block; color: var(--metin1); font-weight: 600; font-size: 13px; }
        .ku-utablo .ad-btn .epost { display: block; }
        .ku-utablo .epost { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); }

        /* Rol rozetleri (kelime + renk; onaysız ayrı rozet) */
        .ku-rozet-grup { display: inline-flex; align-items: center; gap: 5px; flex-wrap: wrap; }
        .ku-rrozet { display: inline-block; font-size: 10px; font-weight: 700; padding: 2.5px 9px; border-radius: 8px; white-space: nowrap; }
        .ku-r-student { background: var(--v1); color: var(--vurgu); }
        .ku-r-teacher { background: color-mix(in srgb, var(--bilgi) 18%, transparent); color: var(--bilgi); }
        .ku-r-admin { background: color-mix(in srgb, var(--toprak) 20%, transparent); color: var(--toprak); }
        .ku-r-onaysiz { background: color-mix(in srgb, var(--uyari) 16%, transparent); color: var(--uyari); }
        /* Askı (0025) — onaysızdan AYRI ton: onaysız "henüz açılmadı", askı "kapatıldı". */
        .ku-r-askida { background: color-mix(in srgb, var(--yanlis) 15%, transparent); color: var(--yanlis); }

        /* Satır-içi onay */
        .ku-mini-onay { background: var(--cta); color: #F2F7F3; border: none; border-radius: 9px; padding: 6px 12px;
          font-family: Outfit, sans-serif; font-size: 10.5px; font-weight: 600; cursor: pointer; min-height: 34px; }
        .ku-mini-onay:disabled { opacity: .5; cursor: default; }
        .ku-mini-kaldir { background: transparent; color: var(--metin3); border: none; border-radius: 9px; padding: 6px 10px;
          font-family: Outfit, sans-serif; font-size: 10.5px; font-weight: 600; cursor: pointer; min-height: 34px; }
        .ku-mini-kaldir:hover { color: var(--yanlis); }

        /* Sayfalama */
        .ku-sayfalama { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; padding-top: 12px;
          border-top: 1px solid var(--cam-kenar); font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3); }
        .ku-sayfalama .butonlar { display: flex; gap: 8px; }
        .ku-sayfalama button { background: var(--v0); border: 1px solid var(--cam-kenar); border-radius: 10px; padding: 7px 13px;
          font-family: Outfit, sans-serif; font-size: 11.5px; font-weight: 600; color: var(--metin2); cursor: pointer; }
        .ku-sayfalama button:disabled { opacity: .4; cursor: default; }

        /* Detay paneli */
        .ku-detay { padding: 18px 20px; }
        .ku-kapat { background: transparent; border: none; cursor: pointer; color: var(--metin3); display: inline-grid;
          place-items: center; padding: 4px; border-radius: 8px; }
        .ku-kapat:hover { color: var(--metin1); }
        .ku-detay .ad { font-family: Outfit, sans-serif; font-size: 16px; font-weight: 800; color: var(--metin1); }
        .ku-detay .epost { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3); margin-top: 2px; word-break: break-all; }
        .ku-cipler { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
        .ku-dchip { display: inline-flex; align-items: center; gap: 4px; font-size: 10.5px; font-weight: 600; padding: 3px 9px;
          border-radius: 9px; background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
        .ku-dchip.ku-sen { background: color-mix(in srgb, var(--bilgi) 14%, transparent); color: var(--bilgi); border: none; }
        .ku-dchip.ku-bekliyor { background: color-mix(in srgb, var(--uyari) 15%, transparent); color: var(--uyari); border: none; }
        .ku-dchip.ku-askida { background: color-mix(in srgb, var(--yanlis) 14%, transparent); color: var(--yanlis); border: none; }
        .ku-bolum { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--cam-kenar); }
        .ku-bolum .etiket { font-family: Outfit, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: .12em;
          text-transform: uppercase; color: var(--metin3); margin-bottom: 8px; }
        .ku-bolum .metin { font-size: 12.5px; color: var(--metin2); line-height: 1.5; }
        .ku-bolum .silik { font-size: 12.5px; color: var(--metin3); line-height: 1.5; }
        .ku-aktif-izgara { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 12px; }
        .ku-aktif-izgara .s { display: flex; justify-content: space-between; gap: 8px; }
        .ku-aktif-izgara .s span:first-child { color: var(--metin3); }
        .ku-aktif-izgara .s span:last-child { font-family: 'JetBrains Mono', monospace; color: var(--metin2); }
        .ku-basvuru-not { font-size: 12px; font-style: italic; color: var(--metin2); margin-top: 8px; line-height: 1.5;
          background: var(--v0); border: 1px solid var(--cam-kenar); border-radius: 12px; padding: 10px 12px; }
        .ku-kilit-not { font-size: 11px; color: var(--metin3); margin-top: 8px; line-height: 1.5; }
        .ku-kilit-kutu { font-size: 12px; color: var(--metin2); line-height: 1.5; background: var(--v0);
          border: 1px solid var(--cam-kenar); border-radius: 12px; padding: 10px 12px; }
        .ku-eylemler { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--cam-kenar); }
        .ku-mini-liste p { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); margin-top: 4px; }

        /* Butonlar */
        .ku-btn { font-family: Outfit, sans-serif; font-weight: 600; font-size: 12px; border-radius: 11px; cursor: pointer;
          border: none; min-height: 40px; padding: 9px 15px; display: inline-flex; align-items: center; justify-content: center;
          gap: 6px; transition: box-shadow .15s, color .15s, border-color .15s; }
        .ku-btn:disabled { opacity: .5; cursor: default; }
        .ku-btn-birincil { background: var(--cta); color: #F2F7F3; }
        .ku-btn-birincil:not(:disabled):hover { box-shadow: var(--parilti); }
        .ku-btn-soluk { background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
        .ku-btn-soluk:not(:disabled):hover { color: var(--metin1); border-color: var(--adacayi); }
        .ku-btn-tehlike { background: transparent; color: var(--yanlis); border: 1px solid color-mix(in srgb, var(--yanlis) 40%, transparent); }
        .ku-btn-tam { width: 100%; }
        .dark .ku-mini-onay, .dark .ku-btn-birincil { color: #EAF4EC; }

        /* Denetim akışı */
        .ku-denetim-satir { display: flex; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--cam-kenar); font-size: 11.5px; }
        .ku-denetim-satir:last-child { border-bottom: none; }
        .ku-denetim-satir .zaman { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: var(--metin3);
          white-space: nowrap; flex-shrink: 0; }
        .ku-denetim-satir .eylem { color: var(--metin2); line-height: 1.5; }
        .ku-denetim-satir .eylem b { color: var(--metin1); font-weight: 600; }

        /* Diyalog (Radix Portal → body; <style> belge-global) */
        .ku-overlay { position: fixed; inset: 0; z-index: 85; background: rgba(12,18,14,.5); backdrop-filter: blur(3px); }
        .ku-modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 86; width: min(92vw, 440px);
          background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border: 1px solid var(--cam-kenar);
          border-radius: 24px; box-shadow: var(--golge); padding: 22px 24px; }
        .ku-modal.ku-genis { width: min(92vw, 460px); max-height: 82vh; display: flex; flex-direction: column; }
        .ku-modal h2 { font-family: Outfit, sans-serif; font-size: 16px; font-weight: 800; color: var(--metin1); }
        .ku-modal .aciklama { margin-top: 6px; font-size: 13px; line-height: 1.5; color: var(--metin2); }
        .ku-modal .uyari-kutu { margin-top: 16px; border: 1px solid color-mix(in srgb, var(--uyari) 25%, transparent);
          background: color-mix(in srgb, var(--uyari) 6%, transparent); border-radius: 12px; padding: 10px 12px;
          font-size: 12px; line-height: 1.5; color: var(--uyari); }
        .ku-modal .dugmeler { margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px; }

        /* Seçenek satırı (sınıf ata) */
        .ku-secenek-liste { margin-top: 12px; min-height: 0; flex: 1; overflow-y: auto; padding-right: 4px; }
        .ku-secenek { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; background: transparent;
          border: none; border-radius: 12px; padding: 8px 10px; cursor: pointer; }
        .ku-secenek:hover { background: var(--v0); }
        .ku-secenek.ku-secili { background: var(--v1); }
        .ku-secenek .tik { width: 16px; flex-shrink: 0; color: var(--vurgu); display: inline-grid; place-items: center; }
        .ku-secenek .govde { min-width: 0; flex: 1; }
        .ku-secenek .govde .b { display: block; font-size: 13px; font-weight: 600; color: var(--metin1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ku-secenek .govde .a { display: block; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ku-secenek .isaret { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 8px;
          background: var(--v0); color: var(--metin3); }

        @media (prefers-reduced-motion: reduce) { .ku-btn { transition: none; } }
      `}</style>

      {/* ═══ BAŞLIK + bekleyen durumu ═══ */}
      <Reveal>
        <section className="ku-kart ku-baslik">
          <span className={cn('ku-durum', durumSakin && 'ku-sakin')}>{durumMetin}</span>
          <h1>Kullanıcılar</h1>
          <p className="alt">Hesaplar, roller ve sınıf bağları — sistemdeki her yetkinin tek yönetim noktası.</p>
        </section>
      </Reveal>

      {/* ═══ STAT ŞERİDİ (4) — tek neon = onay bekleyen (tıkla→filtrele) ═══ */}
      <Reveal delay={0.04}>
        <div className="ku-statlar">
          {/* Sayfanın TEK neonu, bekleyen onay varken: yöneticinin bakması gereken tek sayı. */}
          {bekleyenVar ? (
            <button
              type="button"
              className="ku-kart ku-stat ku-neon"
              onClick={() => {
                setBekleyen(true); setBasvuruBekleyen(false); setAskidakiler(false); setRol('hepsi'); setSayfa(0)
              }}
            >
              <div className="etiket">Onay Bekleyen</div>
              <div className="deger uyari"><CanliSayi value={d.bekleyenOnay} /></div>
              <div className="alt">öğretmen panele giremiyor — filtrelemek için tıkla</div>
            </button>
          ) : (
            <section className="ku-kart ku-stat">
              <div className="etiket">Onay Bekleyen</div>
              <div className="deger"><CanliSayi value={0} /></div>
              <div className="alt">tüm öğretmenler panelde</div>
            </section>
          )}

          <section className="ku-kart ku-stat">
            <div className="etiket">Toplam Hesap</div>
            <div className="deger"><CanliSayi value={d.total} /></div>
            <div className="alt">filtresiz</div>
          </section>

          <section className="ku-kart ku-stat">
            <div className="etiket">Bu Sayfada</div>
            <div className="deger"><CanliSayi value={d.users.length} /></div>
            <div className="alt">{sayfa + 1}/{sayfaSayisi}. sayfa</div>
          </section>

          {/* Askı ayrı bir kuyruk: onay bekleyenle aynı kutuya konsaydı iki farklı iş
              tek sayıya inerdi. Askıda hesap varken tıklanabilir filtre olur. */}
          {d.askidaSayisi > 0 ? (
            <button
              type="button"
              className="ku-kart ku-stat"
              onClick={() => {
                setAskidakiler(true); setBekleyen(false); setBasvuruBekleyen(false); setRol('hepsi'); setSayfa(0)
              }}
              style={{ cursor: 'pointer' }}
            >
              <div className="etiket">Askıda</div>
              <div className="deger uyari"><CanliSayi value={d.askidaSayisi} /></div>
              <div className="alt">hiçbir ekranı açamıyor — filtrelemek için tıkla</div>
            </button>
          ) : (
            <section className="ku-kart ku-stat">
              <div className="etiket">Denetim Kaydı</div>
              <div className="deger">
                {denetim.data?.defterYok
                  ? <span style={{ color: 'var(--metin3)' }}>—</span>
                  : <CanliSayi value={denetim.data?.total ?? 0} />}
              </div>
              <div className="alt">{denetim.data?.defterYok ? 'defter yok' : 'toplam işlem'}</div>
            </section>
          )}
        </div>
      </Reveal>

      {/* ═══ ANA IZGARA ═══ */}
      <div className="ku-izgara">
        {/* ─── SOL: hesap tablosu ─── */}
        <div className="ku-kolon">
          <Reveal delay={0.1}>
            <section className="ku-kart ku-panel-ic">
              <div className="ku-panel-bas">
                <h3>Hesaplar</h3>
                <div className="ku-segment">
                  {([['hepsi', 'Hepsi'], ['student', 'Öğrenci'], ['teacher', 'Öğretmen'], ['admin', 'Yönetici']] as Array<['hepsi' | RolAdi, string]>).map(([v, etiket]) => (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={rol === v}
                      className={rol === v ? 'ku-aktif' : undefined}
                      onClick={() => {
                        setRol(v); setBekleyen(false); setBasvuruBekleyen(false); setAskidakiler(false); setSayfa(0)
                      }}
                    >
                      {etiket}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ku-arac">
                <label className="ku-ara">
                  <Icon name="search" size={14} color="currentColor" style={{ opacity: 0.55 }} />
                  <input
                    value={ara}
                    onChange={(e) => setAra(e.target.value)}
                    placeholder="Ad ya da e-posta ara"
                    aria-label="Ad ya da e-posta ara"
                  />
                </label>
                <button
                  type="button"
                  aria-pressed={bekleyen}
                  className={cn('ku-filtre-cip', bekleyen && 'ku-aktif')}
                  onClick={() => {
                    setBekleyen((b) => !b); setBasvuruBekleyen(false); setAskidakiler(false); setRol('hepsi'); setSayfa(0)
                  }}
                >
                  Yalnız onay bekleyen
                </button>
                <button
                  type="button"
                  aria-pressed={basvuruBekleyen}
                  className={cn('ku-filtre-cip', basvuruBekleyen && 'ku-aktif')}
                  onClick={() => {
                    setBasvuruBekleyen((b) => !b); setBekleyen(false); setAskidakiler(false); setRol('hepsi'); setSayfa(0)
                  }}
                >
                  Yalnız başvuru bekleyen
                </button>
                <button
                  type="button"
                  aria-pressed={askidakiler}
                  className={cn('ku-filtre-cip', askidakiler && 'ku-aktif')}
                  onClick={() => {
                    setAskidakiler((b) => !b); setBekleyen(false); setBasvuruBekleyen(false); setRol('hepsi'); setSayfa(0)
                  }}
                >
                  Yalnız askıdakiler
                </button>
                <HesapAcDialog onKaydet={hesapAc} />
              </div>

              <KullaniciTablosu
                satirlar={d.users}
                seciliId={seciliId}
                onSec={setSeciliId}
                onOnay={(k, onayli) => onayla(k, onayli)}
              />

              {sayfaSayisi > 1 && (
                <div className="ku-sayfalama">
                  <span>{sayfa * SAYFA + 1}–{Math.min((sayfa + 1) * SAYFA, d.total)} / {d.total}</span>
                  <div className="butonlar">
                    <button type="button" disabled={sayfa === 0} onClick={() => setSayfa((s) => Math.max(0, s - 1))}>Önceki</button>
                    <button type="button" disabled={sayfa + 1 >= sayfaSayisi} onClick={() => setSayfa((s) => s + 1)}>Sonraki</button>
                  </div>
                </div>
              )}
            </section>
          </Reveal>
        </div>

        {/* ─── SAĞ: seçili hesap + denetim defteri ─── */}
        <div className="ku-kolon">
          <Reveal delay={0.14}>
            <KullaniciDetay
              detay={detay.data ?? null}
              yukleniyor={detay.loading && Boolean(seciliId)}
              kendiId={user?.id ?? null}
              ogretmenler={ogretmenler.data?.users ?? []}
              onRol={rolDegistir}
              onSinif={sinifAta}
              onProfil={profilDuzelt}
              onSifre={sifreSifirla}
              onAski={askiDegistir}
              onBasvuruReddet={basvuruReddet}
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

function KullaniciDetay({
  detay, yukleniyor, kendiId, ogretmenler,
  onRol, onSinif, onProfil, onSifre, onAski, onBasvuruReddet, onKapat,
}: {
  detay: AdminKullaniciDetayi | null
  yukleniyor: boolean
  kendiId: string | null
  ogretmenler: AdminKullanicilarYaniti['users']
  onRol: (id: string, rol: RolAdi) => Promise<void>
  onSinif: (id: string, teacherId: string | null) => Promise<void>
  onProfil: (id: string, yama: Record<string, string | null>) => Promise<void>
  onSifre: (id: string, ad: string | null) => Promise<void>
  onAski: (id: string, askida: boolean, neden: string | null) => Promise<void>
  onBasvuruReddet: (id: string) => Promise<void>
  onKapat: () => void
}) {
  if (yukleniyor) {
    return <div className="ku-kart" style={{ height: 320 }} />
  }
  if (!detay) {
    return (
      <section className="ku-kart ku-detay">
        <div className="ku-panel-bas"><h3>Hesap</h3></div>
        <p style={{ fontSize: 12.5, color: 'var(--metin3)', lineHeight: 1.6, marginTop: 2 }}>
          Soldaki listeden bir hesaba tıkla: rolünü, sınıf bağını ve etkinliğini burada görürsün.
        </p>
      </section>
    )
  }

  const k = detay.kullanici
  const kendisiMi = k.id === kendiId

  return (
    <section className="ku-kart ku-detay">
      <div className="ku-panel-bas">
        <h3>Hesap</h3>
        <button type="button" onClick={onKapat} aria-label="Paneli kapat" className="ku-kapat" style={{ marginLeft: 'auto' }}>
          <Icon name="close" size={14} color="currentColor" />
        </button>
      </div>

      <div className="ad">{k.name ?? 'İsimsiz hesap'}</div>
      <div className="epost">{k.email ?? '—'}</div>
      <div className="ku-cipler">
        <RolRozeti rol={k.role} onaysiz={k.role === 'teacher' && !k.isApproved} />
        {/* Askı rozeti ROLDEN AYRI çizilir: askı bir yetki seviyesi değil, erişim kesmesidir. */}
        {k.askidaMi && (
          <span className="ku-dchip ku-askida"><Icon name="shield" size={12} color="currentColor" />askıda</span>
        )}
        {detay.basvuru?.durum === 'bekliyor' && (
          <span className="ku-dchip ku-bekliyor"><Icon name="clock" size={12} color="currentColor" />başvuru bekliyor</span>
        )}
        {kendisiMi && <span className="ku-dchip ku-sen">bu sensin</span>}
        {k.grade && <span className="ku-dchip">{k.grade}. sınıf</span>}
        {k.school && <span className="ku-dchip">{k.school}</span>}
      </div>

      {/* ── Askı bağlamı ── "hesabım neden kapalı" sorusunun muhatabı ve gerekçesi. */}
      {detay.aski && (
        <div className="ku-bolum">
          <div className="etiket">Askı</div>
          <p className="metin">
            {detay.aski.neden ?? 'Gerekçe yazılmamış.'}
          </p>
          <p className="ku-kilit-not">
            {detay.aski.verenAdi ?? 'Bir yönetici'} tarafından
            {detay.aski.tarih ? ` ${new Date(detay.aski.tarih).toLocaleDateString('tr-TR')} tarihinde` : ''} askıya alındı.
            Verisi, sınıf bağı ve ilerlemesi duruyor.
          </p>
        </div>
      )}

      {/* ── Sınıf bağı ── */}
      <div className="ku-bolum">
        <div className="etiket">Sınıf</div>
        {k.role === 'teacher' ? (
          <p className="metin">
            Kod <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{k.classCode ?? '—'}</span> ·{' '}
            <Sayi value={detay.sinif?.ogrenciSayisi ?? 0} /> öğrenci
          </p>
        ) : k.role === 'student' ? (
          <p className="metin">
            {detay.ogretmen
              ? <>{detay.ogretmen.name ?? 'İsimsiz öğretmen'} · <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{detay.ogretmen.classCode ?? '—'}</span></>
              : <span className="silik">Sınıfa kayıtlı değil</span>}
          </p>
        ) : (
          <p className="silik">Yöneticinin sınıfı olmaz.</p>
        )}
      </div>

      {/* ── Etkinlik ── (null = HİÇ KAYIT YOK; sıfır basmak "0 doğru yapmış" gibi okunurdu) */}
      <div className="ku-bolum">
        <div className="etiket">Etkinlik</div>
        {!detay.etkinlik ? (
          <p className="silik">Hiç soru çözmemiş — ölçülecek veri yok.</p>
        ) : (
          <div className="ku-aktif-izgara">
            <div className="s"><span>Toplam cevap</span><span><Sayi value={detay.etkinlik.toplamCevap} /></span></div>
            <div className="s"><span>Son 7 gün</span><span><Sayi value={detay.etkinlik.son7Gun} /></span></div>
            <div className="s"><span>Takip kazanım</span><span><Sayi value={detay.etkinlik.takipEdilenKazanim} /></span></div>
            <div className="s">
              <span>Son görülme</span>
              <span>{detay.etkinlik.sonGorulme ? new Date(detay.etkinlik.sonGorulme).toLocaleDateString('tr-TR') : '—'}</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Öğretmen başvurusu (0021) — bağlam + tek tık onay ── */}
      {detay.basvuru && (
        <BasvuruBolumu
          basvuru={detay.basvuru}
          kullanici={k}
          kendisiMi={kendisiMi}
          onOnayla={() => onRol(k.id, 'teacher')}
          onReddet={() => onBasvuruReddet(k.id)}
        />
      )}

      {/* ── Eylemler ── */}
      <div className="ku-eylemler">
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
        <ProfilDuzeltDialog kullanici={k} onKaydet={(yama) => onProfil(k.id, yama)} />
        <SifreSifirlaDugmesi kullanici={k} onGonder={() => onSifre(k.id, k.name)} />
        <AskiDialog
          kullanici={k}
          kendisiMi={kendisiMi}
          onKaydet={(askida, neden) => onAski(k.id, askida, neden)}
        />
      </div>

      {/* ── Bu hesap üzerindeki işlemler (denetim izi) ── */}
      {detay.denetim.length > 0 && (
        <div className="ku-bolum ku-mini-liste">
          <div className="etiket">Bu hesapta yapılanlar</div>
          {detay.denetim.slice(0, 5).map((x) => (
            <p key={x.id}>{new Date(x.createdAt).toLocaleDateString('tr-TR')} · {x.eylem} · {x.adminAdi ?? 'yönetici'}</p>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Öğretmen başvurusu bölümü — bağlamı (durum · tarih · not) yöneticiye açar ve
 * bekleyen başvuru için TEK TIK onay verir.
 *
 * ⚠️ Onay = MEVCUT rol-değiştirme akışı (`onRol(id, 'teacher')`). Ayrı bir "başvuru
 * onay" ucu YOK: terfi başvuruyu backend'de kapatır (sınıf kodu üretir + is_approved).
 * İyimser güncelleme YOK — buton dönerken devre dışı, sonuç reload ile gelir.
 */
function BasvuruBolumu({ basvuru, kullanici, kendisiMi, onOnayla, onReddet }: {
  basvuru: NonNullable<AdminKullaniciDetayi['basvuru']>
  kullanici: AdminKullaniciDetayi['kullanici']
  kendisiMi: boolean
  onOnayla: () => Promise<void>
  onReddet: () => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)
  const bekliyor = basvuru.durum === 'bekliyor'
  const onaylanabilir = bekliyor && kullanici.role === 'student' && !kendisiMi

  return (
    <div className="ku-bolum">
      <div className="etiket">Öğretmen Başvurusu</div>
      <div className="ku-cipler" style={{ marginTop: 0 }}>
        {/* Rozet ASLA yalnız renk: kelime + ikon taşır. */}
        {bekliyor ? (
          <span className="ku-dchip ku-bekliyor"><Icon name="clock" size={12} color="currentColor" />başvuru bekliyor</span>
        ) : basvuru.durum === 'onaylandi' ? (
          <span className="ku-dchip" style={{ background: 'color-mix(in srgb, var(--dogru) 14%, transparent)', color: 'var(--dogru)', border: 'none' }}>
            <Icon name="check" size={12} color="currentColor" />onaylandı
          </span>
        ) : (
          <span className="ku-dchip" style={{ background: 'color-mix(in srgb, var(--yanlis) 14%, transparent)', color: 'var(--yanlis)', border: 'none' }}>
            <Icon name="close" size={12} color="currentColor" />reddedildi
          </span>
        )}
        {basvuru.tarih && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--metin3)' }}>
            {new Date(basvuru.tarih).toLocaleDateString('tr-TR')}
          </span>
        )}
      </div>

      {basvuru.not && <p className="ku-basvuru-not">“{basvuru.not}”</p>}

      {onaylanabilir && (
        <>
          <button
            type="button"
            className="ku-btn ku-btn-birincil ku-btn-tam"
            style={{ marginTop: 12 }}
            disabled={mesgul}
            onClick={() => { setMesgul(true); void onOnayla().finally(() => setMesgul(false)) }}
          >
            <Icon name="check" size={14} color="currentColor" />
            {mesgul ? 'Onaylanıyor…' : 'Öğretmen olarak onayla'}
          </button>
          {/* Reddin karşılığı onaydır: ikisi de kuyruğu kapatır, biri rolü çevirir
              diğeri ÇEVİRMEZ. Red olmadan bekleyen başvuru kuyrukta sonsuza kadar kalıyordu. */}
          <button
            type="button"
            className="ku-btn ku-btn-soluk ku-btn-tam"
            style={{ marginTop: 8 }}
            disabled={mesgul}
            onClick={() => { setMesgul(true); void onReddet().finally(() => setMesgul(false)) }}
          >
            <Icon name="close" size={14} color="currentColor" />
            Başvuruyu reddet
          </button>
          <p className="ku-kilit-not">
            Onaylarsan hesap öğretmen olur, sınıf kodu üretilir ve panel hemen açılır.
            Reddedersen rol değişmez, yalnız başvuru kapanır. İkisi de geri alınabilir.
          </p>
        </>
      )}
    </div>
  )
}

/**
 * Şifre sıfırlama — TEK TIK, onaysız.
 *
 * ⚠️ Yıkıcı değil: kullanıcının mevcut şifresi geçerli kalır, yalnız e-postasına bir
 * kurtarma bağlantısı gider. Bağlantı YÖNETİCİYE GÖSTERİLMEZ (uç onu döndürmüyor) —
 * şifre sıfırlama yetkisi hesaba girme yetkisi değildir.
 */
function SifreSifirlaDugmesi({ kullanici, onGonder }: {
  kullanici: AdminKullaniciDetayi['kullanici']
  onGonder: () => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)
  return (
    <button
      type="button"
      className="ku-btn ku-btn-soluk"
      disabled={mesgul || !kullanici.email}
      title={kullanici.email ? `${kullanici.email} adresine kurtarma bağlantısı gönder` : 'Bu hesabın e-postası yok'}
      onClick={() => { setMesgul(true); void onGonder().finally(() => setMesgul(false)) }}
    >
      {mesgul ? 'Gönderiliyor…' : 'Şifre sıfırla'}
    </button>
  )
}
