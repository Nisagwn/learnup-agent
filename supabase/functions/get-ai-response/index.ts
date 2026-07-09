// AI sohbet proxy'si (OpenRouter üzerinden DeepSeek). API anahtarı sunucuda kalır.
import { preflight, json } from '../_shared/http.ts';
import { llmChat, CHAT_MODEL } from '../_shared/ai.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);
  try {
    const { history, userMessage } = await req.json();
    if (!userMessage) return json({ error: 'userMessage eksik.' }, 400);

    const messages: any[] = [{
      role: 'system',
      content: 'Sen LearnUp platformunun asistanısın. Lise müfredatına hakimsin ve öğrencilere Türkçe, destekleyici ve kısa cevaplar verirsin.',
    }];
    if (Array.isArray(history)) {
      history.slice(-4).forEach((item: any) => {
        const role = item.role === 'model' || item.role === 'assistant' ? 'assistant' : 'user';
        const content = (item.parts && item.parts[0] && item.parts[0].text) || item.content || item.text || '';
        if (content) messages.push({ role, content });
      });
    }
    messages.push({ role: 'user', content: userMessage });

    const reply = await llmChat(messages, { model: CHAT_MODEL, temperature: 0.5, max_tokens: 1024 });
    return json({ reply: reply || 'Cevap üretilemedi.' });
  } catch (err: any) {
    return json({ error: err?.message || 'Sunucu hatası.' }, 500);
  }
});
