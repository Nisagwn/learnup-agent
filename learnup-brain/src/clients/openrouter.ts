import OpenAI from 'openai'
import { env } from '../config/env.js'

/**
 * OpenRouter istemcisi — OpenAI-uyumlu chat/completions (DeepSeek modelleri).
 * Tüm LLM üretim/doğrulama/chat trafiği buradan geçer.
 * `defaultHeaders` OpenRouter attribution/rank için önerilir.
 */
export const openrouter = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': env.APP_URL,
    'X-Title': 'LearnUp YKS Beyin',
  },
})
