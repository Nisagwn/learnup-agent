# AGENTS.md — LearnUp Geliştirme Ajan Ekosistemi

> Giriş kapısı. Bu dizindeki sistem, LearnUp'ı **ayrı Claude Code oturumlarında çalışan uzman
> geliştirme ajanlarıyla** ilerletmek içindir. İletişim dosya-tabanlıdır: görev kartları
> [`handoff/`](handoff/) dizininde yaşar, kuralları [`ORTAK-ANAYASA.md`](ORTAK-ANAYASA.md) belirler.

## 1. Bu dosya ne / ne değil

**Geliştirme ajanları ≠ ürün ajanları.** Uygulamanın içinde zaten çalışan bir ajan kadrosu var —
o bir **ürün özelliğidir** ve bu dokümanla ilgisi yoktur:

| Düzlem | Kadro | Nerede yaşar |
|---|---|---|
| **Ürün** (öğrenciye hizmet eder) | KAPTAN · ATLAS · PUSULA · NABIZ · KÂTİP + atölye worker'ı ("bekçi" janitor'ı, "hakem" eval modülü) | `learnup-brain/src/agents/`, `src/persona/`, `src/workers/` |
| **Geliştirme** (bu doküman) | ORKESTRATÖR · BACKEND · FRONTEND · QA · EVAL-LLMOPS | Ayrı Claude Code oturumları + `docs/agents/` |

Ürün terimleri (kaptan, atlas, bekçi, hakem…) geliştirme ajanı adı olarak **kullanılmaz** —
görev kartlarında karışır.

## 2. Kadro (kanonik tablo)

| Ajan | Rol | Yazma bölgesi | Kapsam DIŞI | Master prompt |
|---|---|---|---|---|
| **ORKESTRATÖR** | Baş Mimar (ana oturum): görev bölme, kart yazma, onay, harcama onayı arayüzü + **tasarım üretimi** (Figma yok — HTML önizleme üretir, kullanıcı onaylar) | `docs/agents/**` · `docs/design/**` (2026-07-22 devri) | her tür üretim kodu | [`orkestrator.md`](orkestrator.md) |
| **BACKEND** | Backend geliştirme: routes/lib/agents/persona/workers/middleware/utils + migrations | `learnup-brain/src/**` · `learnup-brain/migrations/**` | `model-router.ts`'in CHAINS/FIYAT/sağlayıcı blokları (okur, yazmaz) · `frontend-v2/**` | [`backend.md`](backend.md) |
| **FRONTEND** | Frontend geliştirme + FİDAN tasarım sisteminin koda taşınması + metin dili dönüşümü | `frontend-v2/**` (src, index.html, vite.config.js, package.json — 2026-07-22 genişletildi) | `learnup-brain/**` (API değişikliği gerekirse BACKEND'e kart önerir) · `docs/design/**` (okur-uygular; değişiklik önerisini RAPOR'a yazar — sahibi ORKESTRATÖR) | [`frontend.md`](frontend.md) |
| **QA** | Kalite kapıları, kod inceleme, güvenlik regresyonu | yalnız `*.test.ts` + `eval-altin-set.ts` vaka ekleri | üretim kodu YAZMAZ; kusuru düzeltmez, RAPOR'lar | [`qa.md`](qa.md) |
| **EVAL-LLMOPS** | Eval pipeline + model operasyonları: CHAINS, maliyet, denetçi sınavları, A/B, özgünlük eşikleri | `model-router.ts` · `models.ts` · eval/ab/denetçi scriptleri · `benzerlik.ts` eşikleri · `eval-sonuclari/` · `data/` ölçümleri | route/ekran kodu | [`eval-llmops.md`](eval-llmops.md) |

### Oturum başlatma satırları (kopyala-yapıştır; NNN'i değiştir)

