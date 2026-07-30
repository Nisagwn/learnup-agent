import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { apiGet, apiPost, apiPut } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../lib/auth'
import { useAsync } from '../../lib/useAsync'
import { cn } from '../../lib/cn'
import { Icon } from '../../ui'
import type {
  AdminOzgunlukYaniti, EsikDegisYanit, EvalTetikYanit, OnbellekDusYanit,
} from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton } from '../../components/ui'
import { Reveal } from '../../components/fx'

/**
 * AYARLAR — yöneticinin kendi hesabı + sistem kolları (0025).
 *
 * ⚠️ BU EKRAN NEDEN VAR: yöneticinin hesabına dokunabileceği HİÇBİR yer yoktu.
 * `/ben` öğrenci ekranı (rozet, lig, bahçe) ve nav'da yöneticiye kapalı; profil
 * menüsünde de yalnız "Çıkış" vardı. Yönetici adını düzeltemiyor, şifresini
 * değiştiremiyordu — sistemi yöneten hesap kendi kendini yönetemiyordu.
 *
 * ⚠️ EŞİK EDİTÖRÜ BURADA, Özgünlük ekranında DEĞİL: o ekran bariyeri AÇIKLAR
 * (ölçüm, ispat tablosu, dürüst sınır); burası onu DEĞİŞTİRİR. Açıklama ile
 * müdahaleyi ayırmak, "okurken yanlışlıkla değiştirme" riskini kaldırır.
 */
export function Ayarlar() {
  return (
    <Sayfa>
      <style>{`
        .ay-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); }
        .ay-baslik { padding: 16px 22px; }
        .ay-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px); color: var(--metin1); }
        .ay-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 620px; }

        .ay-izgara { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 20px; align-items: start; }
        @media (max-width: 1020px) { .ay-izgara { grid-template-columns: 1fr; } }
        .ay-kolon { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

        .ay-panel { padding: 18px 22px; }
        .ay-panel h3 { font-family: Outfit, sans-serif; font-size: 14px; font-weight: 700; color: var(--metin1); }
        .ay-panel .aciklama { font-size: 12px; color: var(--metin3); line-height: 1.55; margin-top: 4px; }
        .ay-bolum { margin-top: 15px; }

        .ay-alan { display: block; margin-top: 11px; }
        .ay-alan .etiket { display: block; font-size: 10px; font-weight: 600; letter-spacing: .1em;
          text-transform: uppercase; color: var(--metin3); margin-bottom: 5px; }
        .ay-alan input { width: 100%; font-family: Inter, sans-serif; font-size: 13px; color: var(--metin1);
          background: var(--v0); border: 1.5px solid var(--cam-kenar); border-radius: 11px;
          padding: 10px 12px; min-height: 44px; outline: none; }
        .ay-alan input:focus { border-color: var(--adacayi); }
        .ay-alan input:disabled { opacity: .6; }
        .ay-ipucu { font-size: 11px; color: var(--metin3); line-height: 1.5; margin-top: 6px; }

        .ay-btn { font-family: Outfit, sans-serif; font-weight: 600; font-size: 12px; border-radius: 11px;
          cursor: pointer; border: none; min-height: 42px; padding: 10px 16px; margin-top: 13px;
          display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
        .ay-btn:disabled { opacity: .5; cursor: default; }
        .ay-btn-birincil { background: var(--cta); color: #F2F7F3; }
        .ay-btn-birincil:not(:disabled):hover { box-shadow: var(--parilti); }
        .ay-btn-soluk { background: var(--v0); color: var(--metin2); border: 1px solid var(--cam-kenar); }
        .ay-btn-soluk:not(:disabled):hover { color: var(--metin1); border-color: var(--adacayi); }
        .dark .ay-btn-birincil { color: #EAF4EC; }

        .ay-esik-satir { display: flex; align-items: center; gap: 10px; padding: 9px 0;
          border-bottom: 1px solid var(--cam-kenar); }
        .ay-esik-satir:last-child { border-bottom: none; }
        .ay-esik-satir .ders { flex: 1; min-width: 0; font-size: 12.5px; color: var(--metin1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .ay-esik-satir .adet { font-family: 'JetBrains Mono', monospace; font-size: 10.5px; color: var(--metin3); }
        .ay-esik-satir input { width: 74px; font-family: 'JetBrains Mono', monospace; font-size: 12px;
          color: var(--metin1); background: var(--v0); border: 1.5px solid var(--cam-kenar);
          border-radius: 10px; padding: 7px 9px; min-height: 38px; outline: none; text-align: center; }
        .ay-esik-satir input:focus { border-color: var(--adacayi); }
        .ay-esik-satir .taban { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px;
          background: var(--v0); color: var(--metin3); }
        .ay-esik-kaydet { font-family: Outfit, sans-serif; font-size: 11px; font-weight: 600; cursor: pointer;
          border: none; border-radius: 9px; padding: 7px 11px; min-height: 38px; background: var(--cta); color: #F2F7F3; }
        .ay-esik-kaydet:disabled { opacity: .35; cursor: default; }

        .ay-uyari { margin-top: 12px; border: 1px solid color-mix(in srgb, var(--uyari) 28%, transparent);
          background: color-mix(in srgb, var(--uyari) 7%, transparent); border-radius: 12px;
          padding: 10px 12px; font-size: 11.5px; line-height: 1.55; color: var(--uyari); }
        .ay-ops { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 13px; }
        .ay-sonuc { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3);
          line-height: 1.6; margin-top: 10px; }
      `}</style>

      <Reveal>
        <section className="ay-kart ay-baslik">
          <h1>Ayarlar</h1>
          <p className="alt">
            Kendi hesabın ve sistemin ayar kolları. Eşik değişimleri ile ops eylemleri denetim
            defterine işlenir.
          </p>
        </section>
      </Reveal>

      <div className="ay-izgara">
        <div className="ay-kolon">
          <Reveal delay={0.06}><HesapPaneli /></Reveal>
          <Reveal delay={0.1}><SifrePaneli /></Reveal>
        </div>
        <div className="ay-kolon">
          <Reveal delay={0.14}><EsikPaneli /></Reveal>
          <Reveal delay={0.18}><OpsPaneli /></Reveal>
        </div>
      </div>
    </Sayfa>
  )
}

