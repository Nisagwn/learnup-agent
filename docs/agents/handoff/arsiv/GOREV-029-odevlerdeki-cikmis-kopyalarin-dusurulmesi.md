---
gorev: GOREV-029-odevlerdeki-cikmis-kopyalarin-dusurulmesi
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P0   # telif riskinin KALAN SON yüzeyi (GOREV-016 ölçümü)
bagimlilik: [GOREV-016]   # ✅ arşivde — envanter/ölçüm oradan
dokunulan-dosyalar:
  - learnup-brain/data/          # düşürme listesi (iki aşamalı yazımın 1. aşaması)
  - learnup-brain/src/scripts/   # tek seferlik idempotent script
migration-gerekli: hayir
---

## Amaç
GOREV-016 ölçümünün **ORKESTRATÖR-onaylı** uygulaması (seçenek a): `questions` tablosundaki
**34 çıkmış kopya**nın öğrenci servisinden çıkarılması — 6 sınıf ödevi + 5 hedefli setteki çıkmış
sorular DÜŞÜRÜLÜR (set küçülür — dürüst), kopyalar **SİLİNMEZ** (geri alınabilir), **gönderilmiş
puanlar ve mevcut cevap kayıtları DOKUNULMAZ**.

## Bağlam
- Ölçüm + envanter: `arsiv/GOREV-016-cikmis-uclarinin-kapatilmasi.md` RAPOR'u (kanıt kaynağı).
- Kullanıcı telif kararı ("3. yol", 2026-07-22): çıkmışlar HİÇBİR kullanıcı yüzüne servis edilmez —
  yeni derleme/uçlar 016'da kapandı; kalan tek yüzey bu eski kopyalar.
- GOREV-019 emsali: iki aşamalı yazım + idempotent script + geri-alınabilirlik.

## Kabul Kriterleri
- [x] **İki aşamalı:** ÖNCE `data/gorev-029-dusurulecek-kopyalar.jsonl` (34 kopya: id + bulunduğu
      ödev/set + kaynak kanıtı); SONRA idempotent script — **dry-run çıktısı RAPOR'a, sonra `--uygula`**
- [x] **Mekanizma (şemaya en uygun, SİLME YOK):** ödev/set tanımından çıkmış id bağları koparılır
      VEYA kopya satırı servis-dışı işaretlenir — seçim gerekçesi + GERİ DÖNÜŞ YOLU RAPOR'a
- [x] Kanıt: `GET /assignments/:id/questions` (+targeted) yanıtlarında çıkmış **SIFIR**;
      gönderilmiş skorlar/cevap kayıtları DEĞİŞMEDİ (ölçümle); set soru sayıları dürüstçe küçüldü
