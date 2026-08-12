# LearnUp

LearnUp, kişiselleştirilmiş ve adapte olan dinamik öğrenme süreçleriyle öğrencilerin sınav maratonunu optimize eden tam teşekküllü bir YKS/LGS hazırlık platformudur.

Proje seti; React + Vite SPA mimarisine sahip frontend bileşenini, Bun/Express mimarisiyle güçlendirilmiş backend/worker mikroservislerini ve Supabase + Redis ile kurgulanmış esnek veri katmanını içeren ölçeklenebilir bir monorepo yapısıdır.

## İçindekiler

- [Genel Bakış](#genel-bakış)
- [Teknoloji Yığını](#teknoloji-yığını)
- [Proje Yapısı](#proje-yapısı)
- [Ön Koşullar](#ön-koşullar)
- [Ortam Değişkenleri](#ortam-değişkenleri)
- [Docker Compose ile Çalıştırma](#docker-compose-ile-çalıştırma)
- [Yerel Geliştirme](#yerel-geliştirme)
- [Üretim ve Build](#üretim-ve-build)
- [Supabase ve Migrationlar](#supabase-ve-migrationlar)
- [Yardımcı Komutlar](#yardımcı-komutlar)
- [Sorun Giderme](#sorun-giderme)

## Genel Bakış

- `frontend-v2/` — React 19 + Vite 8 SPA. Build sonucu `nginx` tarafından sunulur.
- `learnup-brain/` — Bun tabanlı API sunucusu ve arka plan worker'ı.
- `supabase/` — Supabase projesine ait yapılandırma ve migration dosyaları.
- `docker-compose.yml` — Tüm servisleri (frontend, brain, worker, redis) tek komutla ayağa kaldırmak için yapılandırma.

## Teknoloji Yığını

- Frontend: React 19, Vite 8, Tailwind CSS, Radix UI, Framer Motion, React Three Fiber
- Backend: Bun, Express, Supabase JS, OpenRouter, Redis, Zod
- Veri: Supabase Postgres, Supabase Auth, Supabase pgvector / embeddings
- Dağıtım: Docker Compose (nginx, Bun, Redis)

## Proje Yapısı

- `frontend-v2/` — Tarayıcı tarafı uygulama
- `learnup-brain/` — API, worker ve server-side kod
- `learnup-brain/migrations/` — Supabase migration SQL dosyaları
- `supabase/` — Supabase proje yapılandırmaları ve destek dosyaları
- `docker-compose.yml` — Kök dizinde, tam stack geliştirme için

## Ön Koşullar

- Docker Desktop veya Docker Engine
- Bun (yerel geliştirme için önerilir)
- Git
- Supabase projesi ve uygun API anahtarları

## Ortam Değişkenleri

### Kök düzey `.env`

Kök `.env` dosyası, frontend build sırasında derleme zamanında kullanılacak `VITE_*` değişkenlerini içerir. Bu değerler tarayıcı bundle'ına gömülür.

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_EDGE_FUNCTIONS_BASE_URL` (opsiyonel)

### `learnup-brain/.env`

Backend ve worker için sunucu tarafı ortam değişkenleri burada yer alır. Bu dosyada gizli anahtarlar bulunur.

- `PORT`
- `NODE_ENV`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `REDIS_URL`
- `APP_URL`

`service_role` anahtarı ve diğer gizli değerler yalnızca sunucu tarafında kullanılmalıdır.

### `frontend-v2/.env`

Bu dosya, frontend geliştirme sırasında Vite tarafından yüklenen `VITE_` değişkenlerini içerir. `frontend-v2` dizininde yer alan `.env.example` ve `.env` dosyaları yerel geliştirme için kullanılır.

## Docker Compose ile Çalıştırma

Kök dizindeki `docker-compose.yml`, frontend, brain, worker ve Redis servislerini tek seferde başlatmak için hazırdır.

```powershell
docker compose up --build
```

Çalıştıktan sonra erişim:

- Frontend: http://localhost:3000
- Brain API: http://localhost:8080

## Yerel Geliştirme

### Frontend

```powershell
cd frontend-v2
bun install
bun run dev
```

Bu, Vite geliştirme sunucusunu başlatır ve tarayıcıda canlı yenileme sağlar.

### Brain API

```powershell
cd learnup-brain
bun install
bun run dev
```

### Worker

```powershell
cd learnup-brain
bun run dev:worker
```

Backend için `learnup-brain/.env` dosyasını hazırlamayı unutmayın.

## Üretim ve Build

### Frontend Build

```powershell
cd frontend-v2
bun install
bun run build
```

### Docker Compose Üretim Benzeri Çalıştırma

```powershell
docker compose up --build
```

`frontend-v2` imajı, build sonucu `dist/` klasörünü nginx üzerinde servis eder.

## Supabase ve Migrationlar

Supabase migration dosyaları `learnup-brain/migrations/` dizininde yer alır. Bu dizin, veritabanı şeması değişiklikleri ve yeni kolon eklemeleri için SQL dosyalarını içerir.

## Yardımcı Komutlar

### `docker-compose`

- `docker compose up --build` — Tüm servisleri build ederek başlatır
- `docker compose down` — Çalışan servisleri durdurur ve ağı temizler

### Frontend

- `bun run dev` — Vite geliştirme sunucusunu başlatır
- `bun run build` — Üretim için frontend uygulamasını derler
- `bun run preview` — Build edilmiş frontend uygulamasını yerel olarak sunar

### Backend

- `bun run dev` — API sunucusunu geliştirme modunda başlatır
- `bun run start` — API sunucusunu üretim modunda başlatır
- `bun run dev:worker` — Worker sürecini başlatır

## Sorun Giderme

- `403` veya `401` hatası alıyorsanız, Supabase URL ve anahtarlarını kontrol edin.
- `docker compose` çalışmıyorsa Docker Desktop/Engine kurulumunu doğrulayın ve `docker compose version` komutuyla sürümü kontrol edin.
- `bun` ile ilgili sorun varsa yerel `bun` sürümünüzü kontrol edin veya Docker Compose üzerinden çalıştırmayı tercih edin.
- `frontend-v2` için kullanılan `VITE_*` değişkenleri sadece derleme zamanında bundle içine yazılır; bu nedenle gizli anahtarlar asla buraya konulmamalıdır.

## Notlar

- `frontend-v2` build sürecinde kullanılan `VITE_*` değişkenleri, tarayıcı tarafına gömüldüğü için sadece genel, public bilgiler içermelidir.
- `learnup-brain` backend servisi, `bun` kullanarak derleme olmadan direkt çalıştırılır.
- `worker` servisi, aynı `learnup-brain` imajını kullanır ancak `docker-compose.yml` içinde farklı bir komutla çalıştırılır.
