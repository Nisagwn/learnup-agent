---
gorev: GOREV-042-soru-havuzu-ekrani-fidan
kimden: ORKESTRATÖR
kime: FRONTEND
durum: onaylandi
oncelik: P2
bagimlilik: []   # BAŞLATILABİLİR — 041 (yonetim.tsx) ile kesişim YOK; 043 ile SERİ (ikisi de kule.tsx)
dokunulan-dosyalar:
  - frontend-v2/src/screens/kule/SoruHavuzu.tsx
  - frontend-v2/src/components/kule.tsx   # KaliteHistogrami/ZorlukDagilimi/DersKapsamaTablosu FİDAN
migration-gerekli: hayir
---

## Amaç
Soru Havuzu ekranını **kullanıcı onaylı önizlemeyle** hizalamak:
`docs/design/onizleme/soru-havuzu.html` (2026-07-23 onayı — kaynak referans BUDUR).

## Bağlam
- Tasarım: TASARIM-DILI v1.2 (inline FİDAN `sh-*`). İçerik: EKRAN-HARITASI §18.
- **MOCK YASAK (kullanıcı teyidi):** tek gerçek uç `GET /admin/havuz` (Kule/SoruHavuzu zaten
  kullanıyor): ÖSYM/AI hacim, doğrulanmış oran, kalite histogramı, zorluk, ders kapsama, yıl
  dağılımı, kazanımsız. Ölçüm yoksa `OlcumYok` (ort. kalite eval koşmadıysa "—").
- **TELİF (kehribar RAFTA — KRİTİK):** ÖSYM sayısı görünür (yönetici İÇ operasyonu, §18) AMA
  eski **brass/kehribar kimlik rengi KULLANILMAZ** → nötr toprak tonu + "yalnız iç kaynak (RAG)"
  etiketi. Mevcut koddaki `text-brass-*` ÖSYM vurgusu FİDAN toprak'a çekilir.
- **DÜRÜST KAPSAMA:** düşük oranlar (TDE %3 vb.) güzelleştirilmeden gösterilir; kazanımsız AI
  soruları "ölü stok" uyarısı korunur (koddaki gerekçe).

## Kabul Kriterleri
- [ ] Görünüm iki temada da önizlemeyle eşleşir: 4 stat (ÖSYM nötr toprak · AI · ort. kalite/
      OlcumYok · kapsanan kazanım) · kalite histogramı · zorluk dağılımı · ders bazlı kapsama
      tablosu (düşük oran sıcak tonla dürüst) · ÖSYM yıl dağılımı · AI ders kırılımı (kazanımsız uyarısı)
- [ ] ÖSYM'de brass/kehribar YOK (grep kanıtı: `brass`/`kehribar`/`amber` ÖSYM vurgusunda yok);
      null≠0 her panelde; hero yok (eşit ağırlık — koddaki ≤1 tavan gerekçesi)
- [ ] `tsc --noEmit` sıfır hata + `bun run build` yeşil → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- Yeni backend ucu İSTENMEZ. `components/ui.tsx`/`cekirdek.tsx`/`fx.tsx` DOKUNULMAZ.
  **`components/kule.tsx`'e GOREV-043 de dokunacak — SERİ çalışılır (aynı ajan); 043 sen bitmeden
  BAŞLAMAZ.** Bu kart yalnız KaliteHistogrami/ZorlukDagilimi/DersKapsamaTablosu'na dokunur;
  EsikTablosu (043) ve AjanSagligi/EvalTrendi/OlcumYok (039 — bitti) DEĞİŞMEZ.

## Başlangıç Durumu
- Git rev: `5c2610e`; kirli ağaç (onaylı işler). `kule.tsx` 039'un ONAYLI işiyle kirli (AjanSagligi/
  EvalTrendi/OlcumYok FİDAN oldu — onlara dokunma). Yalnız bu kartın işi eklenir. İlk adım:
  `git diff --stat` RAPOR'a.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0).

## RAPOR
### NOT: Ajan RAPOR yazarken TAKILDI (600s watchdog) — iş tamamdı; ORKESTRATÖR bağımsız kanıtla sonlandırdı.
Ajanın son çıktısı "Both gates green (TSC 0, BUILD 0), kapsam doğrulanıyor" idi — asıl iş bitmiş, yalnız RAPOR/durum yazımı yarım kalmıştı. Bağımsız doğrulama:
- **SoruHavuzu.tsx FİDAN:** 63 `sh-*` scoped sınıf; COASTAL primitifler söküldü. ÖSYM değeri nötr TOPRAK tonunda (`className="deger toprak"`, satır 153) — telif.
- **CANLI brass/kehribar renk kullanımı SIFIR** (grep `text-brass|bg-brass|brass-[0-9]|border-brass` → 0). Kalan 5 `brass/kehribar` eşleşmesi YALNIZ açıklayıcı yorum ("brass/kehribar KULLANILMAZ" telif notu). Kehribar RAFTA kararına tam uyum.
- **kule.tsx kapsamı doğru:** yalnız KaliteHistogrami/ZorlukDagilimi/DersKapsamaTablosu; `EsikTablosu`'na EKLEME YOK (grep kanıtı) → 043'e temiz bırakıldı; 039'un AjanSagligi/EvalTrendi/OlcumYok'una dokunulmadı.
- **Gerçek uç:** tek `GET /admin/havuz` (mock yok); OlcumYok ölçüm olmayan yerde.
- **git diff --stat:** 2 dosya (SoruHavuzu.tsx +269/kule.tsx +334 kümülatif) — beyanla birebir.
- **Kapılar (ORKESTRATÖR bizzat koştu):** `tsc --noEmit` EXIT 0 · `bun run build` EXIT 0 `✓ built in 1.88s`, `SoruHavuzu-*.js 10.29 kB` ayrı chunk. $0.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (önizleme onayı "onay" 2026-07-23; 043 ile SERİ [kule.tsx]; 041 ile paralel)
- 2026-07-23 · FRONTEND · alindi

## Günlük (devam)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv (ajan RAPOR yazarken takıldı — 600s watchdog; iş tamamdı, bağımsız kanıtla sonlandırıldı). Kanıtlar RAPOR'da: 63 sh-*, canlı brass SIFIR (yorumlar hariç), ÖSYM toprak, EsikTablosu 043'e temiz, gerçek uç, kapılar ORKESTRATÖR koştu (tsc 0/build 0). $0. 043 SERBEST (kule.tsx artık boşta).