/* ── Kendi künyesi ───────────────────────────────────────────────────────── */

function HesapPaneli() {
  const { profile, user, refreshProfile } = useAuth()
  const [ad, setAd] = useState('')
  const [mesgul, setMesgul] = useState(false)

  useEffect(() => { setAd(profile?.name ?? '') }, [profile?.name])

  const kaydet = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const yeni = ad.trim()
    if (!yeni) { toast.error('Ad boş olamaz'); return }
    if (yeni === (profile?.name ?? '')) { toast.info('Değişiklik yok'); return }
    setMesgul(true)
    try {
      // ⚠️ KENDİ SATIRI → doğrudan Supabase. `name` 0019 beyaz listesinde (istemci
      // yazabilir); rol/onay gibi YETKİ alanları o listede DEĞİL ve buradan yazılamaz.
      // Yönetim ucu (/admin/kullanici/:id) BAŞKASININ künyesi içindir.
      const { error } = await supabase.from('profiles').update({ name: yeni }).eq('id', user!.id)
      if (error) throw new Error(error.message)
      await refreshProfile()
      toast.success('Adın güncellendi')
    } catch (err: any) {
      toast.error(err?.message ?? 'Ad güncellenemedi')
    } finally {
      setMesgul(false)
    }
  }

  return (
    <form className="ay-kart ay-panel" onSubmit={kaydet}>
      <h3>Hesabım</h3>
      <p className="aciklama">Panelde ve denetim defterinde görünen adın.</p>

      <label className="ay-alan">
        <span className="etiket">Ad</span>
        <input value={ad} onChange={(e) => setAd(e.target.value)} maxLength={80} placeholder="Adın" />
      </label>
      <label className="ay-alan">
        <span className="etiket">E-posta</span>
        <input value={user?.email ?? ''} disabled />
      </label>
      <p className="ay-ipucu">
        E-posta değişimi kimlik doğrulama gerektirir; şu an panelden yapılamıyor.
      </p>

      <button type="submit" className="ay-btn ay-btn-birincil" disabled={mesgul}>
        <Icon name="check" size={14} color="currentColor" />
        {mesgul ? 'Kaydediliyor…' : 'Kaydet'}
      </button>
    </form>
  )
}

/* ── Şifre ───────────────────────────────────────────────────────────────── */

