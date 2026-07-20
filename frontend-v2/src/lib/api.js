import { supabase } from './supabase.js'

// learnup-brain istemcisi. Her istekte Supabase oturumundan JWT çekip Bearer olarak ekler.
// Backend JWKS ile YEREL doğruluyor (ağ çıkışı yok). Base '/api' → vite proxy (dev) / nginx (prod).
const API_BASE = import.meta.env.VITE_API_URL ?? '/api'

async function authHeader() {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/** POST /api/v1/<path> — JSON gövdeli. Hata durumunda anlamlı Error fırlatır. */
export async function apiPost(path, body = {}) {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  // ÖNCE `message` (Türkçe, insan için), SONRA `error` (snake_case kod, makine için).
  // Tersi olduğunda kullanıcı toast'ta "ogrenci_bulunamadi" görüyordu.
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/** GET /api/v1/<path>?<query> */
export async function apiGet(path, params = {}) {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined && v !== ''),
  ).toString()
  const res = await fetch(`${API_BASE}/v1${path}${qs ? `?${qs}` : ''}`, {
    headers: { ...(await authHeader()) },
  })
  const json = await res.json().catch(() => ({}))
  // ÖNCE `message` (Türkçe, insan için), SONRA `error` (snake_case kod, makine için).
  // Tersi olduğunda kullanıcı toast'ta "ogrenci_bulunamadi" görüyordu.
  if (!res.ok) throw new Error(json?.message || json?.error || `İstek başarısız (${res.status})`)
  return json
}

/** DELETE /api/v1/<path> */
export async function apiDelete(path) {
  const res = await fetch(`${API_BASE}/v1${path}`, {
    method: 'DELETE',
    headers: { ...(await authHeader()) },
  })
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