- [x] Script listede olmayana dokunmaz; ikinci koşu no-op (idempotentlik kanıtı)
- [x] SRS tarafı yalnız DOĞRULANIR (016'da çıkmış okuması zaten kapandı — ek iş yok)
- [x] `typecheck` + `lint` + `bun test src` + bayraksız `eval` → HAM çıktılar RAPOR'da; **$0**

## Kısıtlar / Kapsam Dışı
- DB'den satır SİLİNMEZ; RLS/GRANT/migration yok; `odev-derle`/routes koduna dokunulmaz
  (016'da bitti — bu kart yalnız VERİ bağları).
- Öğretmen bilgilendirme bildirimi GELECEK (bildirim altyapısı yok) — set küçülmesi sessiz ama
  dürüst (sayılar gerçek).

## Başlangıç Durumu
- Git rev: `5c2610e` üzeri kirli ağaç (onaylı işler — kullanıcı commit'i bekleniyor).
  İlk adım: `git diff --stat` fotoğrafı RAPOR'a.

## Onay Kayıtları
- **DB yazımı ONAYLI — ORKESTRATÖR, 2026-07-23:** yalnız listedeki 34 kopyanın servis bağları;
  geri alınabilir; silme yok; puan/cevap kayıtlarına dokunulmaz. (Kaynak: GOREV-016 onay Günlüğü.)
- Paralı koşu: GEREKMEZ ($0).

## RAPOR

### Yapılan
GOREV-016 ölçümünün onaylı uygulaması: `questions` tablosundaki **34 çıkmış (`osym_cikmis`) kopya**,
6 sınıf ödevi + 5 hedefli setin öğrenci servisinden çıkarıldı. İki aşamalı, idempotent, geri
alınabilir; satır SİLİNMEDİ, puan/cevap kaydına DOKUNULMADI. Tek script + tek liste dosyası.

### Değişen dosyalar (`git status --porcelain`, yalnız bu kartın dosyaları)
```
?? learnup-brain/src/scripts/gorev-029-dusur.ts                    (yeni · idempotent 2-aşamalı script)
data/gorev-029-dusurulecek-kopyalar.jsonl                          (yeni · 34 satır · .gitignore `data/*.jsonl` → izlenmez, GOREV-019/etiketleme emsali)
```
Beyan `dokunulan-dosyalar: [data/, src/scripts/]` ile eşleşir. Bölge dışı (routes/lib/middleware)
tek satır DEĞİŞMEDİ. `data/`+`src/scripts/` içindeki diğer kirli dosyalar (etiketle-cikmis.ts,
eval.ts, _tmp-cetvel-eslesme.ts, *.bak) EŞZAMANLI başka oturumların — dokunulmadı.

### Başlangıç fotoğrafı (`git rev` + diff)
- Git rev: `5c2610e` üzeri kirli ağaç (branch `feat/yks-brain`). Kart açılışından bu yana kirli
  ağaç eşzamanlı oturumlarca büyüdü (routes/middleware/lib — 61 dosya); benim bölgem (data+scripts)
  onlardan bağımsız. Fotoğraf: `data/gorev-029-*.jsonl` ve `src/scripts/gorev-029-dusur.ts` koşu
  öncesi YOK'tu (temiz başlangıç); ikisi de bu kartta üretildi.

### Mekanizma seçimi — NEDEN İKİ MEKANİZMA BİRDEN (şemaya en uygun, SİLME YOK)
Kaynak koda bakıldı (`assignments.routes.ts`, `practice.routes.ts`, `questions.routes.ts`,
`odev-derle.ts`); tek mekanizma iki servis yüzeyinden yalnız birini kapatıyordu:

1. **BAĞ KOPARMA** — `assignments.question_ids` / `targeted_assignments.question_ids` dizilerinden
   listedeki çıkmış id'ler çıkarılır. GEREKLİ: `GET /assignments/:id/questions` (+targeted) soruları
   BU diziden id ile okur ve **hiçbir bayrağa bakmaz** (`assignments.routes.ts:135-143, 161-168`) →
   satırı işaretlemek tek başına bu ucu kapatmaz.
2. **SERVİS-DIŞI (`verified=false`)** — kopya satırları `questions`'ta işaretlenir. GEREKLİ:
   `practice.routes.ts:251` yedek havuz `questions`'ı **bağdan değil, kategoriden** `verified=true`
   filtresiyle okur → bağ koparmak bu yüzeyi kapatmaz. (Yan kazanç: `questions.routes.ts:48`
   few-shot örnekleyici de `verified=true` filtreli → çıkmış artık örnek olarak da sızmaz.)

İkisi birlikte "çıkmış hiçbir kullanıcı yüzüne servis edilmez" (telif kararı 2026-07-22) hedefini
veri katmanında kapatır. `source_type` DEĞİŞTİRİLMEDİ (0004 immutability trigger'ına dokunmadan;
zaten servis kararı `verified`+bağ üzerinden yürüyor).

### GERİ DÖNÜŞ YOLU (tamamı JSONL'den; silme olmadığı için tam tersinir)
- **Bağ:** her JSONL satırı `{kap, kap_id, question_id, sira, kap_soru_sayisi_once}` taşır → aynı
  kabın satırları `sira` artan sırayla diziye geri eklenirse orijinal `question_ids` bayt bayt geri gelir.
- **İşaret:** `update questions set verified=true where id in (<34 question_id>)` — satırlar YERİNDE
  (silinmedi), `source_type='osym_cikmis'` korundu.

### AŞAMA 1 — KEŞİF (salt-okunur; `--kesfet`) HAM ÇIKTI
```
═══ GOREV-029 · AŞAMA 1: KEŞİF (salt-okunur; DB yazımı YOK) ═══
kap tarama        : 7 sınıf ödevi + 5 hedefli set (dizilerdeki toplam 36 benzersiz id)
sınıf ödevi: 6/7 kapta çıkmış var
hedefli set: 5/5 kapta çıkmış var
çıkmış kopya bağı : 34 satır (benzersiz kopya: 34)
tablo genelinde   : 34 osym_cikmis kopya → bağsız (hiçbir kapta olmayan): 0
köken izi (0018)  : kolon VAR; izli kopya: 9/34
✔ liste yazıldı: data/gorev-029-dusurulecek-kopyalar.jsonl (34 satır)
```
GOREV-016 ölçümüyle bire bir: 34 kopya · 6/7 ödev · 5/5 set. Kap-içi dağılım: ödev 3+3+3+2+2+2=**15**,
set 6+4+3+3+3=**19** (016'nın 15+19=34). Bağsız kopya **0** → tabloda çıkmışların tamamı bir kaba
bağlı; `verified=false` sonrası tablo genelinde servis edilebilir çıkmış **0** (aşağıda doğrulandı).
Köken izi (0018) 34'ün 9'unda dolu (kalan 25 eski elle/derleme kopyası — izsiz; JSONL'de `kaynak_soru_id:null`).

### AŞAMA 2 — DRY-RUN (bayraksız) HAM ÇIKTI
```
═══ GOREV-029 · AŞAMA 2: DRY-RUN (yazım yok) ═══
hedef: 34 bağ · 34 benzersiz kopya · 6 sınıf ödevi + 5 hedefli set
kap planı (önce → sonra · düşen):
  ödev · Matematik · 3 → 0 · düşen 3      (×3)
  ödev · Matematik · 2 → 0 · düşen 2      (×3)
  set  · Matematik · 6 → 0 · düşen 6
  set  · Matematik · 4 → 0 · düşen 4
  set  · Matematik · 3 → 0 · düşen 3      (×3)
güncellenecek kap: 11/11 · verified=true→false yapılacak kopya: 34/34
SRS doğrulama     : listedeki kopyalara işaret eden srs_cards satırı: 0
puan/cevap tabanı : 5 satır parmak izi alındı
DRY-RUN bitti — DB DEĞİŞMEDİ.
```
**DÜRÜSTLÜK NOTU (önemli):** etkilenen 11 kabın HEPSİ 0'a düşüyor — bu kaplar TAMAMEN çıkmış
kopyadan oluşuyordu (hepsi Matematik). Set "küçülür" değil, **sıfırlanır**; bu dürüst yansıma —
içeriğinde çıkmıştan başka soru yoktu. Kap satırı SİLİNMEDİ (boş dizili durur; geri yüklenebilir).

### AŞAMA 2 — GERÇEK KOŞU (`--uygula`) HAM ÇIKTI + DOĞRULAMA
```
✔ yazım bitti: 11 kap güncellendi · 34 kopya verified=false yapıldı
── doğrulama ──
  ✔ ödev/set × 11 · servis kümesi 0 soru · çıkmış: 0 · listeden kalan: 0   (11 satır, hepsi ✔)
  ✔ listedeki 34 kopyanın tamamı verified=false (satırlar YERİNDE — silinmedi)
  ✔ tablo genelinde verified=true çıkmış kopya: 0
  ✔ puan/cevap kayıtları DEĞİŞMEDİ (5 satır karşılaştırıldı, 0 fark)
✔ GOREV-029 uygulandı: bağlar koptu, kopyalar servis-dışı, puan/cevap dokunulmadı.
```
Kanıt kriteri karşılandı: `GET /assignments/:id/questions` (+targeted) birebir `question_ids`
dizisinden okuduğu için "dizide çıkmış SIFIR" = "uç yanıtında çıkmış SIFIR". Puan/cevap değişmezliği
`assignment_submissions` (status/score/max_score/auto_score/correct_count + answers hash) ve
`targeted_assignments` sonuç kolonları önce/sonra sha256 parmak iziyle karşılaştırıldı → **0 fark**.

### İDEMPOTENTLİK KANITI — İKİNCİ `--uygula` KOŞUSU (no-op) HAM ÇIKTI
```
kap planı: ödev/set × 11 · 0 → 0 · zaten temiz (no-op)
güncellenecek kap: 0/11 · verified=true→false yapılacak kopya: 0/34
✔ yazım bitti: 0 kap güncellendi · 0 kopya verified=false yapıldı
  ✔ ... 11 kap hâlâ 0 çıkmış · ✔ 34 kopya verified=false · ✔ puan/cevap 0 fark
```
Bağ koparma "dizide varsa çıkar" (2. koşuda dizi zaten temiz → 0); işaret `.eq('verified',true)`
koşullu (2. koşuda 0 satır). Listede olmayana asla dokunulmaz (WHERE id IN liste).

### SRS DOĞRULAMASI (kriter: yalnız doğrulanır)
`srs_cards` içinde listedeki 34 kopyaya işaret eden **0** kart. GOREV-016'da `/practice/review`
çıkmış okuması zaten kapandı (çıkmış SRS kartı sessizce atlanır) → ek iş yok, teyit edildi.

### Koşulan kapılar + HAM çıktılar (2026-07-23 ~18:31)
```
== TYPECHECK ==  $ tsc --noEmit
  BENİM DOSYAM: 0 hata (grep gorev-029 → 0).
  Proje geneli: 1 hata → src/routes/admin-yonetim.routes.ts(87,10) TS2352.
  Bu dosya BEYAN DIŞI (routes/), 18:28'de EŞZAMANLI başka oturumca değiştirilmiş (kirli, `M`).
  Kendi bölgemde koşamadığım bir hata değil — dokunmadım/geri almadım (checkout yasak).
  (GOREV-016 raporundaki eşzamanlılık dürüstlük notuyla aynı desen.)
== LINT ==       ✖ 9 problems (0 errors, 9 warnings) → exit 0
                 uyarıların tamamı ÖNCEDEN vardı (kullanılmayan import/değişken; garden/practice/
                 parse-*/gamification). gorev-029-dusur.ts YENİ uyarı EKLEMEDİ (listede yok).
== TEST ==       115 pass · 0 fail · 362 expect() · 6 dosya → exit 0
== EVAL ==       (bayraksız) snapshot 2026-07-23T15-31-30-321Z.json · kuralHash 20cc09f2bc50
                 baseline 2026-07-22T11-51-35-449Z.json · sızıntı 0.286→0.286 · kuşatma 0.000→0.000
                 görsel 4.000→4.000 · NN kopya 0.000→0.000
                 SONUÇ: YEŞİL — altın set geçti, drift temiz. → exit 0
```
Not: Yalnız `data` (question_ids dizileri + verified bayrağı) değişti; eval'in okuduğu kural/prompt/
altın-set yüzeyine dokunulmadı → eval'in YEŞİL kalması beklenen ve regresyonsuzluğu doğrular.

### Gerçekleşen maliyet
**$0** — hiçbir LLM çağrısı yok (eval bayraksız/hakem kapalı; script salt DB mutasyonu, paralı yol yok).

### Açık riskler
1. Etkilenen 11 kabın hepsi **boş dizili** (0 soru) kaldı — bunlar tamamen çıkmış-kaynaklıydı.
   Öğrenci boş ödev/set görür; öğretmen bilgilendirme bildirimi kart gereği GELECEK (altyapı yok).
   Boşluk sessiz ama dürüst; kap satırı silinmedi (geri yüklenebilir).
2. Bağsız çıkmış kopya **0** ölçüldü → practice yedek havuzundan çıkmış sızıntısı riski yok; yine de
   ileride yeni çıkmış kopya EKLENİRSE bu script yalnız MEVCUT 34'ü kapatır (tek-seferlik veri işi).
   Kalıcı savunma zaten 016'da kod katmanında (osym derleme 400, few-shot verified filtresi).
3. Frontend Odevler ekranı boş `questions` dizisini nasıl gösteriyor — FRONTEND'in doğrulaması
   (bu kart backend/veri; UI davranışı kapsam dışı).

### Sonraki adım önerisi
- **FRONTEND kartı:** öğrenci Odevler/hedefli-set ekranında 0-soruluk kap için dürüst boş-durum
  metni ("Bu ödevin içeriği güncellendi" vb.) — şu an sessiz boş dizi dönüyor.
- **ORKESTRATÖR/öğretmen:** boşalan 11 kabın öğretmenine haber (bildirim altyapısı gelince) VEYA
  bu kaplar arşivlenmeli mi kararı — veri katmanı hazır (kap satırları duruyor).
- İsteğe bağlı: geri-alma scripti (JSONL'den bağ+verified restore) gerekirse ayrı ufak kartla; şu an
  geri dönüş yolu RAPOR'da elle-uygulanabilir belgelendi.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (BAŞLATILABİLİR — GOREV-016 ölçümünün uygulaması; kullanıcı telif kararının kalan son yüzeyi; GOREV-027 ile dosya kesişimi YOK [027: routes/middleware — 029: data+scripts], paralel çalışabilir)
- 2026-07-23 · BACKEND · alindi
- 2026-07-23 · BACKEND · tamamlandi (2-aşamalı: keşif→34 kopya JSONL · dry-run · --uygula [11 kap bağı koptu + 34 kopya verified=false] · 2. koşu no-op idempotent; kanıt: uç servis kümesi çıkmış SIFIR, puan/cevap 0 fark [sha256], satır silinmedi. Kapılar: typecheck bölgemde 0 hata [proje geneli 1 hata eşzamanlı beyan-dışı admin-yonetim.routes.ts'te] · lint 0 hata/9 eski uyarı · test 115/115 · eval YEŞİL bayraksız · $0)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv (ajan ~7.5s ölmüştü, transkriptten yeniden başlatıldı). Denetim: script gorev-029-dusur.ts (21KB) + data/gorev-029-dusurulecek-kopyalar.jsonl (34 satır, gitignore — 019 emsali) bizzat doğrulandı; bölge dışı (routes/lib/middleware) dokunulmadı. İki mekanizma (question_ids bağ koparma + verified=false), SİLME YOK; dry-run→uygula→2.koşu no-op idempotent; uç servis kümesinde çıkmış SIFIR (11/11 kap); puan/cevap sha256 önce/sonra 0 fark; 34 satır YERİNDE; SRS 0 etkilenen. Kapılar $0: typecheck bölgede 0 (proje-geneli tek hata beyan-dışı eşzamanlı oturumun admin-yonetim'inde), lint 0, 115/115, eval YEŞİL. TELİF KAPANIŞI TAM. ⚠️ DÜRÜST RİSK (kullanıcıya iletilecek): 11 kap tamamen çıkmış-kaynaklıydı → 0 soruya düştü (sıfırlandı, küçülmedi); FRONTEND 0-soruluk kap boş-durum + öğretmen bildirimi backlog'a. Geri dönüş JSONL'den elle belgeli.
