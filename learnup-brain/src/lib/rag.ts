import { createHash } from 'node:crypto'
import { openrouter } from '../clients/openrouter.js'
import { supabase } from '../clients/supabase.js'
import { redisTry } from '../clients/redis.js'
import { EMBED_MODEL, EMBED_DIM } from './models.js'
import { gorselBagimli } from '../utils/soru-saglik.js'

export type GroundingChunk = {
  id: number
  content: string
  context: string | null
  kazanim_code: string | null
  similarity: number
}

export type Exemplar = {
  question_text: string
  options: Record<string, string>
  correct_option: string
  solution: string
  /** 0015 sonrası RPC döndürür ('TYT'|'AYT'); migration basılmadıysa alan gelmez → opsiyonel.
   *  Şu an yalnız KÜNYE (eval/hakem-sınavı verisi) — seçim daraltmada KULLANILMIYOR
   *  ("AYT=zor" doğrulanmadı; içerik-ekseni sapması riski — plan: Kesilenler). */
  exam_label?: string | null
  kazanim_id?: number | null
  /** 0017 sonrası RPC döndürür ('kolay'|'orta'|'zor'|null); migration basılmadıysa alan gelmez
   *  → opsiyonel. Sıralama zaten SQL'de yapılır; buradaki kullanım ikinci emniyet (aşağı bak). */
  difficulty?: string | null
}

/**
 * Embeddings — text-embedding-3-small @768, OpenRouter üzerinden (OpenAI faturası kullanılmaz).
 * F1 DRIFT-GUARD: `dimensions: EMBED_DIM` verilmezse model 1536 döner → `vector(768)` insert patlar.
 * Dönen her vektörün uzunluğu DB'ye gitmeden SERT doğrulanır (fail-fast).
 */
/** Embedding çağrısı için timeout. Router'daki LLM çağrılarının aksine embeddings doğrudan
 *  SDK'ya gidiyor — ve OpenAI SDK varsayılanı `timeout: 600_000` (10 dk) + `maxRetries: 2`,
 *  yani takılan tek bir istek ~30 DAKİKA asılı kalabilir. embed() sohbetin sıcak yolunda
 *  (recallMemories) ve her üretim turunda çağrılıyor → tek bir yavaş embedding tüm isteği
 *  rehin alır. 20 sn fazlasıyla yeterli; aşarsa çağıran hata alır ve isteği bırakır. */
const EMBED_TIMEOUT_MS = 20_000

/**
 * EMBEDDING ÖNBELLEĞİ — kredisiz koşunun ikinci yarısı.
 *
 * ⚠️ EMBEDDINGS PARALIDIR VE MODEL ROUTER'DAN GEÇMEZ. Router'ın ücretsiz-zincir/bütçe/tavan
 * kapılarının hiçbiri buraya uygulanmaz; bu çağrı doğrudan SDK ile gider. Yani "kredisiz koşu"
 * dediğimiz şey, KREDISIZ kipi açıkken bile embedding kadar fatura üretiyordu.
 *
 * Tutar küçük ama sorun tutarda değil GARANTİDE: `generateVerifiedSet` hücre başına 1 embed
 * yapıyor ve sorgu dizesi (`subject topic kazanim difficulty`) TAMAMEN DETERMİNİSTİK — aynı
 * hücre her yeniden denemede aynı vektörü yeniden satın alıyordu. 907 kazanım × 3 zorluk =
 * en fazla 2721 farklı sorgu; önbellekle bu bir kez ödenir, sonraki tüm koşular $0.
 *
 * ⚠️ TTL YOK — bilerek. Önbelleğin anahtarı metnin KENDİSİ (sha1) ve embedding modeli anahtara
 * dahil: metin değişirse anahtar değişir, model değişirse anahtar değişir. Yani bayatlayabilecek
 * bir şey yok; TTL vermek yalnız aynı vektörü tekrar satın almak demek olurdu.
 *
 * ⚠️ Redis yoksa/erişilemezse SESSİZCE eski davranışa döner (redisTry fallback) — önbellek bir
 * hızlandırıcıdır, bağımlılık değil. Bu dosyanın geri kalanındaki "Redis hot-path, hakikat
 * değil" çizgisiyle aynı.
 */
const embedKey = (text: string): string =>
  `lb:embed:${EMBED_MODEL}:${EMBED_DIM}:${createHash('sha1').update(text).digest('hex')}`

