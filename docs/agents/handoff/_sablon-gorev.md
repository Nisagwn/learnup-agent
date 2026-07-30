---
gorev: GOREV-NNN-kisa-slug
kimden: ORKESTRATÖR
kime: BACKEND | FRONTEND | QA | EVAL-LLMOPS
durum: beklemede            # beklemede | alindi | engellendi | tamamlandi | iade | onaylandi | iptal
oncelik: P1                 # P0 acil · P1 normal · P2 fırsat bulunca
bagimlilik: []              # örn. [GOREV-004] — o kart onaylanmadan bu kart alinamaz
dokunulan-dosyalar:         # NİYET BEYANI — kesişen beyanlı kartlar serileştirilir
  - ornek/yol/dosya.ts
migration-gerekli: hayir    # hayir | evet-yazilacak | yazildi-kosulmadi | kosuldu
---

## Amaç
<!-- Tek cümle: bu kart bitince ne doğru olacak? -->

## Bağlam
<!-- İlgili dosya yolları + doküman bölüm ÇAPALARI (satır numarası değil — satırlar kayar).
     Örn: VERDENT.md §3.5, YKS-BEYIN-SISTEM-MIMARISI.md §9, learnup-brain/src/lib/yetki.ts -->

## Kabul Kriterleri
<!-- Ölçülebilir, mümkünse komutlu. Örn:
- [ ] `bun run typecheck` sıfır hata
- [ ] X endpoint'i Y girdisinde 404 dönüyor (403 değil) -->

## Kısıtlar / Kapsam Dışı
<!-- Bu kartta YAPILMAYACAK şeyler — kapsam sürüklenmesini önler. -->

## Başlangıç Durumu
<!-- ORKESTRATÖR doldurur: git rev (kısa hash) + kirli dosya özeti.
     Ajan bu listede olmayan kirli dosyalara dokunmaz. -->

## Onay Kayıtları
<!-- ORKESTRATÖR doldurur: paralı koşu onayı (tarih + tavan $), migration koşuldu bilgisi.
     Yazılı onay yoksa paralı çağrı GÖNDERİLMEZ. -->

## RAPOR
<!-- YALNIZ `kime` ajanı yazar. Başlıklar zorunlu: -->
### Yapılan
### Değişen dosyalar
### Koşulan kapılar + çıktıları
<!-- Ham çıktı ya da son satırlar. Koşulmayan kapı "koşulmadı" diye yazılır. -->
### Gerçekleşen maliyet
<!-- $0 dahil, her zaman yazılır. -->
### Açık riskler
### Sonraki adım önerisi

## Günlük
<!-- Her durum geçişi tek satır: tarih · kim · geçiş · (gerekçe) -->
