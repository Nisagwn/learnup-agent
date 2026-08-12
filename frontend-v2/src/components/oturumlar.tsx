import { useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { apiGet, apiPost } from '../lib/api.js'
import { useAsync } from '../lib/useAsync'
import { Icon } from '../ui'
import type { CihazCikisYaniti, CihazSatiri, OturumListesiYaniti } from '../lib/types'
import type { AdminOturumlarYaniti } from '../lib/types.admin'

/**
 * OTURUM (CİHAZ) YÖNETİMİ — kullanıcının kendi cihazları + yöneticinin görünümü.
 *
 * ⚠️ BU EKRANIN VAR OLUŞ SEBEBİ: backend'de oturum defteri var (learnup-brain/src/lib/
 * oturum.ts) ve "çıkış yap" artık sunucuda gerçekten bir şey yapıyor — ama kullanıcının
 * "nerelerde açığım?" sorusunu soracağı bir yüzey yoktu. Çalınan token'ın farkına
 * varmanın tek yolu bu liste.
 *
 * ⚠️ `katmanAcik:false` BOŞ LİSTE DEĞİLDİR ve ayrı çizilir. Defter kapalıyken boş listeyi
 * "hiçbir yerde açık değilsin" diye göstermek, kullanıcıya olmayan bir güvenlik hissi
 * satmak olurdu — bu dosyadaki tek kırmızı çizgi budur.
 *
 * ⚠️ STİL: satırların/diyaloğun tamamı kendi <style> bloğunda (ot-*). Dosya iki ayrı
 * ekranda kullanılıyor; ortak parçaları birinin stil bloğuna bağlamak, diğerinde çıplak
 * render demekti. Yalnız KART KABUĞU ev sahibinin sınıfını kullanır — `OturumlarKarti`
 * pf-kart (Ben.tsx), `AdminOturumBolumu` ku-bolum (Kullanicilar.tsx) — ki her ekranda
 * komşu kartlarla aynı görünsün. Renkler index.css değişkenlerinden → iki tema otomatik.
 */

const stil = `
  .ot-liste { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
  .ot-satir { display: flex; align-items: center; gap: 11px; padding: 11px 12px; border-radius: 13px; background: var(--ic); }
  .ot-satir.bu { background: color-mix(in srgb, var(--adacayi) 16%, transparent); }
  .ot-ikon { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; flex: 0 0 auto;
    background: color-mix(in srgb, var(--bilgi) 14%, transparent); }
  .ot-ikon svg { width: 16px; height: 16px; }
  .ot-govde { min-width: 0; flex: 1; }
  .ot-govde b { display: block; font-size: 13.5px; font-weight: 600; color: var(--metin1);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ot-govde span { display: block; font-size: 11.5px; color: var(--metin3); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .ot-cip { flex: 0 0 auto; font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 11px;
    background: color-mix(in srgb, var(--adacayi) 24%, transparent); color: var(--vurgu); }
  .ot-cikar { flex: 0 0 auto; background: transparent; color: var(--metin2); cursor: pointer;
    border: 1px solid var(--cizgi); border-radius: 10px; padding: 6px 12px;
    font-family: Inter, sans-serif; font-weight: 600; font-size: 12.5px; transition: background .15s, color .15s; }
  .ot-cikar:hover { background: color-mix(in srgb, var(--yanlis) 10%, transparent); color: var(--yanlis); }
  .ot-cikar:disabled { opacity: .5; cursor: default; }
  .ot-not { font-size: 11.5px; color: var(--metin3); line-height: 1.55; }
  .ot-alt { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
  .ot-tehlike { background: transparent; color: var(--yanlis); cursor: pointer;
    border: 1px solid color-mix(in srgb, var(--yanlis) 35%, transparent); border-radius: 12px; padding: 7px 13px;
    font-family: Inter, sans-serif; font-weight: 600; font-size: 13px; transition: background .15s; }
  .ot-tehlike:hover { background: color-mix(in srgb, var(--yanlis) 10%, transparent); }
  .ot-tehlike:disabled { opacity: .55; cursor: default; }
  .ot-overlay { position: fixed; inset: 0; z-index: 85; backdrop-filter: blur(4px); background: rgba(12,18,14,.45); }
  .ot-modal { position: fixed; left: 50%; top: 50%; z-index: 86; transform: translate(-50%,-50%);
    width: min(92vw, 400px); padding: 24px; background: var(--cam); border: 1px solid var(--cam-kenar);
    border-radius: 24px; box-shadow: var(--golge-h); backdrop-filter: blur(16px); }
  .ot-modal h3 { font-family: Outfit, sans-serif; font-weight: 700; font-size: 16px; color: var(--metin1); }
  .ot-modal p { margin-top: 8px; font-size: 13px; line-height: 1.6; color: var(--metin2); }
  .ot-modal .dugmeler { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  .ot-vazgec { background: transparent; color: var(--vurgu); cursor: pointer; border-radius: 12px; padding: 7px 13px;
    border: 1px solid color-mix(in srgb, var(--vurgu) 35%, transparent);
    font-family: Inter, sans-serif; font-weight: 600; font-size: 13px; }
  .ot-onayla { border: none; cursor: pointer; border-radius: 12px; padding: 8px 16px; color: #fff;
    background: var(--yanlis); font-family: Outfit, sans-serif; font-weight: 700; font-size: 13px; }
  .ot-onayla:disabled { opacity: .5; cursor: default; }
`

/** "az önce · 12 dk önce · 3 sa önce · 2 gün önce · 14.03.2026" */
function gecenSure(iso: string | null): string {
  if (!iso) return '—'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return '—'
  const dk = Math.floor((Date.now() - t) / 60_000)
  if (dk < 1) return 'az önce'
  if (dk < 60) return `${dk} dk önce`
  const sa = Math.floor(dk / 60)
  if (sa < 24) return `${sa} sa önce`
  const gun = Math.floor(sa / 24)
  if (gun < 7) return `${gun} gün önce`
  return new Date(t).toLocaleDateString('tr-TR')
}

/**
 * Cihaz adı — etiket yoksa UA'nın ilk parçası, o da yoksa "Bilinmeyen cihaz".
 *
 * ⚠️ UYDURMA YOK: backend tanıyamadığı UA için null döner (oturum.ts `cihazEtiketi`).
 * Burada "Chrome" diye tahmin etmek, kullanıcının kendi cihazını yanlış tanımasına ve
 * yanlış oturumu kapatmasına yol açardı.
 */
function cihazAdi(o: { cihaz: string | null; userAgent?: string | null }): string {
  if (o.cihaz) return o.cihaz
  const ua = o.userAgent?.trim()
  if (ua) return ua.length > 42 ? `${ua.slice(0, 42)}…` : ua
  return 'Bilinmeyen cihaz'
}

/**
 * IP gösterimi — ÖZEL AĞ ADRESLERİ HAM GÖSTERİLMEZ; " · Yerel ağ" yazılır.
 *
 * ⚠️ NEDEN: ters vekil arkasında istemcinin gerçek adresi yerel olabilir. Docker'da
 * tarayıcı host makinede açıldığında nginx istemciyi bridge gateway'i (172.18.0.1)
 * olarak görür; bu YANLIŞ bir okuma değil, ağın gerçeği. Ama kullanıcıya `172.18.0.1`
 * göstermek hiçbir şey anlatmıyor, üstelik "bu ben miyim?" sorusunu doğuruyor —
 * oysa listenin tek işi tanıma/tanımama kararını kolaylaştırmak.
 *
 * Genel (public) IP'ler AYNEN gösterilir: asıl ayırt edici bilgi odur, gizlenmez.
 */
function ipEki(ip: string | null | undefined): string {
  const ham = ip?.trim()
  if (!ham) return ''
  // Express IPv4'ü IPv6'ya eşlenmiş biçimde verebilir: "::ffff:172.18.0.1"
  const a = ham.toLowerCase().replace(/^::ffff:/, '')
  const yerel = ' · Yerel ağ'

  if (a === '::1') return yerel                                  // IPv6 loopback
  if (a.startsWith('fe80:')) return yerel                        // IPv6 link-local
  if (/^f[cd]/.test(a)) return yerel                             // IPv6 benzersiz-yerel (ULA)

  const p = a.split('.')
  if (p.length === 4 && p.every((o) => /^\d{1,3}$/.test(o))) {
    const o1 = Number(p[0])
    const o2 = Number(p[1])
    if (o1 === 10 || o1 === 127) return yerel                    // 10/8, loopback
    if (o1 === 192 && o2 === 168) return yerel                   // 192.168/16
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return yerel         // 172.16/12 — Docker buraya düşer
    if (o1 === 169 && o2 === 254) return yerel                   // link-local
  }
  return ` · ${ham}`
}

function DefterKapali() {
  return (
    <p className="ot-not" style={{ marginTop: 10 }}>
      Oturum defteri şu an kapalı (sunucuda <code>SESSION_REDIS_URL</code> tanımlı değil).
      Açık cihazların listelenemiyor — bu, <b>hiçbir yerde açık değilsin</b> anlamına gelmez.
    </p>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   KULLANICI GÖRÜNÜMÜ — Profilim > Ayarlar içinde
   ═══════════════════════════════════════════════════════════════════════════ */

export function OturumlarKarti({ onHepsindenCik }: { onHepsindenCik: () => Promise<void> }) {
  const liste = useAsync<OturumListesiYaniti>(() => apiGet('/oturum/liste'), [])
  const [mesgul, setMesgul] = useState<string | null>(null)

  /**
   * ⚠️ SATIRIN TÜM OTURUMLARI KAPATILIR, yalnız en yenisi değil. Satır artık bir cihazı
   * temsil ediyor ve o cihazın her girişi ayrı bir oturum: tek sid kapatmak, satırı listeden
   * düşürüp geri kalanları sessizce açık bırakırdı — yani kullanıcı kapattığını sanırdı.
   */
  const cikar = async (satirKey: string, sidler: string[], etiket: string): Promise<void> => {
    setMesgul(satirKey)
    try {
      const y: CihazCikisYaniti = await apiPost('/oturum/cihaz-cikis', { sidler })
      toast.success(`${etiket} — ${y.kapatilan} oturum kapatıldı`)
      liste.reload()
    } catch (e: any) {
      toast.error(e?.message ?? 'Cihaz çıkarılamadı')
    } finally {
      setMesgul(null)
    }
  }

  const oturumlar = liste.data?.oturumlar ?? []
  const katmanAcik = liste.data?.katmanAcik ?? true

  return (
    <section className="pf-kart" aria-label="Cihazlarım">
      <style>{stil}</style>
      <div className="pf-baslik">
        <span className="pf-bikon" style={{ background: 'color-mix(in srgb, var(--bilgi) 15%, transparent)' }}>
          <Icon name="shield" size={16} color="var(--bilgi)" />
        </span>
        <h2 className="pf-h2">Cihazlarım</h2>
      </div>

      <p className="ot-not">
        Hesabının açık olduğu cihazlar — <b>her cihaz tek satır</b>. Aynı tarayıcıdan birden çok
        kez giriş yaptıysan girişler tek satırda toplanır ("3 giriş" gibi) ve "Çıkar" hepsini
        birden kapatır. Tanımadığın bir satır varsa çıkar ve şifreni değiştir.
      </p>

      {liste.loading && !liste.data && <p className="ot-not" style={{ marginTop: 10 }}>Yükleniyor…</p>}

      {liste.error && (
        <div className="ot-alt">
          <span className="ot-not">Cihaz listesi alınamadı: {liste.error}</span>
          <button className="pf-dis pf-kucuk" onClick={() => liste.reload()}>Tekrar dene</button>
        </div>
      )}

      {!liste.loading && !liste.error && !katmanAcik && <DefterKapali />}

      {!liste.error && katmanAcik && oturumlar.length > 0 && (
        <div className="ot-liste">
          {oturumlar.map((o) => {
            // Kullanılan oturum HARİÇ, bu cihazdaki eski girişler. Yalnız "bu cihaz"
            // satırında anlamlı: kullanıcı kendi ekranından atılmadan temizlik yapabilsin.
            const eskiler = o.sidler.filter((s) => s !== o.buSid)
            return (
              <div key={o.sid} className={o.buCihaz ? 'ot-satir bu' : 'ot-satir'}>
                <span className="ot-ikon">
                  <Icon name="shield" size={16} color={o.buCihaz ? 'var(--vurgu)' : 'var(--bilgi)'} />
                </span>
                <div className="ot-govde">
                  <b>{cihazAdi(o)}</b>
                  <span>
                    {gecenSure(o.sonGorulme)}
                    {ipEki(o.ip)}
                    {o.oturumSayisi > 1 && ` · ${o.oturumSayisi} giriş`}
                  </span>
                </div>
                {o.buCihaz ? (
                  <>
                    {eskiler.length > 0 && (
                      <button
                        className="ot-cikar"
                        disabled={mesgul === o.sid}
                        onClick={() => cikar(o.sid, eskiler, 'Eski girişler')}
                      >
                        {mesgul === o.sid ? 'Kapatılıyor…' : `Eski girişleri kapat (${eskiler.length})`}
                      </button>
                    )}
                    <span className="ot-cip">Bu cihaz</span>
                  </>
                ) : (
                  <button
                    className="ot-cikar"
                    disabled={mesgul === o.sid}
                    onClick={() => cikar(o.sid, o.sidler, cihazAdi(o))}
                  >
                    {mesgul === o.sid ? 'Çıkarılıyor…' : 'Çıkar'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!liste.loading && !liste.error && katmanAcik && oturumlar.length === 0 && (
        <p className="ot-not" style={{ marginTop: 10 }}>Kayıtlı açık cihaz yok.</p>
      )}

      {katmanAcik && (
        <div className="ot-alt">
          <span className="ot-not">
            Şüphelendiğinde hepsini kapat — bu cihaz dahil her yerden çıkış yapılır.
          </span>
          <HepsindenCikDialog adet={oturumlar.length} onOnay={onHepsindenCik} />
        </div>
      )}
    </section>
  )
}

/**
 * "Tüm cihazlardan çık" onayı.
 *
 * ⚠️ ONAY ŞART: eylem kendi oturumunu da kapatır, yani kullanıcı bir sonraki saniyede
 * giriş ekranına düşer. Tek tıkla olması, yanlışlıkla tıklayanı sınav ortasında dışarı
 * atmak demekti.
 */
function HepsindenCikDialog({ adet, onOnay }: { adet: number; onOnay: () => Promise<void> }) {
  const [mesgul, setMesgul] = useState(false)
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button className="ot-tehlike">Tüm cihazlardan çık</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ot-overlay" />
        <Dialog.Content className="ot-modal">
          <Dialog.Title asChild><h3>Tüm cihazlardan çıkılsın mı?</h3></Dialog.Title>
          <Dialog.Description asChild>
            <p>
              {adet > 1 ? `${adet} cihazdaki` : 'Açık'} oturumun kapatılır — <b>şu an kullandığın cihaz dahil</b>.
              Devam etmek için tekrar giriş yapman gerekir. Çözdüğün sorular, serin ve ilerlemen etkilenmez.
            </p>
          </Dialog.Description>
          <div className="dugmeler">
            <Dialog.Close asChild><button className="ot-vazgec">Vazgeç</button></Dialog.Close>
            <button
              className="ot-onayla"
              disabled={mesgul}
              onClick={async () => {
                setMesgul(true)
                try {
                  await onOnay()
                } catch (e: any) {
                  toast.error(e?.message ?? 'Oturumlar kapatılamadı')
                  setMesgul(false)
                }
              }}
            >
              {mesgul ? 'Kapatılıyor…' : 'Evet, her yerden çık'}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   YÖNETİCİ GÖRÜNÜMÜ — Kullanıcılar > seçili hesabın detayı
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Bir hesabın açık cihazları (salt-okunur liste).
 *
 * ⚠️ `nonce` ile dışarıdan tazelenir: oturum kapatma eylemi ekranın kendi
 * handler'ında (toast + denetim uyarısı orada), bu bölüm yalnız sonucu gösterir.
 */
export function AdminOturumBolumu({ userId, nonce }: { userId: string; nonce: number }) {
  const veri = useAsync<AdminOturumlarYaniti>(() => apiGet(`/admin/kullanici/${userId}/oturumlar`), [userId, nonce])
  const oturumlar = veri.data?.oturumlar ?? []

  return (
    <div className="ku-bolum">
      <style>{stil}</style>
      <div className="etiket">Açık cihazlar</div>
      {veri.loading && !veri.data && <p className="silik">Yükleniyor…</p>}
      {veri.error && <p className="silik">Cihaz listesi alınamadı: {veri.error}</p>}
      {!veri.loading && !veri.error && !veri.data?.katmanAcik && (
        <p className="silik">
          Oturum defteri kapalı (SESSION_REDIS_URL yok) — bu hesabın nerelerde açık olduğu ölçülemiyor.
        </p>
      )}
      {!veri.error && veri.data?.katmanAcik && oturumlar.length === 0 && (
        <p className="silik">Kayıtlı açık oturum yok.</p>
      )}
      {!veri.error && veri.data?.katmanAcik && oturumlar.length > 0 && (
        <div className="ot-liste">
          {oturumlar.map((o) => (
            <div key={o.sid} className="ot-satir">
              <span className="ot-ikon"><Icon name="shield" size={16} color="var(--bilgi)" /></span>
              <div className="ot-govde">
                <b>{cihazAdi(o)}</b>
                <span>
                  {gecenSure(o.sonGorulme)}{ipEki(o.ip)}
                  {o.oturumSayisi > 1 && ` · ${o.oturumSayisi} giriş`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * "Tüm oturumları kapat" — askının hafif hâli.
 *
 * ⚠️ ASKI DEĞİLDİR ve diyalog bunu açıkça söyler: hesap açık kalır, kullanıcı yeniden
 * giriş yapıp devam edebilir. Çalıntı token şüphesinde doğru araç budur; kalıcı durdurma
 * askı düğmesidir. İkisini aynı cümlede ayırmazsak yönetici yanlışını sonradan öğrenir.
 */
export function OturumKapatDialog({ ad, onKapat }: {
  ad: string | null
  onKapat: () => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="ku-btn">Oturumları kapat</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ot-overlay" />
        <Dialog.Content className="ot-modal">
          <style>{stil}</style>
          <Dialog.Title asChild><h3>Tüm oturumlar kapatılsın mı?</h3></Dialog.Title>
          <Dialog.Description asChild>
            <p>
              <b>{ad ?? 'Bu kullanıcı'}</b> tüm cihazlarından çıkarılır ve yeniden giriş yapması gerekir.
              Hesap <b>askıya alınmaz</b> — verisi, sınıf bağı ve ilerlemesi olduğu gibi kalır,
              kullanıcı hemen tekrar girebilir. İşlem denetim defterine yazılır.
            </p>
          </Dialog.Description>
          <div className="dugmeler">
            <Dialog.Close asChild><button className="ot-vazgec">Vazgeç</button></Dialog.Close>
            <Dialog.Close asChild>
              <button
                className="ot-onayla"
                disabled={mesgul}
                onClick={async () => {
                  setMesgul(true)
                  try { await onKapat() } finally { setMesgul(false) }
                }}
              >
                {mesgul ? 'Kapatılıyor…' : 'Evet, kapat'}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
