# Frontend Mantık Denetimi — `frontend-v2/`

Kapsam: `src/App.tsx`, `src/screens/**` (13 ekran + `kule/` 7 + `sinif/` 5), `src/components/**` (28 dosya), `src/lib/**` (22 dosya). Yanıt şekilleri `learnup-brain/src/routes/*.ts` ve `src/lib/*.ts` ile karşılaştırıldı.

**Toplam 28 bulgu** — 1 KRİTİK · 8 YÜKSEK · 11 ORTA · 8 DÜŞÜK. Yalnız davranışsal hatalar; stil/kozmetik konular dışarıda.

---

## KRİTİK

### 1. Boş soru bırakılan ödev HİÇ gönderilemiyor (sunucu 400 döndürüyor)

`frontend-v2/src/screens/Odevler.tsx:402` · **KRİTİK**

```ts
const answers = qs.map((q) => ({ questionId: q.id, selectedIndex: cevaplar[q.id] ?? -1 }))
```

Backend şeması (`learnup-brain/src/routes/assignments.routes.ts:9-11`):

```ts
answers: z.array(z.object({ questionId: z.string().uuid(), selectedIndex: z.number().int().min(0) }))
```

**Senaryo:** Öğrenci 10 soruluk ödevde 8'ini işaretler, 2'sini boş bırakır. Arayüz bunu açıkça teşvik eder — alt bar `"8/10 cevaplandı — boşlar yanlış sayılır"` (satır 537), onay modalı `"2 soru boş — boşlar yanlış sayılır"` (satır 552). "Evet, gönder"e basar.

**Sonuç:** Boş sorular için `selectedIndex: -1` gider, zod `.min(0)` reddeder, `validateBody` 400 `gecersiz_istek` üretir. `gonder()` catch'e düşer, `toast.error('Gönderilemedi')` görünür ve `sonuc` null kalır. Öğrenci ödevi **hiçbir şekilde** gönderemez; tek çıkış yolu her soruyu işaretlemek. Tam işaretlenmiş ödevlerde sorun görünmediği için hata "bazen çalışmıyor" gibi rapor edilir.

**Öneri:** Boş soruları paketten tamamen çıkar (`qs.filter((q) => cevaplar[q.id] != null).map(...)`) — sunucu `maxScore`'u `answers.length || questionIds.length` ile zaten hesaplıyor, bu yüzden `questionIds.length` tabanına düşer ve boşlar doğal olarak yanlış sayılır.

---

## YÜKSEK

### 2. Bir ekran çökünce TÜM uygulama kilitleniyor (ErrorBoundary rota değişiminde sıfırlanmıyor)

`frontend-v2/src/components/ErrorBoundary.tsx:11` · `frontend-v2/src/App.tsx:249` · **YÜKSEK**

`ErrorBoundary` `state.error`'ı hiçbir zaman temizlemez ve `Shell` içinde `<Outlet/>`'i saran tek örnek olarak kalıcı mount edilir (satır 249-265) — rota değiştiğinde remount olmaz.

**Senaryo:** Öğrenci `/harita`'ya girer, `rontgen` yanıtındaki beklenmedik bir alan bir panelde `undefined` erişimi tetikler, sınır devreye girer. Kullanıcı üstteki nav'dan "Genel Bakış"a tıklar.

**Sonuç:** URL değişir, sayfa başlığı değişir ama ekranda hâlâ "Bir şeyler ters gitti" durur. Nav çalışıyor görünür, hiçbir sayfa açılmaz. Tek kurtuluş tam sayfa yenilemedir. Bir ekranın çökmesinin diğerlerini korumasını amaçlayan yapı, tam tersini yapar.

**Öneri:** `ErrorBoundary`'yi `key={loc.pathname}` ile sar ya da `componentDidUpdate` içinde konum değişiminde `setState({ error: null })` yap.

### 3. Yönetici vekil kapsamı Öğrenci Röntgeni'nde bozuluyor — cevap logları 403 alıyor

`frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx:86` · **YÜKSEK**

```ts
tGet(`/teacher/ogrenci/${ogrenciId}/loglar?limit=${LOG_LIMIT}&offset=${logSayfa * LOG_LIMIT}`)
```

`tGet` (`lib/sinif-kapsam.ts:63-66`) kapsamı **sorgu parametresi olarak** ekler; `apiGet` (`lib/api.js:70-73`) ise `path`'i olduğu gibi alıp sonuna `?${qs}` yapıştırır. Yol zaten `?` içerdiği için üretilen URL:

```
/api/v1/teacher/ogrenci/<id>/loglar?limit=20&offset=0?ogretmenId=<uuid>
```

**Senaryo:** Yönetici Sınıflar → bir öğretmen → tabloda bir öğrenci satırı → Röntgen açar (`/sinif/ogrenci/:id?ogretmenId=…`).

