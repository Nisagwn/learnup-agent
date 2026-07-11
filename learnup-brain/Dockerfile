# LearnUp "beyin" mikroservisi — Bun tabanlı imaj.
# Bun TypeScript'i yerel çalıştırır → ayrı build/derleme adımı yok.
# Çok aşamalı: bağımlılıkları önce kur (katman cache), sonra kaynağı kopyala.

# ── 1) Bağımlılıklar ────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
# Yalnız manifest'leri kopyala → lockfile değişmedikçe bu katman cache'lenir.
COPY package.json bun.lock ./
# --frozen-lockfile: bun.lock ile birebir, üretim için deterministik kurulum.
RUN bun install --frozen-lockfile

# ── 2) Çalışma imajı ────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Bağımlılıkları ve kaynağı getir.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock tsconfig.json ./
COPY src ./src
COPY migrations ./migrations

# Root olmayan kullanıcı (oven/bun imajında hazır gelen 'bun' kullanıcısı).
USER bun

EXPOSE 8080

# Varsayılan komut = API sunucusu. Worker için compose'ta override edilir.
CMD ["bun", "src/server.ts"]
