import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { m, useReducedMotion } from 'framer-motion'
import { toast } from 'sonner'
import * as Dialog from '@radix-ui/react-dialog'
import { Drawer } from 'vaul'
import { Icon, type IconName } from '../ui'
import { cn } from '../lib/cn'
import { NAV_H } from '../lib/layout'
import { useAsync } from '../lib/useAsync'
import { useIsDesktop } from '../lib/responsive'
import { apiGet, apiDelete, streamChat } from '../lib/api.js'
import type { SohbetGecmisi, SohbetOzeti, EylemTarifi, TestOzeti } from '../lib/types'
import { useAgentTaskStatus } from '../lib/useAgentTaskStatus'
import { MathMarkdown } from '../components/MathMarkdown'

/* ═══════════════════════════════════════════════════════════════════════════
   KOÇ — sohbet ekranı (onaylı önizleme: docs/design/onizleme/koc.html — GOREV-014).
   Inline FİDAN deseni (GOREV-007 emsali) — ui.tsx'e yazılmaz.
   KORUNAN DAVRANIŞLAR (sunum değişti, davranış değişmedi):
   · SÜREKLİLİK: açılışta son oturum yüklenir (GET /chat/history); "yeni sohbet"
     temiz sessionId açar.
   · Akış SIRASINDA ham metin, bitince MathMarkdown (KaTeX titremesi önlenir —
     yarım "$\fra" her token'da yeniden ayrıştırılırsa formül titrer).
   · İlerleme adımları: sunucunun DUYURDUĞU olaylardan çizilir (uydurma sahne yok);
     tur bitince yalnız gerçekten çalışmış araç satırları kalır.
   · Bağlam-duyarlı öneri çipleri: zayıf konu adı gerçek sinyalden enjekte edilir
     (sabitlenmedi — önizlemedeki üç sabit çipten iyidir, karar kartta).
   · Soru bağlamı çipi [HAZIR köprü — GOREV-008 tarafı]: nav('/kaptan', { state:
     { soruBaglami: { ozet, istem } } }) ile gelinirse toprak-tonlu çip görünür ve
     ilk istemin başına bağlam eklenir; bağlam yoksa çip HİÇ render edilmez.
   ═══════════════════════════════════════════════════════════════════════════ */

/* ─── Akış adımları (ilerleme bildirimleri) ──────────────────────────────────
   Koç yanıt üretirken sohbete düşen satırlar: "Verilerin okunuyor" → "Koç
   düşünüyor" → araç satırları → "Yanıt hazırlanıyor".

   ⚠️ ETİKETLER BURADA, ANAHTARLAR SUNUCUDA. Backend yalnız anahtar yollar
   (agents/kaptan.ts · DurumAdi); cümle istemcinin işi — arayüz dilini değiştirmek
   servis deploy'u gerektirmemeli.

   ⚠️ 'analiz' SUNUCUDAN GELMEZ, gönderim anında istemci basar. Kapattığı boşluk
   gerçek: fetch açılıp ilk SSE olayı dönene kadar geçen sürede ekranda hiçbir şey
   olmuyordu ve mesaj gitmemiş gibi duruyordu.
   ─────────────────────────────────────────────────────────────────────────── */

/** 'durum' = boru hattının kendisi, 'arac' = modelin çağırdığı araç. Ayrım görsel
 *  değil davranışsal: tur bitince durum satırları düşer, araç satırları KALIR
 *  (öğrencinin gördüğü "ne yapıldı" kaydı odur). */
type AdimTuru = 'durum' | 'arac'
interface Adim { anahtar: string; etiket: string; ikon: IconName; tur: AdimTuru; bitti: boolean }

const DURUM_ADIMI: Record<string, { etiket: string; ikon: IconName }> = {
  analiz: { etiket: 'Mesajın inceleniyor', ikon: 'scan' },
  veri: { etiket: 'Verilerin okunuyor', ikon: 'search' },
  model: { etiket: 'Koç düşünüyor', ikon: 'sparkle' },
  yanit: { etiket: 'Yanıt hazırlanıyor', ikon: 'edit' },
}

/**
 * Araç adı → satır. Eşleşmeyen ad için satır ÜRETİLMEZ (`null`): eskiden yedek dal
 * ham adı basıyordu ve öğrenci sohbetinde "oneri_ver…" gibi iç isimler görünüyordu —
 * backend'e yeni araç eklendiğinde arayüz sızdırmasın.
 */
const ARAC_ADIMI: Record<string, { etiket: string; ikon: IconName }> = {
  get_student_snapshot: { etiket: 'Verilerine bakıyor', ikon: 'chart' },
  generate_practice: { etiket: 'Sorular hazırlanıyor', ikon: 'target' },
  search_curriculum: { etiket: 'Müfredatı tarıyor', ikon: 'book' },
  save_to_canvas: { etiket: 'Nota işliyor', ikon: 'edit' },
  load_from_canvas: { etiket: 'Notlarını okuyor', ikon: 'book' },
  recall_memory: { etiket: 'Geçmişi hatırlıyor', ikon: 'history' },
  request_plan_update: { etiket: 'Planın güncelleniyor', ikon: 'route' },
  eylem_oner: { etiket: 'Kısayol hazırlanıyor', ikon: 'bolt' },
  oneri_ver: { etiket: 'Takip önerileri hazırlanıyor', ikon: 'lightbulb' },
}

function adimYap(anahtar: string, tur: AdimTuru): Adim | null {
  const kaynak = tur === 'durum' ? DURUM_ADIMI : ARAC_ADIMI
  const tarif = kaynak[anahtar]
  return tarif ? { anahtar, etiket: tarif.etiket, ikon: tarif.ikon, tur, bitti: false } : null
}

/**
 * Yeni adımı listeye ekler ve öncekilerin hepsini bitmiş sayar — akış tek şeritli:
 * sunucu bir sonraki adımı duyurduğunda önceki gerçekten bitmiştir.
 *
 * Aynı anahtar ARKA ARKAYA gelirse yok sayılır: 'model' her turda duyuruluyor ve
 * araçsız bir turda arka arkaya iki kez düşebilir — liste kendini tekrar etmesin.
 */
function adimEkle(mevcut: Adim[] | undefined, yeni: Adim | null): Adim[] {
  const liste = mevcut ?? []
  if (!yeni) return liste
  const son = liste[liste.length - 1]
  if (son && son.anahtar === yeni.anahtar && !son.bitti) return liste
  return [...liste.map((a) => ({ ...a, bitti: true })), yeni]
}

