---
gorev: GOREV-046-bos-odev-kaplari-raporu
kimden: ORKESTRATÖR
kime: BACKEND
durum: onaylandi
oncelik: P1
bagimlilik: []
dokunulan-dosyalar:
  - learnup-brain/src/scripts/gorev-046-bos-kaplar-raporu.ts   # YENİ — salt-okunur teşhis
  - learnup-brain/data/gorev-046-bos-kaplar.jsonl               # ÇIKTI (data/, izlenmez)
migration-gerekli: hayir
---

## Amaç
GOREV-029 telif temizliğinin **0 soruya düşürdüğü ödev kaplarını** (sınıf ödevleri + hedefli
setler) SALT-OKUNUR bir raporla ortaya çıkarmak: hangileri boş, kime atanmış, kaç öğrenci
etkileniyor — böylece kullanıcı "doldur mu / kaldır mı" kararını gerçek veriyle verebilsin.
**Bu kart hiçbir şeyi değiştirmez** (V3.7.2 iki-aşamalı yazım: önce ölç/raporla, mutasyon ayrı kart).

## Bağlam
- **KÖK NEDEN:** GOREV-029, çıkmış-kaynaklı 34 soruyu ödevlerden söktü (`bag-kopar+servis-disi`:
  `question_ids` çözüldü + `verified=false`, silinmedi). Bazı kaplar TÜM sorularını kaybetti → 0'a
  düştü (özet: 6 sınıf ödevi + 5 hedefli set = 11 kap, hepsi Matematik). Bu kaplar hâlâ öğrencilerin
  panosunda ve açılınca çözülemez (GOREV-044 UI ölü-ucu — o düzeltme kullanıcı direktifiyle görsel
  dalgaya ertelendi; bu kart sorunu **kaynağında/veride** aydınlatır).
- **029'un kanıt izi:** `learnup-brain/data/gorev-029-dusurulecek-kopyalar.jsonl` (34 satır). Her
  kayıt: `kap` ('assignment'|'targeted'), `kap_id`, `kap_baslik`, `sira`, `kap_soru_sayisi_once`,
  `kanit` (source_type/verified/category…), `islem`. Bir kap için düşürülen soru sayısı
  `kap_soru_sayisi_once`'a EŞİTSE o kap tamamen boşalmıştır → aday boş kap.