const embedOnbellekOku = async (texts: string[]): Promise<Array<number[] | null>> =>
  redisTry(
    async (r) => {
      const ham = await r.mget(...texts.map(embedKey))
      return ham.map((s) => {
        if (!s) return null
        try {
          const v = JSON.parse(s) as number[]
          // Bozuk/eski boyutlu kayıt önbellekte kalmışsa YOK say — DB'ye yanlış boyut gitmesin.
          return Array.isArray(v) && v.length === EMBED_DIM ? v : null
        } catch {
          return null
        }
      })
    },
    texts.map(() => null),
  )

const embedOnbellekYaz = async (ciftler: Array<[string, number[]]>): Promise<void> => {
  if (!ciftler.length) return
  await redisTry(async (r) => {
    const p = r.pipeline()
    for (const [text, vec] of ciftler) p.set(embedKey(text), JSON.stringify(vec))
    await p.exec()
    return true
  }, false)
}

export async function embed(texts: string[]): Promise<number[][]> {
  const onbellekli = await embedOnbellekOku(texts)
  // Yalnız ISKALAYANLARI satın al. Sıra korunur: eksik indeksler yerlerine geri yazılır.
  const eksikIdx = onbellekli.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0)
  if (!eksikIdx.length) return onbellekli as number[][]

  const res = await openrouter.embeddings.create(
    {
      model: EMBED_MODEL,
      input: eksikIdx.map((i) => texts[i]),
      dimensions: EMBED_DIM,
    },
    { timeout: EMBED_TIMEOUT_MS, maxRetries: 1 },
  )
  const yeni = res.data.map((d) => d.embedding)
  for (const v of yeni) {
    if (v.length !== EMBED_DIM) {
      throw new Error(`EMBED_DIM drift: beklenen ${EMBED_DIM}, gelen ${v.length}`)
    }
  }
  // ⚠️ Sağlayıcı isteneni sayıca karşılamazsa yerine koyma sessizce KAYAR (yanlış metne yanlış
  // vektör) — bu, RAG'de teşhis edilmesi en zor arıza sınıfıdır. Sert kontrol.
  if (yeni.length !== eksikIdx.length) {
    throw new Error(`embedding sayısı tutmadı: istenen ${eksikIdx.length}, gelen ${yeni.length}`)
  }

  const sonuc = onbellekli.slice()
  eksikIdx.forEach((idx, k) => { sonuc[idx] = yeni[k] })
  await embedOnbellekYaz(eksikIdx.map((idx, k) => [texts[idx], yeni[k]] as [string, number[]]))
  return sonuc as number[][]
}

/** Grounding retrieval — ltree ön-ekli + vektör sıralı (match_yks_knowledge RPC).
 *  `qvec` verilirse embed ATLANIR. generateVerifiedSet grounding ve exemplar için BİREBİR
 *  AYNI sorgu dizesini kullanıyor; iki kez embed etmek bedava değil (ağ + token). */
export async function retrieveGrounding(p: {
  subject: string
  paths: string[]
  query: string
  qvec?: number[]
  k?: number
}): Promise<GroundingChunk[]> {
  const qe = p.qvec ?? (await embed([p.query]))[0]
  const { data, error } = await supabase.rpc('match_yks_knowledge', {
    query_embedding: qe,
    filter_subject: p.subject,
    filter_paths: p.paths,
    match_count: p.k ?? 8,
  })
  if (error) throw error
  return (data ?? []) as GroundingChunk[]
}

/**
 * Exemplar retrieval — altın ÖSYM soruları (match_yks_exemplars RPC).
 *
 * ⚠️ `filter_topic` BİLEREK null GEÇİLİYOR — geri koyma. RPC'deki topic filtresi BİREBİR string
 * eşleşmesidir (`e.topic = filter_topic`); çağıran ise oraya `curriculum_nodes.title` gönderiyordu.
 * Bunlar farklı evrenler: müfredat başlığı "Fizik biliminin tanımına yönelik tümevarımsal akıl
 * yürütebilme", örneğin konusu ise belgenin kendi başlığı ("Sözcükte Anlam").
 *
 * ÖLÇÜLDÜ (canlı DB): node.title 881 tür · exemplar.topic 206 tür · ORTAK yalnız 168.
 * Yani kazanımların ~%80'i için filtre HİÇBİR örnek bırakmıyordu. 6 dersten örneklem:
 *   birebir topic → 11/24 örnek (Tarih'te SIFIR) · topic=null → 24/24 (her kazanıma 4)
 * Sonuç: model, "ÖSYM formatına benzet" denilen soruları çoğu kazanımda HİÇ GÖRMÜYORDU.
 * Havuzdaki "ÖSYM'ye benzemiyor / çeşitlilik yok" şikâyetinin birinci sebebi buydu.
 *
 * Doğru araç zaten tabloda: RPC vektör benzerliğiyle sıralıyor (`embedding <=> query_embedding`)
 * ve `query` dizesi konuyu ZATEN içeriyor (`${subject} ${topic} ${kazanim} ${difficulty}`).
 * Yani konu yakınlığı SEMANTİK olarak kuruluyor; exact-match onu boğuyordu. `subject` filtresi
 * kalır (ders dışına çıkmasın), konuyu vektöre bırakıyoruz.
 *
 * `difficulty` filtresi kalıyor: RPC NULL zorluklu satırı ELEMİYOR (0009) — çıkmış soruların
 * zorluğu bilinmediği için hepsi her zorluk için geçerli üslup örneğidir.
 */
