# Bun ile Çalıştırma (Node.js / npm gerekmez)

Bu servis artık bir **Bun** projesidir. Bun, TypeScript'i **doğrudan** çalıştırır (tsx/derleme yok) ve `.env`'i **otomatik** yükler.

## 1) Bun'ı kur — Windows (PowerShell)
```powershell
irm bun.sh/install.ps1 | iex
```
Terminali yeniden aç ve doğrula:
```powershell
bun --version
```
> macOS/Linux için: `curl -fsSL https://bun.sh/install | bash`

## 2) Bağımlılıkları kur
```powershell
cd learnup-brain
bun install
```
İstersen npm kalıntısını temizle: `package-lock.json`'ı sil (Bun `bun.lockb` üretir); `node_modules`'ı `bun install` yeniden kurar.

## 3) Komutlar
| Komut | İş |
|---|---|
| `bun dev` | API — hot-reload → http://localhost:8080 |
| `bun run dev:worker` | Ritim worker (Redis Streams tüketici) |
| `bun run seed` | MEB/YKS müfredatını bas (`curriculum_nodes` + `osym_blueprint`) |
| `bun run typecheck` | Tip kontrolü (tsc) |
| `bun run lint` | ESLint |
| `bun start` | Prod — API'yi tek sefer çalıştır |

## Notlar
- **`.env` otomatik yüklenir** (Bun native). `.env`'i doldurman yeterli; ekstra ayar yok.
- **İki process birlikte çalışır:** bir terminalde `bun dev`, diğerinde `bun run dev:worker`.
- **Redis:** `.env`'de `REDIS_URL` tanımlıysa worker + ajan orkestrasyonu devreye girer; tanımsızsa API + RAG + Kaptan tek başına çalışır.
- **Seed'den önce** `.env`'deki Supabase anahtarlarının dolu olması gerekir (script Supabase'e yazar).
- Tip kontrolü hâlâ `tsc` ile yapılır (Bun tip denetlemez) — `bun run typecheck`.
