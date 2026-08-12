# Öğretmen Paneli — Uçtan Uca Mantık Denetimi

**Tarih:** 2026-08-11 · **Dal:** `ci`
**Kapsam:** Öğretmenin ekranda yapabildiği her işin tam yolu —
`frontend-v2/src/screens/sinif/**` (5 ekran) · `components/RolGecidi.tsx` · `components/sinif.tsx` ·
`lib/{sinif.tsx,sinif-kapsam.ts,useAsync.ts,sorgu.ts,api.js}` · `App.tsx` sınıf rota ağacı ·
`learnup-brain/src/routes/{teacher,sinif,assignments,questions}.routes.ts` ·
`src/lib/{yetki,rontgen,odev-derle,pg}.ts` · `src/middleware/{auth,requireRole}.ts` ·
`src/workers/atolye.worker.ts` · `learnup-brain/migrations/**` + `supabase/migrations/{0001,0002}`

**Yöntem:** Her dosya birebir okundu; her bulgu için tetikleme yolu ekrandan SQL'e kadar izlendi.
Tetiklenemeyen (ölü kod, ulaşılamaz dal, zaten korunan) şüpheler rapora ALINMADI — emin olunamayanlar
ayrı "ŞÜPHELİ" bölümünde. Kod DEĞİŞTİRİLMEDİ.

**2026-08-10 denetimiyle ilişki:** `00-ozet.md` / `01-frontend.md` / `02-backend.md` / `03-cekirdek.md`
okundu. Orada geçen bulgular burada tekrar YAZILMADI — §5'te "bilinen" olarak tek satır referans
verildi, §6'da o rapordan sonra DÜZELTİLMİŞ olanlar işaretlendi.

**Toplam 21 YENİ bulgu** — 4 KRİTİK · 5 YÜKSEK · 7 ORTA · 5 DÜŞÜK

> **DURUM (2026-08-12): 21 bulgunun tamamı + §5'teki bilinen bulgular düzeltildi.**
> Ayrıntılı döküm §9'da. İki migration YAZILDI ama HENÜZ UYGULANMADI — kullanıcı elle basacak:
> `learnup-brain/migrations/0037_rls_sertlestirme.sql` (K1–K4) ve
> `0038_panel_sayim_rpc.sql` (O3 · D2). **0037 basılmadan K1–K4 açık kalır**; 0038 basılmazsa
> uçlar eski (pahalı) yola düşer ve log'a uyarı basar — panel çalışır.
> Doğrulama: backend `tsc` + `eslint` temiz, 166 test geçti; frontend `tsc` temiz, `vite build` başarılı.

---

## 0. Sistemik temalar

Yirmi bir bulgunun on beşi dört başlık altında toplanıyor.

### T1 — Sunucudaki her kapı, tarayıcıdaki anon istemciyle yandan geçilebiliyor (KRİTİK)

`learnup-brain` service-role ile çalışır ve RLS'i baypas eder; kod bunu her dosyada yazıyor ve
kapıları uygulama katmanında tek tek kuruyor (`sorulariSoy`, tek-gönderim kilidi, otoriter puanlama,
`assertTeacherOwnsStudent`). Ama **öğrencinin tarayıcısında aynı veritabanına açılan ikinci bir yol
var**: `frontend-v2/src/lib/supabase.js` anon anahtarla `createClient` kuruyor ve
`supabase/migrations/0002_rls_policies.sql` bu yolu neredeyse hiç kısıtlamıyor.

| Tablo | Politika (0002) | Sonuç |
|---|---|---|
| `questions` | `select using (true)` | Ödev sorularının `correct_answer`'ı okunabilir |
| `assignment_submissions` | `insert/update` = kendi satırı | Puan istemci tarafından yazılabilir |
| `targeted_assignments` | `update` = `teacher_id` **veya** `student_id` | Hedefli set puanı öğrenci tarafından yazılabilir |
| `user_logs` | `insert` = kendi satırı | Sınıf KPI'larının kaynağı uydurulabilir |
| `profiles`,`user_logs`,`user_answers`,`assignments`,`assignment_submissions`,`targeted_assignments` | `select using (true)` | Okulun tamamı çapraz okunabilir |

Repo bu tür sertleştirmeyi başka yerlerde YAPMIŞ (`0019` → `revoke update on public.profiles from
authenticated`, `0014` → `revoke select on v_mastery_rollup from authenticated`), yani "grant'lar
`authenticated`'a açık" varsayımı bu projede ampirik olarak doğrulanmış. Ödev/log tabloları o dersi
almamış. Öğretmen panelinin gördüğü her sayı (başarı yüzdesi, risk etiketi, ısı haritası, İlgi
Bekleyenler) bu tabloların üzerinde duruyor.

### T2 — Ödev bir kez yayınlandıktan sonra geri alınamıyor, kapatılamıyor, düzeltilemiyor (YÜKSEK)

`assignments` için repoda **yalnız INSERT var** (`teacher.routes.ts:838`). `status`'u `archived`
yapan, `due_date`'i değiştiren, satırı silen hiçbir uç yok (grep ile doğrulandı; yalnız
`src/scripts/gorev-047-*.ts` bakım betiği siliyor). Buna karşılık:

- `assignments.routes.ts:208-215` gönderimde `status` ve `due_date`'i **zorunlu kılıyor**,
- `SinifPanosu.tsx:817` "Son tarih: 3 Ağustos" çiziyor,
- `POST /teacher/odev` gövdede `dueDate` kabul ediyor (`teacher.routes.ts:846`),
- **hiçbir ekran `dueDate` göndermiyor** (`OdevAtolyesi.tsx:288-296`).