**Sonuç:** `ogretmenId` ayrı bir parametre olarak parse edilmez (`offset` değerinin içine gömülür). `app.ts:146` `requireOgretmenKapsami` yöneticide kapsam bulamaz → 403 `ogretmen_secilmedi`. Ekranın diğer panelleri (rontgen, detay — düz `tGet(yol, {})` kullanıyorlar) çalışırken sadece "Cevap Logları" paneli "Cevap kayıtları yüklenemedi" der. Ayrıca `offset` `NaN` olur. Öğretmende kapsam null olduğu için hata görünmez — bu yüzden yalnız yönetici şikâyet eder.

**Öneri:** Sorgu dizisini yola gömme; `tGet(`/teacher/ogrenci/${ogrenciId}/loglar`, { limit: LOG_LIMIT, offset: logSayfa * LOG_LIMIT })` kullan.

### 4. "Yarım kalan teste devam" tamamen farklı bir soru setinin ortasına atlıyor

`frontend-v2/src/screens/Bugun.tsx:239` · `frontend-v2/src/screens/Coz.tsx:87,183-195` · **YÜKSEK**

Çöz yalnız `{ spec, idx, toplam }` kaydeder (`Coz.tsx:186-192`); **soruların kendisini kaydetmez** (`source: 'ai' | 'konu'` dallarında `spec.questions` yoktur). Devam butonu `state: { ...devam.spec, startIndex: devam.idx }` ile gider ve `SetCozumu` `useState(spec?.startIndex ?? 0)` ile o indekse konumlanır — ama sorular sıfırdan yeniden çekilir.

**Senaryo:** Öğrenci "Soru Çöz" ile Türev setine başlar, 6. soruda çıkar. Bugün ekranında "Yarım kalan teste devam — 5/10" görür ve tıklar. `kaynak === 'ai'` ve `spec.kazanimId` yok (öneriden gelmişti) → `Coz.tsx:163-168` yeniden `/practice/suggest` çağırır, bu kez **Limit** kazanımını önerir ve o kazanımdan 10 yeni soru gelir.

**Sonuç:** Öğrenci 5 soruyu hiç görmeden atlar ve alakasız bir setin 6. sorusuyla karşılaşır; ilerleme çubuğu "6/10" der. Sunucu daha az soru döndürürse (`startIndex >= sorular.length`) ekran anında "Test bitti — 0/0 doğru" özetine düşer.

**Öneri:** Devam kaydına çekilmiş soru listesini de yaz (`questions: sorular`), ya da tekrar çözülebilir bir kaynak değilse devam kartını hiç gösterme.

### 5. Antrenman: havuz tükenince aynı soru sessizce yeniden sorulur, hata mesajı hiç görünmez

`frontend-v2/src/screens/Coz.tsx:545-552, 589-598` · **YÜKSEK**

```ts
} else {
  setHata('Havuzda uygun soru kalmadı — Koç yenilerini hazırlıyor.')
  setAsama('soru')
}
```

Hata ekranı yalnız `if (hata && !aktifSoru)` koşulunda çizilir (satır 589). `getir` bu dala düştüğünde `aktifSoru` doludur, `soru` da değişmemiştir ve `setSecili(null)` çağrılmaz (o yalnız `r.nextQuestion` dalında var).

**Senaryo:** Öğrenci antrenmanda 4. soruyu cevaplar; `/practice/next` `nextQuestion` döndürmez (havuz tükendi ya da kısa bir sunucu arızası).

**Sonuç:** Ekran `'geri'` yerine `'soru'` aşamasına döner, **aynı soruyu** hâlâ eski seçimiyle gösterir, "Kontrol Et" tıklanabilirdir. Öğrenci aynı soruyu tekrar cevaplar: `istatistik.toplam` ikinci kez artar ve `/answers`'a ikinci bir POST gider (aşağıdaki #9 ile birleşince XP çift sayılır). Yazılan hata metni ekranda hiç görünmez. Aynı dal `catch` bloğunda da (satır 549-552) tekrarlanır ve `hata` sonraki başarılı çağrılarda hiç temizlenmez.

**Öneri:** `getir` hata/boş dalında da `setAsama('geri')` (ya da özel bir "bitti" hâli) kur ve `hata`yı gövdede `aktifSoru` varken de bir şerit olarak göster; başarılı yanıtta `setHata('')`.

### 6. Antrenman: `correct_answer` boş gelen soruda "Kontrol Et" hiçbir şey yapmıyor (ekran kilitleniyor)

`frontend-v2/src/screens/Coz.tsx:562` · **YÜKSEK**

```ts
if (secili == null || !aktifSoru?.correct_answer) return
```

Buton `disabled={secili == null || asama === 'yukleniyor'}` (satır 690) — `correct_answer`'ı hiç kontrol etmez.

**Senaryo:** `/practice/next` anlık üretilmiş bir soruyu `correct_answer: null` ile döndürür (uçta bu alan opsiyoneldir; `AntrenmanSoru.correct_answer: string | null`, satır 505). Öğrenci bir şık seçer ve "Kontrol Et"e basar.

