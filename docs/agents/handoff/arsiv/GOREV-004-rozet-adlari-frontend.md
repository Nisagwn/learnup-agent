---
gorev: GOREV-004-rozet-adlari-frontend
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: [GOREV-005]   # 002 ve 003 ONAYLANDI (arşivde); kalan engel build kapısı (005)
dokunulan-dosyalar:
  - frontend-v2/src/lib/rozetler.ts
  - frontend-v2/src/screens/Ben.tsx
  - docs/design/TASARIM-DILI.md
migration-gerekli: hayir
---

## Amaç
Frontend'teki rozet/rütbe adlarını (sunucu aynası) GOREV-003'teki düz ad tablosuyla birebir
eşitlemek ve kararı TASARIM-DILI'ne işlemek.

## Bağlam
- **Kullanıcı kararı (2026-07-21):** rozet/rütbe adlarında metafor YOK — düz işlevsel adlar.
- Ad tablosu: GOREV-003 kartındaki tablo TEK KAYNAKTIR (artık `arsiv/`de). RAPOR'unda ek çeviri
  çıkmadı; QUEST_TEMPLATES başlıkları zaten düz, TIERS makine id'si — dokunulmaz.
- **GOREV-003 SONUCU (onaylandı, arşivde):** sunucuda görünen rozet/rütbe ad alanı YOK —
  `BADGE_CATALOG` yalnız `id` döner (`streak_7`…`level_8`), rütbe yalnız sayı (1–8). Adlar
  YALNIZ frontend'te yaşıyor: `rozetler.ts:11–19` (`ad` alanları) + `Ben.tsx:32` (`RUTBE` dizisi).
  Ad güncellenirken **id→ad eşlemesi bozulmamalı**; API şekli değişmez, sunucu tarafı iş yok.
- `bagimlilik` durumu: GOREV-003 ✅ sağlandı (onaylandı); kalan bekleyiş **GOREV-002**
  (`Ben.tsx` dosya kesişimi; ANAYASA §5 serileştirme).

## Kabul Kriterleri
- [x] `rozetler.ts` ad alanları GOREV-003 tablosu + RAPOR ekleriyle birebir (7 tablo + 8 tablo-dışı metafor listelendi; id/icon sabit)
- [x] `Ben.tsx` RUTBE merdiveni `Seviye 1`…`Seviye 8` (askeri adlar kalktı); rozet `id`'lerine dokunulmadı
- [x] `docs/design/TASARIM-DILI.md` §6'ya not eklendi: "Rozet/rütbe adları düz işlevseldir —
      metafor yok (kullanıcı kararı 2026-07-21); Bahçem serbest bölgesi yalnız bahçe/eşya
      içeriği için geçerlidir, başarı adları için değil"
- [x] `cd frontend-v2 && ../learnup-brain/node_modules/.bin/tsc --noEmit -p tsconfig.json` sıfır hata → çıktı RAPOR'da (TSC_EXIT=0)
- [x] `bun run build` başarılı → son satırlar RAPOR'da (BUILD_EXIT=0, ✓ built in 2.36s)

## Kısıtlar / Kapsam Dışı
- Rozet görselleri/ikonları bu kartta değişmez (görsel FİDAN kartlarının işi).
- `Ben.tsx`'te GOREV-002'nin metin satırları dışında kalan alanlara dokunulmaz.

## Başlangıç Durumu
- Git rev: `5c2610e` (branch: `feat/yks-brain`); kullanıcı henüz commit atmadı.
- GOREV-002 ✅ ve GOREV-003 ✅ onaylandı (arşivde). `Ben.tsx` ve `rozetler.ts` çalışma ağacında
  kirli (Ben.tsx GOREV-002'nin onaylı değişikliklerini taşıyor) — bu kart yalnız `RUTBE` dizisi
  (Ben.tsx:32 civarı) + `rozetler.ts` `ad` alanlarına dokunur, diğer değişiklikleri korur.
- Kalan engel: **GOREV-005** (build kapısı kırık — `bun run build` kriteri onsuz koşulamaz).
  005 onaylanınca bu kart serbesttir.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
Rozet/rütbe adları GOREV-003 tablosuyla birebir eşitlendi ve **tabloda olmayan metaforlu adlar da**
GOREV-003 kuralı gereği ("aynı kurala göre çevir ve RAPOR'da listele") düz işlevsel karşılıklarına
indirildi. `id`'ler ve ikonlar DEĞİŞMEDİ (sunucu `BADGE_CATALOG` aynası korundu); yalnız görünen
`ad` (+ tutarlılık için `kosul`) dizeleri.

**A) GOREV-003 tablosundaki 7 çeviri (`rozetler.ts` + `Ben.tsx RUTBE`):**
| id / yer | Eski | Yeni |
|---|---|---|
| streak_7 | Fener Bekçisi | `7 Gün Seri` |
| streak_100 | Deniz Kurdu | `100 Gün Seri` |
| solved_25 | İlk Sefer | `İlk 25 Soru` |
| solved_100 | Açık Deniz | `100 Soru` |
| solved_500 | Okyanus Aşan | `500 Soru` |
| level_8 | Kaptan | `Seviye 8` |
| Ben.tsx `RUTBE[]` | Er…Kaptan (askeri) | `Seviye 1`…`Seviye 8` |

