import { supabase } from './supabase.js'

// learnup-brain istemcisi. Her istekte Supabase oturumundan JWT çekip Bearer olarak ekler.
// Backend JWKS ile YEREL doğruluyor (ağ çıkışı yok). Base '/api' → vite proxy (dev) / nginx (prod).
const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

let cachedToken = null
let cachedAt = 0
const TOKEN_TTL_MS = 60_000

supabase.auth.onAuthStateChange((evt, session) => {
  cachedToken = session?.access_token ?? null
  cachedAt = cachedToken ? Date.now() : 0
})

async function authHeader() {
  if (cachedToken && Date.now() - cachedAt < TOKEN_TTL_MS) {
    return { Authorization: `Bearer ${cachedToken}` }
  }
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  cachedToken = token ?? null
  cachedAt = token ? Date.now() : 0
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function clearToken() {
  cachedToken = null
  cachedAt = 0
}

/** POST /api/v1/<path> — JSON gövdeli. Hata durumunda anlamlı Error fırlatır. */
export async function apiPost(path, body = {}, opts = {}) {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (res.status === 401) clearToken()
  const json = await res.json().catch(() => ({}))
  // ÖNCE `message` (Türkçe, insan için), SONRA `error` (snake_case kod, makine için).
  // Tersi olduğunda kullanıcı toast'ta "ogrenci_bulunamadi" görüyordu.
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/**
 * PUT /api/v1/<path> — JSON gövdeli.
 *
 * POST'tan ayrı: PUT "bu kaynağın değeri artık BU" der ve tekrarı zararsızdır
 * (özgünlük eşiği gibi ayarlar). POST yeni bir iş başlatır — ikisini karıştırmak,
 * iki kez tıklamanın iki farklı sonuç verdiği uçlar üretir.
 */
export async function apiPut(path, body = {}, opts = {}) {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (res.status === 401) clearToken()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/** GET /api/v1/<path>?<query> */
export async function apiGet(path, params = {}, opts = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  ).toString()
  const res = await fetch(`${API_BASE}/v1${path}${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeader()) },
    signal: opts.signal,
  })
  if (res.status === 401) clearToken()
  const json = await res.json().catch(() => ({}))
  // ÖNCE `message` (Türkçe, insan için), SONRA `error` (snake_case kod, makine için).
  // Tersi olduğunda kullanıcı toast'ta "ogrenci_bulunamadi" görüyordu.
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/**
 * PATCH /api/v1/<path> — KISMÎ güncelleme.
 *
 * PUT'tan ayrı: PATCH yalnız gönderilen alanlara dokunur. Künye düzeltmede bu şart —
 * PUT semantiğiyle gönderilmemiş her alan "temizlensin" diye okunurdu.
 */
export async function apiPatch(path, body = {}, opts = {}) {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (res.status === 401) clearToken()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/** DELETE /api/v1/<path> */
export async function apiDelete(path, opts = {}) {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'DELETE',
    headers: { ...(await authHeader()) },
    signal: opts.signal,
  })
  if (res.status === 401) clearToken()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/**
 * POST /api/v1/chat — SSE akışı. `onEvent(type, data)` her olayda çağrılır
 * (type: 'token' | 'tool' | 'done' | 'error'). Kaptan sohbeti için (2. faz).
 */
export async function streamChat({ sessionId, message }, onEvent, signal) {
  const res = await fetch(`${API_BASE}/v1/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify({ sessionId, message }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`sohbet başlatılamadı (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const parts = buf.split('\n\n')
    buf = parts.pop() ?? ''
    for (const block of parts) {
      const evLine = block.match(/^event:\s*(.*)$/m)
      const dataLine = block.match(/^data:\s*([\s\S]*)$/m)
      if (!evLine) continue
      let data = dataLine?.[1] ?? ''
      try { data = JSON.parse(data) } catch { /* düz metin */ }
      onEvent(evLine[1].trim(), data)
    }
  }
}
