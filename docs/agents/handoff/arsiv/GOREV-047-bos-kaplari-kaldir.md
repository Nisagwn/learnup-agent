---
gorev: GOREV-047-bos-kaplari-kaldir
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P1
bagimlilik: [GOREV-046]
dokunulan-dosyalar:
  - learnup-brain/src/scripts/gorev-047-bos-kaplar-kaldir.ts   # YENİ — iki aşamalı (dry-run + --uygula)
  - learnup-brain/data/gorev-047-silinen-kaplar-yedek.jsonl     # ÇIKTI (yedek, izlenmez; yalnız --uygula'da)
migration-gerekli: hayir
---

## Amaç
GOREV-046 raporunun canlı-teyitli **11 boş ödev kabını** (6 sınıf ödevi + 5 hedefli set)
kaynağından KALDIRMAK — kullanıcı kararı: "hepsini kaldır". Cerrahi (yalnız bu 11 id), silmeden
önce her kabı yeniden doğrulayan, referans-güvenli ve **tam yedekli** bir silme.

## Bağlam
- **Kullanıcı kararı (2026-07-23):** 046 raporundaki 11 boş kabın HEPSİ kaldırılacak. Gerekçe:
  test/seed görünümü (3 gün önce oluşmuş, hepsi Matematik, 6 ödev 0-roster'lı tek öğretmene ait,
  5 set tek öğrenciye ait), 0 gerçek içerik kaybı, en düşük risk.
- **Girdi = 046 çıktısı:** `learnup-brain/data/gorev-046-bos-kaplar.jsonl` (11 satır; her satır
  `tur` ∈ {assignment,targeted}, `kap_id`, canlı teyitli `soru_sayisi_simdi:0`). Kesin id listesi budur.
- **İki-aşamalı yazım (V§3.7.2):** 046 = ölçüm/rapor (1. aşama). Bu kart = mutasyon (2. aşama).
  Script **DRY-RUN varsayılan**; gerçek silme yalnız `--uygula` bayrağıyla. `gorev-031-endash-duzelt.ts`
  emsali (dry-run default + --uygula).