export async function retrieveExemplars(p: {
  subject: string
  /** Yalnız çağıranın niyetini belgelemek için; filtreye GİRMEZ (yukarı bak) — konu `query`
   *  dizesi üzerinden vektöre gider. */
  topic: string
  difficulty: string
  query: string
  qvec?: number[]
  k?: number
}): Promise<Exemplar[]> {
  const istenen = p.k ?? 4
  const qe = p.qvec ?? (await embed([p.query]))[0]
  // FAZLA ÇEK, BOZUĞU ELE, İSTENENİ VER. Bozukları elemek sayıyı düşürmemeli: örnek yoksa
  // model biçimi hiç göremez (exemplar'ın TEK işi biçim). 3× tampon, %6'lık en kötü ders
  // (Matematik) için fazlasıyla yeter.
  const { data, error } = await supabase.rpc('match_yks_exemplars', {
    query_embedding: qe,
    filter_subject: p.subject,
    filter_topic: null, // ← exact-match kapalı; konu benzerliği vektörde (yukarıdaki ölçüm)
    filter_difficulty: p.difficulty,
    match_count: istenen * 3,
  })
  if (error) throw error
  // ŞEKLİ KAYBOLMUŞ SORU ÖRNEK OLAMAZ. ÖLÇÜLDÜ: 1730 çıkmış sorunun 32'si (%1.8, Matematik'te
  // %6) PDF→metin dönüşümünde şeklini/indisini yitirmiş ve çözülemez hâlde. Bunlar modele
  // "ÖSYM böyle yazar" diye gidiyordu — biçim öğreten şeyin kendisi bozuksa öğrettiği de bozuk.
  // Eleme BURADA, çekme anında: RPC saf vektör araması, sağlık bilgisi kodda durur.
  const saglam = ((data ?? []) as Exemplar[]).filter((e) => !gorselBagimli(e.question_text))

  // ── ZORLUĞU TUTAN ÖRNEK ÖNCE — İKİNCİ EMNİYET (asıl sıralama SQL'de, migration 0017) ──
  // RPC'nin zorluk süzgeci NULL'a TOLERANSLIDIR (`e.difficulty is null` HER siparişe girer).
  // Zorluk bilinmezken doğruydu; etiketleme başlayınca NULL nötr değil JOKER oldu. ÖLÇÜLDÜ
  // (etiketlemenin %31'inde): Matematik zor=19 ↔ joker=267 → saf vektör sırasıyla ilk 4 örneğe
  // ortalama 0.3 gerçek-zor düşüyordu, yani etiketler üretime hiç yansımıyordu.
  //
  // ⚠️ ASIL DÜZELTME SQL TARAFINDA (0017: `order by (e.difficulty = filter_difficulty) desc`).
  // Buradaki sıralama TEK BAŞINA YETMEZ: RPC istenenin 3 katını çekse bile (12 aday), joker'ler
  // havuzda 14× fazlayken vektör sırası etiketlileri ilk 12'ye bile sokmaz. Bu satırlar yalnız
  // aynı niyeti kodda görünür kılar ve 0017 basılmadan önce zarar vermez (alan gelmezse
  // difficulty undefined → hepsi joker sayılır → sıra korunur, davranış eskisi gibi).
  //
  // Süzgeç DARALTILMADI: Fizik'te "zor" etiketli örnek henüz SIFIR; sert filtre orada modeli
  // örneksiz bırakırdı ve exemplar'ın TEK işi biçim öğretmek. Tercih ederiz, dışlamayız.
  const tutan = saglam.filter((e) => e.difficulty === p.difficulty)
  const joker = saglam.filter((e) => e.difficulty !== p.difficulty)
  return [...tutan, ...joker].slice(0, istenen)
}