function SifrePaneli() {
  const [sifre, setSifre] = useState('')
  const [tekrar, setTekrar] = useState('')
  const [mesgul, setMesgul] = useState(false)

  const degistir = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (sifre.length < 8) { toast.error('Şifre en az 8 karakter olmalı'); return }
    if (sifre !== tekrar) { toast.error('Şifreler eşleşmiyor'); return }
    setMesgul(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: sifre })
      if (error) throw new Error(error.message)
      setSifre(''); setTekrar('')
      toast.success('Şifren değiştirildi')
    } catch (err: any) {
      toast.error(err?.message ?? 'Şifre değiştirilemedi')
    } finally {
      setMesgul(false)
    }
  }

  return (
    <form className="ay-kart ay-panel" onSubmit={degistir}>
      <h3>Şifre</h3>
      <p className="aciklama">
        Değişiklik anında geçerli olur. Diğer hesapların şifresini sıfırlamak için Kullanıcılar
        ekranını kullan — orada bağlantı yalnız kullanıcının e-postasına gider.
      </p>

      <label className="ay-alan">
        <span className="etiket">Yeni şifre</span>
        <input type="password" value={sifre} onChange={(e) => setSifre(e.target.value)} autoComplete="new-password" />
      </label>
      <label className="ay-alan">
        <span className="etiket">Yeni şifre (tekrar)</span>
        <input type="password" value={tekrar} onChange={(e) => setTekrar(e.target.value)} autoComplete="new-password" />
      </label>

      <button type="submit" className="ay-btn ay-btn-birincil" disabled={mesgul || !sifre}>
        <Icon name="shield" size={14} color="currentColor" />
        {mesgul ? 'Değiştiriliyor…' : 'Şifreyi değiştir'}
      </button>
    </form>
  )
}

/* ── Özgünlük eşikleri ───────────────────────────────────────────────────── */

