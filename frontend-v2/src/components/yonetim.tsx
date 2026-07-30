import { useMemo, useState, type ReactNode } from 'react'

import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { BosDurum, Sayi } from './cekirdek'
import { EYLEM_ADI } from '../lib/types.admin'
import type {
  AdminKullaniciDetayi, AdminKullaniciSatiri, DenetimSatiri,
} from '../lib/types.admin'

/* ═══════════════════════════════════════════════════════════════════════════
   YÖNETİM — KULLANICI & DENETİM BİLEŞENLERİ  (FİDAN v1.2 inline desen)

   kule.tsx sistemin DURUMUNU çizer (havuz, eval, ajanlar); burası KİŞİLERİ ve
   onlar üzerinde yapılmış işlemleri. Ayrı dosya, aynı admin chunk'ı: öğrenci ve
   öğretmen bu koddan tek bayt indirmez.

   ⚠️ STİL KAYNAĞI: bu bileşenlerin `ku-*` sınıfları Kullanicilar.tsx içindeki tek
   <style> bloğunda tanımlıdır (onaylı önizleme: docs/design/onizleme/kullanicilar.html).
   Bu bileşenler YALNIZ Kullanicilar ekranında render edilir — dialog'lar Radix Portal
   ile body'ye taşınsa da <style> belge-global olduğu için sınıflar orada da geçerlidir.

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
 * Rol rozeti — ASLA yalnız renk: her rozet kelimeyi de taşır. Onaysız öğretmen
 * AYRI bir "onaysız" rozeti alır (önizleme deseni), tek amber rozete gömülmez.
 * (kehribar/brass KULLANILMAZ: o ton ÖSYM mührünün kimliğine ayrılmış.)
 */
export function RolRozeti({ rol, onaysiz }: { rol: RolAdi; onaysiz?: boolean }) {
  if (rol === 'admin') return <span className="ku-rrozet ku-r-admin">yönetici</span>
  if (rol === 'teacher') {
    return onaysiz ? (
      <span className="ku-rozet-grup">
        <span className="ku-rrozet ku-r-teacher">öğretmen</span>
        <span className="ku-rrozet ku-r-onaysiz">onaysız</span>
      </span>
    ) : (
      <span className="ku-rrozet ku-r-teacher">öğretmen</span>
    )
  }
  return <span className="ku-rrozet ku-r-student">öğrenci</span>
}