**Sonuç:** Fonksiyon sessizce döner. Buton aktif, tıklanıyor, hiçbir şey olmuyor; sonraki soruya geçiş de `kontrol` içinden tetiklendiği için akış tümüyle durur. Tek çıkış, çıkış onayı diyaloğudur.

**Öneri:** Butonu `disabled={... || !aktifSoru?.correct_answer}` yap ve nedeni kelimeyle söyle.

### 7. Ödev Atölyesi: elle seçilen sorular tek öğrenciye gönderimde sessizce yok sayılıyor

`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:278-286` (yayın) vs `546, 563-573` (özet) · **YÜKSEK**

Sınıf dalı `...(secili.length ? { questionIds: secili } : {})` gönderir; **hedefli dal göndermez** — yalnız `soruSayisi: adet` ve `kazanimIds`.

**Senaryo:** Öğretmen havuzdan 5 soruyu tek tek işaretler (sepet "5 soru gidecek — elle seçildi" der), "Kime" seçicisinden bir öğrenci seçer ve "Sete gönder"e basar.

**Sonuç:** Sunucuya `soruSayisi: adet` (varsayılan 10) gider; seçilen 5 soru hiç kullanılmaz, öğrenciye zayıf kazanımlarından derlenmiş **rastgele 10 soru** düşer. Toast `"… ${y.bulunan} soruluk set gönderildi"` der ve sayı 5 değil 10 çıkar — ama öğretmen bunu bir yuvarlama sanır. Arayüzün vaadi ile giden istek ayrışır.

**Öneri:** Hedefli dalda ya `questionIds`'i taşı ya da `hedefOgrenci` seçiliyken elle seçimi devre dışı bırakıp bunu ekranda söyle.

### 8. "Tekrar çöz" aynı soruları yeniden puanlatıyor — XP/lig/coin sınırsız şişiyor

`frontend-v2/src/screens/Coz.tsx:309-315` (`onTekrar`) + `198-213` (`puanla`) · **YÜKSEK**

`onTekrar` yalnız istemci sayaçlarını sıfırlar; `sorular` dizisi aynı kalır. `puanla` her seferinde `attemptNumber: 1` gönderir ve `learnup-brain/src/lib/answers.ts:92-130` aynı `questionId` için tekrar-kontrolü yapmaz — `dogrulandi` true olduğu sürece `xpForAnswer` tam XP + `FIRST_TRY_BONUS` verir, `totalSolved`/`correctAnswers`/haftalık lig XP'si artar.

**Senaryo:** Öğrenci 10 soruluk seti çözer, özet ekranında "Tekrar çöz"e basar, aynı 10 soruyu (cevapları artık ezberdir) tekrar çözer. İstediği kadar tekrarlar.

**Sonuç:** Her tur 10 doğru cevaplık XP + ilk-deneme bonusu basar; lig sıralaması, seviye halkası, rozetler ve bahçe coin ekonomisi tamamen sahte hâle gelir. Ödev akışında (`assignments.routes.ts:205-214`) tek-gönderim kilidi bilinçli olarak konmuş; Çöz akışında karşılığı yok.

**Öneri:** `onTekrar` sonrası çözülen soruları yeniden puanlatma (yerel tekrar modu) ya da `attemptNumber`'ı gerçek deneme sayısıyla gönder.

### 9. Sınıfa katılma/ayrılma sonrası profil tazelenmiyor — "Ödevler" sekmesi belirmiyor

`frontend-v2/src/screens/Ben.tsx:638-652, 654-666` · **YÜKSEK**

`katil`/`ayril` yalnız `durum.reload()` çağırır; `useAuth().refreshProfile()` çağrılmaz.

**Senaryo:** Öğrenci Profil ekranında sınıf kodunu girer, "Katıl"a basar, "…sınıfına katıldın" toast'ını görür.

**Sonuç:** `profile.teacher_id` istemci bellekte hâlâ `null`'dır. `App.tsx:291-293` "Ödevler" sekmesini tam olarak bu alana bakarak ekler → sekme görünmez. Öğrenci öğretmeninin gönderdiği ödevlere hiçbir yerden ulaşamaz; tek çare tam sayfa yenilemedir. Aynı şey ters yönde de olur: ayrıldıktan sonra "Ödevler" sekmesi durmaya devam eder ve tıklanınca boş liste açar. (Karşılaştırma: `OtomatikKatilim.tsx:38` aynı durumda doğru şekilde `refreshProfile()` çağırıyor.)

**Öneri:** `katil`/`ayril` başarı yolunda `await refreshProfile()` ekle.

---

## ORTA

### 10. localStorage anahtarları kullanıcı başına ayrılmamış ve çıkışta temizlenmiyor

`Coz.tsx:186` (`learnup.devam`) · `Ben.tsx:868` / `Bugun.tsx:52` (`learnup.hedef`) · `OdakZamanlayici.tsx:13-30` (`learnup.odak.*`) · `Onboarding.tsx:13` (`learnup.tur`) · `lib/hedefTarih.ts:6` (`learnup.hedefTarih`) · **ORTA**