/**
 * Tur bitti: durum satırları DÜŞER, araç satırları bitmiş olarak kalır.
 * "Koç düşünüyor ✓" cevabın altında kalsaydı her mesaj üç satır ölü gürültü taşırdı;
 * "Sorular hazırlanıyor ✓" ise kalıcı bilgidir (mevcut davranış da buydu).
 */
function adimlariKapat(mevcut: Adim[] | undefined): Adim[] {
  return (mevcut ?? []).filter((a) => a.tur === 'arac').map((a) => ({ ...a, bitti: true }))
}

interface Msg {
  id: number; role: 'user' | 'kaptan'; text: string
  streaming?: boolean; adimlar?: Adim[]; baglamOzet?: string
  /** Balonun altında çizilen tıklanabilir eylemler (SSE 'eylem' olayı + /chat/history). */
  eylemler?: EylemTarifi[]
}

/** Sonuç ekranındaki "Bu soruyu açıkla" köprüsünün nav-state sözleşmesi. */
interface SoruBaglami { ozet: string; istem: string }

/**
 * Analiz istendiğinde sohbette GÖRÜNEN metin — kısa ve insanca.
 *
 * ⚠️ HAM DÖKÜM ARTIK BURADA DEĞİL. Eskiden 12 satırlık yapısal döküm (skor, ders kırılımı,
 * numaralı yanlış listesi) KULLANICI MESAJI olarak basılıyordu: öğrenci hiç yazmadığı bir
 * duvar metnini kendi balonunda görüyordu ve sohbet okunmaz hale geliyordu. O döküm artık
 * `testOzeti` alanıyla YAPISAL gidiyor, sunucu ondan system katmanında bir yönerge kuruyor
 * (persona/kaptan.charter.ts · testAnaliziIstemi) — modele ulaşır, ekrana çıkmaz.
 *
 * ⚠️ SONUÇ OTOMATİK GÖNDERİLMEZ. Kart belirir, analiz ANCAK butona basılırsa istenir:
 * otomatik olsaydı her test istenmemiş bir LLM çağrısı (ve fatura) üretirdi.
 */
const ANALIZ_METNI = 'Çözdüklerimi analiz eder misin?'

/** Çöz ekranından dönüldüğünde giriş alanının üstünde beliren analiz kartı. */
function TestKarti({ ozet, onAnaliz, onKapat }: {
  ozet: TestOzeti; onAnaliz: () => void; onKapat: () => void
}) {
  const yuzde = ozet.toplam ? Math.round((ozet.dogru / ozet.toplam) * 100) : 0
  return (
    <div className="kc-test-kart">
      <div className="min-w-0 flex-1">
        <div className="kc-test-baslik">
          Test bitti — <b>{ozet.dogru}/{ozet.toplam}</b> doğru (%{yuzde})
        </div>
        <div className="kc-test-alt">
          {ozet.yanlislar.length
            ? `${ozet.yanlislar.length} yanlış · Koç neyi kaçırdığını çıkarabilir`
            : "Hatasız — sırada ne var, Koç'a soralım"}
        </div>
      </div>
      <button type="button" className="kc-aksiyon kc-aksiyon-vurgu flex-none" onClick={onAnaliz}>
        <Icon name="chart" size={14} color="currentColor" />
        Analiz et
      </button>
      <button type="button" className="kc-test-kapat" onClick={onKapat} aria-label="Test özetini kapat">×</button>
    </div>
  )
}

/* ─── Eylem butonları ────────────────────────────────────────────────────────
   Kaptan bir şey ÖNERDİĞİNDE artık cümleyle sormuyor ("5 soru atayım mı? Ne dersin?"),
   `eylem_oner` aracını çağırıyor ve buraya bir buton düşüyor. Öğrenci "evet" yazıp
   sonra ekran aramak yerine tek dokunuşla gidiyor.

   ⚠️ BUTON METİNDEN TÜRETİLMEZ. Kaynağı aracın YAPISAL çıktısıdır (kazanimId, zorluk).
   Metinden parse etseydik arayüz modelin kelime seçimine bağlanırdı: model bir gün
   "aralıklı tekrar" derse buton sessizce kaybolurdu.
   ─────────────────────────────────────────────────────────────────────────── */

const EYLEM_IKON: Record<string, IconName> = {
  coz: 'target', tekrar: 'history', antrenman: 'bolt',
  rota: 'route', konular: 'book', plan_bekle: 'route',
}

/**
 * Eylemi gezinme hedefine çevirir. `null` → bu tür bu istemcide bilinmiyor, buton çizilmez
 * (backend yeni tür eklediğinde eski istemci ÇÖKMEMELİ; mesaj okunur kalır).
 */
function eylemHedefi(e: EylemTarifi): { yol: string; state?: unknown } | null {
  switch (e.tur) {
    case 'coz':
      if (!e.kazanimId) return null // kazanımsız 'coz' hangi soruyu açacağını bilemez
      return {
        yol: '/coz',
        state: {
          source: 'ai', kazanimId: e.kazanimId, subject: e.subject,
          difficulty: e.difficulty, title: e.baslik ?? 'Koç pratiği',
        },
      }
    case 'tekrar':
      return { yol: '/coz', state: { source: 'review', title: 'Tekrar destesi' } }
    case 'antrenman':
      return { yol: '/coz', state: { source: 'antrenman' } }
    // NOT: /coz hedeflerine `donusSession` EylemSeridi'nde eklenir — hangi sohbetten
    // çıkıldığı bilgisi buraya değil, çağıran bileşene aittir.
    case 'rota':
    case 'plan_bekle':
      return { yol: '/rota' }
    case 'konular':
      return { yol: '/konular' }
    default:
      return null
  }
}

/**
 * Plan görevi butonu — görev bitene kadar BEKLEME göstergesi, bitince tıklanabilir.
 *
 * Kaptan "hazırlayıp haber vereceğim" diyor ama eskiden haber verecek kanalı yoktu:
 * görev worker'da bitiyor, öğrenciye hiçbir şey ulaşmıyordu. Artık görev yoklanıyor
 * (useAgentTaskStatus) ve bittiğinde bu buton canlanıyor — söz verilen yerde tutuluyor.
 */