/** Sınıf sütunu — role göre kod / öğrenci sayısı / başvuru işareti. */
function sinifHucresi(k: AdminKullaniciSatiri): ReactNode {
  if (k.role === 'teacher') {
    // Onaysız öğretmenin henüz sınıfı yok → yalnız kod; onaylıda öğrenci sayısı da.
    return k.isApproved && k.ogrenciSayisi != null
      ? <>kod {k.classCode ?? '—'} · <Sayi value={k.ogrenciSayisi} /> öğrenci</>
      : <>kod {k.classCode ?? '—'}</>
  }
  if (k.role === 'student' && k.basvuruDurumu === 'bekliyor') return <>— · başvuru bekliyor</>
  return '—'
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
    <div style={{ overflowX: 'auto' }}>
      <table className="ku-utablo" style={{ minWidth: 560 }}>
        <thead>
          <tr>
            <th scope="col">Hesap</th>
            <th scope="col">Rol</th>
            <th scope="col">Sınıf</th>
            <th scope="col" aria-label="İşlem" />
          </tr>
        </thead>
        <tbody>
          {satirlar.map((k) => {
            const secili = k.id === seciliId
            const onayBekliyor = k.role === 'teacher' && !k.isApproved
            return (
              <tr key={k.id} className={secili ? 'ku-secili' : undefined}>
                <td>
                  {/* Tıklanabilir <button>, tıklanabilir <tr> DEĞİL: Tab+Enter doğal çalışsın. */}
                  <button type="button" className="ad-btn" onClick={() => onSec(k.id)}>
                    <b>{k.name ?? 'İsimsiz hesap'}</b>
                    <span className="epost">{k.email ?? '—'}</span>
                  </button>
                </td>
                <td>
                  <span className="ku-rozet-grup">
                    <RolRozeti rol={k.role} onaysiz={onayBekliyor} />
                    {/* Askı rozeti ROLDEN AYRI (0025): askı bir yetki seviyesi değil,
                        erişimin tümden kesilmesidir. Rol rozetine gömmek ikisini karıştırırdı. */}
                    {k.askidaMi && <span className="ku-rrozet ku-r-askida">askıda</span>}
                  </span>
                </td>
                <td className="epost">{sinifHucresi(k)}</td>
                <td style={{ textAlign: 'right' }}>
                  {k.role === 'teacher' && <OnayDugmesi kullanici={k} onOnay={onOnay} />}
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
 * VERMEK yıkıcı değil — tek tık, diyalog yok (satır-içi "Onayla").
 */
function OnayDugmesi({ kullanici, onOnay }: {
  kullanici: AdminKullaniciSatiri
  onOnay: (k: AdminKullaniciSatiri, onayli: boolean) => Promise<void>
}) {
  const [mesgul, setMesgul] = useState(false)

  if (!kullanici.isApproved) {
    return (
      <button
        type="button"
        className="ku-mini-onay"
        disabled={mesgul}
        onClick={() => { setMesgul(true); void onOnay(kullanici, true).finally(() => setMesgul(false)) }}
      >
        {mesgul ? 'Onaylanıyor…' : 'Onayla'}
      </button>
    )
  }

  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button type="button" className="ku-mini-kaldir">Onayı kaldır</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ku-overlay" />
        <Dialog.Content className="ku-modal">
          <Dialog.Title>Onay kaldırılsın mı?</Dialog.Title>
          <Dialog.Description className="aciklama">
            <strong>{kullanici.name ?? 'Bu öğretmen'}</strong> en geç 60 saniye içinde
            öğretmen panelinden çıkar: sınıf listesi, ısı haritası ve öğrenci röntgenleri
            erişilemez olur. Öğrenciler sınıfta kalır — bağ kopmaz, yalnız görüş kapanır.
          </Dialog.Description>
          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="ku-btn ku-btn-soluk">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="ku-btn ku-btn-tehlike"
                disabled={mesgul}
                onClick={() => { setMesgul(true); void onOnay(kullanici, false).finally(() => setMesgul(false)) }}
              >
                Onayı kaldır
              </button>
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
      <p className="ku-kilit-kutu">
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
        <button type="button" className="ku-btn ku-btn-soluk">Rolü değiştir</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ku-overlay" />
        <Dialog.Content className="ku-modal">
          <Dialog.Title>Rol değiştir</Dialog.Title>
          <Dialog.Description className="aciklama">
            <strong>{kullanici.name ?? kullanici.email ?? 'Bu hesap'}</strong> şu an{' '}
            {ROL_ETIKET[kullanici.role]}.
          </Dialog.Description>

          <div className="ku-segment ku-segment-genis">
            {(['student', 'teacher', 'admin'] as RolAdi[]).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={hedef === r}
                className={hedef === r ? 'ku-aktif' : undefined}
                onClick={() => setHedef(r)}
              >
                {ROL_ETIKET[r]}
              </button>
            ))}
          </div>

          {uyari && <p className="uyari-kutu">{uyari}</p>}

          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="ku-btn ku-btn-soluk">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="ku-btn ku-btn-birincil"
                disabled={!degisti || mesgul}
                onClick={() => {
                  if (!degisti) return
                  setMesgul(true)
                  void onKaydet(hedef).finally(() => setMesgul(false))
                }}
              >
                {ROL_ETIKET[hedef]} yap
              </button>
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
    return 'Yönetici hesap açar, rol değiştirir, hesap askıya alır, her sınıfa öğretmen adına ' +
      'girip ödev atayabilir ve havuzdan soru düşürebilir. Bu yetkiyi geri almak için başka ' +
      'bir yöneticiye ihtiyaç duyulur.'
  }
  return null
}

/* ── Hesap yaşam döngüsü (0025) ──────────────────────────────────────────── */

/**
 * ASKI — hesabı durdurur, SİLMEZ.
 *
 * ⚠️ Kalıcı silme bilinçli olarak yok (kullanıcı kararı 2026-07-24): yanlış askı bir
 * özür, yanlış silme onarılamaz bir kayıptır. Askı hiçbir sınıf/öğretmen bağını
 * koparmaz; kaldırıldığı an kullanıcı bıraktığı yerden devam eder.
 *
 * ⚠️ GEREKÇE ZORUNLU. "Hesabım neden kapalı?" sorusunun cevabı defterde yazmıyorsa
 * askı, keyfî bir kapatmadan ayırt edilemez.
 */
export function AskiDialog({ kullanici, kendisiMi, onKaydet }: {
  kullanici: AdminKullaniciDetayi['kullanici']
  kendisiMi: boolean
  onKaydet: (askida: boolean, neden: string | null) => Promise<void>
}) {
  const [neden, setNeden] = useState('')
  const [mesgul, setMesgul] = useState(false)
  const askida = kullanici.askidaMi

  if (kendisiMi) {
    return (
      <p className="ku-kilit-not">
        Kendi hesabını askıya alamazsın — kendini dışarı kilitlemenin geri dönüşü elle SQL'dir.
      </p>
    )
  }

  return (
    <Dialog.Root onOpenChange={(a) => { if (!a) setNeden('') }}>
      <Dialog.Trigger asChild>
        <button type="button" className={askida ? 'ku-btn ku-btn-soluk' : 'ku-btn ku-btn-tehlike'}>
          {askida ? 'Askıyı kaldır' : 'Askıya al'}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ku-overlay" />
        <Dialog.Content className="ku-modal">
          <Dialog.Title>{askida ? 'Askıyı kaldır' : 'Hesabı askıya al'}</Dialog.Title>
          <Dialog.Description className="aciklama">
            {askida ? (
              <><strong>{kullanici.name ?? 'Bu hesap'}</strong> yeniden giriş yapabilecek ve bıraktığı
              yerden devam edecek.</>
            ) : (
              <><strong>{kullanici.name ?? 'Bu hesap'}</strong> giriş yapabilir ama hiçbir ekranı
              açamaz. Verisi, sınıf bağı ve ilerlemesi olduğu gibi kalır.</>
            )}
          </Dialog.Description>

          {!askida && (
            <label className="ku-alan" style={{ display: 'block', marginTop: 14 }}>
              <span className="etiket" style={{
                display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '.1em',
                textTransform: 'uppercase', color: 'var(--metin3)', marginBottom: 5,
              }}>
                Gerekçe (zorunlu)
              </span>
              <input
                value={neden}
                onChange={(e) => setNeden(e.target.value)}
                maxLength={500}
                placeholder="Örn. tekrarlanan kötüye kullanım bildirimi"
                style={{
                  width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--metin1)',
                  background: 'var(--v0)', border: '1.5px solid var(--cam-kenar)', borderRadius: 11,
                  padding: '10px 12px', minHeight: 44, outline: 'none',
                }}
              />
            </label>
          )}

          {!askida && (
            <p className="uyari-kutu">
              Askı kalıcı silme DEĞİLDİR ve istediğin an kaldırılabilir. Gerekçe denetim defterine yazılır.
            </p>
          )}

          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="ku-btn ku-btn-soluk">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className={askida ? 'ku-btn ku-btn-birincil' : 'ku-btn ku-btn-tehlike'}
                disabled={mesgul || (!askida && !neden.trim())}
                onClick={() => {
                  if (!askida && !neden.trim()) return
                  setMesgul(true)
                  void onKaydet(!askida, askida ? null : neden.trim()).finally(() => setMesgul(false))
                }}
              >
                {askida ? 'Askıyı kaldır' : 'Askıya al'}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Künye düzeltme — YETKİ alanları (rol/onay/sınıf) buradan YAZILMAZ, ayrı uçları var. */
export function ProfilDuzeltDialog({ kullanici, onKaydet }: {
  kullanici: AdminKullaniciDetayi['kullanici']
  onKaydet: (yama: Record<string, string | null>) => Promise<void>
}) {
  const bosla = (): Record<string, string> => ({
    name: kullanici.name ?? '',
    school: kullanici.school ?? '',
    grade: kullanici.grade ?? '',
    student_class: kullanici.studentClass ?? '',
  })
  const [form, setForm] = useState(bosla)
  const [mesgul, setMesgul] = useState(false)

  const alanlar: Array<[keyof ReturnType<typeof bosla>, string]> = [
    ['name', 'Ad'],
    ['school', 'Okul'],
    ['grade', 'Sınıf düzeyi'],
    ['student_class', 'Şube'],
  ]

  return (
    <Dialog.Root onOpenChange={(a) => { if (a) setForm(bosla()) }}>
      <Dialog.Trigger asChild>
        <button type="button" className="ku-btn ku-btn-soluk">Künyeyi düzelt</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ku-overlay" />
        <Dialog.Content className="ku-modal">
          <Dialog.Title>Künyeyi düzelt</Dialog.Title>
          <Dialog.Description className="aciklama">
            Yalnız kimlik bilgileri. Rol, onay ve sınıf bağı buradan değişmez — her birinin
            kendi kapısı ve kendi korumaları var.
          </Dialog.Description>

          <div style={{ marginTop: 12 }}>
            {alanlar.map(([alan, etiket]) => (
              <label key={alan} style={{ display: 'block', marginTop: 10 }}>
                <span style={{
                  display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '.1em',
                  textTransform: 'uppercase', color: 'var(--metin3)', marginBottom: 5,
                }}>
                  {etiket}
                </span>
                <input
                  value={form[alan]}
                  onChange={(e) => setForm((f) => ({ ...f, [alan]: e.target.value }))}
                  maxLength={200}
                  style={{
                    width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--metin1)',
                    background: 'var(--v0)', border: '1.5px solid var(--cam-kenar)', borderRadius: 11,
                    padding: '10px 12px', minHeight: 44, outline: 'none',
                  }}
                />
              </label>
            ))}
          </div>

          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="ku-btn ku-btn-soluk">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="ku-btn ku-btn-birincil"
                disabled={mesgul}
                onClick={() => {
                  setMesgul(true)
                  // Boş string → null: "temizle" ile "dokunma" ayrımını sunucu yapar,
                  // iki farklı "boş" değeri taşımayız.
                  const yama = Object.fromEntries(
                    Object.entries(form).map(([k, v]) => [k, v.trim() || null]),
                  )
                  void onKaydet(yama).finally(() => setMesgul(false))
                }}
              >
                Kaydet
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Davetle hesap açma — şifre YÖNETİCİ TARAFINDAN BELİRLENMEZ, davet bağlantısı gider. */
export function HesapAcDialog({ onKaydet }: {
  onKaydet: (veri: { email: string; name: string; rol: 'student' | 'teacher'; school: string | null }) => Promise<void>
}) {
  const bos = { email: '', name: '', rol: 'student' as 'student' | 'teacher', school: '' }
  const [f, setF] = useState(bos)
  const [mesgul, setMesgul] = useState(false)
  const gecerli = f.email.includes('@') && f.name.trim().length > 0

  const alan = (etiket: string, deger: string, yaz: (v: string) => void, tur = 'text'): ReactNode => (
    <label style={{ display: 'block', marginTop: 10 }}>
      <span style={{
        display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '.1em',
        textTransform: 'uppercase', color: 'var(--metin3)', marginBottom: 5,
      }}>
        {etiket}
      </span>
      <input
        type={tur}
        value={deger}
        onChange={(e) => yaz(e.target.value)}
        maxLength={200}
        style={{
          width: '100%', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'var(--metin1)',
          background: 'var(--v0)', border: '1.5px solid var(--cam-kenar)', borderRadius: 11,
          padding: '10px 12px', minHeight: 44, outline: 'none',
        }}
      />
    </label>
  )

  return (
    <Dialog.Root onOpenChange={(a) => { if (a) setF(bos) }}>
      <Dialog.Trigger asChild>
        <button type="button" className="ku-btn ku-btn-birincil">
          <Icon name="check" size={14} color="currentColor" />
          Hesap aç
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ku-overlay" />
        <Dialog.Content className="ku-modal">
          <Dialog.Title>Hesap aç</Dialog.Title>
          <Dialog.Description className="aciklama">
            Kullanıcıya davet e-postası gider ve şifresini kendisi kurar. Yönetici hiçbir an
            şifreyi görmez.
          </Dialog.Description>

          <div className="ku-segment ku-segment-genis">
            {(['student', 'teacher'] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={f.rol === r}
                className={f.rol === r ? 'ku-aktif' : undefined}
                onClick={() => setF((x) => ({ ...x, rol: r }))}
              >
                {r === 'student' ? 'Öğrenci' : 'Öğretmen'}
              </button>
            ))}
          </div>

          {alan('E-posta', f.email, (v) => setF((x) => ({ ...x, email: v })), 'email')}
          {alan('Ad', f.name, (v) => setF((x) => ({ ...x, name: v })))}
          {alan('Okul (isteğe bağlı)', f.school, (v) => setF((x) => ({ ...x, school: v })))}

          {f.rol === 'teacher' && (
            <p className="uyari-kutu">
              Öğretmen hesabına sınıf kodu üretilir ve doğrudan onaylı açılır — davet kabul
              edilir edilmez panele girebilir.
            </p>
          )}

          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="ku-btn ku-btn-soluk">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="ku-btn ku-btn-birincil"
                disabled={!gecerli || mesgul}
                onClick={() => {
                  if (!gecerli) return
                  setMesgul(true)
                  void onKaydet({
                    email: f.email.trim().toLowerCase(),
                    name: f.name.trim(),
                    rol: f.rol,
                    school: f.school.trim() || null,
                  }).finally(() => setMesgul(false))
                }}
              >
                Davet gönder
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
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
        <button type="button" className="ku-btn ku-btn-soluk">Sınıfa ata</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="ku-overlay" />
        <Dialog.Content className="ku-modal ku-genis">
          <Dialog.Title>Sınıf ataması</Dialog.Title>
          <Dialog.Description className="aciklama">
            <strong>{kullanici.name ?? 'Bu öğrenci'}</strong> hangi öğretmenin sınıfında olsun?
          </Dialog.Description>

          <label className="ku-ara" style={{ marginTop: 16, marginBottom: 0, flex: 'none' }}>
            <Icon name="search" size={14} color="currentColor" style={{ opacity: 0.55 }} />
            <input
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder="Öğretmen adı, e-posta ya da sınıf kodu"
            />
          </label>

          <div className="ku-secenek-liste">
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
              <p style={{ padding: '24px 8px', textAlign: 'center', fontSize: 12, color: 'var(--metin3)' }}>
                Onaylı öğretmen bulunamadı.
              </p>
            )}
          </div>

          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="ku-btn ku-btn-soluk">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="ku-btn ku-btn-birincil"
                disabled={!degisti || mesgul}
                onClick={() => {
                  if (!degisti) return
                  setMesgul(true)
                  void onKaydet(hedef).finally(() => setMesgul(false))
                }}
              >
                Kaydet
              </button>
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
      className={cn('ku-secenek', secili && 'ku-secili')}
    >
      {/* Seçim asla YALNIZ renkle işaretlenmez — ikon da taşır (görünürlük değişir, yer sabit). */}
      <span className="tik" style={{ visibility: secili ? 'visible' : 'hidden' }}>
        <Icon name="check" size={14} color="currentColor" />
      </span>
      <span className="govde">
        <span className="b">{baslik}</span>
        <span className="a">{alt}</span>
      </span>
      {isaret && <span className="isaret">{isaret}</span>}
    </button>
  )
}

/* ── Denetim akışı ───────────────────────────────────────────────────────── */

/** Kanonik etiket listesi types.admin.ts'te (EYLEM_ADI) — burası onu kullanır. */
const EYLEM_METNI = EYLEM_ADI

export function DenetimAkisi({ kayitlar, defterYok }: {
  kayitlar: DenetimSatiri[]
  defterYok: boolean
}) {
  // ⚠️ "Defter yok" ile "hiç işlem yok" AYRI hâller. 0020 uygulanmadığında boş
  // liste çizmek, denetimsiz bir sistemi "temiz" göstermek olurdu.
  if (defterYok) {
    return (
      <section className="ku-kart ku-panel-ic">
        <div className="ku-panel-bas"><h3>Denetim Defteri</h3></div>
        <p style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--metin2)' }}>
          Defter tablosu henüz yok —{' '}
          <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>0020_yonetim_denetim.sql</span>{' '}
          uygulanmamış. Bu, "hiç yönetim işlemi yapılmadı" demek <strong>değildir</strong>:
          yapılan işlemler kaydedilmiyor. Migration uygulanana kadar rol değişimleri ve
          sınıf atamaları izsiz kalıyor.
        </p>
      </section>
    )
  }

  return (
    <section className="ku-kart ku-panel-ic">
      <div className="ku-panel-bas">
        <h3>Denetim Defteri</h3>
        <span className="sag-mono" style={{ marginLeft: 'auto' }}>append-only</span>
      </div>
      {!kayitlar.length ? (
        <p style={{ fontSize: 12, color: 'var(--metin3)' }}>Henüz yönetim işlemi yapılmamış.</p>
      ) : (
        <div>
          {kayitlar.map((d) => (
            <div key={d.id} className="ku-denetim-satir">
              <span className="zaman">
                {new Date(d.createdAt).toLocaleString('tr-TR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              <span className="eylem">
                <b>{EYLEM_METNI[d.eylem] ?? d.eylem}</b>
                {d.hedefAdi && <> · {d.hedefAdi}</>}
                {detayOzeti(d) && <> · {detayOzeti(d)}</>}
                {' · '}{d.adminAdi ?? 'yönetici'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/**
 * Ham jsonb'yi okunur tek satıra indirir — yönetici ham anahtar okumasın.
 *
 * Eylem başına serbest şema olduğu için tek tek ele alınır; tanımadığı eylemde
 * `null` döner ve satır yalnız eylem adıyla çizilir (uydurma özet YOK).
 */
export function detayOzeti(d: DenetimSatiri): string | null {
  const x = d.detay ?? {}
  const s = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

  switch (d.eylem) {
    case 'rol_degis': {
      const n = Number(x.serbestBirakilanOgrenci ?? 0)
      return `${x.oncekiRol} → ${x.yeniRol}${n > 0 ? ` · ${n} öğrenci serbest bırakıldı` : ''}`
    }
    case 'ogretmen_onay':
      return x.onayli === true ? 'onaylandı' : 'onay kaldırıldı'
    case 'sinif_ata':
      return x.yeniOgretmenId ? 'sınıfa atandı' : 'sınıftan çıkarıldı'
    case 'gorev_yeniden':
      return `${x.kind ?? 'görev'} · ${x.akisaItildi === true ? 'akışa itildi' : 'bekçiye bırakıldı'}`
    case 'gorev_iptal':
      return `${x.kind ?? 'görev'} · ${x.oncekiDurum ?? '—'} → FAILED`
    case 'hesap_olustur':
      return `${x.rol ?? ''} · ${s(x.email) ?? ''}`.trim() || null
    case 'profil_duzelt': {
      const alanlar = Object.keys((x.degisenler as Record<string, unknown>) ?? {})
      return alanlar.length ? alanlar.join(', ') : null
    }
    case 'sifre_sifirla':
      return s(x.email)
    case 'hesap_askiya':
      return s(x.neden) ?? 'gerekçe yazılmadı'
    case 'hesap_geri_al':
      return 'erişim geri verildi'
    case 'basvuru_reddet':
      return s(x.not)
    case 'soru_dogrulama':
      return `${x.yeni === true ? 'havuza alındı' : 'havuzdan düşürüldü'}${s(x.neden) ? ` · ${s(x.neden)}` : ''}`
    case 'soru_karantina':
      return `${x.karantina === true ? 'karantinaya alındı' : 'karantinadan çıkarıldı'}${s(x.neden) ? ` · ${s(x.neden)}` : ''}`
    case 'soru_etiket': {
      const alanlar = Object.keys((x.degisenler as Record<string, unknown>) ?? {})
      return alanlar.length ? alanlar.join(', ') : null
    }
    case 'uretim_tetik':
      return `${x.kazanimBaslik ?? 'kazanım'} · ${x.adet ?? '?'} soru${x.difficulty ? ` · ${x.difficulty}` : ''}`
    case 'esik_degis':
      // ⚠️ DÜŞÜRME AYRICA İŞARETLENİR: eşiği düşürmek kalite bariyerini gevşetir ve
      // defterde bir artırımdan ayırt edilebilir olmalı.
      return `${x.subject ?? '—'} · ${x.onceki ?? 'taban'} → ${x.yeni}${x.dusuruldu === true ? ' (düşürüldü)' : ''}`
    case 'eval_tetik':
      return 'ölçüm kuyruğa alındı'
    case 'onbellek_dus':
      return `panel ${x.panel ?? 0} · kimlik ${x.kimlik ?? 0} · sınıf ${x.sinif ?? 0} · redis ${x.redis ?? 0}`
    case 'ogretmen_adina_odev':
      return x.tur === 'hedefli_set'
        ? `hedefli set · ${x.ogrenciAdi ?? 'öğrenci'} · ${x.soruAdedi ?? '?'} soru`
        : `sınıf ödevi · ${x.baslik ?? ''} · ${x.soruAdedi ?? '?'} soru`
    case 'ogretmen_adina_ogrenci':
      return `${x.ogrenciAdi ?? 'öğrenci'} · ${x.islem === 'cikar' ? 'sınıftan çıkarıldı' : 'sınıfa eklendi'}`
    default:
      return null
  }
}
