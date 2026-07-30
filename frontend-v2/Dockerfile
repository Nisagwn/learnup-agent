# LearnUp frontend-v2 — Vite 8 / React 19 SPA (Bun ile build).
# Çok aşamalı: (1) bun ile build → statik dist/, (2) nginx ile servis.
# ⚠️ UYARI: Vite, VITE_* değişkenlerini BUILD anında bundle'a gömer (runtime DEĞİL).
#    → değerler build ARG olarak verilir. Yalnız PUBLIC değerler (URL + anon key);
#      service_role / sb_secret ASLA buraya girmez (bundle tarayıcıya iner).

# ── 1) Build aşaması (Bun — frontend-v2 bun.lock kullanır) ──────────
FROM oven/bun:1-alpine AS build
WORKDIR /app

# Bağımlılıklar — lockfile ile deterministik (katman cache).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build-time env (PUBLIC): Vite bunları derleme sırasında gömer.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_EDGE_FUNCTIONS_BASE_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_EDGE_FUNCTIONS_BASE_URL=$VITE_EDGE_FUNCTIONS_BASE_URL

COPY . .
RUN bun run build          # → /app/dist (statik HTML/CSS/JS)

# ── 2) Servis aşaması (nginx) ───────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
# SPA fallback + /api → brain reverse-proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Yalnız derlenmiş statik çıktı taşınır (bun, kaynak, node_modules imaja girmez).
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
# nginx varsayılan CMD ile ön planda çalışır (daemon off).