- **CANLI DOĞRULAMA ŞART (jsonl'e körü körüne güvenme):** aday `kap_id`'ler CANLI DB'den teyit
  edilir — `assignments` / `targeted_assignments` tablosunda `question_ids` uzunluğu GERÇEKTEN 0 mı?
  (Sonradan elle doldurulmuş olabilir.) Rapor yalnız canlıda hâlâ boş olanları "boş" işaretler.
- Şema: `assignments` (teacher_id, class_code?, question_ids, title, created_at…) sınıf geneli —
  öğrenci kolonu YOK; etkilenen öğrenciler o öğretmenin/sınıf kodunun roster'ından türetilir.
  `targeted_assignments` (student_id NOT NULL, question_ids, title, status…) tek öğrenciye özel.
- Anayasa: **null ≠ 0** (boş ≠ ölçülmedi — rapor ayrımı korur); `fetchAll()` (M6 — 1000 tuzağı);
  rol/RLS: service-role okuma, uygulama katmanı. LLM YOK, paralı çağrı YOK ($0).

## Kabul Kriterleri
- [ ] `learnup-brain/src/scripts/gorev-046-bos-kaplar-raporu.ts` — salt-okunur script:
      029 jsonl'inden aday `kap_id`'leri çıkarır (kap başına düşen soru = `kap_soru_sayisi_once`
      olanlar), **canlı DB'den teyit eder** (`question_ids` uzunluğu 0), her boş kap için üretir:
      `kap` türü · `kap_id` · `baslik` · sahip (`teacher_id` / `student_id`) · `class_code` (varsa) ·
      `created_at` · `soru_sayisi_once` (029'dan) · `soru_sayisi_simdi` (canlı, 0 beklenir) ·
      `etkilenen_ogrenci_sayisi` (targeted=1; assignment=roster adedi, ölçülemezse `null` — UYDURMA
      YOK) · `oneri` sınıflaması ('doldur-icerik-hatti' | 'kaldir' | 'incele' — yalnız ETİKET,
      eylem değil).
- [ ] Çıktı `learnup-brain/data/gorev-046-bos-kaplar.jsonl` (kap başına bir satır) + konsola özet
      tablo (tür bazında sayım, toplam etkilenen öğrenci, ders dağılımı). İki-aşamalı yazım: yalnız
      `data/`'ya yazar, DB'ye DOKUNMAZ.
- [ ] **Hiçbir mutasyon yok:** `UPDATE`/`DELETE`/`insert`/`upsert`/RPC-yazım YOK; yalnız `select`.
      `git status` yalnız yeni script'i gösterir (data/ izlenmez). Idempotent: iki kez koşmak aynı
      raporu üretir.
- [ ] `null ≠ 0`: ölçülemeyen alan (`etkilenen_ogrenci_sayisi` roster çekilemezse) `null` yazılır,
      0'a çevrilmez. 029 jsonl'inde olup canlıda ARTIK boş OLMAYAN kap "boş" sayılmaz (raporda
      `durum: 'artik-dolu'` ayrı bölümde listelenir — dürüstlük).
- [ ] `bun run typecheck` sıfır hata + `bun run lint` temiz → HAM çıktılar RAPOR'a. `bun test src`
      koşulur (bu script davranış değiştirmiyor; kırılma olmamalı). **`bun run eval` GEREKMEZ**
      (kural/model/soru-sağlık değişmedi — drift'e dokunmaz); RAPOR'da "eval koşulmadı: gerekçe" yaz.
- [ ] **$0** — LLM/paralı çağrı yok; RAPOR'da doğrula.

## Kısıtlar / Kapsam Dışı
- **SALT-OKUNUR.** Boş kapları doldurma/silme/geri-yükleme YOK — o ayrı bir mutasyon kartı
  (kullanıcı raporu görüp karar verince ORKESTRATÖR açar). Bu kart karar VERMEZ, veri SUNAR.
- `model-router.ts` CHAINS/FIYAT/sağlayıcı blokları OKUNMAZ bile — gerek yok (LLM'siz).
- Migration YOK. `data/` çıktısı dışında hiçbir kalıcı durum değişmez.
- İçerik hattı (havuz-doldur / yeni soru üretimi) bu kartta YOK.
- Frontend'e/UI'a dokunulmaz (kullanıcı direktifi: görsele girme).

## Başlangıç Durumu
- Git rev: `5c2610e`. Çalışma ağacı çok kirli (tüm onaylı FİDAN + telif + eval + öğretmen kaydı
  işleri commit'lenmedi — kullanıcı commit'leyecek). `learnup-brain/` tarafında GOREV-029/031 vb.
  onaylı işlerin izleri kirli olabilir — **onlara dokunma**; yalnız yeni script'i ekle. Girdi dosyası
  `data/gorev-029-dusurulecek-kopyalar.jsonl` (34 satır) mevcut. İlk adım: durumu `alindi` yap,
  `data/gorev-029-*.jsonl`'i oku, sonra script'i yaz. Beyan dışı kirli dosyaya dokunma; `git checkout --` YASAK.

## Onay Kayıtları
- Paralı koşu: GEREKMEZ ($0 — salt-okunur, LLM yok).
- Migration: yok.

## RAPOR
<!-- YALNIZ BACKEND ajanı doldurur. -->
### Yapılan
- `src/scripts/gorev-046-bos-kaplar-raporu.ts` — YENİ salt-okunur teşhis scripti yazıldı
  (gorev-029-dusur.ts / gorev-031-endash-duzelt.ts deseni: service-role client, ESM `.js`
  importları, tek atışlık koşu; bayrak yok — her koşu salt-okunur).
- **Aday çıkarımı (029'dan):** 34 kanıt satırı kap başına gruplandı; düşen soru == `kap_soru_sayisi_once`
  olan **11 kap** aday boş bulundu (6 sınıf ödevi + 5 hedefli set). Kısmen boşalan (düşen < once) kap: 0.
- **Canlı teyit (jsonl'e körü körüne güvenilmedi):** aday `kap_id`'ler `assignments` /
  `targeted_assignments`'tan okundu; `question_ids` uzunluğu **11/11'inde canlıda GERÇEKTEN 0** →
  hepsi hâlâ boş. `artik-dolu` (canlıda yeniden dolmuş): **0**. `kayip` (canlıda satır yok): **0**.
- **Sahip/roster:** 6 sınıf ödevinin tamamı tek öğretmene (`b5baf893…`) ait; roster
  `lib/yetki.ts:sinifOgrencileri` (KANONİK: role='student' AND teacher_id/teacher_ids; `fetchAll`)
  ile ölçüldü → **0 öğrenci** (bu öğretmenin sınıfına katılmış öğrenci yok). teacher_id mevcut
  olduğu için bu 0 **ölçüldü**, `null` değil (null ≠ 0). 5 hedefli set tek öğrenciye (`bfa79ff0…`)
  ait → her biri **1** öğrenci.
- **class_code:** `assignments` tablosunda `class_code` kolonu YOK (canlı probe:
  `column assignments.class_code does not exist`) → kartın "class_code (varsa)" gereği sahip
  öğretmenin `profiles.class_code`'undan türetildi; o da **null** (öğretmenin sınıf kodu tanımsız —
  bu, roster'ın neden 0 olduğunu da açıklar). Hedefli sette class_code boyutu yok → null.
- **oneri (yalnız ETİKET, eylem değil):** etkilenen>0 → `doldur-icerik-hatti` (5 hedefli set);
  etkilenen==0 → `kaldir` (6 sınıf ödevi); etkilenen==null → `incele` (0). Bu kart karar VERMEZ.
- Çıktı `data/gorev-046-bos-kaplar.jsonl` (11 satır, kap başına 1) + konsol özet tablosu üretildi.
- **İdempotency:** iki koşu bayt-bayt aynı jsonl'i üretti (sha256 aynı; deterministik tür→kap_id sırası).

### Değişen dosyalar
- `learnup-brain/src/scripts/gorev-046-bos-kaplar-raporu.ts` — YENİ (salt-okunur; yalnız `.select`).
- `learnup-brain/data/gorev-046-bos-kaplar.jsonl` — ÇIKTI (11 satır; `data/` git-ignored, izlenmez).
- Beyan dışı HİÇBİR dosyaya dokunulmadı. `git checkout --` / `git restore` KULLANILMADI.
  `git status --short` (beyan): `?? learnup-brain/src/scripts/gorev-046-bos-kaplar-raporu.ts`
  (jsonl `git check-ignore` ile izlenmiyor doğrulandı). DB'ye 0 yazım.

### Koşulan kapılar + çıktıları
**`bun run typecheck`** → SIFIR hata (exit 0):
```
$ tsc --noEmit
TSC_EXIT=0
```

**`bun run lint`** → temiz, 0 error (exit 0). Yeni dosya UYARISIZ (kullanılmayan `fetchAll` importu
kaldırıldı). Kalan 10 uyarı bu kartla ilgisiz ÖNCEDEN VAR OLAN dosyalarda (gamification/garden/
practice.routes, parse-*.ts):
```
✖ 10 problems (0 errors, 10 warnings)
LINT_EXIT=0
```

**`bun test src`** → 123 pass / 0 fail (exit 0; script davranış değiştirmiyor, kırılma yok):
```
 123 pass
 0 fail
 386 expect() calls
Ran 123 tests across 6 files. [586.00ms]
TEST_EXIT=0
```

**Salt-okunur ispatı** (script içi mutasyon fiili taraması):
```
=== mutation verb check (update|delete|insert|upsert|rpc) ===  → NONE FOUND
=== supabase çağrı fiilleri ===  → yalnız .select( (3 satır: 148, 158, 213) + import sinifOgrencileri (select-only)
```

**Koşu 1 (canlı) — konsol özeti (HAM):**
```
═══ GOREV-046 · BOŞ ÖDEV KAPLARI RAPORU (SALT-OKUNUR; DB yazımı YOK) ═══
029 kanıt izi     : 34 satır → 11 aday boş kap (6 sınıf ödevi + 5 hedefli set)
── BOŞ KAP ÖZETİ (canlı teyitli) ──
tür bazında       : sınıf ödevi 6 · hedefli set 5 · TOPLAM 11
etkilenen öğrenci : 5 (ölçülebilen 11 kap) · ölçülemeyen (null) 0 kap
ders dağılımı     : Matematik:11
öneri etiketi     : kaldir:6  doldur-icerik-hatti:5

  tür         kap_id    başlık                            once→simdi  etkilenen  öneri
  ödev        2a49ec23  Matematik                         3→0         0          kaldir
  ödev        3c2df948  Matematik                         2→0         0          kaldir
  ödev        5f0d773a  Matematik                         2→0         0          kaldir
  ödev        a2ce3b2d  Matematik                         3→0         0          kaldir
  ödev        ca3259c7  Matematik                         3→0         0          kaldir
  ödev        d3a84b2d  Matematik                         2→0         0          kaldir
  set         2e49baa3  Matematik                         3→0         1          doldur-icerik-hatti
  set         2faa0905  Matematik                         6→0         1          doldur-icerik-hatti
  set         3ddc504b  Matematik                         4→0         1          doldur-icerik-hatti
  set         7e1b4116  Matematik                         3→0         1          doldur-icerik-hatti
  set         f12262d4  Matematik                         3→0         1          doldur-icerik-hatti

── ARTIK DOLU (029'da boşalmış ama canlıda yeniden soru var — "boş" SAYILMAZ): 0 ──
── KAYIP (029 adayı ama canlı tabloda YOK — silinmiş/taşınmış): 0 ──
✔ jsonl yazıldı: …/data/gorev-046-bos-kaplar.jsonl (11 boş kap)
SALT-OKUNUR: DB DEĞİŞMEDİ. İkinci koşu aynı çıktıyı üretir (idempotent).
```

**Üretilen jsonl — ilk 3 satır (HAM):**
```
{"durum":"bos","tur":"assignment","kap_id":"2a49ec23-d354-409a-802d-02cdf95d67b1","baslik":"Matematik","sahip":"b5baf893-94ef-446a-948c-616f717622f0","sahip_turu":"teacher_id","class_code":null,"created_at":"2026-07-20T07:36:53.380395+00:00","soru_sayisi_once":3,"soru_sayisi_simdi":0,"etkilenen_ogrenci_sayisi":0,"oneri":"kaldir"}
{"durum":"bos","tur":"assignment","kap_id":"3c2df948-884e-4af4-bb69-69ad5c2b68c5","baslik":"Matematik","sahip":"b5baf893-94ef-446a-948c-616f717622f0","sahip_turu":"teacher_id","class_code":null,"created_at":"2026-07-20T07:37:38.841467+00:00","soru_sayisi_once":2,"soru_sayisi_simdi":0,"etkilenen_ogrenci_sayisi":0,"oneri":"kaldir"}
{"durum":"bos","tur":"targeted","kap_id":"2e49baa3-9928-468e-99ff-b31860996e76","baslik":"Matematik","sahip":"bfa79ff0-c952-49bd-8bc0-1bd532e15847","sahip_turu":"student_id","class_code":null,"created_at":"2026-07-20T07:42:28.211916+00:00","soru_sayisi_once":3,"soru_sayisi_simdi":0,"etkilenen_ogrenci_sayisi":1,"oneri":"doldur-icerik-hatti"}
```

**Koşu 2 — idempotency (HAM):**
```
RUN2_EXIT=0
hash1=cf1859a5cd6e2c80d213097e8ad2a07bb5c8bbdafe0c65db8addb42d0179353f
hash2=cf1859a5cd6e2c80d213097e8ad2a07bb5c8bbdafe0c65db8addb42d0179353f
IDEMPOTENT=YES (byte-identical)
```

**`bun run eval` — KOŞULMADI (gerekçe):** kural/model/soru-sağlık değişmedi; script salt-okunur bir
teşhistir, davranışa/drift'e dokunmaz (kabul kriteri de "gerekmez" diyor). Çalıştırmak yalnız gürültü olurdu.

### Gerçekleşen maliyet
**$0.** LLM/paralı çağrı YOK — yalnız Supabase `select` okumaları (service-role). `model-router.ts` /
CHAINS / routed* fonksiyonlarına dokunulmadı; hiçbir OpenRouter çağrısı yapılmadı.

### Açık riskler
- **6 sınıf ödevinin etkilenen=0 olması bir gözlem, veri kaybı değil:** sahip öğretmen (`b5baf893…`)
  `profiles.class_code`'u null ve sınıfına katılmış öğrenci yok. Öğrenci katılırsa bu kaplar canlıda
  yine 0 soru gösterir (GOREV-044 UI ölü-ucu). `kaldir` etiketi bu yüzden — ama karar kullanıcının.
- **jsonl anlık görüntüdür:** rapor koşulduğu andaki canlı durumu yansıtır; kaplar sonradan elle
  doldurulursa (artik-dolu) yeniden koşmak gerekir. Script bunu zaten ayrı bölümde raporlar.
- Tüm boş kaplar Matematik — 029'un yalnız çıkmış-Matematik kopyalarını sökmesinin doğrudan sonucu;
  başka ders etkilenmedi.
- `assignments` tablosunda `class_code` kolonu YOK; class_code öğretmen profilinden türetildi.
  Şema başka bir "sınıf" alanı taşıyorsa (görülmedi) o boyut raporda yer almaz.

### Sonraki adım önerisi
- **Mutasyon kartı (ORKESTRATÖR açar, kullanıcı kararından SONRA):** bu rapordaki 11 boş kap için
  kullanıcı "doldur mu / kaldır mı" kararını versin. `data/gorev-046-bos-kaplar.jsonl` girdi olur:
  `oneri` alanı yalnız başlangıç etiketi; nihai eylem kullanıcının. Doldurma → içerik hattı (havuz-üret
  / yeni soru); kaldırma → kap satırının servisten çıkarılması. **Bu kart o kararı VERMEZ.**
- **FRONTEND kartı (ayrı):** GOREV-044 UI ölü-ucu (boş kap açılınca "çözülemez") görsel dalgada
  ele alınacak — 0 soruluk kap için öğrenci panosunda net "içerik hazırlanıyor" durumu.

## Günlük
- 2026-07-23 · ORKESTRATÖR · kart açıldı (beklemede; salt-okunur teşhis — 029 boş kaplarının kök-neden raporu, görsel-dışı)
- 2026-07-23 · BACKEND · alindi
- 2026-07-23 · BACKEND · tamamlandi (11 boş kap: 6 sınıf ödevi[etkilenen 0→kaldir] + 5 hedefli set[etkilenen 1→doldur]; canlı teyitli, artik-dolu 0 / kayip 0; salt-okunur, $0; TSC/lint/test hepsi exit 0; idempotent)
- 2026-07-23 · ORKESTRATÖR · onaylandi + arşiv. Bağımsız denetim: (1) SALT-OKUNUR MÜHÜRLÜ — mutasyon grep (`.update/.delete/.insert/.upsert/.rpc`) = 0; yalnız 3 `.select` (kolon-yoklama + canliOku + profiles.class_code). Tek yazım `data/*.jsonl` (git-ignored); DB'ye tek bayt yazılmadı. (2) Çıktı 11 kayıt canlı teyitli (soru_sayisi_simdi=0): 6 sınıf ödevi (hepsi öğretmen b5baf893, roster 0 → etkilenen 0 → `kaldir`) + 5 hedefli set (hepsi Matematik). (3) TYPECHECK bağımsız yeniden koşuldu = exit 0. (4) null≠0 + artik-dolu(0)/kayip(0) dürüstlük bölümleri korunmuş. **DÜRÜSTLÜK NÜANSI (rapora eklenecek):** 5 hedefli setin sahibi TEK ve AYNI öğrenci (`bfa79ff0`) → konsol "toplam etkilenen 5" = set-öğrenci çifti toplamı; GERÇEK FARKLI ÖĞRENCİ = 1 (5 boş Matematik seti olan tek öğrenci). Kap-başına jsonl verisi doğru (her set sahip=student_id); yalnız konsol rollup'ı distinct saymıyor. Gerçek yüz-etkisi: 1 öğrenci + 6 öksüz ödev (0 roster, kimse görmüyor). Git ayak izi yalnız yeni script. $0.