```
Sen BACKEND ajanısın. Sırasıyla docs/agents/ORTAK-ANAYASA.md, docs/agents/backend.md ve docs/agents/handoff/GOREV-NNN dosyalarını oku; kartın durumunu alindi yap, sonra işle.
Sen FRONTEND ajanısın. Sırasıyla docs/agents/ORTAK-ANAYASA.md, docs/agents/frontend.md ve docs/agents/handoff/GOREV-NNN dosyalarını oku; kartın durumunu alindi yap, sonra işle.
Sen QA ajanısın. Sırasıyla docs/agents/ORTAK-ANAYASA.md, docs/agents/qa.md ve docs/agents/handoff/GOREV-NNN dosyalarını oku; kartın durumunu alindi yap, sonra işle.
Sen EVAL-LLMOPS ajanısın. Sırasıyla docs/agents/ORTAK-ANAYASA.md, docs/agents/eval-llmops.md ve docs/agents/handoff/GOREV-NNN dosyalarını oku; kartın durumunu alindi yap, sonra işle.
Sen ORKESTRATÖR ajanısın. docs/agents/ORTAK-ANAYASA.md ve docs/agents/orkestrator.md dosyalarını oku; aktif kartları gözden geçir ve sıradaki işi planla.
```

## 3. Belge hiyerarşisi

Çelişkide üstteki kazanır:
`YKS-BEYIN-SISTEM-MIMARISI.md` → `VERDENT.md` → `ORTAK-ANAYASA.md` → `<rol>.md` → görev kartı.

## 4. Handoff protokolü (özet — kanonik metin ORTAK-ANAYASA §3–6)

- Yaşam döngüsü: `beklemede → alindi → tamamlandi → onaylandi → arsiv/` (+ `engellendi`, `iade`, `iptal`).
- Kartı yalnız ORKESTRATÖR açar; numara = dizindeki (arsiv dahil) en büyük NNN + 1.
- Bölüm sahipliği: RAPOR yalnız işi yapan ajanın; onay/iade/iptal ORKESTRATÖR'ün.
- Eşzamanlılık: bölge sahipliği + `dokunulan-dosyalar` kesişimi olan kartlar serileştirilir.
- Şablon: [`handoff/_sablon-gorev.md`](handoff/_sablon-gorev.md).

## 5. Kalite kapıları — kim neyi koşar

| Kapı | Komut | Dizin | Kim |
|---|---|---|---|
| Backend tip | `bun run typecheck` (sıfır hata = iş bitiş ölçütü) | `learnup-brain` | BACKEND her kartta · QA bağımsız doğrular |
| Backend lint | `bun run lint` | `learnup-brain` | BACKEND · QA |
| Backend test | `bun test src` | `learnup-brain` | BACKEND · QA |
| Regresyon | `bun run eval` ($0; ihlalde exit 1) | `learnup-brain` | davranış değiştiyse BACKEND · QA · EVAL-LLMOPS |
| Frontend tip | `../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` (**elle** — `vite build` tipleri denetlemez, eslint kurulu değil) | `frontend-v2` | FRONTEND her kartta · QA bağımsız doğrular |

QA'nın rolü **bağımsız doğrulamadır**: geliştiren ajanın "geçti" demesi yetmez; QA aynı kapıları
kendi oturumunda koşar ve çıktıyı kendi RAPOR'una yazar.

## 6. Para ve yan-etki kuralları (özet — kanonik metin ORTAK-ANAYASA §7)

- Paralı LLM koşusu: kartta **yazılı kullanıcı onayı + sert tavan** olmadan asla.
- `bun run eval` bayraksız **$0**'dır; `--hakem --evet` paralıdır (~$0.01) → onay ister.
- Commit/push **her zaman kullanıcı**. Migration'ı BACKEND yazar, **kullanıcı koşar**.
- DB toplu yazımı iki aşamalı: önce `data/*.jsonl` → onay → DB.

## 7. Gözden geçirme eşikleri (kadro değişikliği yalnız bu dosyada yapılır)

- **EVAL-LLMOPS'un ikiye bölünmesi** (Eval ↔ LLMOps): `uretim_telemetri` işi (MİMARİ §17/A5,
  migration 0021) + Kule `UretimHunisi` paneli açılır ve kalıcı iş yükü oluşturursa değerlendirilir.
- ~~`docs/design/**` devri~~ **GERÇEKLEŞTİ (2026-07-22):** kullanıcı kararıyla Figma iptal —
  tasarımları ORKESTRATÖR üretir (statik HTML önizleme → kullanıcı onayı), FRONTEND koda taşır.
  `docs/design/**` sahibi artık ORKESTRATÖR. Aynı gün FRONTEND bölgesi `frontend-v2/**` olarak
  genişletildi (vite.config.js build onarımı GOREV-005 için gerekliydi).