function PlanBekleButonu({ eylem, git }: { eylem: EylemTarifi; git: () => void }) {
  const gorev = useAgentTaskStatus(eylem.taskId ?? null)
  const hazir = gorev.durum === 'COMPLETED'
  const patladi = gorev.durum === 'FAILED'

  if (patladi) {
    return (
      <span className="kc-aksiyon-not" role="status">
        Plan hazırlanamadı — birazdan tekrar isteyebilirsin.
      </span>
    )
  }
  if (!hazir) {
    return (
      <span className="kc-aksiyon-not" role="status" aria-live="polite">
        <span className="kc-aksiyon-spin" aria-hidden>◌</span> Planın hazırlanıyor…
      </span>
    )
  }
  return (
    <button type="button" className="kc-aksiyon kc-aksiyon-vurgu" onClick={git}>
      <Icon name="route" size={14} color="currentColor" />
      {eylem.etiket}
    </button>
  )
}

/** Bir mesajın altındaki buton şeridi. Bilinmeyen türler sessizce atlanır. */
function EylemSeridi({ eylemler, sessionId }: { eylemler: EylemTarifi[]; sessionId: string }) {
  const nav = useNavigate()
  const cizilecek = eylemler.filter((e) => eylemHedefi(e) !== null)
  if (!cizilecek.length) return null

  return (
    <div className="kc-aksiyonlar">
      {cizilecek.map((e, i) => {
        const hedef = eylemHedefi(e)!
        // ⚠️ /coz'e giderken BULUNDUĞUMUZ SOHBETİN kimliği taşınır. Test bitince
        // "Koç'a dön" butonu öğrenciyi bu konuşmaya geri getirir; olmasaydı boş bir
        // sohbete düşerdi (ekran her girişte temiz sohbet açıyor) ve testi öneren
        // konuşma sonucu hiç öğrenmezdi.
        const state = hedef.yol === '/coz'
          ? { ...(hedef.state as object), donusSession: sessionId }
          : hedef.state
        const git = () => nav(hedef.yol, state ? { state } : undefined)
        if (e.tur === 'plan_bekle') {
          return <PlanBekleButonu key={`${e.tur}-${i}`} eylem={e} git={git} />
        }
        return (
          <button key={`${e.tur}-${i}`} type="button" className="kc-aksiyon" onClick={git}>
            <Icon name={EYLEM_IKON[e.tur] ?? 'sparkle'} size={14} color="currentColor" />
            {e.etiket}
          </button>
        )
      })}
    </div>
  )
}

/* ─── Sohbet geçmişi paneli ──────────────────────────────────────────────────
   Öncesinde bu ekranda geçmişe giden HİÇBİR yol yoktu: "yeni sohbet" her basıldığında
   bir öncekine ulaşmak imkânsız hale geliyordu. Veri kaybolmuyordu (chat_messages'ta
   duruyordu) ama öğrenci için yok hükmündeydi.
   ─────────────────────────────────────────────────────────────────────────── */

/** Oturumları "Bugün / Dün / Son 7 gün / Daha eski" başlıklarına ayırır.
 *  Ham tarih listesi ("09.08.2026") tarama yükünü öğrenciye bindirirdi; insan
 *  "dün konuştuğumuz şey" diye hatırlar, tarihle değil. */
function tarihKumesi(iso: string): string {
  const t = new Date(iso)
  const bugun = new Date()
  const gun = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const fark = Math.round((gun(bugun) - gun(t)) / 86_400_000)
  if (fark <= 0) return 'Bugün'
  if (fark === 1) return 'Dün'
  if (fark < 7) return 'Son 7 gün'
  if (fark < 30) return 'Son 30 gün'
  return 'Daha eski'
}

const KUME_SIRA = ['Bugün', 'Dün', 'Son 7 gün', 'Son 30 gün', 'Daha eski']

/** Satır sağındaki kısa zaman ("14:32" bugünse, yoksa "9 Ağu"). */
function kisaZaman(iso: string): string {
  const t = new Date(iso)
  const bugun = new Date()
  const ayniGun = t.toDateString() === bugun.toDateString()
  return ayniGun
    ? t.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
    : t.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
}