Yani ödev penceresi özelliği üç katmanda var, yalnız öğretmenin dokunabildiği yerde yok. Aynı boşluk
yanlış yayınlanan ödevi de kalıcı yapıyor (bkz. Y2, bilinen #16).

### T3 — Aynı soru iki ekranda iki farklı yanıt alıyor (ORTA)

Panelin dört yerinde aynı büyüklük iki farklı formülle hesaplanıyor ve öğretmen ikisini de görüyor:

| Soru | A ekranı | B ekranı |
|---|---|---|
| "Bu kazanımdan ödev derlenebilir mi?" | `SinifPanosu.tsx:354` → `osym + ai === 0` | `SinifIsi.tsx:536` → `ai === 0` (doğru) |
| "Sınıfta kaç öğrenci var?" | `SinifPanosu.tsx:506` → `ozet.sinif.ogrenciSayisi` (gerçek) | `SinifPanosu.tsx:676` → `roster.length` (200 tavanlı) |
| "Bu ödevi kaç kişi yapmadı?" | tablo: güncel mevcut | `SinifPanosu.tsx:799` → tazelenmemiş `ogrenciSayisi` |
| "Isı haritası kaç öğrenciyi kapsıyor?" | `SinifIsi.tsx:391` → en kalabalık hücrenin sayısı | gerçek mevcut |

### T4 — Ölçek değişmezleri (`fetchAll` / `sayimAl` / 1000-satır tuzağı) ödev hattında uygulanmamış (ORTA)

`lib/pg.ts` "PostgREST 1000 satırda SESSİZCE keser" kuralını ampirik kanıtla yazıyor ve iki araç
sunuyor. Öğretmen panelinin üç sıcak yolu bu araçları atlıyor: `odev-derle.ts:104` (filtresiz,
`fetchAll`sız tam tablo), `teacher.routes.ts:496-506` (`sayimAl` yerine satır satır sayım),
`teacher.routes.ts:184-195` (84 günlük tüm sınıf logu belleğe).

---

## 1. KRİTİK

### K1 — Ödev sorularının DOĞRU CEVABI öğrenciye açık: `questions` tablosu anon istemciye tam okunur

`supabase/migrations/0002_rls_policies.sql:38` · `learnup-brain/src/lib/odev-derle.ts:315-335` ·
`learnup-brain/src/routes/assignments.routes.ts:54-65` · **KRİTİK**

```sql
create policy questions_read on questions for select to authenticated using (true);
```

`sorulariMaterialize` seçilen havuz sorularını `questions` tablosuna kopyalarken `correct_answer`'ı
**metin olarak** yazıyor (`odev-derle.ts:325`) — puanlama `options[idx] === correct_answer`
karşılaştırmasıyla yapıldığı için başka türlü olamaz. `assignments.routes.ts:56` `sorulariSoy()` bu
alanı yanıttan özenle soyuyor ve yorum bunu "cevap kâhini" diye adlandırıyor.

**Senaryo:** Öğretmen 20 soruluk Matematik ödevini yayınlar. Öğrenci ödevi açar; `GET
/api/v1/assignments/:id/questions` cevapsız gövdeyi döndürür ama her sorunun `id`'sini taşır. Öğrenci
aynı sekmedeki oturumuyla:

```js
supabase.from('questions').select('id, correct_answer, explanation').in('id', [...20 id])
```

**Sonuç:** 20 doğru cevabın tamamı tek istekte elde edilir. `POST /assignments/submit` %100 yazar,
`/teacher/odevler` `ortalamaYuzde` 1.0 döner, `sinif_ozeti` risk etiketini `dusuk` yapar, "İlgi
Bekleyenler" listesi o öğrenciyi hiç göstermez. Sunucudaki tek-gönderim kilidi, cevap soyma ve
otoriter puanlama — üçü de bu tek satır yüzünden anlamsız. Aynı politika çıkmış/AI havuzundan
kopyalanmış TÜM soruları da açar.

**Öneri:** `questions_read`'i `using (auth.uid() = teacher_id)` ile daralt ve öğrenci okumasını
tamamen uca bırak (uç zaten `sorulariSoy` ile veriyor); ya da `correct_answer`/`explanation`
kolonlarında `revoke select ... from authenticated` uygula (`0019`'un `profiles` için kurduğu
kolon-yetkisi deseni).

---

### K2 — Öğrenci kendi ödev puanını ve hedefli set sonucunu doğrudan veritabanına yazabiliyor

`supabase/migrations/0002_rls_policies.sql:66-69, 72-76` · **KRİTİK**

```sql
create policy asub_insert on assignment_submissions for insert to authenticated
  with check ((select auth.uid()) = student_id);
create policy asub_update on assignment_submissions for update to authenticated
  using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);
create policy ta_update on targeted_assignments for update to authenticated
  using ((select auth.uid()) in (teacher_id, student_id)) with check (…);
```

Sütun kısıtı yok: `score`, `max_score`, `auto_score`, `correct_count`, `status`, `completed_at`,
`answers` — hepsi istemci yazılabilir.

**Senaryo A (hiç çözmeden tam puan):** Öğrenci ödevi hiç açmaz, doğrudan
`insert into assignment_submissions (assignment_id, student_id, score, max_score, correct_count)`
ile 20/20 yazar. `0036`'daki `unique(assignment_id, student_id)` bunu ENGELLEMEZ — tersine, sunucu
gönderimini de bloke eder ("Bu ödevi zaten gönderdiniz").

**Senaryo B (hedefli set):** Öğrenci `update targeted_assignments set score = max_score,
status = 'completed', completed_at = now() where id = '<kendi seti>'`. `assignments.routes.ts:307,
331`'deki tek-gönderim kilidi (yorumu "cevap kâhinini kapatmanın TEK dayanağı" diyor) atlanır.

**Sonuç:** `/teacher/odevler` `gonderim.ortalamaYuzde`, `/teacher/ogrenci/:id` `sonOdevler`,
`SinifPanosu` "Aktif Ödev Takibi" çubukları ve öğrencinin risk sınıflandırması tamamen istemci
kontrollü. Öğretmenin ödev hakkında gördüğü tek somut ölçüt bu.

**Öneri:** İki tablonun `insert`/`update` politikalarını kaldır (yazma yalnız service-role'dan
gelsin — zaten öyle geliyor). `ta_update`'in `student_id` kolu 2026 öncesi doğrudan-istemci
mimarisinin kalıntısı.

---

### K3 — Sınıf panosunun bütün sayıları öğrenci tarafından uydurulabiliyor: `user_logs` insert açık

`supabase/migrations/0002_rls_policies.sql:50` · `learnup-brain/migrations/0016_rol_ve_panel.sql:111-121` ·
`learnup-brain/src/routes/teacher.routes.ts:184-216` · **KRİTİK**

```sql
create policy logs_insert on user_logs for insert to authenticated
  with check ((select auth.uid()) = student_id);
```

`sinif_ozeti` RPC'si `solved`/`correct`/`xp`/`last_active` alanlarını **doğrudan `user_logs`'tan**
üretiyor (0016:111-121); `/teacher/ozet` haftalık raporu ve 84 günlük trendi aynı tablodan okuyor.
`is_correct`, `xp`, `kazanim_id`, `subject`, `difficulty`, `created_at` üzerinde hiçbir kısıt yok.

**Senaryo:** Öğrenci 400 satır `user_logs` insert eder (`is_correct: true`, `xp: 15`, geçmiş
tarihlerle). Ertesi sabah öğretmen panoyu açar.

**Sonuç:** Öğrencinin `basariOrani` %100, `solved` 400, `lastActive` "az önce" olur;
`riskBul` (`teacher.routes.ts:118-124`) onu `dusuk` risk sayar, triyaj listesinden düşer, CSV
raporuna doğru yazılır, veli görüşmesinde bu sayı konuşulur. Ters yön de mümkün: bir öğrenci başka
bir öğrencinin `student_id`'si için yazamaz (kontrol var) ama kendi kaydını `is_correct: false` ile
şişirip yapay olarak "yüksek risk" görünebilir.

**Not:** Sunucu tarafındaki `POST /answers` zinciri doğruluğu DB'den çözüyor
(`lib/answers.ts` `dogrulukKontrol`) — yani sunucu doğru davranıyor; sorun sunucunun tamamen
atlanabilmesi.

**Öneri:** `logs_insert` politikasını kaldır. `user_logs`'a yazan tek meşru yol `record_answer`
RPC'si ve `/answers` ucudur; ikisi de service-role ile çalışıyor.

---

### K4 — Okulun tamamı çapraz okunabiliyor: altı tabloda `select using (true)`

`supabase/migrations/0002_rls_policies.sql:32, 38, 45, 49, 61, 66, 72` · **KRİTİK**

`profiles` · `questions` · `user_answers` · `user_logs` · `assignments` · `assignment_submissions` ·
`targeted_assignments` — hepsinde okuma `using (true)`. Dosyanın kendi başlığı bunu "öğretmen↔öğrenci
karşılıklı okumalar buna bağlı — mevcut Firestore kuralı da böyleydi" diye gerekçelendiriyor; ama o
karşılıklı okuma 2026'da uca taşındı ve **kapsam kapısı** (`requireOgretmenKapsami` +
`assertTeacherOwnsStudent`) tam bunun için yazıldı.

**Senaryo:** Bir öğrenci `supabase.from('profiles').select('id,name,email,role,teacher_id,class_code')`
çağırır → tüm okulun kimlik listesi + **her öğretmenin sınıf kodu**. Ardından
`supabase.from('user_logs').select('*')` → tüm okulun cevap akışı;
`supabase.from('assignment_submissions').select('*')` → herkesin ödev puanları.

**Sonuç:** (a) Öğretmen panelinin "yalnız öğretmen görür" dediği ödev başarı verisi fiilen herkese
açık; (b) sızan `class_code`'larla herhangi bir öğrenci istediği sınıfa `POST /sinif/katil` edebilir
(kod 6 hane hex, `sinif.routes.ts:17` brute-force yüzeyini daraltmayı hedefliyor — sızıntı o hedefi
tümden yok ediyor); (c) `assertTeacherOwnsStudent`'ın 404 ile gizlemeye çalıştığı "bu öğrenci kimin"
bilgisi `profiles.teacher_id`'den serbestçe okunuyor.

**Öneri:** `profiles_read`'i en azından `auth.uid() = id or role = 'teacher'` gibi bir daraltmaya
al ve `class_code`'u kolon yetkisiyle kapat; log/ödev tablolarının okuma politikalarını kaldır
(panel zaten `/teacher/*` üzerinden okuyor).

---

## 2. YÜKSEK

### Y1 — Hedefli set derlemesi SİSTEMDEKİ TÜM ödevleri filtresiz tarıyor; havuz her öğrenci için gereksiz yere daralıyor

`learnup-brain/src/lib/odev-derle.ts:100-125` (özellikle `:104`, `:119-124`) · **YÜKSEK**

```ts
const setler = await Promise.all([
  supabase.from('assignments').select('question_ids, teacher_id'),          // ← filtre YOK
  supabase.from('targeted_assignments').select('question_ids').eq('student_id', studentId),
])
…
const { data } = await supabase.from('questions').select('kaynak_soru_id').in('id', [...qIds])
```

Dört ayrı kusur tek satırda:

1. **Kapsam yok.** `teacher_id` kolonu seçiliyor ama **hiç kullanılmıyor**; hiçbir `.eq()` yok. Yani
   sistemdeki HERHANGİ bir öğretmenin HERHANGİ bir sınıfa verdiği sorular, bu öğrenciye "daha önce
   gitmiş" sayılıp eleniyor. Yorum (`:112-113`) "öğrencinin öğretmeninden gelenler" diyor — kod
   öyle yapmıyor.