**B) Tabloda OLMAYAN, kural gereği çevrilen metaforlu adlar (GOREV-003'ün "listele" talebi):**
| id | Eski (metafor) | Yeni (düz) | Gerekçe |
|---|---|---|---|
| streak_3 | Kıvılcım | `3 Gün Seri` | seri serisiyle tutarlı |
| streak_30 | Ay Işığı | `30 Gün Seri` | seri serisiyle tutarlı |
| level_3 | Çavuş (askeri) | `Seviye 3` | rütbe merdiveniyle tutarlı |
| level_5 | Teğmen (askeri) | `Seviye 5` | rütbe merdiveniyle tutarlı |
| mastery_80 | Usta İşi | `%80 Ustalık` | kosul'u düz söyler |
| mastery_100 | Kusursuz | `%100 Ustalık` | kosul'u düz söyler |
| bloom_80 | Bahçıvan | `Özel Ağaç` | başarı adı düz (bkz. §6 notu: Bahçem serbest bölgesi yalnız bahçe İÇERİĞİ için) |
| phoenix | Anka | `Efsanevi Ağaç` | başarı adı düz (aynı gerekçe) |

**C) Tutarlılık (kosul + Ben.tsx rütbe→seviye görünür etiketleri):**
- level_3/5/8 `kosul`: `Rütbe N` → `Seviye N'e ulaş` (ad "Seviye N" ile çakışmasın diye eylem cümlesi).
- `Ben.tsx` rütbe/seviye gösterimi — RUTBE dizisi düzleşince "Rütbe" etiketi + "Seviye N" adı
  çelişeceğinden görünür "Rütbe" sözcükleri "Seviye"ye çekildi (aşağıda satır satır). Bu, RUTBE
  değişikliğinin doğrudan sonucu; ORKESTRATÖR yalnız L32'yi isterse bu 3 satır geri alınabilir.

  | Satır | Eski | Yeni | Not |
  |---|---|---|---|
  | Ben.tsx:32 | `RUTBE = ['Er'…'Kaptan']` | `['Seviye 1'…'Seviye 8']` | **mandat** |
  | Ben.tsx:40 | fallback `?? 'Kaptan'` | `?? 'Seviye 8'` | metafor fallback'ı kalktı |
  | Ben.tsx:93 | halka rozeti `Rütbe {r.lvl}` | `{r.ad}` → "Seviye N" | RUTBE burada render edilir; "Seviye N" tek yerde |
  | Ben.tsx:100 | altbaşlık `${r.ad} · YKS yolcusu` | `YKS yolcusu` | halka rozetiyle "Seviye N" tekrarını önler |
  | Ben.tsx:105–106 | `sonraki rütbe` · `en yüksek rütbe` | `sonraki seviye` · `en yüksek seviye` | etiket tutarlılığı |

**Doğrulama:** `rozetler.ts`'te denizcilik/askeri/metafor adı **kalmadı** (git grep: eşleşme yok).
`Ben.tsx`'te kalan "rütbe" geçişleri **yalnız kod yorumlarında** (satır 25/30/68/82) — kullanıcıya
görünmez, mekanizmayı doğru tarif ediyor, kapsam dışı bırakıldı.

