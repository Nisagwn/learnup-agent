/**
 * KASITLI HTTP HATASI.
 *
 * Route'lar 4xx'i `throw new HttpHatasi(...)` ile bildirir; errorHandler status/code'u
 * olduğu gibi geçirir. Bunsuz her fırlatılan hata 500 olurdu (middleware/error.ts:18).
 *
 * `code` MAKİNE için (snake_case, istemci switch'ler), `message` İNSAN için (Türkçe cümle).
 * Gövde şekli mevcut sözleşmeyle uyumlu: auth.ts:26 `{ error: 'missing_bearer' }`,
 * rateLimit.ts:42 `{ error: 'cok_fazla_uretim', message: '…' }`.
 */
export class HttpHatasi extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'HttpHatasi'
  }
}

/** 403 — rol yetersiz / onaysız. */
export function yetkisiz(code: string, message: string): HttpHatasi {
  return new HttpHatasi(403, code, message)
}

/**
 * 404 — kaynak yok VEYA çağıranın görmeye hakkı yok.
 *
 * ⚠️ Sahiplik ihlalinde de 404 döneriz, 403 DEĞİL: 403, verilen uuid'nin gerçek bir
 * kayda ait olduğunu DOĞRULAR ve ucu numaralandırma kehanetine çevirir. Ayrım
 * sunucu tarafında `warn` ile loglanır (bkz. yetki.ts).
 */
export function bulunamadi(code: string, message: string): HttpHatasi {
  return new HttpHatasi(404, code, message)
}

/** 400 — istemci girdisi geçersiz. */
export function gecersizIstek(code: string, message: string): HttpHatasi {
  return new HttpHatasi(400, code, message)
}
