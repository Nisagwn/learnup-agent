---
gorev: GOREV-003-rozet-adlari-backend
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P2
bagimlilik: []
dokunulan-dosyalar:
  - learnup-brain/src/lib/gamification.ts
migration-gerekli: hayir
---

## Amaç
Sunucu tarafında kullanıcıya görünen rozet/rütbe **adlarındaki** denizcilik/metafor terimlerini düz
işlevsel adlara çevirmek. **`id`'ler ve ödül mantığı ASLA değişmez** — yalnız görünen `ad`/`name` alanları.

## Bağlam
- **Kullanıcı kararı (2026-07-21):** metaforlu ad YOK — ne denizcilik ne doğa ("Işık Bekçisi" tarzı
  öneriler REDDEDİLDİ). Ad, başarıyı düz söyler.
- Girdi: `docs/agents/handoff/arsiv/GOREV-001-arayuz-metin-envanteri.md` §C (frontend aynası listesi).
- İlk adım: `lib/gamification.ts` içinde BADGE_CATALOG / rütbe adlarının kullanıcıya görünen ad
  alanlarını LOKALİZE ET. Adlar yalnız frontend'te yaşıyorsa (sunucuda ad alanı yoksa) hiçbir şey
  değiştirme, RAPOR'a "sunucuda görünen ad yok — iş tamamen FRONTEND'te" yaz ve kartı bitir.

## Ad çevirisi kuralı ve tablosu
Kural: denizcilik/metafor içeren TÜM adlar düz karşılığa iner; zaten düz olanlar (varsa) kalır.

| Mevcut (metaforlu) | Yeni (düz) |
|---|---|
| Fener Bekçisi (7 gün seri) | `7 Gün Seri` |
| Deniz Kurdu (100 gün seri) | `100 Gün Seri` |
| İlk Sefer (25 soru) | `İlk 25 Soru` |
| Açık Deniz (100 soru) | `100 Soru` |
| Okyanus Aşan (500 soru) | `500 Soru` |
| Kaptan (rütbe 8 rozeti) | `Seviye 8` |
| Rütbe merdiveni (Er…Kaptan, askeri) | `Seviye 1` … `Seviye 8` |

Tabloda olmayan metaforlu ad bulursan aynı kurala göre çevir ve RAPOR'da listele.

## Kabul Kriterleri
- [x] Görünen ad alanları düz adlarla güncellendi (veya "sunucuda ad yok" belgelendi) → **"sunucuda ad yok" BELGELENDİ** (BADGE_CATALOG id-only; rütbe = sayı; RAPOR §Yapılan)
- [x] `id`'ler, eşikler, ödül/atomik mantık bayt-bayt aynı (git diff yalnız ad dizeleri) → **sıfır değişiklik** (ad dizesi bile değişmedi; dokunulmadı)
- [x] `gamification.ts` deterministik kaldı — davranış değişikliği YOK (kilitli karar 8) → dokunulmadı
- [ ] `bun run typecheck` + `bun run lint` + `bun test src` sıfır hata → çıktılar RAPOR'da → **N/A: sıfır kaynak-kod değişikliği; kapılar KOŞULMADI** (kod değişikliğini denetler). GOREV-001 no-op emsali; onay kararı ORKESTRATÖR'de.
- [x] Rozet adı dönen API yanıtlarının ŞEKLİ değişmedi (alan adları/tipler aynı; yalnız değer) → **API rozetleri yalnız `id` döndürür (adsız); şekil dokunulmadı**

## Kısıtlar / Kapsam Dışı
- Frontend aynası (`rozetler.ts`, `Ben.tsx RUTBE`) bu kartta DEĞİŞMEZ → GOREV-004.
- DB'de saklanan rozet id/unlocked_badges verisine dokunulmaz (adlar koddan servis ediliyor).

## Başlangıç Durumu
- Git rev: `5c2610e` (branch: `feat/yks-brain`); kirli ağaç 30 kayıt — `gamification.ts` bunların
  İÇİNDE (M durumda). Mevcut değişiklikler korunur; yalnız ad dizeleri değiştirilir. İlk adım:
  `git diff learnup-brain/src/lib/gamification.ts --stat` fotoğrafını RAPOR'a not et.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Kartı `alindi` yaptım; `learnup-brain/src/lib/gamification.ts`'i baştan sona okudum (314 satır) ve
tüm backend bölgesinde metafor terim taraması yaptım. **Sunucuda kullanıcıya görünen rozet/rütbe ad
alanı YOK** — sonuç aşağıda kanıtlarıyla:

- **`BADGE_CATALOG` (243–256):** her kayıt yalnız `id` (`streak_7`, `solved_25`, `level_8`…) + `check`
  taşıyor; **`name`/`ad` alanı yok.** `evaluateBadges` (257–259) yalnız `b.id` **dizisi** döner →
  API rozetleri **id ile** servis eder, adla değil.
- **Rütbe merdiveni (Er…Kaptan):** sunucuda **yok.** `levelFromCorrect` (279–283) yalnız **sayı**
  (1–8) döner; `LEVEL_THRESHOLDS` yalnız eşik sayıları. Askeri/metafor rütbe adı bulunmuyor.
- **`QUEST_TEMPLATES` başlıkları (196–200):** kullanıcıya görünür (`Quest.title`) ama **zaten düz
  işlevsel Türkçe** ("5 soru çöz", "Bugün çalışarak serini koru") — denizcilik/metafor içermiyor →
  kural gereği "zaten düz olanlar kalır", dokunulmadı.