- **Denetim (M11 — her mutasyon denetlenir):** silinen her satırın TAM kopyası önce
  `data/gorev-047-silinen-kaplar-yedek.jsonl`'e yazılır (geri-yükleme kaydı = denetim izi). Mümkünse
  `yonetim_denetim` append-only tablosuna da bir sistem-kaydı eklenir (şema uygunsa; değilse yedek+log
  denetim izidir — RAPOR'da hangi yol seçildiği yazılır).
- Şema/route: `assignments` (sınıf geneli, teacher_id) ve `targeted_assignments` (student_id).
  Sınıf ödevi gönderimleri AYRI tabloya yazılır (submit route'una bak); hedefli set gönderimi satırın
  kendi `status`'una yazılır. Silmeden önce REFERANS kontrolü şart (aşağıda).
- LLM YOK, paralı çağrı YOK ($0). Migration YOK (şema değişmez; yalnız veri satırı silinir).

## Kabul Kriterleri
- [ ] `learnup-brain/src/scripts/gorev-047-bos-kaplar-kaldir.ts` — iki aşamalı:
      **DRY-RUN (varsayılan, bayraksız):** hiçbir şey silmez; ne silineceğinin tam manifestini basar
      (tür, kap_id, başlık, sahip, canlı `question_ids` uzunluğu, referans-durumu, karar: silinecek |
      atlanacak-dolu | atlanacak-referanslı | zaten-yok). **`--uygula`:** yalnızca 'silinecek'
      işaretlileri siler.
- [ ] **RUN-ZAMANI YENİDEN DOĞRULAMA (jsonl'e körü körüne güvenme):** her id için canlı satır çekilir;
      `question_ids` uzunluğu HÂLÂ 0 mı? Doluysa (artik-dolu) → **SİLME, atla + raporla**. Satır zaten
      yoksa → atla (idempotent, hata değil).
- [ ] **REFERANS GÜVENLİĞİ:** silmeden önce bu kap id'lerine işaret eden gönderim/cevap kayıtları var
      mı kontrol edilir (sınıf ödevi submission tablosu + hedefli set `status != 'pending'`/tamamlanmış
      göstergesi). Referans/gönderim VARSA → o kabı **SİLME, atla + raporla** (öksüz kayıt/kırılma
      önleme). Hangi tabloların kontrol edildiği RAPOR'da.
- [ ] **YEDEK (yalnız --uygula):** silinen her satırın TAM kopyası `data/gorev-047-silinen-kaplar-yedek.jsonl`'e
      yazılır (silmeden ÖNCE). Dry-run'da yedek yazılmaz.
- [ ] **CERRAHİ:** yalnız 046'daki 11 id, yalnız doğru tablodan (assignment→`assignments`,
      targeted→`targeted_assignments`). Başka satır/tablo/koşul ile silme YOK. `.delete().eq('id', …)`
      tek tek ya da `.in('id', [doğrulanmış id'ler])` — asla filtresiz/geniş delete.
- [ ] İdempotent: ikinci `--uygula` koşusu 0 siler (hepsi gitti), hata vermez.
- [ ] `bun run typecheck` sıfır hata + `bun run lint` temiz + `bun test src` (123 geçer/0 hata) →
      HAM çıktılar RAPOR'a. `bun run eval` GEREKMEZ (kural/model/soru-sağlık değişmedi) — gerekçe yaz.
- [ ] **$0** — LLM yok.

## Kısıtlar / Kapsam Dışı
- **AJAN `--uygula` KOŞMAZ.** Ajan yalnız script'i yazar + DRY-RUN koşar + RAPOR'a manifesti koyar.
  Geri-dönüşsüz `--uygula` adımını, dry-run manifestini denetledikten sonra ORKESTRATÖR koşar.
- Yalnız beyan edilen 2 dosya (+ `yonetim_denetim` şema uygunsa bir denetim satırı; onun dışında
  hiçbir tabloya YAZMA). Başka kirli dosyaya dokunma. `git checkout --` YASAK. COMMIT/push ATMA.
- Migration YOK. Şema değişmez. Boş kap DIŞINDA hiçbir veriye dokunulmaz.
- İçerik hattı / soru üretimi bu kartta YOK (kullanıcı "doldur"u değil "kaldır"ı seçti).
- Frontend'e dokunma. Dev sunucularına dokunma.

## Başlangıç Durumu
- Git rev: `5c2610e`. Çalışma ağacı çok kirli (onaylı işler, kullanıcı commit'leyecek). GOREV-046
  ONAYLANDI+arşivde; girdi `data/gorev-046-bos-kaplar.jsonl` (11 satır) hazır. `learnup-brain/` tarafı
  046 script'iyle (onaylı) kirli — ona dokunma; yalnız yeni 047 script'ini ekle. İlk adım: durumu
  `alindi` yap, 046 jsonl'ini oku, submit route'larından referans tablolarını tespit et, sonra
  script'i yaz + DRY-RUN koş.

## Onay Kayıtları
- Kullanıcı kararı: 2026-07-23 — "hepsini kaldır (11 kap)" (AskUserQuestion yanıtı). Silme ONAYLI.
- Paralı koşu: GEREKMEZ ($0). Migration: yok.
- `--uygula`: ORKESTRATÖR koşacak (dry-run denetimi sonrası). Ajan koşmaz.

## RAPOR
<!-- YALNIZ BACKEND ajanı doldurur. -->
### Yapılan
- İki aşamalı `gorev-047-bos-kaplar-kaldir.ts` yazıldı: **DRY-RUN varsayılan** (yazım yok), `--uygula`
  yalnız 'silinecek' işaretlileri siler. Karar motoru iki modda da ORTAK; --uygula ek olarak
  yedekleyip siler. `gorev-031` (dry-run+--uygula) ve `gorev-046` (supabase client, .js import, canlı
  okuma) emsalleri izlendi.
- **Referans tabloları tespiti (submit route incelemesi):**
  - Sınıf ödevi (assignment) gönderimleri → `assignment_submissions` tablosuna INSERT edilir
    (`assignments.routes.ts` POST /submit). Kontrol: `assignment_submissions`'ta bu `assignment_id`'ye
    işaret eden HERHANGİ bir satır var mı (fetchAll — M6 1000-tuzağı). VARSA → atlanacak-referansli.
  - Hedefli set (targeted) gönderimi → satırın KENDİ alanlarına UPDATE edilir (`status='completed'`,
    `completed_at`, `score`, `auto_score`, `answers`). Kontrol: `targeted_assignments` satırında
    tamamlanmışlık göstergesi (status!='pending' VEYA completed_at/score/auto_score dolu VEYA answers>0).
- **ÖLÇÜLMÜŞ DÜZELTME (dürüstlük):** ilk dry-run 5 seti yanlışlıkla 'atlanacak-referansli' işaretledi.
  Ham okuma (5 satır) gösterdi ki `max_score` satır OLUŞTURULURKEN doluyor (6/4/3/3/3 = 046
  `soru_sayisi_once` ile bire bir), gönderimde değil → tamamlanmışlık göstergesi DEĞİL. `max_score`
  referans kontrolünden ÇIKARILDI. Gerçek gönderim izleri (status/completed_at/score/auto_score/answers)
  5 satırda da boş → 5 set gerçekten boş+gönderilmemiş → 'silinecek'.
- **Güvenlik katmanları:** (1) run-zamanı yeniden doğrulama (canlı question_ids hâlâ 0 mı; satır yoksa
  zaten-yok/idempotent), (2) referans güvenliği (yukarıdaki 2 tablo), (3) yedek yalnız --uygula'da
  silmeden ÖNCE tam `select('*')` kopyası APPEND (eski yedek ezilmez), (4) cerrahi `.delete().eq('id',id)`
  tek tek yalnız doğru tablo, (5) idempotent ikinci --uygula 0 siler.
- **Denetim yolu (M11) — SEÇİLEN:** `yonetim_denetim`'e sistem-kaydı EKLENMEDİ. O tablo (0020) ADMIN
  eylem defteri: `admin_id NOT NULL`, `eylem` ∈ {ogretmen_onay|rol_degis|sinif_ata|gorev_yeniden},
  `hedef_tur` ∈ {kullanici|gorev}. Bakım/sistem silmesinin admin_id'si yok ve hedefi (ödev kabı) ne
  kullanıcı ne görev → uygun eylem/hedef_tur yok; sahte admin_id uydurmak append-only defteri kirletir
  (null≠uydur). **Denetim izi = yedek jsonl (tam satır + silinme zamanı, geri-yükleme kaydı) + konsol logu.**

### Değişen dosyalar
- `learnup-brain/src/scripts/gorev-047-bos-kaplar-kaldir.ts` — YENİ (yazma bölgesi: learnup-brain/src).
- `learnup-brain/data/gorev-047-silinen-kaplar-yedek.jsonl` — DRY-RUN'da YAZILMADI (yok); yalnız --uygula
  yolunda ORKESTRATÖR koşunca oluşur.
- (Bu kart: durum/Günlük/RAPOR — `kime` ajanı bölümleri.)

### Koşulan kapılar + çıktıları
```
$ bun run typecheck   (tsc --noEmit)
TYPECHECK_EXIT=0   (0 hata)

$ bun run lint        (eslint src)
✖ 9 problems (0 errors, 9 warnings)   LINT_EXIT=0
  → 9 uyarının HEPSİ önceden var olan dosyalarda (gamification.routes, garden.routes,
    practice.routes, parse-dop, parse-sorular); gorev-047 dosyasında 0 uyarı/0 hata.

$ bun test src
 123 pass · 0 fail · 386 expect() calls · 6 dosya   TEST_EXIT=0

$ bun run eval   → KOŞULMADI: kural/model/soru-sağlık değişmedi (yalnız veri-silme script'i; davranış dokunulmadı).

$ bun src/scripts/gorev-047-bos-kaplar-kaldir.ts   (DRY-RUN, DRYRUN_EXIT=0)
─────────────────────── DRY-RUN MANİFESTİ (11 kap) ───────────────────────
  tür    kap_id    başlık      sahip     canlı#  referans                                          KARAR
  ödev   2a49ec23  Matematik   b5baf893  0       gonderim=0                                        silinecek
  ödev   3c2df948  Matematik   b5baf893  0       gonderim=0                                        silinecek
  ödev   5f0d773a  Matematik   b5baf893  0       gonderim=0                                        silinecek
  ödev   a2ce3b2d  Matematik   b5baf893  0       gonderim=0                                        silinecek
  ödev   ca3259c7  Matematik   b5baf893  0       gonderim=0                                        silinecek
  ödev   d3a84b2d  Matematik   b5baf893  0       gonderim=0                                        silinecek
  set    2e49baa3  Matematik   bfa79ff0  0       status=pending·bitis=yok·score=yok·auto=yok·cevap=0  silinecek
  set    2faa0905  Matematik   bfa79ff0  0       status=pending·bitis=yok·score=yok·auto=yok·cevap=0  silinecek
  set    3ddc504b  Matematik   bfa79ff0  0       status=pending·bitis=yok·score=yok·auto=yok·cevap=0  silinecek
  set    7e1b4116  Matematik   bfa79ff0  0       status=pending·bitis=yok·score=yok·auto=yok·cevap=0  silinecek
  set    f12262d4  Matematik   bfa79ff0  0       status=pending·bitis=yok·score=yok·auto=yok·cevap=0  silinecek
  ── KARAR ÖZETİ ──  silinecek: 11 · atlanacak-dolu: 0 · atlanacak-referansli: 0 · zaten-yok: 0 · toplam: 11
```

### Gerçekleşen maliyet
- **$0** — LLM/paralı çağrı yok. Yalnız Supabase okuma (dry-run). Migration yok.

### Açık riskler
- **--uygula henüz koşulmadı** (kart gereği): gerçek silme ORKESTRATÖR'de. Silme geri-dönüşsüz; geri
  dönüş yolu = yedek jsonl'deki tam satır kopyaları (insert ile geri yüklenebilir).
- TOCTOU: --uygula karar motorunu run-zamanında YENİDEN çalıştırır (dry-run kararına güvenmez); bir set
  bu arada gönderilirse (status/score dolarsa) o kap otomatik 'atlanacak-referansli' olur, silinmez.
- Yedek dosyası izlenmez (.gitignore/veri klasörü); geri-yükleme için --uygula'dan sonra saklanmalı.

### Sonraki adım önerisi
- ORKESTRATÖR bu manifesti denetleyip `bun src/scripts/gorev-047-bos-kaplar-kaldir.ts --uygula` koşar
  (11 kap silinir + yedek yazılır). Ardından idempotency için ikinci --uygula → 0 siler beklenir.
- (Kapsam dışı, ayrı kart) İçerik hattı: hedefli setlerin sahibi tek öğrenci (bfa79ff0) — istenirse
  bu öğrenciye yeni set üretimi ayrı FRONTEND/BACKEND kartı olarak açılabilir (kullanıcı "kaldır" dedi,
  bu kartta yok).

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; 046 bağımlı — kullanıcı "hepsini kaldır" kararı; ajan yalnız dry-run, --uygula ORKESTRATÖR'de)
- 2026-07-23 · BACKEND · alindi
- 2026-07-23 · BACKEND · tamamlandi (script yazıldı + DRY-RUN koşuldu: 11/11 silinecek, 0 dolu/0 referanslı/0 zaten-yok; ref tabloları assignment_submissions + targeted_assignments-satırı; typecheck/lint/test 0/0/123; $0; --uygula ORKESTRATÖR'de)
- 2026-07-23 · ORKESTRATÖR · script DENETİMİ (satır satır): id kaynağı yalnız 046 jsonl (tür+benzersizlik kilidi); KATMAN1 yeniden-doğrulama (satır-yok→zaten-yok, question_ids>0→atlanacak-dolu); KATMAN2 referans (assignment→assignment_submissions sayımı [submit ucu satır 225-226 `.insert` ile TEYİTLİ tablo], targeted→status/completed_at/score/auto_score/answers; `max_score` haklı olarak hariç — oluşturmada dolar, gönderim göstergesi değil); YEDEK silmeden önce `select('*')` + satır-sayısı uyuşmazsa DURUR; CERRAHİ tek-tek `.delete().eq('id')` doğru tablo; idempotent. `yonetim_denetim`'e yazmama gerekçesi doğru (admin defteri; sahte admin_id append-only'i kirletir) → denetim izi = yedek jsonl.
- 2026-07-23 · ORKESTRATÖR · --uygula KOŞULDU (ben): 11/11 silindi (6 assignments + 5 targeted_assignments), yedek +11 satır (`data/gorev-047-silinen-kaplar-yedek.jsonl`), UYGULA_EXIT=0. İDEMPOTENT TEYİT: ikinci koşu silinecek=0 / zaten-yok=11. Bağımsız güvence: 6 ödev 0-roster'lı öğretmene ait (gönderim imkânsız) + 5 set pending·boş·cevapsız. $0, DB dışında yazım yok, HEAD 5c2610e (commit yok). onaylandi + arşiv.