Hiçbiri `user.id` ile isimlendirilmemiş; `signOut` (`Ben.tsx:755-765`, `App.tsx:455`) hiçbirini silmiyor.

**Senaryo:** Aynı tarayıcıda A öğrencisi çıkar, B öğrencisi girer (ortak bilgisayar / demo cihazı).

**Sonuç:** B, A'nın "Yarım kalan teste devam — 5/10" kartını görür ve tıklayınca A'nın kazanım setine gider; A'nın günlük hedefini (ör. 40) kendi hedefi sanır; A'nın odak dakikaları B'nin "Çalışma Süresi" KPI'sında görünür; ilk giriş turu B'ye hiç açılmaz. Aynı problem yönetici test hesapları arasında geçiş yaparken de çıkar.

**Öneri:** Anahtarlara `user.id` öneki ver ve `signOut` öncesi `learnup.*` anahtarlarını temizle.

### 11. Günlük hedef iki kaynaktan okunuyor — yeni cihazda Bugün ve Profil farklı sayı gösteriyor

`frontend-v2/src/screens/Bugun.tsx:51-56, 80` vs `frontend-v2/src/screens/Ben.tsx:852-860` · **ORTA**

`Bugun.gunlukHedef()` **yalnız** `localStorage`'a bakar (yoksa 10). `Ben.GunlukHedefSatiri` ise önce `profile.daily_goal`'a bakar, yoksa localStorage'a.

**Senaryo:** Öğrenci telefonundan hedefi 30 yapar (`daily_goal=30` DB'ye yazılır), sonra bilgisayarından girer.

**Sonuç:** Bilgisayarda localStorage boş → Bugün ekranı hedefi **10** kabul eder: halka `3/10`, hero metni "Hedefe 7 soru kaldı", Analizler'deki kesikli hedef çizgisi (`Harita.tsx:326 → hedefGunluk={gunlukHedef()}`) 10'da çizilir. Aynı anda Profil ekranı **30** gösterir. İki ekran aynı değer için farklı sayı söyler.

**Öneri:** `gunlukHedef()`'i profil satırından besle (ya da Bugün'de `profile.daily_goal ?? localStorage ?? 10` sırasını uygula).

### 12. "Bu Ay Çözülen" öğleden önce bugünkü çözümleri saymıyor (öğlen çıpası + `f >= 0` çelişkisi)

`frontend-v2/src/screens/Harita.tsx:31-32, 85-93` · aynı hata `frontend-v2/src/screens/sinif/OgrenciRontgeni.tsx:39-40, 145-151` · **ORTA**

```ts
const gunF = (isoGun) => Math.floor((Date.now() - +new Date(isoGun + 'T12:00:00')) / GUN_MS)
...
if (f >= 0 && f < 30) bu += g.solved
```

Öğlen çıpası, gün içinde saat 12:00'den ÖNCE bugünün farkını `-1` yapar (`floor(-0.125) === -1`).

**Senaryo:** Öğrenci sabah 09:00'da 20 soru çözer ve Analizler'i açar.

**Sonuç:** Bugünün satırı için `f = -1` → `f >= 0` koşulunu geçemez, `else if (f >= 30 …)` de tutmaz; satır tamamen düşer. "Bu Ay Çözülen" bugünkü 20 soruyu göstermez, saat 12:00'den sonra aniden belirir. Aynı ifade `dogruluk7` içinde `f < 7` biçiminde yazıldığı için orada bugün SAYILIR — yani aynı ekranda iki stat aynı günü farklı sayar. `OgrenciRontgeni.buHafta` ("bu hafta N soru") da öğleden önce eksik gösterir.

**Öneri:** Pencere kontrollerini `f >= -1` (ya da öğlen çıpasını kaldırıp `f > -1`) yerine tek bir yardımcıya bağla; `dogruluk7` ile aynı sınır kuralını kullan.

### 13. Seri "bugün tamamlandı" rozeti ve dondurma butonu gece yarısı–03:00 arasında yanlış davranıyor

`frontend-v2/src/screens/Ben.tsx:52, 516-518, 555-561` · **ORTA**