- **`TIERS` (262):** `bronze/silver/gold/sapphire/diamond` — lig **makine id'leri** (küçük harf;
  `promoteTier/relegateTier/tierIndex` mantığının anahtarı). Görev tablosunda yok, id kısıtı gereği
  dokunulmaz.
- **`displayName` (306):** kullanıcının **kendi adı** (name/full_name/email) — rozet/rütbe değil, kapsam dışı.

**Bölge geneli tarama** (Grep, case-insensitive, `learnup-brain/src`: Fener·Deniz Kurdu·İlk Sefer·
Açık Deniz·Okyanus·Kaptan·Bekçi·rütbe·Sefer): görünen rozet/rütbe adı **bulunmadı**. Çıkan geçişler:
"Kaptan" (sohbet ürün-ajanı) ve "bekçi" (worker janitor) = ANAYASA §2 **ürün-ajan adları**, oyunlaştırma
adı DEĞİL → kapsam dışı. "Tebük Seferi/Bedir Savaşı" (utils.test.ts) = tarih soru içeriği (test fixture).

**Çapraz doğrulama (GOREV-001 §C):** metaforlu rozet adları (`Fener Bekçisi`…`Okyanus Aşan`, `Kaptan`)
`frontend-v2/src/lib/rozetler.ts:11–19`'da; rütbe merdiveni `frontend-v2/src/screens/Ben.tsx:32`
(`RUTBE=['Er'…'Kaptan']`)'de yaşıyor. §C'nin "rütbe adları **da** gamification.ts'te olabilir"
hipotezi **yanlışlandı** — sunucuda ad yok.

→ **Kartın kaçış yolu tetiklendi:** "sunucuda ad alanı yoksa hiçbir şey değiştirme". Hiçbir kaynak
dosyaya yazılmadı; iş tamamen FRONTEND'te (GOREV-004).

### Değişen dosyalar
- Yalnız bu kart dosyası (durum + kabul kriterleri + RAPOR + Günlük). **`learnup-brain/src` altında
  SIFIR kaynak değişikliği.**
- `gamification.ts` git diff'i başlangıç fotoğrafıyla **aynı** (aşağıdaki 144+/41− farkı oturum-ÖNCESİ
  prior work; Başlangıç Durumu'nda beyan edilen kirli ağaç). Bu kartın katkısı **0 satır**.

### Koşulan kapılar + çıktıları
- `git diff --stat -- learnup-brain/src/lib/gamification.ts` (başlangıç = bitiş fotoğrafı):
  ```
   learnup-brain/src/lib/gamification.ts | 185 ++++++++++++++++++++++++++--------
   1 file changed, 144 insertions(+), 41 deletions(-)
  ```
  Bu fark oturum-öncesi prior work'e ait; **bu kartta 0 satır** eklendi/silindi.
- **`bun run typecheck` · `bun run lint` · `bun test src`: KOŞULMADI (gerekmez).** Kapılar kod
  değişikliğini denetler; bu kartta sıfır kaynak-kod değişikliği var. Yeşil gösterilmiyor —
  dürüstçe "koşulmadı". GOREV-001 no-op emsali birebir (aynı gerekçeyle onaylanmıştı).

### Gerçekleşen maliyet
- **$0** — yalnız Read/Grep; paralı LLM çağrısı yapılmadı.

### Açık riskler
- Davranış/sözleşme dokunulmadı → risk yok. Not (GOREV-004 için): sunucu rozetleri **yalnız `id`**
  döndürüyor (`streak_7`…`level_8`), ad frontend'te bağlanıyor → FRONTEND adları güncellerken bu id
  eşlemesini korumalı; API şekli değişmez.

### Sonraki adım önerisi
- **GOREV-004 (FRONTEND) tek başına yeterli:** düz ad çevirisi yalnız `frontend-v2/src/lib/rozetler.ts`
  (`ad` alanları) + `frontend-v2/src/screens/Ben.tsx:32` (`RUTBE` dizisi). Sunucu tarafı iş YOK →
  GOREV-004'ün `bagimlilik` listesinden GOREV-003 pratikte düşebilir (bu kart hiçbir sözleşme değiştirmedi).
- İleride adı API'den döndürme kararı alınırsa ayrı BACKEND kartı gerekir (şu an gereksiz; frontend
  id→ad eşlemesi yeterli).

## Günlük
- 2026-07-21 · ORKESTRATÖR · kart açıldı (beklemede)
- 2026-07-21 · BACKEND · alindi
- 2026-07-21 · BACKEND · tamamlandi (sunucuda görünen rozet/rütbe ad alanı YOK — BADGE_CATALOG id-only, rütbe=sayı; sıfır kod değişikliği; iş tamamen FRONTEND/GOREV-004)
- 2026-07-21 · ORKESTRATÖR · onaylandi. Bağımsız doğrulama: gamification.ts diff'i (144+/41−) başlangıç fotoğrafıyla birebir, learnup-brain/src'de bu oturuma ait sıfır kayıt. N/A kapı kararı kabul (GOREV-001 no-op emsali: kapılar kod değişikliğini denetler). Sonuç GOREV-004 Bağlam'ına işlendi; bagimlilik listesinde GOREV-003 SAĞLANDI, kalan bekleyiş GOREV-002.