### Değişen dosyalar
`git diff --stat` (beyandaki 3 dosya; `docs/design/TASARIM-DILI.md` `docs/` izlenmeyen olduğundan
diff --stat'ta çıkmaz — §6'ya not eklendi):
```
 frontend-v2/src/lib/rozetler.ts | 28 +++++++++++++--------------   (14 ad + 3 kosul; id/icon sabit)
 frontend-v2/src/screens/Ben.tsx | 28 +++++++++++++--------------   (GOREV-002 + bu kartın RUTBE işi birlikte)
```
Not: `Ben.tsx` diff'i vs HEAD, **GOREV-002'nin onaylı metin değişikliklerini de içeriyor** (aynen
korundu); bu kartın katkısı yukarıdaki C-tablosundaki 6 satır. Beyan dışı dosyaya dokunulmadı;
`id`'ler ve rozet ikonları (ör. level_8 `icon:'anchor'`) değişmedi.

### Koşulan kapılar + çıktıları
**1) `tsc --noEmit -p tsconfig.json` → SIFIR HATA ✓**
```
TSC_EXIT=0
```
**2) `bun run build` → BAŞARILI ✓** (GOREV-005 sonrası build yeşil):
```
dist/assets/vendor-three-CX4HGfXI.js   900.77 kB │ gzip: 240.29 kB
✓ built in 2.36s
BUILD_EXIT=0
```
(">500 kB chunk" satırı bilgilendirme uyarısı, hata değil — three.js; GOREV-005'te belgelendi.)

### Gerçekleşen maliyet
**$0** — yalnız Edit/Grep/Read + tsc/build. Paralı LLM çağrısı yok.

### Açık riskler
1. **Garden rozetleri (bloom_80/phoenix) düzleştirildi** (`Bahçıvan`→`Özel Ağaç`, `Anka`→`Efsanevi
   Ağaç`) — eklenen §6 notunun "başarı adları serbest bölgede DEĞİL" kuralına dayanır. ORKESTRATÖR
   bunları "bahçe içeriği" sayarsa iade edip eski adları geri isteyebilir (yargı çağrısı).
2. **Ben.tsx görünür "Rütbe" etiket editleri (L93/100/105/106)** kartın literal `RUTBE` dizisi
   kapsamının biraz ötesinde — düzleşmenin yarattığı çelişkiyi (Rütbe 3 rozeti + Seviye 3 adı)
   kapatmak için yapıldı. Sadece L32 istenirse geri alınır.
3. **Kalan denizcilik/metafor kırıntıları (kapsam dışı, not):** level_8 rozet `icon:'anchor'`
   (görsel/ikon — kart Kısıtı gereği dokunulmadı); "YKS yolcusu" altbaşlığı ("yolcu" hafif yolculuk
   metaforu, rozet/rütbe adı DEĞİL); Ben.tsx kod yorumlarındaki "rütbe" (görünmez).

### Sonraki adım önerisi
- **Görsel FİDAN kartı:** rozet ikon seti (özellikle level_8 `anchor`, streak `flame`) doğa/işlevsel
  ikonlarla gözden geçirilsin — bu kart yalnız metin.
- **İsteğe bağlı metin cilası (düşük öncelik):** "YKS yolcusu" → "YKS öğrencisi"; Ben.tsx kod
  yorumlarında "rütbe" → "seviye". Kullanıcıya görünür etki yok/çok az.
- Build + tsc yeşil → kart commit'e hazır (commit'i kullanıcı atar; GOREV-002/004/005 birlikte gidebilir).

## Günlük
- 2026-07-21 · ORKESTRATÖR · kart açıldı (beklemede; GOREV-002 + GOREV-003 onayını bekler)
- 2026-07-22 · FRONTEND · alindi
- 2026-07-22 · FRONTEND · tamamlandi (rozet+rütbe adları düz işlevsel: 7 tablo çevirisi + 8 tablo-dışı metafor + RUTBE→Seviye 1..8 + kosul/etiket tutarlılığı; id/icon sabit; tsc SIFIR hata; `bun run build` YEŞİL)
- 2026-07-22 · ORKESTRATÖR · onaylandi. Bağımsız doğrulama: rozetler.ts'te metafor/askeri ad SIFIR (grep boş), 14 rozet id'si eksiksiz; kapı çıktıları RAPOR'da. İki yargı çağrısı ONAYLANDI: (1) bahçe rozetlerinin düzleştirilmesi kullanıcı kararının doğru uygulaması; (2) Ben.tsx görünür "Rütbe"→"Seviye" etiketleri düzleşmenin zorunlu sonucu — geri alma YOK. Sonraki adım önerileri (ikon seti, metin cilası) gelecek görsel kartlara not edildi.