İstemci `bugunIso()` = `new Date().toLocaleDateString('en-CA')` (tarayıcı yereli, TR'de UTC+3). Sunucu `todayISO()` (`learnup-brain/src/lib/gamification.ts:83-89`) `getFullYear/Month/Date` ile **sunucu yerelini** kullanır; `docker-compose.yml`'de `TZ` tanımlı olmadığı için kapsayıcı UTC'dir.

**Senaryo:** Öğrenci gece 01:00'de (Istanbul) soru çözer ve Profil'i açar.

**Sonuç:** Sunucu `lastActiveDate = D-1` yazar, istemci `bugunIso() = D` hesaplar → eşitlik tutmaz. "bugün tamamlandı ✓" rozeti çıkmaz; yerine "Bugünü dondur" butonu belirir. Öğrenci basarsa `POST /gamification/streak/freeze` sunucunun `today`'i (`D-1`) için bir dondurma hakkını **boşa harcar** (`gamification.routes.ts:175-179`) — o gün zaten aktifti. `freezeUsedDates.includes(bugun)` kontrolü de aynı sebeple hep false olur.

**Öneri:** İstemcide gün anahtarını `toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' })` ile üret (`SinifPanosu.tsx:316` zaten böyle yapıyor) ya da sunucuda `TZ=Europe/Istanbul` sabitle.

### 14. "N kazanımın tekrar vakti geldi" diyen kart, boş bir tekrar setine götürebiliyor

`frontend-v2/src/screens/Bugun.tsx:298-310` · `frontend-v2/src/screens/Rota.tsx:272-278` vs `learnup-brain/src/routes/practice.routes.ts:90-127` · **ORTA**

Uç `count: kartlar.length` (vadesi gelen SRS kartı, en fazla 30) döndürür ama `questions`'ı yalnız `yks_ai_questions`'ta karşılığı olan, `verified` ve karantinasız satırlarla doldurup 10'a keser.

**Senaryo:** Öğrencinin 6 kartı vadesinde ama hepsi eski `questions`/çıkmış havuzuna işaret ediyor (telif kararı sonrası bu kaynaklar servis edilmiyor).

**Sonuç:** `count = 6 > 0` olduğu için Bugün'de "6 kazanımın tekrar vakti geldi — unutmadan pekiştir" kartı ve "10 soruluk tekrar başlat" butonu çizilir; Rota'da "6 kazanım · Tekrar vadesi" görünür. Tıklayan öğrenci Çöz'de "Vadesi gelen kart yok" boş ekranıyla karşılaşır. Ayrıca `count` KART sayısıdır, arayüz "kazanım" der ve buton her hâlükârda "10 soruluk" iddiasında bulunur.

**Öneri:** Kart/şeridi `count` yerine `questions.length > 0` ile kapıla; adet metnini `questions.length`'ten yaz.

### 15. Ödev Atölyesi ve Soru Havuzu: filtre değişince sayfa numarası sıfırlanmıyor

`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:214, 239-251` · `frontend-v2/src/components/havuz-moderasyon.tsx:124, 141-153` · **ORTA**

Her iki ekranda `sayfa` yalnız arama debounce'unda sıfırlanıyor (`OdevAtolyesi.tsx:222`, `havuz-moderasyon.tsx:131`); ders/zorluk/durum/sıralama değişimleri `sayfa`'ya dokunmuyor ama `useAsync` bağımlılığında.

**Senaryo:** Öğretmen Matematik havuzunda 4. sayfaya (offset 60) geçer, sonra "Kimya" çipine tıklar (Kimya'da 18 soru var).

**Sonuç:** İstek `offset=60&limit=20` ile gider, boş dizi döner. Ekran "Bu kriterlere uyan soru yok — Zorluk filtresini 'Hepsi' yap ya da başka ders dene" der; oysa 18 soru vardır. Sayfalama şeridi `sonSayfa = 0` olduğu için tümüyle gizlenir (`sonSayfa > 0` koşulu) ve kullanıcının 1. sayfaya dönecek bir düğmesi kalmaz — dersi değiştirip geri gelmek zorundadır. Aynı senaryo yönetim Soru Havuzu → Sorular sekmesinde ders/durum değiştirince yaşanır. (Karşılaştırma: `Kullanicilar.tsx:529` ve `Denetim.tsx:212` her filtre değişiminde doğru şekilde `setSayfa(0)` çağırıyor.)

**Öneri:** Filtre setter'larını `setSayfa(0)` ile birlikte çağır.

### 16. Ödev Atölyesi: ders değişince elle soru seçimi korunuyor, başka dersin soruları yayınlanıyor

`frontend-v2/src/screens/sinif/OdevAtolyesi.tsx:216, 365, 288-296` · **ORTA**

`setDers(...)` `secili`'yi temizlemez (`sablonKopyala` temizler, filtre değişimi temizlemez).

**Senaryo:** Öğretmen Matematik havuzundan 6 soru işaretler, sonra fikir değiştirip "Fizik" çipine geçer ve "Sınıfa yayınla"ya basar.

**Sonuç:** İstek `subject: 'Fizik'` + `questionIds: [<6 matematik sorusu>]` ile gider. Sepet "6 soru elle seçildi" der, özet satırı "Ders: Fizik" der; sınıfa Fizik ödevi diye Matematik soruları düşer.

**Öneri:** `setDers`/`setZorluk` içinde `setSecili([])` yap ya da seçim varken filtre değişimini uyarıyla engelle.

### 17. `useAsync` isteği aslında iptal etmiyor — `AbortController` hiçbir yere bağlı değil

`frontend-v2/src/lib/useAsync.ts:18, 21-22, 30` · **ORTA**

```ts
const controller = new AbortController()
...
fnRef.current()          // ← signal fn'e HİÇ geçilmiyor
...
return () => { alive = false; controller.abort() }   // ← kimse dinlemiyor
```

Dosya başlığı "açık istek AbortController ile iptal edilir" diyor; gerçekte `abort()` hiçbir fetch'e bağlı değil.

**Senaryo:** Yönetici Kullanıcılar ekranında arama kutusuna hızlıca yazar (her 300 ms'de bir `sorgu` değişir) ya da öğretmen sayfalar arasında hızla gezinir.

**Sonuç:** Her bağımlılık değişiminde önceki HTTP isteği sonuna kadar koşmaya devam eder. `alive` bayrağı state bozulmasını önler (bu iyi), ama ağ/sunucu yükü boşa gider ve `standardLimiter` (60/dk) hızlı gezinmede beklenenden erken tetiklenir. `tGet`/`apiGet` `opts.signal`'ı zaten destekliyor (`api.js:75`), yalnız bağlanmamış.

**Öneri:** `fn`'i `(signal) => Promise<T>` imzasına çevir ve `fnRef.current(controller.signal)` çağır; ya da yanıltıcı yorumu ve ölü `controller`'ı kaldır.

### 18. Koç: kullanıcı ve asistan balonları aynı `id`'yi alabiliyor — token'lar iki balona birden yazılıyor

`frontend-v2/src/screens/Kaptan.tsx:533-541` · **ORTA**

```ts
const kaptanId = Date.now() + 1
setMsgs((prev) => [
  ...prev,
  { id: Date.now(), role: 'user', ... },      // ← updater çalışırken yeniden okunur
  { id: kaptanId, role: 'kaptan', ... },
])
const guncelle = (fn) => setMsgs((prev) => prev.map((msg) => (msg.id === kaptanId ? fn(msg) : msg)))
```

`kaptanId` hesaplandıktan sonra updater kapanışı React tarafından çağrılana kadar ≥1 ms geçerse `Date.now() === kaptanId` olur.

**Senaryo:** Kullanıcı mesaj gönderir; ana iş parçacığı o anda meşguldür (KaTeX render, grafik chunk'ı) ve updater 1 ms sonra koşar.

**Sonuç:** Kullanıcı balonu ile asistan balonu aynı `id`'yi taşır. `guncelle` her iki mesajı da eşleştirir → gelen token'lar kullanıcının kendi balonunun içine de yazılır (kullanıcı yazmadığı bir metni kendi balonunda görür), ayrıca React duplicate-key uyarısı verir. Deterministik değildir, "bazen sohbet karışıyor" olarak rapor edilir.

**Öneri:** Tek bir `const t = Date.now()` alıp `id: t` / `id: t + 1` kullan, ya da `crypto.randomUUID()`.

### 19. Çöz: çıkış onayı modalı açıkken Enter tuşu arkadaki soruyu ilerletiyor

`frontend-v2/src/screens/Coz.tsx:258-271` (window keydown) + `54-77` (`CikisOnay` Radix Dialog) · **ORTA**

Klavye dinleyicisi `window`'a bağlıdır ve modal açıkken devre dışı kalmaz; yalnız `INPUT`/`TEXTAREA` hedeflerini eler.

**Senaryo:** Öğrenci sağdaki şıkkı seçmiş, çıkmak için ✕'e basar, "Testten çık?" diyaloğunda kararsız kalıp Enter'a basar (odak "Devam et" butonundadır).

**Sonuç:** `e.preventDefault()` çalışır, `kontrol()` tetiklenir — modalın arkasındaki soru cevaplanır, `/answers`'a POST gider ve sayaç artar; diyalog Enter'ı yutamadığı için kullanıcı ne olduğunu görmez. Aynı şekilde `geri` aşamasındayken Enter arkadaki soruyu ilerletir.

**Öneri:** Dialog `open` durumunu yukarı taşıyıp dinleyiciyi kapılandır (`if (modalAcik) return`), ya da dinleyiciyi `window` yerine odak kapsayıcısına bağla.

### 20. İlk giriş turu, profil yüklenmeden öğretmen ve yöneticiye de açılıyor

`frontend-v2/src/App.tsx:233-235, 269` · **ORTA**

```ts
const { profile } = useAuth()
const rol = rolBul(profile)        // profile null iken → 'student'
const [tur, setTur] = useState(turGerekli)
...
{rol === 'student' && tur && <Onboarding onKapat={() => setTur(false)} />}
```

`Shell` `profilYukleniyor`'u beklemez (`RolGecidi` ve `AnaKapi` bekler, `Shell` beklemez) ve `rolBul(null)` güvenli varsayılan olarak `'student'` döner.

**Senaryo:** Yeni kaydolmuş bir öğretmen ilk kez giriş yapar; oturum gelir, `profiles` satırı ikinci bir istekte gelir.

**Sonuç:** O pencerede tam ekran onboarding modalı açılır ("Genel Bakış — bugünün özeti", "İlk adım: Tanışma Sınavı" — hiçbiri öğretmende yok). Öğretmen "Sınava başla"ya basarsa `/coz`'e yönlendirilir, `RolGecidi izin={['student']} yonlendir` onu `/sinif`'e geri atar — ama `localStorage['learnup.tur'] = 'tamam'` yazılmıştır, yani gerçek öğrenci hesabı aynı cihazda turu hiç görmez.

**Öneri:** `Shell` içinde de `profilYukleniyor` iken turu çizme.

### 21. Odak Zamanlayıcısı sayfadan ayrılınca sessizce sıfırlanıyor; Bugün KPI'sı canlı güncellenmiyor

`frontend-v2/src/components/OdakZamanlayici.tsx:33-46` + `frontend-v2/src/screens/Bugun.tsx:81` · **ORTA**

Sayaç durumu (`kalan`, `calisiyor`) yalnız bileşen state'inde; `bugunkuOdakDk()` render sırasında bir kez okunuyor.

**Senaryo:** Öğrenci 25 dakikalık odak seansını başlatır, 10. dakikada "Analizler"e bakmak için nav'a tıklar ve geri döner.

**Sonuç:** Bileşen unmount olduğu için interval durur, dönüşte sayaç `25:00`'e sıfırlanır ve durakta değildir — seans kaybolur, "Bugün N odak seansı" artmaz (yalnız biriken saniyeler localStorage'da kalır). Ayrıca sayaç çalışırken Bugün'ün "Çalışma Süresi" KPI'sı hiç güncellenmez (Bugün yeniden render olmaz), yani 24 dakika boyunca eski dakika değerini gösterir. Ek olarak arka plan sekmesinde `setInterval` kısıldığı için biriken süre gerçek süreden az olur.

**Öneri:** Başlangıç damgasını (`Date.now()`) localStorage'da tut ve kalanı ondan türet; Bugün KPI'sını bir tik ya da callback ile besle.

---

## DÜŞÜK

### 22. `source: 'osym'` çıkışı var olmayan `/arsiv` rotasına gidiyor (Arşiv ekranı hiç mount edilmiyor)

`frontend-v2/src/screens/Coz.tsx:255` · `frontend-v2/src/App.tsx:116-184` · **DÜŞÜK**

`nav(kaynak === 'osym' ? '/arsiv' : …)` — `App.tsx`'te `arsiv` diye bir `<Route>` yok, `screens/Arsiv.tsx` hiçbir yerden import edilmiyor (telif kararı gereği raftaydı). `/arsiv` `path="*"` → `NotFound` yakalar.

**Senaryo:** ÖSYM kaynağı bir yolla yeniden açılırsa (ör. Arşiv rotası geri eklenir ya da nav-state elle kurulur) çıkış/hata butonları 404'e gider.

**Sonuç:** Bugün ölü bir dal; ancak `testModu`, `cz-muhur`, `KAYNAK_ETIKET.osym` gibi tüm ÖSYM kolları da onunla birlikte erişilemez durumda — Coz.tsx'in yaklaşık üçte biri hiç tetiklenmiyor.

**Öneri:** Ya rotayı geri ekle ya da `osym` dalını ve `Arsiv.tsx`'i bilinçli "raf" olarak tek bir yerde işaretle.

### 23. Konular: talep kaydı başarısız olsa da "istendi" yazılıyor

`frontend-v2/src/screens/Konular.tsx:107-110` · **DÜŞÜK**

`setTalepEdilen(...)` iyimser olarak önce çalışır, `apiPost(...).catch(() => {})` hatayı tümüyle yutar.

**Senaryo:** Öğrenci boş bir konuya dokunur, istek 500 ya da ağ hatasıyla düşer.

**Sonuç:** Satır "talebin alındı — üretim sırasına eklendi" / "istendi" der, oysa sunucuda hiçbir kayıt yok. Yöneticinin kapsama ekranında bu konu "0 öğrenci bekliyor" görünür — tam olarak dosyanın başındaki yorumun (satır 96-103) engellemeyi amaçladığı sessiz kayıp.

**Öneri:** Katkıyı `then` içinde işaretle, `catch`'te geri al ve toast göster.

### 24. Kullanıcılar: "Toplam Hesap · filtresiz" etiketi yanlış — sayı filtreli

`frontend-v2/src/screens/kule/Kullanicilar.tsx:472-476` · **DÜŞÜK**

`d.total` `learnup-brain/src/routes/admin.routes.ts:485,538`'de filtre uygulanmış sorgunun `count: 'exact'` değeridir.

**Senaryo:** Yönetici "Öğretmen" segmentine tıklar.

**Sonuç:** "Toplam Hesap: 12 / filtresiz" yazar; oysa 12 yalnız öğretmen sayısıdır. Aynı sayı `sayfaSayisi` hesabında kullanıldığı için sayfalama doğru çalışır — sorun sadece etikettedir ama yöneticiyi sistemdeki toplam hesap sayısı konusunda yanıltır.

**Öneri:** Etiketi "filtreye uyan" yap (Denetim.tsx:190 bu ayrımı doğru yapıyor).

### 25. Sınıflar: 100 öğretmen tavanı var, sayfalama yok

`frontend-v2/src/screens/kule/Siniflar.tsx:25, 38-41` · **DÜŞÜK**

`limit: SAYFA (100)` sabit, `offset` hiç kullanılmıyor, sayfalama arayüzü yok.

**Senaryo:** Sistemde 130 öğretmen hesabı var.

**Sonuç:** İlk stat kartı `liste.data.total` ile "130 öğretmen" der, ızgarada 100 kart çizilir; kalan 30 öğretmenin sınıfına yöneticinin girebileceği hiçbir yol kalmaz (arama dışında). "Sınıftaki Öğrenci"/"Boş Sınıf"/"Onaysız" statları da yalnız ilk 100 üzerinden sayılır ama bunu yalnız ikinci kart ("bu sayfadaki sınıfların toplamı") söyler.

**Öneri:** Kullanicilar.tsx'teki sayfalama desenini uygula.

### 26. CSV indirmede `URL.revokeObjectURL` senkron çağrılıyor

`frontend-v2/src/screens/sinif/SinifPanosu.tsx:433-438` · `frontend-v2/src/screens/kule/Denetim.tsx:85-90` · **DÜŞÜK**

`a.click()` hemen ardından `URL.revokeObjectURL(url)` çağrılıyor; `<a>` belgeye hiç eklenmiyor.

**Senaryo:** Öğretmen Firefox'ta "⬇ CSV"ye basar.

**Sonuç:** Blob URL indirme başlamadan iptal edilebilir; dosya bazı tarayıcılarda hiç inmez, hata da görünmez. Chromium'da genellikle çalışır — bu yüzden "bende çalışıyor" tuzağıdır.

**Öneri:** `setTimeout(() => URL.revokeObjectURL(url), 0)` ya da `requestAnimationFrame` ile ertele.

### 27. Ustalık Matrisi "ölçüm yok" sayımı, aynı anahtara düşen derslerde şişiyor

`frontend-v2/src/components/rontgen.tsx:479-480` + `frontend-v2/src/screens/Harita.tsx:127-149` · **DÜŞÜK**

`gruplar` HAM `n.subject` ile gruplanır; `mufredat` ise `dersAnahtar(c.subject)` ile toplanır. `lib/format.ts:24-26`'da hem `türkçe` hem `edebiyat` → `'trk'`.

**Senaryo:** Öğrenci Türkçe ve Edebiyat'tan ayrı ayrı soru çözmüş; müfredatta Türkçe 60, Edebiyat 40 kazanım var.

**Sonuç:** Her iki ders satırı da `toplam = 100` alır; "ölçüm yok — bu dersten N konuya henüz dokunulmadı" tooltip'i her iki satırda da şişmiş sayı verir. `Harita.tsx:188-191` `KapsamaKarti` toplamı da ders filtresi seçiliyken aynı şekilde birleşik değeri kullanır.

**Öneri:** `mufredat`'ı ham `subject` ile de indeksle ya da grupları `dersAnahtar` ile kur.

### 28. Isı Haritası: ders çipi değişince seçili ünite parametresi URL'de bayat kalıyor

`frontend-v2/src/screens/sinif/SinifIsi.tsx:191-192, 313-327` · **DÜŞÜK**

`setDers(...)` `unite` sorgu parametresini temizlemez.

**Senaryo:** Öğretmen Matematik → "Türev" hücresini seçer (URL `?unite=mat.turev`), sonra "Kimya" çipine tıklar.

**Sonuç:** URL `?ders=kimya&unite=mat.turev` olur. `seciliHucre` null döner ve sağdaki panel "Matristen bir hücre seç" boş hâline döner (davranış doğru), ama paylaşılan bağlantı anlamsız bir parametre taşır ve "Tümü"ne dönüldüğünde eski ünite paneli aniden geri açılır — kullanıcının seçmediği bir seçim.

**Öneri:** `setDers` içinde `setUnite(null)` çağır.

---

## Notlar

- `Coz.tsx` ÖSYM (`osym`) kolu, `Arsiv.tsx` ekranı ve `components/SinifKatil.tsx` şu an hiçbir rotadan erişilemiyor (grep ile doğrulandı) — telif kararı sonrası bilinçli raf olabilir ama `Coz.tsx:255`'teki `/arsiv` yönlendirmesi kırık kaldı (#22).
- `CommandPalette.tsx:17-24` öğrenci `SAYFALAR` listesinde `/konular` ve `/odevler` yok — nav'da olan iki ekran palette aranamıyor (bulgu olarak sayılmadı, işlevsel kayıp değil).
- Sunucu-istemci gün anahtarı tutarsızlığı üç ayrı yerde farklı çözülmüş: `SinifPanosu.tsx:316` `timeZone: 'Europe/Istanbul'` (backend `lib/rontgen.ts:175` ile uyumlu), `Bugun.tsx:84` / `Harita.tsx:173` / `OgrenciRontgeni.tsx:47` tarayıcı yereli, `lib/gamification.ts:83` sunucu yereli. #12 ve #13 bu ayrışmanın iki farklı yüzü.