function EsikPaneli() {
  const oz = useAsync<AdminOzgunlukYaniti>(() => apiGet('/admin/ozgunluk'), [])
  const [taslak, setTaslak] = useState<Record<string, string>>({})
  const [mesgul, setMesgul] = useState<string | null>(null)

  const kaydet = async (subject: string, mevcut: number): Promise<void> => {
    const yeni = Number(taslak[subject])
    if (!Number.isFinite(yeni) || yeni <= 0 || yeni >= 1) {
      toast.error('Eşik 0 ile 1 arasında olmalı (ör. 0.62)')
      return
    }
    // ⚠️ DÜŞÜRME AÇIK ONAY İSTER: eşiği düşürmek kalite bariyerini gevşetir ve
    // bir daha geri alınsa bile o aralıkta üretilmiş sorular havuzda kalır.
    if (yeni < mevcut) {
      const onay = window.confirm(
        `${subject} eşiğini ${mevcut} → ${yeni} DÜŞÜRÜYORSUN.\n\n` +
        'Daha düşük eşik, birbirine daha çok benzeyen soruların havuza girmesine izin verir. ' +
        'Bu değişim denetim defterine "düşürüldü" olarak işlenir.\n\nDevam edilsin mi?',
      )
      if (!onay) return
    }
    setMesgul(subject)
    try {
      const y: EsikDegisYanit = await apiPut('/admin/ozgunluk/esik', { subject, esik: yeni })
      toast.success(`${subject}: ${y.onceki ?? 'taban'} → ${y.yeni}`)
      if (!y.denetimYazildi) {
        toast.warning('Eşik değişti ama denetim defterine yazılamadı — 0020 uygulanmamış olabilir.', { duration: 9000 })
      }
      setTaslak((t) => { const k = { ...t }; delete k[subject]; return k })
      oz.reload()
    } catch (err: any) {
      toast.error(err?.message ?? 'Eşik güncellenemedi', { duration: 7000 })
    } finally {
      setMesgul(null)
    }
  }

  if (oz.loading && !oz.data) return <section className="ay-kart" style={{ height: 260 }} />
  if (oz.error) {
    return (
      <section className="ay-kart ay-panel">
        <h3>Özgünlük Eşikleri</h3>
        <p className="aciklama">Eşikler alınamadı: {oz.error}</p>
        <GlowButton className="mt-3" variant="outline" onClick={() => oz.reload()}>Tekrar dene</GlowButton>
      </section>
    )
  }

  const d = oz.data!
  return (
    <section className="ay-kart ay-panel">
      <h3>Özgünlük Eşikleri</h3>
      <p className="aciklama">
        Aday soru, aynı dersteki en yakın komşusuna bu eşiğin üstünde benziyorsa <strong>elenir</strong>.
        Eşiği yükseltmek kapıyı gevşetir, düşürmek sıkılaştırır — değerler gerçek ÖSYM'nin
        en-yakın-komşu p99'undan türetildi.
      </p>

      {/* Eşikler DB'den okunamıyorsa DÜZENLEME YANILSAMASI ÜRETME: yönetici burada
          değiştirdiğini sanıp yürürlükte olmayan bir değer kaydeder. */}
      {!d.kaynakDB && (
        <div className="ay-uyari">
          Eşikler şu an <strong>koddaki varsayılanlardan</strong> okunuyor —
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}> ozgunluk_esikleri</span> tablosu boş
          ya da erişilemiyor (0025 uygulanmamış olabilir). Kaydettiğin değer tablo gelene kadar
          yürürlüğe girmez.
        </div>
      )}

      <div className="ay-bolum">
        {d.esikler.map((e) => {
          const taslakDeger = taslak[e.subject]
          const degisti = taslakDeger !== undefined && Number(taslakDeger) !== e.esik
          return (
            <div key={e.subject} className="ay-esik-satir">
              <span className="ders">
                {e.subject}{' '}
                <span className="adet">· {e.havuzAdedi} soru</span>
              </span>
              {e.taban && <span className="taban">taban</span>}
              <input
                type="number"
                step="0.01"
                min="0.01"
                max="0.99"
                value={taslakDeger ?? String(e.esik)}
                onChange={(ev) => setTaslak((t) => ({ ...t, [e.subject]: ev.target.value }))}
                aria-label={`${e.subject} özgünlük eşiği`}
              />
              <button
                type="button"
                className="ay-esik-kaydet"
                disabled={!degisti || mesgul === e.subject}
                onClick={() => kaydet(e.subject, e.esik)}
              >
                {mesgul === e.subject ? '…' : 'Kaydet'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/* ── Ops ─────────────────────────────────────────────────────────────────── */

function OpsPaneli() {
  const [mesgul, setMesgul] = useState<'onbellek' | 'eval' | null>(null)
  const [sonuc, setSonuc] = useState<string | null>(null)

  const onbellekDus = async (): Promise<void> => {
    setMesgul('onbellek')
    try {
      const y: OnbellekDusYanit = await apiPost('/admin/onbellek/dus', {})
      // Sonuç SAYIYLA gösterilir: basıldıktan sonra bir şey olup olmadığı
      // bilinemeyen bir ops düğmesi, olmayan bir düğmeden farksızdır.
      setSonuc(`panel ${y.panel} · kimlik ${y.kimlik} · sınıf ${y.sinif} · redis ${y.redis} anahtar düştü`)
      toast.success('Önbellekler düşürüldü')
    } catch (err: any) {
      toast.error(err?.message ?? 'Önbellek düşürülemedi')
    } finally {
      setMesgul(null)
    }
  }

  const evalKostur = async (): Promise<void> => {
    setMesgul('eval')
    try {
      const y: EvalTetikYanit = await apiPost('/admin/eval/kosum', {})
      setSonuc(`eval görevi kuyruğa alındı: ${y.taskId.slice(0, 8)}…`)
      toast.success('Eval ölçümü kuyruğa alındı — sonuç Yönetim ekranında görünecek', { duration: 7000 })
    } catch (err: any) {
      toast.error(err?.message ?? 'Eval tetiklenemedi', { duration: 7000 })
    } finally {
      setMesgul(null)
    }
  }

  return (
    <section className="ay-kart ay-panel">
      <h3>Sistem</h3>
      <p className="aciklama">
        Panel sayıları eskiyse önbelleği düşür. Eval ölçümü havuzun yapısal kalitesini yeniden
        ölçer; dakikalar sürer ve arka planda koşar.
      </p>

      <div className="ay-ops">
        <button
          type="button"
          className={cn('ay-btn ay-btn-soluk')}
          disabled={mesgul !== null}
          onClick={onbellekDus}
        >
          <Icon name="scan" size={14} color="currentColor" />
          {mesgul === 'onbellek' ? 'Düşürülüyor…' : 'Önbelleği düşür'}
        </button>
        <button
          type="button"
          className={cn('ay-btn ay-btn-soluk')}
          disabled={mesgul !== null}
          onClick={evalKostur}
        >
          <Icon name="gauge" size={14} color="currentColor" />
          {mesgul === 'eval' ? 'Kuyruğa alınıyor…' : 'Eval ölçümünü koştur'}
        </button>
      </div>

      {sonuc && <p className="ay-sonuc">{sonuc}</p>}
    </section>
  )
}
