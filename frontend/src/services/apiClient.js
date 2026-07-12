// ============================================================
// LearnUp backend istemcisi — supabase.functions.invoke(...) YERİNE geçer.
// Tüm mantık artık Edge Functions'ta değil, learnup-brain (Express/Bun) backend'inde.
//
// Tasarım: `apiInvoke(fnName, { body })` imzası ve `{ data, error }` dönüşü,
// supabase.functions.invoke ile BİREBİR aynı → çağrı noktaları neredeyse hiç değişmez.
// JWT, Supabase oturumundan alınıp Authorization: Bearer olarak eklenir (invoke gibi).
//
// Taban URL: VITE_API_URL (varsa) yoksa '/api'.
//   • Docker/prod: nginx '/api' → brain:8080 proxy'ler (tek origin, CORS yok).
//   • Vite dev:    vite.config.js server.proxy '/api' → http://localhost:8080.
// ============================================================
import { supabase } from '../supabase';

// Eski Edge fonksiyon adı → backend route (MIGRATION-MAP.md). Hepsi POST.
const ROUTES = {
  'generate-questions': '/questions/generate',
  'generate-targeted-set': '/questions/targeted',
  'save-ai-questions': '/questions/save',
  'get-ai-response': '/ai/respond',
  'submit-answer': '/practice/next',
  'record-answer': '/practice/record',
  'submit-assignment': '/assignments/submit',
  'submit-targeted-assignment': '/assignments/targeted/submit',
  'ensure-daily-state': '/gamification/daily',
  'claim-quest-reward': '/gamification/quests/claim',
  'use-streak-freeze': '/gamification/streak/freeze',
  'purchase-garden-item': '/garden/purchase',
  'plant-seed': '/garden/plant',
  'move-plant': '/garden/move',
  'remove-plant': '/garden/remove',
  'delete-account': '/account/delete',
};

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

/**
 * supabase.functions.invoke(fnName, { body }) yerine geçen ince istemci.
 * @param {string} fnName  Eski Edge fonksiyon adı (ROUTES anahtarı).
 * @param {{ body?: any }} [opts]
 * @returns {Promise<{ data: any, error: Error|null }>}
 */
export async function apiInvoke(fnName, { body } = {}) {
  const path = ROUTES[fnName];
  if (!path) {
    return { data: null, error: new Error(`apiInvoke: bilinmeyen fonksiyon '${fnName}'`) };
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body ?? {}),
    });

    // Gövde JSON değilse (ör. 502 HTML) çökme; null'a düş.
    const raw = await res.text();
    let json = null;
    if (raw) {
      try { json = JSON.parse(raw); } catch { json = null; }
    }

    if (!res.ok) {
      const msg = json?.error || json?.message || `İstek başarısız (HTTP ${res.status})`;
      return { data: null, error: new Error(msg) };
    }
    return { data: json, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

export default apiInvoke;
