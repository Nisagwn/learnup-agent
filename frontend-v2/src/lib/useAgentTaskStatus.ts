import { useEffect, useRef, useState } from 'react'
import { apiGet } from './api.js'

/**
 * AJAN GÖREV DURUMU YOKLAYICISI (polling).
 *
 * Arka plana atılan görevleri (POST /admin/eval/kosum, POST /agents/dispatch …) takip eder.
 * O uçlar `202 Accepted` + `taskId` döner ve iş worker'da koşar — yani sonuç HTTP yanıtında
 * YOKTUR. Sunucudan istemciye push kanalı da yok: SSE yalnız sohbette (/api/chat) kullanılıyor.
 * Geriye yoklama kalıyor.
 *
 * ⚠️ NEDEN SSE/WebSocket DEĞİL: bu görevler dakikalar sürer ve saniyede bir güncelleme
 * üretmez — durumları PENDING → RUNNING → COMPLETED, yani üç geçiş. Böyle bir akış için
 * kalıcı bağlantı açmak, açık bağlantıyı iki brain node'undan birine yapıştırmak ve
 * yeniden bağlanma mantığı yazmak demektir. Birkaç saniyede bir tek SELECT çok daha ucuz.
 *
 * ⚠️ ARALIK VE TAVAN KEYFİ DEĞİL:
 *   · 3 sn → dakikada 20 istek. Uç `standardLimiter`'da (60/dk); llmLimiter'da (10/dk)
 *     olsaydı yoklama daha ilk yarım dakikada 429 alırdı (bkz. app.ts mount sırası).
 *   · 2 dk tavan → SONSUZ YOKLAMA YOK. Worker ölür, görev FAILED bile yazılamazsa istemci
 *     sonsuza kadar yoklamamalı. Tavan dolunca 'zaman_asimi' durumuna düşülür; bu "görev
 *     başarısız" DEMEK DEĞİLDİR — görev arka planda sürüyor olabilir, yalnız BU EKRAN
 *     beklemeyi bıraktı. Metin de bunu söyler.
 */

/**
 * BAĞLANABİLECEK DİĞER NOKTALAR — kod eklenmedi, çünkü çağıran yok.
 *
 * Bu hook şu an tek yere bağlı: Ayarlar → Ops → "Eval ölçümünü koştur"
 * (POST /admin/eval/kosum). Sunucuda `202 Accepted` + `taskId` dönen İKİ uç daha var ve
 * ikisinin de frontend'de HİÇBİR çağıranı yok — varsayımla ekran uydurmamak için
 * dokunulmadı, yalnız not düşülüyor:
 *
 *  1) POST /admin/havuz/uretim  (admin-havuz.routes.ts, kind: 'forge_topup')
 *     Yanıt tipi `UretimTetikYanit` frontend'de types.admin.ts:407'de TANIMLI ama
 *     kullanılmıyor — yani arayüz bir zamanlar planlanmış, yapılmamış. Doğal yeri
 *     `components/havuz-moderasyon.tsx`: kapsama tablosunda açığı olan bir (kazanım, zorluk)
 *     hücresine "üret" düğmesi + bu hook ile durum satırı. Üretim dakikalarca sürdüğü ve
 *     LLM harcadığı için ilerleme göstergesi burada eval'den bile gerekli.
 *
 *  2) POST /agents/dispatch  (agents.routes.ts, öğrenci tarafı beyaz liste)
 *     Öğrencinin kendi hesabı için 'plan' / 'diagnose' / 'compact' gibi görevleri
 *     kuyruğa atabildiği genel uç. Frontend'de hiç çağrılmıyor; `screens/Rota.tsx`
 *     bunun senkron kardeşini (POST /agents/pusula) kullanıyor ve tool-loop bitene kadar
 *     isteği açık tutuyor. Rota'yı asenkrona çevirmek istenirse yol şu: `/agents/pusula`
 *     yerine `/agents/dispatch { kind: 'plan' }` çağır, dönen taskId'yi bu hook'a ver.
 *     ⚠️ Bu bir DAVRANIŞ değişikliğidir (senkron → asenkron), o yüzden burada yapılmadı.
 */

/** Sunucudaki `agent_tasks.status` değerleri (GET /agents/status/:taskId). */
export type GorevDurumu = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'

/** Hook'un dışarı verdiği durum — sunucu durumlarına iki istemci-tarafı hâl eklenir. */
export type YoklamaDurumu = GorevDurumu | 'zaman_asimi' | 'bos'