2. **`fetchAll` yok.** `lib/pg.ts`'in başlığı "PostgREST 1000 satırda SESSİZCE keser" diyor. 1000.
   ödevden sonra eleme rastgele bir alt kümeye dayanıyor.
3. **`.in()` sınırsız.** `qIds` tüm ödevlerin tüm soru id'lerinin birleşimi; 12.000 uuid ≈ 450 KB
   sorgu dizesi → PostgREST/nginx `414`.
4. **Sonuç geri döndürülemez şekilde daralıyor:** havuza yazılmış bir AI sorusu bir kez herhangi bir
   ödeve girdiyse, artık HİÇBİR öğrenciye hedefli set olarak gitmiyor.

**Senaryo:** Okulda 40 öğretmen var, her biri dönem içinde 15 ödev yayınlamış (600 ödev × 10 soru =
6.000 soru kopyası). Öğretmen A, hiç ödev almamış X öğrencisine "Türev" kazanımından 10 soruluk
hedefli set gönderir. Havuzda o kazanımda 12 doğrulanmış AI sorusu var ama 11'i başka sınıflarda
kullanılmış.

**Sonuç:** `havuzdanSec` 1 soru döndürür → `uyariMetni(10, 1, 0)` → "Havuzda bu kriterlere uyan 1
soru bulundu (10 istenmişti)". Öğretmen "havuz boş" sanır; havuzda 12 soru vardır ve X onların
hiçbirini görmemiştir. Havuz doldukça sorun küçülmez, BÜYÜR.

**Öneri:** `assignments` sorgusunu öğrencinin öğretmen(ler)ine (`sinifOgrencileri`'nin tersi ya da
`profiles.teacher_id`) kapsa, `fetchAll` ile çek, `kaynak_soru_id` çözümünü 500'lük parçalara böl —
ya da `questions.kaynak_soru_id` üzerinden tek bir RPC ile çöz.

---

### Y2 — "Hedefli ödev gönder" derin bağlantısı, mevcut yüklenmeden yayınlanırsa TÜM SINIFA ödev basıyor

`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:199, 210, 265-268, 275-306` ·
`frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx:230, 255, 297` · **YÜKSEK**

```ts
const { roster } = useSinif()                       // ← loading BEKLENMİYOR
const [hedef, setHedef] = useState(onDolguOgrenci ?? 'sinif')
const hedefOgrenci = useMemo(
  () => (hedef === 'sinif' ? null : roster.find((o) => o.studentId === hedef) ?? null), [hedef, roster])
…
if (hedefOgrenci) { /* POST /teacher/hedefli-odev */ } else { /* POST /teacher/odev — SINIFA */ }
```

`OdevAtolyesi` — panelin diğer ekranlarının aksine — `useSinif().loading`'i hiç kontrol etmiyor
(`SinifPanosu.tsx:332` ve `OgrenciRontgeni.tsx:264` kontrol ediyor). `roster` boşken `find` `null`
döner ve akış **sessizce sınıf dalına düşer**.

**Senaryo:** Öğretmen Öğrenci Röntgeni'nde "Hedefli ödev gönder"e basar (`OgrenciRontgeni.tsx:255`),
`/sinif/odev?ogrenci=<uuid>` açılır. Atölye anında çizilir; `/teacher/sinif` isteği hâlâ uçuşta ya
da hata almış (`SinifSaglayici` `error`'ı yalnız context'e koyuyor, bu ekran okumuyor). Öğretmen
sağdaki sepette hazır duran "Yayınla" düğmesine basar.

**Sonuç:** İstek `POST /teacher/odev` olarak gider ve **sınıfın tamamına** ödev düşer. Düğme metni
o an "Sınıfa yayınla" der ama öğretmen az önce tek öğrenci için buraya geldiği için okumaz; başarı
toast'ı da "Ödev yayınlandı — 10 soru sınıfa gitti" der ve ekran `/sinif`'e döner. **Geri alınamaz:**
ödevi silen ya da kapatan hiçbir uç yok (T2). Aynı kapı `Öncelik Radarı` ve `Ustalık Matrisi`'ndeki
"Set gönder" bağlantıları için de açık.

**Öneri:** `roster` yüklenene kadar birincil eylemi kilitle; `onDolguOgrenci` var ama roster'da
bulunamıyorsa sınıf dalına DÜŞME — açık hata ver ("Öğrenci listesi yüklenemedi").

---

### Y3 — Yayınlanmış ödev kapatılamıyor, düzeltilemiyor, silinemiyor; son tarih ayarlanamıyor

`learnup-brain/src/routes/teacher.routes.ts:838-851` (tek yazma yolu) ·
`learnup-brain/src/routes/assignments.routes.ts:208-215` ·
`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:288-296` ·
`frontend-v2/src/screens/sinif/SinifPanosu.tsx:783-825` · **YÜKSEK**

`assignments` tablosuna yazan tek uç `POST /teacher/odev`. `PATCH`/`PUT`/`DELETE` karşılığı yok
(tüm `routes/*` tarandı). `status` kolonu `'active'` sabitiyle yazılıyor ve bir daha değişmiyor.
`due_date` gövdede kabul ediliyor ama hiçbir ekran göndermiyor; Atölye'de son tarih alanı yok.