/** Silme onayı — Radix Dialog (proje kuralı: yıkıcı eylem asla window.confirm). */
function SilOnay({ baslik, onSil }: { baslik: string; onSil: () => void }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="kc-gec-sil"
          aria-label={`"${baslik}" sohbetini sil`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="close" size={13} color="currentColor" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="kc-overlay" />
        <Dialog.Content className="kc-modal" aria-describedby="kc-sil-aciklama">
          <Dialog.Title className="kc-modal-baslik">Sohbeti sil?</Dialog.Title>
          <Dialog.Description id="kc-sil-aciklama" className="kc-modal-metin">
            “{baslik}” kalıcı olarak silinir. Koç'un seni tanıması etkilenmez — yalnız bu
            konuşmanın dökümü kaldırılır.
          </Dialog.Description>
          <div className="kc-modal-aksiyon">
            <Dialog.Close asChild>
              <button type="button" className="kc-modal-btn">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button type="button" className="kc-modal-btn kc-modal-tehlike" onClick={onSil}>Sil</button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

interface PanelProps {
  oturumlar: SohbetOzeti[]
  aktifId: string
  yukleniyor: boolean
  onSec: (sessionId: string) => void
  onYeni: () => void
  onSil: (sessionId: string) => void
}

function GecmisPanel({ oturumlar, aktifId, yukleniyor, onSec, onYeni, onSil }: PanelProps) {
  // Kümeleri sırayla gez; boş küme başlık basmaz.
  const kumeler = useMemo(() => {
    const harita = new Map<string, SohbetOzeti[]>()
    for (const o of oturumlar) {
      const k = tarihKumesi(o.son_mesaj_at)
      const liste = harita.get(k) ?? []
      liste.push(o)
      harita.set(k, liste)
    }
    return KUME_SIRA.filter((k) => harita.has(k)).map((k) => [k, harita.get(k)!] as const)
  }, [oturumlar])

  return (
    <div className="kc-gecmis">
      <div className="kc-gec-ust">
        <button type="button" className="kc-gec-yeni" onClick={onYeni}>
          <Icon name="plus" size={14} color="currentColor" />
          Yeni sohbet
        </button>
      </div>

      <div className="kc-gec-liste">
        {yukleniyor && <p className="kc-gec-bos">Yükleniyor…</p>}

        {/* ⚠️ "Henüz sohbet yok" YALNIZ yükleme bittiğinde. Yükleme sırasında göstermek,
            geçmişi olan öğrenciye bir an "hiç konuşmamışsın" demek olurdu. */}
        {!yukleniyor && oturumlar.length === 0 && (
          <p className="kc-gec-bos">
            Henüz kayıtlı sohbet yok. Koç'a bir şey sor — konuşma buraya düşer.
          </p>
        )}

        {kumeler.map(([kume, liste]) => (
          <div key={kume} className="kc-gec-kume">
            <h3 className="kc-gec-kume-ad">{kume}</h3>
            {liste.map((o) => (
              <div
                key={o.session_id}
                className={cn('kc-gec-satir', o.session_id === aktifId && 'kc-gec-aktif')}
                role="button"
                tabIndex={0}
                aria-current={o.session_id === aktifId ? 'true' : undefined}
                onClick={() => onSec(o.session_id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSec(o.session_id) } }}
              >
                <span className="kc-gec-baslik">{o.baslik}</span>
                <span className="kc-gec-meta">
                  {kisaZaman(o.son_mesaj_at)} · {o.mesaj_sayisi} mesaj
                </span>
                <SilOnay baslik={o.baslik} onSil={() => onSil(o.session_id)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

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
  /** Çöz ekranından "Koç'a dön" ile gelindiyse dolu — giriş üstünde analiz kartı çizilir. */
  const [testOzeti, setTestOzeti] = useState<TestOzeti | null>(
    () => (location.state as { testOzeti?: TestOzeti } | null)?.testOzeti ?? null,
  )
  const endRef = useRef<HTMLDivElement>(null)
  const sessionId = useRef<string>((globalThis.crypto?.randomUUID?.() ?? String(Date.now())))
  const abortRef = useRef<AbortController | null>(null)

  // ── Sohbet geçmişi (0035) ──
  const masaustu = useIsDesktop()
  const [oturumlar, setOturumlar] = useState<SohbetOzeti[]>([])
  const [oturumlarYukleniyor, setOturumlarYukleniyor] = useState(true)
  const [panelAcik, setPanelAcik] = useState(false)   // yalnız mobil çekmece
  /** Panelde hangi satır işaretli — `sessionId` bir ref olduğu için ayrı state şart
   *  (ref değişimi yeniden çizim tetiklemez, işaret güncellenmezdi). */
  const [aktifId, setAktifId] = useState('')

  const oturumlariYenile = useCallback(async () => {
    try {
      const y = await apiGet('/chat/oturumlar')
      setOturumlar(Array.isArray(y?.oturumlar) ? y.oturumlar : [])
    } catch {
      // Liste alınamazsa sohbet yine çalışır — panel boş görünür, ekran ölmez.
      setOturumlar([])
    } finally {
      setOturumlarYukleniyor(false)
    }
  }, [])

  useEffect(() => { void oturumlariYenile() }, [oturumlariYenile])

  // Bağlam-duyarlı çip: zayıf konu adı gerçek sinyalden (DİNAMİK — sabitlenmez)
  const oneri = useAsync<any>(() => apiGet('/practice/suggest'), [])
  const zayifKonu = oneri.data?.reason === 'weak' ? oneri.data?.kazanim?.title : null

  /** Son turda Koç'un `oneri_ver` ile verdiği takipler. Boşsa yedeğe düşülür. */
  const [turOnerileri, setTurOnerileri] = useState<string[]>([])

  /**
   * ÇİPLER ARTIK SABİT DEĞİL.
   *
   * ⚠️ ESKİ HÂLİ: `['Bugünkü planım', 'Dünü özetle', 'Moralim bozuk']` + zayıf konu.
   * Sohbet başlarken makuldü ama ilerledikçe alakasızlaşıyordu: öğrenci türev sorusunu
   * tartışırken ekranda hâlâ "Moralim bozuk" duruyordu — üç çipin üçü de o an
   * konuşulanla ilgisizdi ve şerit görsel gürültüye dönüşüyordu.
   *
   * İki kaynak, bu sırayla:
   *  1) TUR ÖNERİLERİ — Koç'un o yanıtta `oneri_ver` ile verdiği takipler. Modelin
   *     METNİNDEN türetilmez, ÇAĞIRDIĞI ARAÇTAN gelir (eylem butonlarıyla aynı ilke).
   *  2) YEDEK — model çağırmadıysa (araç kullanımı garanti değildir) başlangıç çipleri.
   *     Sohbet BOŞKEN zaten doğru olan set budur; doluyken de en azından ilgisiz üç
   *     sabit yerine "konuşmayı sürdüren" genel takipler gösterilir.
   */
  const cipler = useMemo(() => {
    if (turOnerileri.length) return turOnerileri

    // Sohbet başlamadı → gerçek sinyalden başlangıç çipleri (eski davranış korunur).
    if (msgs.length === 0) {
      const liste = ['Bugünkü planım', 'Dünü özetle', 'Moralim bozuk']
      liste.unshift(zayifKonu ? `${zayifKonu} konusundan 5 soru` : 'Zayıf konudan 5 soru')
      return liste
    }
    // Sohbet sürüyor ama model öneri vermedi → konuşmayı sürdüren genel takipler.
    // "Bugünkü planım" burada YANLIŞ olurdu: konuyu değiştirir, sürdürmez.
    return ['Bunu daha basit anlat', 'Bir örnek çöz', 'Neden böyle?']
  }, [turOnerileri, msgs.length, zayifKonu])

  /** Sunucu mesajlarını balon modeline çevirir (hem ilk yükleme hem oturum geçişi kullanır). */
  const mesajlariBas = useCallback((g: SohbetGecmisi) => {
    setMsgs(
      (g.messages ?? []).map((mesaj, i) => ({
        id: i + 1,
        role: mesaj.role === 'user' ? 'user' as const : 'kaptan' as const,
        text: mesaj.content,
        // 0034: butonlar mesajla birlikte yaşar — yenilemede kaybolmaz.
        eylemler: Array.isArray(mesaj.eylemler) ? mesaj.eylemler : undefined,
      })),
    )
  }, [])

  /**
   * AÇILIŞTA HER ZAMAN TEMİZ SOHBET.
   *
   * ⚠️ ESKİ DAVRANIŞ: ekrana her girişte son oturum yüklenirdi ("kaldığın yerden devam").
   * Geçmiş paneli yokken bunun bir gerekçesi vardı — konuşmaya dönmenin BAŞKA yolu yoktu.
   * Panel geldikten sonra aynı davranış ters etki yapıyor: öğrenci Koç'a yeni bir şey
   * sormak için giriyor ve karşısında dünkü konuşmanın kuyruğunu buluyor; yeni sohbet
   * açmak için ayrıca bir düğmeye basması gerekiyor.
   *
   * Artık giriş DAİMA boş sayfa; eskiler soldaki listede duruyor ve tek tıkla açılıyor.
   *
   * ⚠️ TEK İSTİSNA — `donusSession`: Çöz ekranından "Koç'a dön" ile gelindiğinde ÇIKILAN
   * konuşma geri yüklenir. Orada boş sayfa açmak, testi öneren konuşmayı koparmak olurdu:
   * öğrenci Koç'un önerisiyle test çözer, döner ve Koç hiçbir şey bilmiyormuş gibi durur.
   */
  useEffect(() => {
    const donus = (location.state as { donusSession?: string } | null)?.donusSession
    if (!donus) { setGecmisYuklendi(true); return }

    let alive = true
    apiGet('/chat/history', { sessionId: donus })
      .then((g: SohbetGecmisi) => {
        if (!alive || !g?.sessionId) return
        sessionId.current = g.sessionId
        setAktifId(g.sessionId)
        setGecmisVar(true)
        mesajlariBas(g)
      })
      .catch(() => { /* açılamazsa temiz sohbette kal — ekran ölmez */ })
      .finally(() => { if (alive) setGecmisYuklendi(true) })
    return () => { alive = false }
    // location.state yalnız mount'ta okunur (gezinme her seferinde yeni bir mount üretir).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Panelden bir sohbet seç — o oturumun dökümü yüklenir. */
  const oturumSec = useCallback(async (hedef: string) => {
    if (hedef === sessionId.current) { setPanelAcik(false); return }
    // ⚠️ Uçuştaki akış İPTAL EDİLİR: yarım bir yanıt, geçiş yapılan sohbetin balonlarına
    // token yazmaya devam ederdi (yanlış konuşmaya yazan bir Koç).
    abortRef.current?.abort()
    setPanelAcik(false)
    try {
      const g: SohbetGecmisi = await apiGet('/chat/history', { sessionId: hedef })
      sessionId.current = hedef
      setAktifId(hedef)
      setGecmisVar(true)
      mesajlariBas(g)
      // Çipler tura özgüdür ve geçmişe yazılmaz → başka sohbete geçince yedeğe düşülür.
      setTurOnerileri([])
    } catch (err: any) {
      toast.error(err?.message ?? 'Sohbet açılamadı')
    }
  }, [mesajlariBas])

  const oturumSil = useCallback(async (hedef: string) => {
    try {
      await apiDelete(`/chat/oturum/${hedef}`)
      setOturumlar((prev) => prev.filter((o) => o.session_id !== hedef))
      // Açık olan sohbet silindiyse ekran boş bir sohbete düşer — silinmiş bir konuşmanın
      // balonlarını göstermeye devam etmek, silmenin işe yaramadığını düşündürürdü.
      if (hedef === sessionId.current) {
        sessionId.current = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
        setAktifId('')
        setMsgs([])
        setGecmisVar(false)
      }
      toast('Sohbet silindi')
    } catch (err: any) {
      toast.error(err?.message ?? 'Sohbet silinemedi')
    }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: azalt ? 'auto' : 'smooth' }) }, [msgs, azalt])
  useEffect(() => () => abortRef.current?.abort(), [])

  /**
   * @param text  Sohbette GÖRÜNEN ve geçmişe yazılan metin.
   * @param testVerisi  Opsiyonel yapısal test sonucu — modele system katmanında gider,
   *   ekranda GÖRÜNMEZ. Cümleleri sunucu kurar; istemci buradan serbest metin geçiremez.
   */
  const send = async (text: string, testVerisi?: TestOzeti) => {
    const mesaj = text.trim()
    if (!mesaj || gonderiliyor) return
    setInput('')
    setGonderiliyor(true)
    // Önceki turun çipleri DERHAL düşer: akış sürerken eski takipleri tıklanabilir
    // bırakmak, öğrenciyi cevabı gelmemiş bir konuşmanın devamına yönlendirirdi.
    setTurOnerileri([])

    // Soru bağlamı (varsa) yalnız İSTEMİN başına eklenir; balonda çip olarak görünür.
    const aktifBaglam = baglam
    if (aktifBaglam) setBaglam(null)
    const istem = aktifBaglam ? `${aktifBaglam.istem}\n\n${mesaj}` : mesaj

    // ⚠️ İKİ ID TEK ZAMAN DAMGASINDAN TÜRETİLİR.
    // Eskiden kullanıcı balonu `id: Date.now()` ile updater'ın İÇİNDE hesaplanıyordu:
    // `kaptanId` alındıktan sonra React updater'ı çağırana kadar ≥1 ms geçerse (ana iş
    // parçacığı KaTeX render'ı ya da grafik chunk'ıyla meşgulse) `Date.now() === kaptanId`
    // oluyordu. O zaman `guncelle` HER İKİ mesajı da eşleştiriyor ve gelen token'lar
    // kullanıcının kendi balonuna da yazılıyordu — kullanıcı yazmadığı bir metni kendi
    // balonunda görüyordu (üstüne React duplicate-key uyarısı). Deterministik olmadığı için
    // "bazen sohbet karışıyor" diye rapor edilirdi.
    const t = Date.now()
    const kaptanId = t + 1
    setMsgs((prev) => [
      ...prev,
      { id: t, role: 'user', text: mesaj, baglamOzet: aktifBaglam?.ozet },
      // İlk adım gönderim anında basılır — SSE'nin ilk olayı gelene kadar ekran boş kalmasın.
      { id: kaptanId, role: 'kaptan', text: '', streaming: true, adimlar: adimEkle([], adimYap('analiz', 'durum')) },
    ])

    const guncelle = (fn: (msg: Msg) => Msg) =>
      setMsgs((prev) => prev.map((msg) => (msg.id === kaptanId ? fn(msg) : msg)))

    abortRef.current = new AbortController()
    try {
      await streamChat(
        { sessionId: sessionId.current, message: istem, testOzeti: testVerisi },
        (type: string, data: any) => {
          if (type === 'token') guncelle((msg) => ({ ...msg, text: msg.text + (typeof data === 'string' ? data : '') }))
          // Boru hattının kendisi (bağlam okuma / model bekleme / yazma) — sunucudan anahtar gelir.
          else if (type === 'durum') guncelle((msg) => ({ ...msg, adimlar: adimEkle(msg.adimlar, adimYap(String(data ?? ''), 'durum')) }))
          else if (type === 'tool') guncelle((msg) => ({ ...msg, adimlar: adimEkle(msg.adimlar, adimYap(String(data ?? ''), 'arac')) }))
          // 'eylem' = aracın SONUCU (buton tarifi); 'tool' yalnız aracın ADI'ydı.
          else if (type === 'eylem' && data && typeof data === 'object') {
            guncelle((msg) => ({ ...msg, eylemler: [...(msg.eylemler ?? []), data as EylemTarifi] }))
          }
          // Takip çipleri — bu turun önerileri bir öncekinin yerini alır (biriktirilmez;
          // eski turun çipleri ekranda kalsaydı şerit hızla alakasız metinle dolardı).
          else if (type === 'oneri' && Array.isArray(data)) {
            setTurOnerileri((data as unknown[]).map(String).filter(Boolean).slice(0, 3))
          }
          else if (type === 'done') guncelle((msg) => ({ ...msg, streaming: false, adimlar: adimlariKapat(msg.adimlar) }))
          else if (type === 'error') {
            // Önce `message` (Türkçe), sonra `error` (kod) — lib/api.js sözleşmesiyle aynı sıra.
            const detay = String((data && typeof data === 'object' ? (data.message || data.error) : data) || '')
            guncelle((msg) => ({
              // ⚠️ ADIMLAR BURADA DA KAPANIR: kapanmasaydı kopan bir akıştan sonra
              // "Koç düşünüyor" satırı ekranda sonsuza kadar nabız atardı — hata
              // mesajının yanında hâlâ çalışıyormuş gibi görünen bir gösterge.
              ...msg, streaming: false, adimlar: adimlariKapat(msg.adimlar),
              text: msg.text
                ? `${msg.text}\n\n_Bağlantı koptu — devamı gelmedi. Son mesajını yeniden gönderebilirsin._`
                : `Bağlantı koptu — son mesajını yeniden gönderebilirsin.${detay ? ` (${detay})` : ''}`,
            }))
          }
        },
        abortRef.current.signal,
      )
      guncelle((msg) => ({ ...msg, streaming: false, text: msg.text || 'Yanıt alınamadı — yeniden dener misin?', adimlar: adimlariKapat(msg.adimlar) }))
    } catch (err: any) {
      if (err?.name !== 'AbortError') guncelle((msg) => ({ ...msg, streaming: false, adimlar: adimlariKapat(msg.adimlar), text: msg.text || `Koç'a şu an ulaşılamadı${err?.message ? ` (${err.message})` : ''} — birazdan yeniden deneyebilirsin.` }))
    } finally {
      setGonderiliyor(false)
      // Liste tazelensin: YENİ sohbetin ilk mesajıydıysa panelde henüz satırı yok, ve her
      // mesaj "son mesaj" zamanını değiştirdiği için sıralama da kayar.
      setAktifId(sessionId.current)
      void oturumlariYenile()
    }
  }

  const yeniSohbet = () => {
    abortRef.current?.abort()
    sessionId.current = globalThis.crypto?.randomUUID?.() ?? String(Date.now())
    setAktifId('')
    setMsgs([])
    setGecmisVar(false)
    setPanelAcik(false)
    setTurOnerileri([])   // yeni sohbet → başlangıç çiplerine dön
    // ⚠️ Artık "önceki konuşma güvende" demek YETMİYOR — nerede olduğunu da söylüyoruz.
    // Eskiden bu cümle teknik olarak doğru ama pratikte yanlıştı: konuşma duruyordu,
    // ona giden hiçbir yol yoktu.
    toast('Yeni sohbet açıldı', { description: 'Öncekiler soldaki geçmiş listesinde duruyor.' })
  }

  const salt = msgs.length === 0 && gecmisYuklendi

  const panel = (
    <GecmisPanel
      oturumlar={oturumlar}
      aktifId={aktifId}
      yukleniyor={oturumlarYukleniyor}
      onSec={(id) => void oturumSec(id)}
      onYeni={yeniSohbet}
      onSil={(id) => void oturumSil(id)}
    />
  )

  return (
    /* Masaüstü: kalıcı sol panel + sohbet (iki sütun). Mobil: tek sütun, panel çekmecede.
       Yapışkanlık gerekmez — panel salt okuma, sohbetin kendi durumu ayrı. */
    <div className="flex" style={{ height: `calc(100vh - ${NAV_H}px)` }}>
      {masaustu && <aside className="kc-gec-sabit">{panel}</aside>}
      <div className="flex min-w-0 flex-1 flex-col">
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
        /* Akış adımları — Koç çalışırken düşen ilerleme satırları (tek kart, tek şerit). */
        .kc-akis { display: flex; flex-direction: column; gap: 3px; margin-bottom: 7px;
          padding: 8px 11px; border-radius: 13px; background: var(--v0);
          border: 1px solid var(--cam-kenar); width: max-content; max-width: 100%; }
        .kc-adim { display: flex; align-items: center; gap: 8px; min-width: 0;
          font-size: 11.5px; font-weight: 600; line-height: 1.5; color: var(--vurgu); }
        /* Biten satır geri çekilir: canlı olan HANGİSİ sorusu tek bakışta yanıtlanmalı. */
        .kc-adim-bitti { color: var(--metin3); font-weight: 500; }
        .kc-adim-ikon { display: grid; place-items: center; width: 19px; height: 19px; flex: none;
          border-radius: 7px; background: var(--v1); }
        .kc-adim-bitti .kc-adim-ikon { background: transparent; }
        .kc-adim-nokta { display: inline-flex; gap: 3px; flex: none; }
        .kc-adim-nokta i { width: 3px; height: 3px; border-radius: 50%; background: var(--yaprak); opacity: .45; }
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
        /* Mesaj altı eylem butonları (kc-eylem'den AYRI: o karşılama ekranının dikey
           kartı, bu balon altındaki sarmalanan yatay şerit). */
        /* ── Sohbet geçmişi paneli ── */
        .kc-gec-sabit { width: 268px; flex: none; height: 100%; border-right: 1px solid var(--cam-kenar);
          background: var(--v0); }
        .kc-gecmis { display: flex; flex-direction: column; height: 100%; min-height: 0; }
        .kc-gec-ust { padding: 12px; border-bottom: 1px solid var(--cam-kenar); flex: none; }
        .kc-gec-yeni { display: flex; align-items: center; justify-content: center; gap: 7px; width: 100%;
          min-height: 42px; border-radius: 12px; border: 1.5px dashed var(--adacayi); background: transparent;
          color: var(--vurgu); font-size: 13px; font-weight: 600; cursor: pointer; transition: background .2s; }
        .kc-gec-yeni:hover { background: var(--v1); }
        /* Liste KENDİ İÇİNDE kayar (min-height:0 şart — flex çocuk yoksa taşar ve
           sayfanın tamamı kaydırılabilir hale gelir, giriş kutusu ekrandan çıkardı). */
        .kc-gec-liste { flex: 1; min-height: 0; overflow-y: auto; padding: 8px; }
        .kc-gec-kume { margin-bottom: 10px; }
        .kc-gec-kume-ad { font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase;
          color: var(--metin3); padding: 6px 8px 4px; margin: 0; }
        .kc-gec-satir { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 9px 34px 9px 10px;
          border-radius: 11px; cursor: pointer; transition: background .15s; }
        .kc-gec-satir:hover { background: var(--v1); }
        .kc-gec-satir:focus-visible { outline: 2px solid var(--yaprak); outline-offset: -2px; }
        /* Aktif satır: dolu zemin + sol şerit. Yalnız renkle ayırmak yetmez (kontrast/renk körlüğü). */
        .kc-gec-aktif { background: var(--v1); }
        .kc-gec-aktif::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 3px;
          border-radius: 3px; background: var(--yaprak); }
        .kc-gec-baslik { font-size: 12.5px; font-weight: 600; color: var(--metin1); line-height: 1.35;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .kc-gec-meta { font-size: 10.5px; color: var(--metin3); }
        .kc-gec-sil { position: absolute; right: 6px; top: 8px; display: grid; place-items: center;
          width: 24px; height: 24px; border-radius: 8px; border: none; background: transparent;
          color: var(--metin3); cursor: pointer; opacity: 0; transition: opacity .15s, background .15s; }
        .kc-gec-satir:hover .kc-gec-sil, .kc-gec-sil:focus-visible { opacity: 1; }
        .kc-gec-sil:hover { background: rgba(200, 80, 70, .14); color: #C85046; }
        /* Dokunmatikte hover yok → silme düğmesi ulaşılamaz olurdu; orada hep görünür. */
        @media (hover: none) { .kc-gec-sil { opacity: .6; } }
        .kc-gec-bos { font-size: 12px; color: var(--metin3); padding: 14px 10px; line-height: 1.5; }

        /* Mobil çekmece */
        .kc-cekmece { position: fixed; inset-inline: 0; bottom: 0; z-index: 86; display: flex; flex-direction: column;
          max-height: 82vh; border-top-left-radius: 24px; border-top-right-radius: 24px;
          background: var(--grad-a); border: 1px solid var(--cam-kenar); border-bottom: 0; }
        .kc-cekmece-tut { width: 40px; height: 4px; border-radius: 3px; background: var(--adacayi);
          margin: 10px auto 4px; flex: none; opacity: .6; }
        .kc-cekmece-baslik { font-family: Outfit, sans-serif; font-size: 14px; font-weight: 700;
          color: var(--metin1); text-align: center; padding: 4px 0 8px; margin: 0; flex: none; }

        /* Silme onayı */
        .kc-overlay { position: fixed; inset: 0; z-index: 90; backdrop-filter: blur(3px);
          background: rgba(12, 18, 14, .5); }
        .kc-modal { position: fixed; z-index: 91; left: 50%; top: 50%; transform: translate(-50%, -50%);
          width: min(420px, calc(100vw - 32px)); background: var(--grad-a); border: 1px solid var(--cam-kenar);
          border-radius: 18px; padding: 20px; }
        .kc-modal-baslik { font-family: Outfit, sans-serif; font-size: 16px; font-weight: 700;
          color: var(--metin1); margin: 0 0 8px; }
        .kc-modal-metin { font-size: 13px; line-height: 1.55; color: var(--metin2); margin: 0 0 18px; }
        .kc-modal-aksiyon { display: flex; justify-content: flex-end; gap: 10px; }
        .kc-modal-btn { min-height: 40px; padding: 0 18px; border-radius: 11px; font-size: 13px; font-weight: 600;
          cursor: pointer; border: 1.5px solid var(--adacayi); background: transparent; color: var(--metin2); }
        .kc-modal-btn:hover { background: var(--v1); }
        .kc-modal-tehlike { background: #C85046; border-color: transparent; color: #FFF; }
        .kc-modal-tehlike:hover { background: #B84438; border-color: transparent; }

        /* Test sonucu kartı (Çöz → Koç dönüşü) */
        .kc-test-kart { display: flex; align-items: center; gap: 12px; margin-bottom: 10px;
          padding: 11px 13px; border-radius: 14px; background: var(--v1);
          border: 1.5px solid var(--adacayi); position: relative; }
        .kc-test-baslik { font-size: 13px; font-weight: 600; color: var(--metin1); }
        .kc-test-alt { font-size: 11.5px; color: var(--metin3); margin-top: 2px; }
        .kc-test-kapat { position: absolute; right: 6px; top: 4px; border: none; background: transparent;
          color: var(--metin3); font-size: 16px; line-height: 1; cursor: pointer; padding: 2px 5px; }
        .kc-test-kapat:hover { color: var(--metin1); }

        .kc-aksiyonlar { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
        .kc-aksiyon { display: inline-flex; align-items: center; gap: 7px; min-height: 40px;
          padding: 8px 14px; border-radius: 12px; border: 1.5px solid var(--adacayi);
          background: var(--ic); color: var(--vurgu); font-size: 12.5px; font-weight: 600;
          cursor: pointer; transition: background .2s, border-color .2s; }
        .kc-aksiyon:hover { background: var(--v1); border-color: var(--yaprak); }
        .kc-aksiyon:focus-visible { outline: 2px solid var(--yaprak); outline-offset: 2px; }
        /* Vurgulu: beklenen bir şey HAZIR olduğunda (plan bitti) — dolu zemin, dikkat çeker. */
        .kc-aksiyon-vurgu { background: var(--cta); color: #F2F7F3; border-color: transparent; }
        .kc-aksiyon-vurgu:hover { background: var(--cta); border-color: transparent; filter: brightness(1.06); }
        .kc-aksiyon-not { display: inline-flex; align-items: center; gap: 7px; margin-top: 8px;
          font-size: 12px; color: var(--metin3); }
        .kc-aksiyon-spin { display: inline-block; animation: kc-donsun 1.4s linear infinite; }
        @keyframes kc-donsun { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .kc-aksiyon-spin { animation: none; } }
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
          /* Çalışan adımın üç noktası — sırayla parlar. Duran bir satırla çalışan satır
             arasındaki farkı yalnız RENK taşısaydı, akış kilitlendiğinde de aynı görünürdü. */
          .kc-adim-nokta i { animation: kc-parla 1.2s ease-in-out infinite; }
          .kc-adim-nokta i:nth-child(2) { animation-delay: .18s; }
          .kc-adim-nokta i:nth-child(3) { animation-delay: .36s; }
          @keyframes kc-parla { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
          .kc-imlec { animation: kc-yanip 1s step-end infinite; }
          @keyframes kc-yanip { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        }
      `}</style>

      {/* ── Başlık — FİDAN koç avatarı + tanım + geçmiş notu ── */}
      <div className="glass rounded-none border-x-0 border-t-0">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          {/* Mobilde geçmiş çekmecesinin tek kapısı. Masaüstünde panel zaten görünür. */}
          {!masaustu && (
            <button
              onClick={() => setPanelAcik(true)}
              title="Sohbet geçmişi"
              aria-label={`Sohbet geçmişi${oturumlar.length ? ` — ${oturumlar.length} sohbet` : ''}`}
              className="grid size-11 flex-none cursor-pointer place-items-center rounded-xl transition-colors"
              style={{ background: 'var(--v0)', border: '1px solid var(--cam-kenar)', color: 'var(--metin2)' }}
            >
              <Icon name="history" size={16} color="currentColor" />
            </button>
          )}
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
            className="grid size-11 flex-none cursor-pointer place-items-center rounded-xl transition-colors"
            style={{ background: 'var(--v0)', border: '1px solid var(--cam-kenar)', color: 'var(--metin2)' }}
          >
            <Icon name="edit" size={16} color="currentColor" />
          </button>
        </div>
      </div>

      {/* ── Mesajlar ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-3.5 px-4 py-5">
          {msgs.map((msg) => <Balon key={msg.id} msg={msg} sessionId={aktifId || sessionId.current} />)}

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
          {/* Test sonucu kartı — analiz İSTEĞE BAĞLI (otomatik LLM çağrısı yok). */}
          {testOzeti && (
            <TestKarti
              ozet={testOzeti}
              onKapat={() => setTestOzeti(null)}
              onAnaliz={() => {
                const veri = testOzeti
                setTestOzeti(null)   // kart tek kullanımlık: analiz istendi, iş bitti
                // Görünen: kısa cümle. Modele giden: `veri` → sunucuda system yönergesi.
                void send(ANALIZ_METNI, veri)
              }}
            />
          )}
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

      {/* Mobil: aynı panel vaul çekmecesinde (Bahçe'deki desenle aynı). */}
      {!masaustu && (
        <Drawer.Root open={panelAcik} onOpenChange={setPanelAcik}>
          <Drawer.Portal>
            <Drawer.Overlay className="fixed inset-0 z-[85] backdrop-blur-sm" style={{ background: 'rgba(12, 18, 14, 0.5)' }} />
            <Drawer.Content className="kc-cekmece">
              <div className="kc-cekmece-tut" aria-hidden />
              <Drawer.Title className="kc-cekmece-baslik">Sohbet geçmişi</Drawer.Title>
              {panel}
            </Drawer.Content>
          </Drawer.Portal>
        </Drawer.Root>
      )}
    </div>
  )
}

/**
 * Akış adımları kartı — Koç yanıt üretirken sohbete düşen ilerleme satırları.
 *
 * `aria-live="polite"`: ekran okuyucu her yeni adımı duyurur ama okumayı kesmez.
 * `aria-busy`: satır bitmemişse "çalışıyor" bilgisi görsel nabza değil, öznitelike bağlı.
 */
function AkisAdimlari({ adimlar }: { adimlar: Adim[] }) {
  return (
    <div className="kc-akis" role="status" aria-live="polite">
      {adimlar.map((a, i) => (
        <div key={`${a.anahtar}-${i}`} className={cn('kc-adim', a.bitti && 'kc-adim-bitti')} aria-busy={!a.bitti}>
          <span className="kc-adim-ikon">
            <Icon name={a.bitti ? 'check' : a.ikon} size={11} color="currentColor" strokeWidth={a.bitti ? 2.4 : 1.9} />
          </span>
          <span className="min-w-0 truncate">{a.etiket}</span>
          {!a.bitti && <span className="kc-adim-nokta" aria-hidden><i /><i /><i /></span>}
        </div>
      ))}
    </div>
  )
}

function Balon({ msg, sessionId }: { msg: Msg; sessionId: string }) {
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
        {/* İlerleme bildirimleri — akış sürerken boru hattının adımları, bitince yalnız
            çalışmış araçlar (adimlariKapat). Balonun ÜSTÜNDE: yanıt metni akmaya
            başladığında satırlar cevabın altında kalıp yerini kaydırmasın. */}
        {!!msg.adimlar?.length && <AkisAdimlari adimlar={msg.adimlar} />}
        {/* ⚠️ METİN YOKKEN VE ADIM KARTI VARKEN BALON ÇİZİLMEZ. İkisi birlikte çizilseydi
            adım kartının hemen altında boş bir balon dururdu — üstelik "Koç yazıyor"
            noktaları kartın söylediğini üçüncü kez tekrar ederdi. Adım yoksa (yedek yol)
            eski davranış aynen sürer: boş balon + zıplayan noktalar. */}
        {(msg.text || !msg.adimlar?.length) && (
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
        )}
        {/* Eylem butonları — akış BİTİNCE. Akış sırasında çizmek, model konuşmayı
            sürdürürken tıklanabilir bir hedef göstermek olurdu (yarım öneri). */}
        {!msg.streaming && !!msg.eylemler?.length && <EylemSeridi eylemler={msg.eylemler} sessionId={sessionId} />}
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