export interface AgentTaskStatus {
  durum: YoklamaDurumu
  /** Görev tamamlandıysa worker'ın döndürdüğü gövde. */
  sonuc: unknown
  /** FAILED ise sunucunun yazdığı hata; yoklama isteği patlarsa onun mesajı. */
  hata: string | null
  /** Hâlâ yoklanıyor mu? (yükleniyor göstergesi bunu kullanır) */
  yokluyor: boolean
}

const ARALIK_MS = 3_000
const TAVAN_MS = 2 * 60_000

const BASLANGIC: AgentTaskStatus = { durum: 'bos', sonuc: null, hata: null, yokluyor: false }

/**
 * `taskId` verildiği andan itibaren görevi yoklar; terminal duruma ulaşınca durur.
 * `taskId` null ise hiçbir şey yapmaz (henüz görev başlatılmamış demektir).
 *
 * @example
 *   const [taskId, setTaskId] = useState<string | null>(null)
 *   const gorev = useAgentTaskStatus(taskId)
 *   // ...
 *   const y = await apiPost('/admin/eval/kosum', {})
 *   setTaskId(y.taskId)
 */
export function useAgentTaskStatus(taskId: string | null): AgentTaskStatus {
  const [durum, setDurum] = useState<AgentTaskStatus>(BASLANGIC)

  // Etkin `taskId`'yi effect dışında da okuyabilmek için değil — yalnız temizlik
  // sırasında geç gelen yanıtı elemek için gerekli (bkz. `iptal` bayrağı).
  const zamanlayici = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!taskId) {
      setDurum(BASLANGIC)
      return
    }

    let iptal = false
    const baslangic = Date.now()
    const controller = new AbortController()

    setDurum({ durum: 'PENDING', sonuc: null, hata: null, yokluyor: true })

    /** Zamanlayıcıyı kapatır. Hem terminal durumda hem unmount'ta çağrılır. */
    const durdur = (): void => {
      if (zamanlayici.current !== null) {
        clearInterval(zamanlayici.current)
        zamanlayici.current = null
      }
    }

    const yokla = async (): Promise<void> => {
      // Tavan: görev bitmese de yoklamayı bırak. Sonsuz yoklama, ölmüş bir worker'ı
      // sonsuza kadar sorgulamak demektir.
      if (Date.now() - baslangic > TAVAN_MS) {
        durdur()
        if (!iptal) setDurum((s) => ({ ...s, durum: 'zaman_asimi', yokluyor: false }))
        return
      }

      try {
        const y = await apiGet(`/agents/status/${taskId}`, {}, { signal: controller.signal })
        if (iptal) return

        const gelen = (y?.status ?? 'PENDING') as GorevDurumu
        const bitti = gelen === 'COMPLETED' || gelen === 'FAILED'
        if (bitti) durdur()

        setDurum({
          durum: gelen,
          sonuc: y?.result ?? null,
          hata: gelen === 'FAILED' ? (y?.error ?? 'Görev başarısız oldu.') : null,
          yokluyor: !bitti,
        })
      } catch (err: any) {
        if (iptal || err?.name === 'AbortError') return

        /**
         * ⚠️ TEK BİR HATA YOKLAMAYI ÖLDÜRMEZ — 404 hariç.
         *
         * Görev PG'ye yazıldıktan hemen sonra yoklanırsa ya da istek diğer brain node'una
         * düşerse geçici bir hata görülebilir; bir sonraki tur düzelir. Ama 404 kalıcıdır
         * (görev yok ya da başka kullanıcının) — orada ısrar etmek anlamsız.
         */
        const kalici = typeof err?.message === 'string' && err.message.includes('görev bulunamadı')
        if (kalici) {
          durdur()
          setDurum({ durum: 'FAILED', sonuc: null, hata: 'Görev bulunamadı.', yokluyor: false })
        }
      }
    }

    void yokla() // ilk yoklama HEMEN — 3 sn boş ekran bekletme
    zamanlayici.current = setInterval(() => void yokla(), ARALIK_MS)

    // Bileşen sökülünce / taskId değişince: interval temizlenir, uçuştaki istek iptal edilir,
    // geç gelen yanıt `iptal` bayrağıyla elenir (sökülmüş bileşene setState yok).
    return () => {
      iptal = true
      durdur()
      controller.abort()
    }
  }, [taskId])

  return durum
}