**Senaryo:** Öğretmen "Fizik" çipi seçiliyken sepette duran Matematik seçimiyle ödevi yayınlar
(bilinen bulgu #16 bunu tetikliyor). Hatayı fark eder.

**Sonuç:** Ödevi kaldıramaz. Öğrenciler yanlış ödevi görmeye devam eder, gönderirler,
`assignment_submissions`'a puan yazılır ve o puanlar sınıf ortalamasına girer. "Aktif Ödev Takibi"
paneli (`SinifPanosu.tsx:328` — `od.status === 'active'` filtresi) ödevi sonsuza dek "açık" gösterir
ve "Henüz yapmayan N öğrenci" der. Tek çare aynı konuda ikinci bir ödev yayınlamaktır.

**İkincil:** `due_date` doğrulanmıyor — `String(b.dueDate)` doğrudan `timestamptz` kolonuna gidiyor;
geçersiz bir metin Postgres `22007` üretir ve `teacher.routes.ts:852` bunu `500
odev_olusturulamadi`'ya çevirir (400 olmalıydı).

**Öneri:** `PATCH /teacher/odev/:id` (yalnız `status` ve `due_date`) + `DELETE /teacher/odev/:id`
(gönderim yoksa sil, varsa arşivle) ekle; Atölye'ye son tarih alanı koy ve `dueDate`'i zod ile
doğrula.

---

### Y4 — `POST /teacher/ogrenci` e-posta joker karakterlerini kaçışsız `ilike`'a veriyor: numaralandırma karşıtı değişmez fiilen yok

`learnup-brain/src/routes/teacher.routes.ts:1009-1024` · **YÜKSEK**

```ts
const email = String(req.body?.email ?? '').trim().toLowerCase()
if (!email || !email.includes('@')) throw gecersizIstek(…)
const { data: aday } = await supabase.from('profiles')
  .select('id, name, email, role, teacher_id').ilike('email', email).maybeSingle()
```

Tek doğrulama `includes('@')`. `%` ve `_` LIKE joker karakterleridir ve hiçbir yerde kaçışlanmıyor.
Aynı fonksiyonun 1021-1022. satırlarındaki yorum amacı açıkça yazıyor: *"öğretmen, hangi
e-postaların sistemde kayıtlı olduğunu yoklayamasın"*.

**Senaryo:** Öğretmen ekleme kutusuna `ahmet%@%` yazar. Okulda `ahmetyilmaz@lise.k12.tr` adresli,
henüz sınıfa katılmamış bir öğrenci vardır ve desene uyan tek satır odur.

**Sonuç:** Uç `{ eklendi: true, student: { id, name, email } }` döner — öğretmen adını bilmediği,
adresini bilmediği bir öğrenciyi sınıfına almış olur ve **tam e-posta adresi yanıtta geri gelir**.
O andan itibaren o öğrencinin röntgeni, cevap logları, yanılgı teşhisi ve ustalık haritası
`assertTeacherOwnsStudent`'tan meşru olarak geçer. `_` ile tek karakter yoklaması da mümkün
(`ali_@gmail.com`). Birden çok eşleşmede `maybeSingle` çoklu-satır hatası verir ve uç `500
ogrenci_aranamadi` döner — yani yoklamanın "çok geniş" olduğu bile geri bildirilir.

**Öneri:** `.eq('email', email)` kullan (kolon zaten lowercase yazılıyor, `handle_new_user`
`new.email`'i alıyor) ya da `email` içindeki `%`, `_`, `\` karakterlerini reddet; ayrıca yanıttan
`email` alanını çıkar (öğretmen zaten yazdığı adresi biliyor).

---

### Y5 — Sınıf mevcudu 200'de sessizce kesiliyor; aynı ekran iki farklı öğrenci sayısı gösteriyor

`learnup-brain/src/routes/teacher.routes.ts:262, 288-292` ·
`frontend-v2/src/lib/sinif.tsx:37` · `frontend-v2/src/screens/sinif/SinifPanosu.tsx:348, 506, 676` · **YÜKSEK**

```ts
// backend
const limit = sayiParam(req.query.limit, 200, 500)   // varsayılan 200
students: sirali.slice(offset, offset + limit)
// frontend — parametresiz çağrı → limit 200
const roster = useAsync<SinifRosterYaniti>(() => tGet('/teacher/sinif'), [kapsam])
```

`SinifSaglayici`'nin `roster`'ı **tüm sınıf yüzeyinin tek öğrenci kaynağıdır**: tablo, triyaj
listesi, Karşılaştır seçicisi, Ödev Atölyesi "Kime" açılır listesi, Röntgen'deki ← / → gezinmesi
(`sinif.tsx:46-56`). Hiçbir ekranda sayfalama arayüzü yok; `offset` hiç gönderilmiyor.

**Senaryo:** Kalabalık bir okulda bir öğretmenin sınıf kodunu 240 öğrenci kullanmış.

**Sonuç:** Üst şeritte "**240 öğrenci kayıtlı**" (`:506`, `/teacher/ozet`'ten gerçek sayı) yazarken
hemen altındaki filtre çipi "**Tümü (200)**" (`:676`, `roster.length`) der. 40 öğrenci tabloda,
triyajda, karşılaştırmada, "Kime" listesinde ve ok tuşu gezinmesinde HİÇ görünmez; öğretmenin onların
röntgenine ulaşabileceği tek yol URL'i elle yazmaktır. Aynı sınıra `sinif_ozeti` RPC'si takılmaz
(sunucu tümünü çekip bellekte dilimliyor) — yani KPI'lar 240 üzerinden, liste 200 üzerinden konuşur.
(Karşılaştırma: `01-frontend.md` #25 aynı sınıfta bir hatayı `Siniflar.tsx` için raporlamıştı; orada
etki yalnız yönetici ekranıyla sınırlıydı, burada paylaşılan bağlam bozuluyor.)

**Öneri:** `SinifSaglayici`'de sayfalamayı gerçekten uygula (`Kullanicilar.tsx` deseni) ya da
`roster.length < ozet.sinif.ogrenciSayisi` iken ekranda açıkça söyle.

---

## 3. ORTA

### O1 — Sınıf Panosu ödev derleme kapısını ÖSYM stoğuyla açıyor; Isı Haritası aynı kapıyı doğru kuruyor

`frontend-v2/src/screens/sinif/SinifPanosu.tsx:354-355, 637-649` ·
`frontend-v2/src/screens/sinif/SinifIsi.tsx:536, 541-545` ·
`learnup-brain/src/lib/odev-derle.ts:186-192` · **ORTA**

```ts
// SinifPanosu — ÖSYM stoğunu SAYIYOR
const havuzBos = seciliKazanim != null
  && seciliKazanim.havuzdaSoru.osym + seciliKazanim.havuzdaSoru.ai === 0
// SinifIsi — doğru
disabled={seciliKazanim.havuzdaSoru.ai === 0}
```

Telif kararı (2026-07-22) gereği çıkmış ÖSYM sorusu ödeve **derlenemez**: `havuzdanSec` açık `osym`
isteğini 400 ile reddediyor, `tablodanOrnekle` tablo adını `yks_ai_questions` olarak sabitlemiş,
`secilenleriGetir` çıkmış id'leri açık hatayla eliyor. `osym` sayacı yalnızca bilgi amaçlı kalmış.

**Senaryo:** "Sınıfın Zayıf Kazanımları" listesinde ilk sırada olan bir kazanımda çıkmış havuzda 14,
AI havuzunda 0 soru var (etiketleme kaydına göre 1695 çıkmış soru kazanıma bağlı — bu durum yaygın).

**Sonuç:** `havuzBos` `false` olur → uyarı satırı ("Seçili kazanım için havuzda soru yok") çizilmez,
sayfanın TEK birincil eylemi olan "Seçili kazanımdan ödev derle" **etkin** görünür. Öğretmen basar,
Ödev Atölyesi `?kazanim=…&ders=…` ile açılır, havuz şeridi "0 doğrulanmış soru" der, sepet "0 soru
gidecek" gösterir ve "Sınıfa yayınla" düğmesi kapalıdır. Öğretmen boş bir gezintiye çıkarılmıştır.
Aynı kazanıma Isı Haritası'ndan bakıldığında düğme doğru şekilde kapalıdır ve gerekçesi yazılıdır —
iki ekran aynı soruya iki farklı cevap verir.

**Öneri:** `havuzBos`'u `havuzdaSoru.ai === 0` yap; `havuzdaSoru.osym`'i uçtan tümüyle kaldırmayı
değerlendir (bkz. D2).

---

### O2 — Elle soru seçilen ödevde sunucu YANLIŞ bir eksiklik uyarısı üretiyor

`learnup-brain/src/routes/teacher.routes.ts:793, 818, 869` ·
`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:288-298` · **ORTA**

```ts
const istenen = Number(b.soruSayisi)                                   // :793
adet: secilenIds?.length ? secilenIds.length : istenen,                // :818  ← taban değişti
uyari: uyariMetni(istenen, derleme.questionIds.length, derleme.atlanan) // :869  ← taban DEĞİŞMEDİ
```

Elle seçim varken `adet` doğru şekilde `secilenIds.length`'e çekiliyor, ama uyarı metni hâlâ
`soruSayisi` gövde alanını "istenen" sayıyor. Arayüz elle seçim yaparken de `soruSayisi: adet`
göndermeye devam ediyor (`OdevAtolyesi.tsx:291`) — yani iki sayı neredeyse her zaman farklı.

**Senaryo:** Öğretmen havuzdan 5 soruyu tek tek işaretler; "Soru sayısı" kutusu varsayılan 10'da
durur (sepet zaten "5 soru gidecek — elle seçildi" yazıyor). "Sınıfa yayınla"ya basar.

**Sonuç:** İki toast üst üste çıkar: yeşil "Ödev yayınlandı — 5 soru sınıfa gitti" ve sarı
**"Havuzda bu kriterlere uyan 5 soru bulundu (10 istenmişti)."** İkincisi yalandır — havuzda eksik
yoktu, öğretmenin kendisi 5 soru seçmişti. `uyariMetni`'nin tüm amacı (`odev-derle.ts:352`) dürüst
eksiklik bildirimi; burada tam tersini yapıyor ve öğretmeni ödevi silmeye/yeniden derlemeye iter
(ki Y3 gereği silemez).

**Öneri:** `:869`'da `secilenIds?.length ?? istenen` kullan; `yanit.istenen`'i de aynı tabana çek.

---

### O3 — `/teacher/ozet` her panel açılışında sınıfın 84 GÜNLÜK tüm cevap logunu belleğe çekiyor

`learnup-brain/src/routes/teacher.routes.ts:178-217` · `frontend-v2/src/lib/sinif.tsx:36` · **ORTA**

```ts
const ids = satirlar.map((s) => s.student_id)                 // tüm mevcut
const loglar = await fetchAll<…>(() => supabase.from('user_logs')
  .select('created_at, is_correct, is_skipped, xp')
  .in('student_id', ids)
  .gte('created_at', new Date(simdi - 84 * 86_400_000).toISOString()))
```

Dosyanın kendi başlığı (`:45-47`) "YANIT ÖNBELLEĞİ YOK" diyor ve gerekçesi doğru (öğretmenler arası
sızıntı). Ama o karar, gövdenin ucuz olmasını gerektiriyor; burada gövde sınıfın tüm geçmişi.

**Senaryo:** 40 kişilik aktif bir sınıf, kişi başı günde ~18 cevap → 84 günde ~60.000 `user_logs`
satırı. Öğretmen Sınıf Panosu'nu açar; sonra bir öğrencinin röntgenine girip geri döner.

**Sonuç:** Her `/sinif` alt-ağaç girişinde `SinifSaglayici` `/teacher/ozet`'i yeniden çağırır
(`kapsam` deps'i sabit ama bileşen kapı route'unda mount ediliyor) ve uç 60 ardışık PostgREST
sayfalama isteği yapar; toplanan tek çıktı 42 kovalık bir sparkline + üç KPI'dır. 200 öğrencide
`.in()` sorgu dizesi ~7,5 KB'a çıkar ve `admin-havuz`/`aiquestions`'ta bilinen 414 sınıfına yaklaşır.
Panel yavaşlar; öğretmen "sistem takılıyor" der.

**Öneri:** Haftalık toplam + günlük trendi bir RPC'ye taşı (`sinif_ozeti` deseni: tek sorgu,
`group by` gün anahtarı). Bugün sınıf verisi için üç ayrı RPC zaten var; bu dördüncüsü.

---

### O4 — Isı haritası dipnotundaki "N öğrenci" sınıf mevcudu değil, EN KALABALIK hücrenin sayısı

`learnup-brain/src/routes/teacher.routes.ts:351` · `frontend-v2/src/screens/sinif/SinifIsi.tsx:391` · **ORTA**

```ts
ogrenciSayisi: satirlar.length ? Math.max(...satirlar.map((s) => s.student_count)) : 0
```

`sinif_isi_haritasi` (0016:191-196) her hücre için `count(*)` — yani O ÜNİTEDE ölçümü olan öğrenci
sayısı — döndürüyor. Bunların maksimumu sınıf mevcudu DEĞİL.

**Senaryo:** 30 kişilik sınıfta 11 öğrenci Matematik'ten soru çözmüş, 6'sı Fizik'ten, geri kalanı
hiçbir şey. En kalabalık hücre 9 öğrenci içeriyor.

**Sonuç:** Matris altında "çürüme uygulanmış · **9 öğrenci** · zayıf eşiği %40" yazar. Öğretmen bunu
"haritada sınıfımın 9 kişisi var" ya da daha kötüsü "sınıfım 9 kişi" diye okur; hücre üstündeki
"%62 · 7 öğr." rakamlarıyla birlikte haritanın kapsamını sistematik olarak yanlış tahmin eder.
Ekranın kendi dürüstlük kuralı ("sahte hücre çizilmez", "sayı uydurulmaz") tam da bu satırda
çiğneniyor: sayı uydurma değil ama ADI yanlış.

**Öneri:** Uca `sinif_mevcudu` sayımından gelen gerçek `ogrenciSayisi` koy ve hücre kapsamını ayrı
bir alanla (`olculenOgrenci`) ver; ekranda "30 öğrencinin 9'u ölçüldü" de.

---

### O5 — Hedefli setlerin öğretmen tarafında hiçbir takip yüzeyi yok (uç veriyor, ekran okumuyor)

`learnup-brain/src/routes/teacher.routes.ts:702-707, 762-771` ·
`frontend-v2/src/screens/sinif/SinifPanosu.tsx:60-72` ·
`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:48-57` · **ORTA**

`GET /teacher/odevler` yanıtında `hedefli[]` alanı var (öğrenci adı, durum, puan, tarih) ve
`OdevListesiYaniti` tipinde tanımlı. **Hiçbir ekran bu alanı okumuyor**: `SinifPanosu`'nun
`OdevTakipYaniti` arayüzü de, `OdevAtolyesi`'nin `GecmisYaniti` arayüzü de yalnız `assignments`,
`ogrenciSayisi`, `total` alanlarını içeriyor. Uç ayrıca `hedefli`'yi `.limit(30)` ile kesiyor ve
onun için `count` döndürmüyor.

**Senaryo:** Öğretmen Öğrenci Röntgeni'nden üç öğrenciye hedefli set gönderir (panelin en çok
öne çıkarılan eylemi — "Ekranın TEK birincil eylemi"). Ertesi hafta "kim yaptı?" diye bakar.

**Sonuç:** Sınıf Panosu'nun "Aktif Ödev Takibi" paneli yalnız sınıf ödevlerini çizer; Ödev
Atölyesi'nin "Geçmiş Ödevler" listesi de öyle. Hedefli setin durumunu görmenin tek yolu, öğrenci
öğrenci Röntgen açıp sağ alttaki "Ödev Geçmişi" paneline bakmaktır — üç öğrenci için üç ayrı
sayfa. Ödev atama → gönderim → puanlama zincirinin geri bildirim ucu, en çok kullanılan yolda kopuk.

**Öneri:** `SinifPanosu`'nun ödev paneline `hedefli` şeridini ekle (öğrenci adı + durum + puan);
uçta `hedefli` için de `count`/sayfalama ver.

---

### O6 — Öğrenci Röntgeni'ndeki "Ödev Geçmişi", öğretmen kapsamıyla süzülmüyor

`learnup-brain/src/routes/teacher.routes.ts:547-563` (özellikle `:551-555` ↔ `:556-562`) · **ORTA**

```ts
supabase.from('assignment_submissions')
  .select('… assignments(subject, topic)')
  .eq('student_id', studentId)                     // ← teacher süzgeci YOK
  .order('created_at', …).limit(5),
supabase.from('targeted_assignments')
  .select(…)
  .eq('student_id', studentId)
  .eq('teacher_id', teacherId)                     // ← burada VAR
  .order('created_at', …).limit(5),
```

Asimetri aynı `Promise.all` bloğunun içinde, iki satır arayla duruyor.

**Senaryo:** Öğrenci dönem ortasında okul/şube değiştirir: B öğretmeninin sınıfından ayrılıp A'nın
sınıf koduyla katılır (`POST /sinif/katil` bunu destekliyor ve eski `assignment_submissions`
satırları silinmiyor — kasıtlı). A, öğrencinin röntgenini açar.

**Sonuç:** Sağ alttaki "Ödev Geçmişi" panelinde B öğretmeninin ödev başlıkları ("Kimya · Asit-Baz"),
puanları ve tarihleri görünür — üstelik `tur: 'sinif'` rozetiyle, kendi ödevinden ayırt edilemeyecek
şekilde. Öğretmen A bu satırları kendi verdiği ödevler sanır ve öğrencinin "benim ödevlerimdeki
başarısı" hakkında yanlış sonuç çıkarır. Ayrıca B'nin ödev yapısı A'ya sızmış olur.

**Öneri:** `assignment_submissions` sorgusuna `.eq('teacher_id', teacherId)` ekle (kolon zaten
`assignments.routes.ts:249`'da dolduruluyor); eski satırlarda `teacher_id` boşsa `assignments`
gömmesi üzerinden süz.

---

### O7 — Öğrenci ekleme/çıkarma sonrası ödev ve zayıf-kazanım panelleri tazelenmiyor

`frontend-v2/src/screens/sinif/SinifPanosu.tsx:206-209, 378, 395` · **ORTA**

```ts
const { ozet, roster, loading, error, reload } = useSinif()
const zayif   = useAsync<SinifZayifYaniti>(…, [])      // ayrı yaşam döngüsü
const odevler = useAsync<OdevTakipYaniti>(…, [])       // ayrı yaşam döngüsü
…
reload()   // ogrenciEkle (:378) ve ogrenciCikar (:395) YALNIZ context'i tazeliyor
```

`reload` `SinifSaglayici`'nin `ozet` + `roster`'ını yeniliyor; `zayif` ve `odevler` `useAsync`
örnekleri hiç haber almıyor.

**Senaryo:** 12 kişilik sınıftan iki öğrenci "Çıkar" diyaloğuyla çıkarılır (backend `sinifiUnut` ile
önbelleği doğru düşürüyor).

**Sonuç:** Aynı ekranda tablo 10 satıra iner ve üst şerit "10 öğrenci kayıtlı" der, ama "Aktif Ödev
Takibi" paneli hâlâ **"5/12 tamamladı"** ve "Henüz yapmayan 7 öğrenci" yazar (`odevler.data
.ogrenciSayisi` bayat). "Sınıfın Zayıf Kazanımları" listesi de çıkarılan öğrencilerin katkısını
saymaya devam eder ("3/12 öğrenci"). Öğretmen hangi sayının doğru olduğunu bilemez; ekranın kendi
yorumu (`:395`) "iyimser güncelleme YOK — sunucu hakikati tek gerçek" diyor ama hakikatin yalnız
üçte biri yeniden okunuyor.

**Öneri:** `ogrenciEkle`/`ogrenciCikar` başarı yolunda `zayif.reload()` ve `odevler.reload()`'u da
çağır (ya da sağlayıcıya bir "sınıf sürümü" sayacı koyup üç `useAsync`'i ona bağla).

---

## 4. DÜŞÜK

### D1 — Isı haritası kırılımındaki öğrenci satırı, tek öğrenciyle Karşılaştırma'ya götürüyor (çıkmaz sokak)

`frontend-v2/src/screens/sinif/SinifIsi.tsx:464-488` (özellikle `:472-474`) ·
`frontend-v2/src/screens/sinif/Karsilastir.tsx:27-30, 90-103` · **DÜŞÜK**

Satırın etiketi "Karşılaştır", `aria-label`'ı "Karşılaştırmada aç". Hedef
`/sinif/karsilastir?ogrenci=<tek uuid>`; `Karsilastir` ise `secilenler.length < 2` olduğunda
ızgarayı hiç çizmez.

**Senaryo:** Öğretmen "Türev" ünitesindeki eşik altı listesinde en zayıf öğrenciye tıklar.

**Sonuç:** "En az iki öğrenci seç — Karşılaştırma, iki öğrencinin aynı ölçütteki farkını yan yana
gösterir" boş durumuna düşer; aradığı bilgi (o öğrencinin röntgeni) hiç açılmaz ve geri dönüp
haritayı yeniden kurması gerekir. Ayrıca `secili` tekilleştirilmiyor: `?ogrenci=a,a` iki özdeş sütun
ve yinelenen React `key` üretir (`Karsilastir.tsx:40-43`, `sinif.tsx:815`).

**Öneri:** Satırı Röntgen'e bağla (`/sinif/ogrenci/<id>`), karşılaştırmayı ikincil bir eylem yap;
`secili` hesabına `[...new Set(...)]` ekle.

---

### D2 — Zayıf kazanım havuz stoğu, satır satır çekilerek sayılıyor (`sayimAl` varken)

`learnup-brain/src/routes/teacher.routes.ts:492-507` · `learnup-brain/src/lib/pg.ts:49` · **DÜŞÜK**

```ts
fetchAll<{ kazanim_id: number }>(() =>
  supabase.from('yks_questions').select('kazanim_id').in('kazanim_id', ids).eq('verified', true)),
fetchAll<{ kazanim_id: number }>(() =>
  supabase.from('yks_ai_questions').select('kazanim_id').in('kazanim_id', ids)…),
```

Amaç kazanım başına stok SAYISI; kod tüm satırları getirip JS'te `Map`'e sayıyor. `lib/pg.ts` bunun
için `sayimAl`'ı yazmış.

**Senaryo:** `SinifIsi.tsx:199` bu ucu `limit: 100` ile çağırıyor. 100 kazanım × ortalama 200 soru ×
iki tablo = ~40.000 satır, ~40 sayfalama isteği — üstelik dönen `osym` sayacı arayüzde ya yanlış
kullanılıyor (O1) ya hiç kullanılmıyor (`SinifIsi.tsx:522` yalnız `.ai` yazıyor).

**Öneri:** Kazanım başına sayımı tek bir `group by` RPC'sine taşı; telif kararından sonra anlamsız
kalan `havuzdaSoru.osym` alanını kaldır.

---

### D3 — Ödev Atölyesi'ndeki "ön-dolgu koruması" effect'i hiçbir şey yapmıyor

`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:207, 270-273` · **DÜŞÜK**

```ts
const [ders, setDers] = useState<string | null>(onDolguDers)   // :207 — zaten bu değer
…
// Ön-dolgu dersi ısı haritasında yoksa kullanıcıyı yanıltmayalım.
useEffect(() => {
  if (onDolguDers && dersler.length && !dersler.includes(onDolguDers)) setDers(onDolguDers)
}, [onDolguDers, dersler])
```

Koşul sağlandığında yapılan tek şey, state'i ZATEN sahip olduğu değere yeniden atamak. Yorumun
tarif ettiği koruma (temizleme ya da uyarı) hiç yazılmamış.

**Senaryo:** Derin bağlantıdaki ders, ısı haritası `subjects` listesinde yok (sınıf o dersten henüz
ölçüm üretmemiş).

**Sonuç:** Hiçbir ders çipi "aktif" görünmez ama sepet "Ders: Kimya" der ve havuz sorgusu Kimya ile
gider. Öğretmen hangi kapsamın yürürlükte olduğunu ekrandan okuyamaz; çipe basınca kapsam sessizce
değişir.

**Öneri:** Ya çipi listeye ekle (ölçümü olmayan ders de derlenebilir), ya `setDers(null)` yapıp
nedenini yaz — ya da ölü effect'i kaldır.

---

### D4 — `POST /teacher/odev` her çağrıda kullanılmayan bir profil sorgusu yapıyor

`learnup-brain/src/routes/teacher.routes.ts:822, 872` · **DÜŞÜK**

```ts
const kimlik = await kimlikAl(teacherId)   // :822
…
void kimlik                                // :872  ← tek kullanım: atmak
```

`kimlik` hiçbir yerde okunmuyor. `kimlikAl` önbellekli olsa da soğuk yolda bir `profiles` okumasıdır
ve ödev oluşturmanın kritik yolunda duruyor. Ayrıca `void kimlik` satırı, okuyucuya "burada bir şey
kullanılıyor" izlenimi verip lint'i susturuyor.

**Öneri:** İkisini de sil (hemen altındaki `profiles.grade` sorgusu ayrı ve gerçekten kullanılıyor).

---

### D5 — İki küçük görüntüleme/belge hatası

`frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx:165-171` · `frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:424-427` · **DÜŞÜK**

1. `sinifOrt` yorumu "sağlayıcının zaten çektiği `/teacher/ozet` trend'i (**30 günlük** pencere)"
   diyor; uç 84 günlük pencere döndürüyor (`teacher.routes.ts:194`). Sayı doğru hesaplanıyor, ama
   ekrandaki referans çizgisinin ne olduğunu okuyan kişi yanlış öğreniyor.
2. Havuz sayfa aralığı etiketi `${sayfa*20+1}–${sayfa*20+eslesen.length} / ${havuzToplam}` biçiminde
   kuruluyor. Filtre değişip sonuç kümesi küçüldüğünde (bilinen #15) `sayfa` sıfırlanmadığı için
   sunucu boş sayfa döndürür ve şerit **"61–60 / 18 eşleşen"** yazar — hem imkânsız bir aralık hem
   de kullanıcının nerede olduğuna dair yanlış bilgi.

---

## 5. Bilinen bulgular — bu kapsamda HÂLÂ geçerli (tekrar yazılmadı)

| Kaynak | Bulgu | Bu kapsamdaki yeri |
|---|---|---|
| `01-frontend.md` #7 | Hedefli gönderimde elle seçilen sorular yok sayılıyor | `OdevAtolyesi.tsx:278-284` — ayrıca `ders` ve `zorluk` filtreleri de hedefli dalda hiç gönderilmiyor; sepet "Ders: Matematik · Zorluk: Zor" derken istek yalnız `soruSayisi` + `kazanimIds` taşıyor |
| `01-frontend.md` #15 | Filtre değişince sayfa sıfırlanmıyor | `OdevAtolyesi.tsx:365` (`setDers`), `:383` (`setZorluk`) — görünür yüzü D5/2 |
| `01-frontend.md` #16 | Ders değişince elle seçim korunuyor | `OdevAtolyesi.tsx:365` — Y3 (geri alınamazlık) bunu kalıcı hasara çeviriyor |
| `01-frontend.md` #17 | `useAsync` `AbortController`'ı hiçbir fetch'e bağlı değil | `useAsync.ts:18, 30` — sınıf ekranlarının tamamı bu hook'la çalışıyor |
| `01-frontend.md` #26 | CSV'de `revokeObjectURL` senkron | `SinifPanosu.tsx:433-438` |
| `01-frontend.md` #28 | Ders çipi değişince `unite` parametresi bayat kalıyor | `SinifIsi.tsx:323` |
| `00-ozet.md` T2 | "Bugün" üç ayrı zaman diliminde | `OgrenciRontgeni.tsx:50-52, 152` tarayıcı yereli ↔ `lib/rontgen.ts:175` Europe/Istanbul |
| `00-ozet.md` T1 | Puan ekonomisi korunmuyor | Bu raporun K1–K3'ü aynı ekonomiyi **ikinci bir yoldan** (anon istemci) açıyor |

---

## 6. 2026-08-10 raporundan sonra DÜZELTİLMİŞ — artık geçerli değil

Aşağıdakiler kodda okunarak doğrulandı; ilgili yerlerde düzeltmenin gerekçesini anlatan yorumlar da
duruyor.

| Bulgu | Durum | Kanıt |
|---|---|---|
| `02-backend.md` #3 — `/targeted/submit` tek gönderim yok | **düzeltildi** | `assignments.routes.ts:307-310` ön kontrol + `:331` `.neq('status','completed')` UPDATE koşulu |
| `02-backend.md` #4 — `maxScore = answers.length` | **düzeltildi** | `assignments.routes.ts:242, 315` → `questionIds.length \|\| answers.length` |
| `02-backend.md` #5 — `due_date`/`status` kontrol edilmiyor | **düzeltildi** (uçta) | `assignments.routes.ts:208-215` — ama son tarihi AYARLAYAN arayüz hâlâ yok (Y3) |
| `02-backend.md` #6 — `/questions/save` rol kapısı yok, `meta.teacherId` istemciden | **düzeltildi** | `app.ts:131` `requireRole('teacher','admin')` · `questions.routes.ts:254` `teacherId = userId` |
| `02-backend.md` #8 — `/questions/targeted` onay + `teacher_ids` | **düzeltildi** | `questions.routes.ts:194` `assertTeacherOwnsStudent` + mount'ta onay kapısı |
| `02-backend.md` #9 — çıkarma yanlış satırı boşaltıyor | **düzeltildi** | `teacher.routes.ts:1102-1113` yalnız çağıran öğretmenin bağını koparıyor; `admin-yonetim.routes.ts:289-296` aynısını yapıyor |
| `02-backend.md` #10 — gönderim tekilliği TOCTOU | **düzeltildi** | `migrations/0036_gonderim_tekilligi.sql` A bölümü + `assignments.routes.ts:261` `23505 → 409` |
| `02-backend.md` #19 — `class_code` benzersiz değil | **düzeltildi** | `0036` B bölümü (`profiles_class_code_uq` kısmi unique) |
| `01-frontend.md` #2 — `ErrorBoundary` rota değişiminde sıfırlanmıyor | **düzeltildi** | `App.tsx:253` `sifirlaAnahtari={loc.pathname}` |
| `01-frontend.md` #3 — Röntgen loglarında çift `?` | **düzeltildi** | `OgrenciRontgeni.tsx:98` parametreler ikinci argümanda |
| `01-frontend.md` #12 — öğlen çıpası bugünü düşürüyor | **düzeltildi** (röntgen tarafında) | `OgrenciRontgeni.tsx:42-43` `Math.max(0, …)` |
| `01-frontend.md` #20 — onboarding `profilYukleniyor`'u beklemiyor | **düzeltildi** | `App.tsx:278` `!profilYukleniyor && rol === 'student' && tur` |

---

## 7. ŞÜPHELİ (doğrulanmışlarla karıştırılmamalı)

**Ş1 — `teacher_ids` çoklu üyeliğinin üç ayrı yerde ayrışması.**
`sinif_mevcudu` (0016:90) ve `assertTeacherOwnsStudent` (`yetki.ts:192`) sahipliği `teacher_id`
**veya** `teacher_ids` olarak tanımlıyor. Buna karşılık (a) `POST /sinif/ayril` ve `/sinif/katil`
(`sinif.routes.ts:84-89, 117-122`) yalnız `teacher_id`'ye dokunuyor — öğrencinin kendi ayrılma yolu
çoklu üyeliği düşürmüyor; (b) ödev teslimatının tamamı (`assignments.routes.ts:74, 78, 131, 200`)
yalnız `profiles.teacher_id`'ye bakıyor — `teacher_ids` ile bağlı bir öğrenci öğretmenin mevcudunda,
ısı haritasında ve "bekleyen" sayımında görünürken sınıf ödevini HİÇ göremez ve gönderemez (403).
**Neden şüpheli:** repoda `teacher_ids`'i YAZAN hiçbir kod yolu yok (kolonun kaynağı
`supabase/migrations/0003:11` "mobil parity"; `YKS-BEYIN-SISTEM-MIMARISI.md:1009` da "okunuyor ama
hiçbir yerde yazılmıyor" diyor). Bugünkü kodla tetiklenemez; devralınan/mobil veri varsa tetiklenir.

**Ş2 — `due_date` gün sınırı.**
`assignments.due_date` `timestamptz` (`0001:191`) ve gönderim kontrolü `new
Date(due_date).getTime() < Date.now()` (`assignments.routes.ts:212`). Arayüz tarih-YALNIZ bir değer
gönderirse (`2026-08-20`) bu UTC gece yarısı = TSİ 03:00 olarak yorumlanır ve son tarih gününün
tamamı kapalı olur. **Neden şüpheli:** bugün hiçbir ekran `dueDate` göndermiyor (Y3), yani
ölçülebilir bir davranış yok — ama Y3 düzeltilirken bu tuzağa düşülmemeli.

**Ş3 — Hedefli set başlangıç durumunun iki farklı değeri.**
`POST /teacher/hedefli-odev` `status: 'pending'` yazıyor (`teacher.routes.ts:966`),
`POST /questions/targeted` ise `status: 'draft'` (`questions.routes.ts:231`). Öğrencinin ödev
listesi (`assignments.routes.ts:81`) durumu süzmüyor, gönderim kontrolü yalnız `'completed'`'a
bakıyor — yani ikisi de çalışıyor. **Neden şüpheli:** `/questions/targeted`'ı çağıran hiçbir ekran
yok (grep ile doğrulandı), yani bugün ölü bir dal; ama `/teacher/odevler` `hedefli[].status` alanını
olduğu gibi dışarı verdiği için ileride bir ekran bu iki değeri karşılaştırırsa sessizce yanlış
gruplama yapar.

---

## 8. Denetim sonucu temiz çıkan alanlar (bilerek raporlanmadı)

- **Kapsam kapısı.** `requireOgretmenKapsami` (`middleware/requireRole.ts:86-145`) üç hâli de doğru
  ayırıyor; UUID biçim kontrolü `kimlikAl`'dan ÖNCE; kapsamsız yönetici 400 alıyor, sessizce boş
  sınıf görmüyor. `teacher.routes.ts` içinde `req.userId` yalnız `vekilIzi`'nde (`:87`) — dosyanın
  kendi grep değişmezi tutuyor.
- **Vekil denetim izi.** `vekilIzi` yalnız yönetici yazdığında defter yazıyor ve sonucu yanıta
  `denetimYazildi` olarak taşıyor; izsiz kalmış bir yetki kullanımı "başarı" olarak dönmüyor.
- **Sahiplik.** Öğrenci parametresi alan **beş uç da** (`/ogrenci/:id`, `/rontgen`, `/loglar`,
  `/hedefli-odev`, `DELETE /ogrenci`) `assertTeacherOwnsStudent`'tan geçiyor; 404 ile "yok" ve
  "senin değil" ayrımı istemciye sızmıyor.
- **Telif kararı.** Çıkmış ÖSYM havuzu üç ayrı katmanda kapatılmış: liste ucu (`teacher.routes.ts:1140`),
  derleyici (`odev-derle.ts:186`), elle seçim (`odev-derle.ts:247-257`) ve istemci savunma süzgeci
  (`OdevAtolyesi.tsx:255`). Tek sızıntı sayaç alanında (O1/D2).
- **Havuz sayfalaması.** Liste ve sayım filtreleri birebir aynı (`karantina` dahil) ve sıralamada
  `id` tie-break'i var — sayfalar kaymıyor.
- **Isı haritası ↔ kırılım tutarlılığı.** İki uç aynı roster (`sinif_mevcudu`), aynı `p_min_attempts`
  varsayılanı ve aynı `ISI_ZAYIF_ESIK` ile çağrılıyor; ekran ayrıca yanıtın `unitPath`'ini seçili
  hücreyle karşılaştırıp bayat kare çizmiyor (`SinifIsi.tsx:254-255`).
- **Yıkıcı eylem.** Öğrenci çıkarma Radix Dialog ile onaylanıyor (`SinifPanosu.tsx:856-892`);
  `window.confirm` panelin hiçbir yerinde yok (grep). İyimser güncelleme yapılmıyor.
- **Sessiz devralma sınırı.** `POST /teacher/ogrenci` başka sınıftaki öğrenciyi devralmıyor, yarış
  koruması `.is('teacher_id', null)` UPDATE koşulunda ve 0 satır "eklendi" diye raporlanmıyor.
- **`null ≠ 0` disiplini.** `basariOrani`, `avgMastery`, `ortalamaYuzde`, `risk: 'veri-yok'` ve
  ekranlardaki "ölçüm yok" karşılıkları uçtan ekrana kadar tutarlı taşınıyor.

---

## 9. DÜZELTME KAYDI (2026-08-12)

Aşağıdakilerin tamamı uygulandı ve derleme/test kapısından geçti. Migration'lar YAZILDI,
uygulanmadı (Studio SQL Editor'e elle basılacak).

### Migration'lar

| Dosya | Kapattığı | Not |
|---|---|---|
| `0037_rls_sertlestirme.sql` | K1 K2 K3 K4 | `profiles`/`questions`/`user_logs`/`user_answers` okuması kendi satırına (ya da sahibi öğretmene) daraltıldı; `logs_insert`, `answers_insert`, `asub_insert/update/read`, `ta_insert/update/read`, `asg_read` DÜŞÜRÜLDÜ. **Uygulanmadan K1–K4 açık.** Uygulanmadan önce doğrulandı: frontend anon istemciyle yalnız KENDİ `profiles` satırını okuyor/yazıyor (`lib/auth.tsx`, `Ben.tsx`, `Konular.tsx`, `kule/Ayarlar.tsx`) — başka tablo yok, eski `frontend/` uygulaması repoda yok. |
| `0038_panel_sayim_rpc.sql` | O3 D2 | `sinif_gunluk_trend(uuid,int)` + `havuz_stok(int[])`; ikisi de `service_role`a kısıtlı. Basılmazsa uçlar eski yola düşer + log uyarısı (panel çalışır). |

### Kod düzeltmeleri

| Bulgu | Ne yapıldı | Dosya |
|---|---|---|
| **Y1** | Tekrar-eleme öğrencinin öğretmen(ler)ine kapsandı (`teacher_id` + `teacher_ids`), `fetchAll` eklendi, `.in()` 500'lük parçalara bölündü, parça hatası elemeyi eksik yapar ama derlemeyi öldürmez | `lib/odev-derle.ts` |
| **Y2** | `roster` yüklenmeden hedefli yayın SESSİZCE sınıfa düşemiyor: `hedefKilitli` ile düğme kilitli, etiket "Öğrenci bekleniyor…", `yayinla` içinde ikinci kontrol, açık hata kutusu | `sinif/OdevAtolyesi.tsx` |
| **Y3** | `PATCH /teacher/odev/:id` (status + dueDate) ve `DELETE /teacher/odev/:id` (gönderim yoksa sil, varsa **arşivle** — cascade öğrenci cevaplarını silmesin) eklendi; Atölye'de son tarih alanı + Geçmiş Ödevler'de "Kapat"/"Sil" (silme Radix Dialog onayıyla) | `teacher.routes.ts`, `sinif/OdevAtolyesi.tsx`, `lib/sinif-kapsam.ts` |
| **Y4** | `.ilike('email', …)` → `.eq('email', …)` (joker yoklaması kapandı); yanıttan `email` alanı çıkarıldı (denetim defterinde kalır) | `teacher.routes.ts` |
| **Y5** | Sağlayıcı roster'ı 500'lük sayfalarla TAMAMINI çekiyor (tavan 5000); "240 kayıtlı / Tümü (200)" çelişkisi bitti | `lib/sinif.tsx` |
| **O1** | `havuzBos` artık yalnız `havuzdaSoru.ai`'ye bakıyor; aynı hata `components/sinif.tsx` triyaj kuyruğunda da vardı, o da düzeltildi | `sinif/SinifPanosu.tsx`, `components/sinif.tsx` |
| **O2** | Uyarı tabanı `hedefAdet` (elle seçimde seçim sayısı); `yanit.istenen` de aynı tabana çekildi | `teacher.routes.ts` |
| **O3** | 84 günlük log çekimi → `sinif_gunluk_trend` RPC; haftalık KPI artık gün kovalarından türetiliyor (kayan 168 saat yerine 7 TAKVİM günü — şeridin başlığıyla uyumlu) | `teacher.routes.ts` |
| **O4** | `ogrenciSayisi` gerçek sınıf mevcudu (`sinif_mevcudu`), ölçülen sayı ayrı alan (`olculenOgrenci`); dipnot "30 öğrencinin 9'u ölçüldü" | `teacher.routes.ts`, `types/panel.ts`, `lib/types.teacher.ts`, `sinif/SinifIsi.tsx` |
| **O5** | Panoda "Hedefli setler" şeridi: öğrenci adı (Röntgen'e bağlı) + durum + puan; sınıf ödevlerinden ayrı ölçü | `sinif/SinifPanosu.tsx` |
| **O6** | Ödev geçmişi `assignments!inner` + `.eq('assignments.teacher_id', …)` ile öğretmen kapsamına alındı | `teacher.routes.ts` |
| **O7** | `sinifTazele()` — ekle/çıkar sonrası `ozet`+`roster` yanında `zayif` ve `odevler` da yenileniyor | `sinif/SinifPanosu.tsx` |
| **D1** | Isı haritası öğrenci satırı artık Röntgen'e gidiyor (tek kişilik karşılaştırma çıkmazı bitti); `Karsilastir` seçimi `Set` ile tekilleştiriliyor | `sinif/SinifIsi.tsx`, `sinif/Karsilastir.tsx` |
| **D2** | Stok sayımı `havuz_stok` RPC'sine taşındı; `havuzdaSoru.osym` alanı uçtan ve tiplerden KALDIRILDI (telif kararından sonra anlamsızdı) | `teacher.routes.ts`, `types/panel.ts`, `lib/types.teacher.ts` |
| **D3** | Ölü effect silindi; yerine `dersListeDisi` ile sepette açık ibare ("sınıfta ölçüm yok") | `sinif/OdevAtolyesi.tsx` |
| **D4** | Kullanılmayan `kimlikAl` çağrısı ve `void kimlik` satırı silindi | `teacher.routes.ts` |
| **D5** | (1) `sinifOrt` yorumu 30 → 84 gün olarak düzeltildi. (2) Havuz sayfa aralığı boş sayfada "61–60" yazmıyor | `sinif/OgrenciRontgeni.tsx`, `sinif/OdevAtolyesi.tsx` |
| **Ş2** | `sonTarihCoz()`: gün-yalnız değer TSİ gün SONUNA çekilir (`23:59:59.999+03:00`), geçersiz değer 500 değil 400 döner | `teacher.routes.ts` |

### §5'teki bilinen bulgular

| Bulgu | Durum |
|---|---|
| #7 hedefli gönderimde elle seçim/filtre | **Düzeltildi (backend tarafı asıl sorundu).** İstemci `questionIds` gönderiyordu ama `POST /teacher/hedefli-odev` bu alanı hiç okumuyordu. Artık `questionIds` + `difficulty` okunuyor; elle seçimde zayıf-kazanım şartı aranmıyor ve `rationale` "öğretmenin elle seçtiği N soru" diyor |
| #15 filtre değişince sayfa sıfırlanmıyor | Zaten düzeltilmişti (`filtreDegisti`) — etiket tarafı D5/2 ile tamamlandı |
| #16 ders değişince elle seçim korunuyor | Zaten düzeltilmişti (`filtreDegisti` seçimi de temizliyor) |
| #17 `useAsync` AbortController hiçbir fetch'e bağlı değil | **Düzeltildi.** `fn(signal)` imzası + sınıf ekranlarının tüm çağrılarında `{ signal }` iletiliyor |
| #26 CSV `revokeObjectURL` senkron | **Düzeltildi** (`setTimeout(…, 0)`) |
| #28 ders çipi değişince `unite` bayat | **Düzeltildi** (`dersSec` ünite + kazanım seçimini de düşürüyor) |
| T2 "Bugün" saat dilimi | **Düzeltildi (bu panelde).** Röntgen gün anahtarları ve saatler Europe/Istanbul; `gunF` çıpası `+03:00`. Projenin tamamındaki `TZ` kararı ayrı iş olarak duruyor |
| T1 puan ekonomisi | 0037 ile bu paneldeki ikinci yol (anon istemci) kapanıyor; `/answers` tarafındaki bilinen bulgular ayrı iş |

### Sonradan yakalanan iki eksik (aynı gün)

1. **Arşivlenen ödev öğrencinin panosunda kalıyordu.** Kapatma yolu açılınca ortaya çıkan
   zincir eksiği: `GET /assignments` durumu hiç süzmüyordu, öğrenci kapatılmış ödevi açıp
   çözüyor ve ancak GÖNDERİRKEN 409 duvarına çarpıyordu. Liste artık `submit` ile aynı
   ölçüyü kullanıyor (`status === 'active'`), fakat **zaten gönderilmiş** arşiv ödevleri
   görünür kalıyor (öğrencinin geçmişi ve puanı orada). Yanıta `status` alanı eklendi.
   — `assignments.routes.ts`
2. **Isı haritası satırının etiketi hedefiyle çelişiyordu.** Satır Röntgen'e bağlandı ama
   üstünde hâlâ "Karşılaştır" yazıyordu; `aria-label` "Röntgeni aç" diyordu — ekran okuyucu
   kullanan ve kullanmayan öğretmen farklı iki şey duyuyordu. Etiket ve ikon düzeltildi,
   dosya başlığındaki eski köprü notu güncellendi. — `sinif/SinifIsi.tsx`

### Kapsam dışı bırakılanlar

- **Ş1** (`teacher_ids` çoklu üyelik ayrışması): bugünkü kodla tetiklenemez (kolonu YAZAN yol yok).
  Y1 düzeltmesi `teacher_ids`'i okuyor, yani ödev derlemesi tarafı hazır.
- **Ş3** (hedefli set `pending` / `draft` ayrışması): `/questions/targeted` çağıran ekran yok, ölü dal.
- Ekranda görünen bozuk emoji (`SinifPanosu` "Herkes tamamladı") yol üstünde düzeltildi.
