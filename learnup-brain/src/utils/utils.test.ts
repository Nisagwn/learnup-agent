/** ŞIK DÜZENİ + EŞZAMANLILIK — `bun test src/utils` */
import { expect, test, describe } from 'bun:test'
import { siklariDuzenle, sayiya, celdiriciKusatmasi, sikUzunlukSizintisi, type SikliSoru } from './shufflers.js'
import { gorselBagimli } from './soru-saglik.js'
import { kokBenzerligi, celdiriciKumesiAyni } from './benzerlik.js'
import { latexDuzelt, latexBozuk, soruLatexBozuk, matematigiDuzelt, hamMatematikKacagi } from './latex.js'
import { mapLimit } from './concurrency.js'

const soru = (siklar: Record<string, string>, dogru: string, cozum = ''): SikliSoru => ({
  siklar: siklar as SikliSoru['siklar'],
  dogru,
  cozum,
})

describe('sikUzunlukSizintisi — kod kapısı ("en uzun şıkkı işaretle" taktiğini kapatır)', () => {
  // ÖLÇÜLDÜ (metinsel şıklı): gerçek ÖSYM'de doğru cevap %24 en uzun şık (rastgele %20 →
  // sızıntı yok), AI havuzunda %52. Eşik uydurulmadı: gerçek ÖSYM'nin taşma dağılımından
  // seçildi (+%15 → ÖSYM'nin %11'ini, havuzun %32'sini reddeder).
  const s = (arr: string[], dogru: string): SikliSoru =>
    soru({ A: arr[0], B: arr[1], C: arr[2], D: arr[3], E: arr[4] }, dogru)

  test('doğru şık belirgin UZUN → sızıntı', () => {
    expect(sikUzunlukSizintisi(s(
      ['Kısa yanlış', 'Kısa yanlış iki', 'Yorum, iki değişken arasındaki ilişkililiğin neden-sonuç ilişkisi olduğu yanılgısını içermektedir', 'Kısa üç', 'Kısa dört'],
      'C',
    ))).toBe('sizinti')
  })

  test('KISA olgu şıklarında uzun ÖZEL AD yanlış alarm vermez (gerçek ÖSYM sorusu)', () => {
    // 2019 TYT Tarih'ten. "Hudeybiye Antlaşması" diğerlerinden %67 uzun — ama bu sızıntı değil,
    // antlaşmanın adı öylece uzun. Yalnız ORAN'a bakan ilk sürüm bu soruyu REDDEDİYORDU; kapı
    // gerçek ÖSYM sorusunu yakıyorsa kapı yanlıştır. Mutlak taban (+10ch) bunu eler: +8ch.
    // ÖSYM'de de doğru şık %24 en uzundur; "en uzun olmak" tek başına kusur DEĞİL.
    expect(sikUzunlukSizintisi(s(
      ['Bedir Savaşı', 'Hudeybiye Antlaşması', 'Mekke Fethi', 'Hendek Savaşı', 'Hayber Fethi'],
      'B',
    ))).toBe('temiz')
  })

  test('doğru şık KISA ise sızıntı yok (kapı tek yönlü)', () => {
    expect(sikUzunlukSizintisi(s(
      ['Uzun uzun açıklamalı yanlış şık bir', 'Kısa', 'Uzun uzun açıklamalı yanlış şık üç', 'Uzun uzun açıklamalı yanlış dört', 'Uzun uzun açıklamalı yanlış beş'],
      'B',
    ))).toBe('temiz')
  })

  test('SAYISAL şıklarda kural UYGULANMAZ — uzunluk anlamsız (null)', () => {
    // "10000" > "9" ama bu sızıntı değil, büyüklük. Kuşatma kapısı zaten o işi görüyor.
    expect(sikUzunlukSizintisi(s(['9', '10', '11', '12', '100000'], 'E'))).toBeNull()
  })

  test('ROMA kombinasyon şıklarında kural UYGULANMAZ — uzunluk YAPISAL (null)', () => {
    // "I, II ve III" her zaman "Yalnız I"den uzundur; bunu sızıntı saymak ÖSYM'nin en yaygın
    // kalıbını topyekûn yasaklardı.
    expect(sikUzunlukSizintisi(s(['Yalnız I', 'Yalnız II', 'I ve II', 'I ve III', 'I, II ve III'], 'E'))).toBeNull()
  })
})

describe('celdiriciKusatmasi — kod kapısı (pahalı hakemin yerine)', () => {
  test('doğru değeri KUŞATAN çeldiriciler geçer (2 alt, 2 üst)', () => {
    expect(celdiriciKusatmasi(soru({ A: '6', B: '8', C: '10', D: '12', E: '14' }, 'C'))).toBe('kusatilmis')
  })

  test('doğru cevap EN BÜYÜK → tek yanda (artan sırada hep E olur, öğrenci tahmin eder)', () => {
    expect(celdiriciKusatmasi(soru({ A: '2', B: '4', C: '6', D: '8', E: '10' }, 'E'))).toBe('tek-yanda')
  })

  test('doğru cevap EN KÜÇÜK → tek yanda (artan sırada hep A olur)', () => {
    expect(celdiriciKusatmasi(soru({ A: '10', B: '12', C: '14', D: '16', E: '18' }, 'A'))).toBe('tek-yanda')
  })

  test('sadece 1 çeldirici altta → yetersiz kuşatma', () => {
    expect(celdiriciKusatmasi(soru({ A: '8', B: '10', C: '12', D: '14', E: '16' }, 'B'))).toBe('tek-yanda')
  })

  test('KESİR ve ONDALIK şıklar sayı olarak karşılaştırılır (metin sırası değil)', () => {
    // "1/2"=0.5 · "0,75"=0.75 · "1"=1 · "3/2"=1.5 · "2"=2 → doğru 1, iki altta iki üstte.
    expect(celdiriciKusatmasi(soru({ A: '1/2', B: '0,75', C: '1', D: '3/2', E: '2' }, 'C'))).toBe('kusatilmis')
  })

  test('METİNSEL şıklarda kural UYGULANMAZ → null (alt/üst anlamsız)', () => {
    expect(
      celdiriciKusatmasi(soru({ A: 'Yalnız I', B: 'Yalnız II', C: 'I ve II', D: 'II ve III', E: 'I, II ve III' }, 'C')),
    ).toBeNull()
  })

  test('geçersiz doğru harf → null (kapı yanlış hüküm vermez)', () => {
    expect(celdiriciKusatmasi(soru({ A: '2', B: '4', C: '6', D: '8', E: '10' }, 'X'))).toBeNull()
  })
})

describe('siklariDuzenle — deterministik şık düzeni', () => {
  test('SAYISAL şıklar ARTAN sıraya dizilir ve doğru harf takip eder', () => {
    // Doğru cevap 12, A'da. Artan sırada 12 ortaya düşmeli → doğru harfi kayar.
    const r = siklariDuzenle(soru({ A: '12', B: '20', C: '4', D: '16', E: '8' }, 'A'))
    expect(Object.values(r.siklar)).toEqual(['4', '8', '12', '16', '20'])
    expect(r.siklar[r.dogru as 'A']).toBe('12') // doğru şık hâlâ 12'yi işaret ediyor
    expect(r.dogru).toBe('C')
  })

  test('ROMA kalıbı DOKUNULMAZ', () => {
    const inp = { A: 'Yalnız I', B: 'Yalnız II', C: 'I ve II', D: 'I ve III', E: 'I, II ve III' }
    const r = siklariDuzenle(soru(inp, 'C'))
    expect(r.siklar).toEqual(inp as SikliSoru['siklar'])
    expect(r.dogru).toBe('C')
  })

  test('çözüm HARFE atıf yapıyorsa DOKUNULMAZ (çözüm yalan söylemesin)', () => {
    const inp = { A: 'elma', B: 'armut', C: 'kiraz', D: 'muz', E: 'incir' }
    const r = siklariDuzenle(soru(inp, 'B', 'Doğru cevap B şıkkında verilmiştir.'))
    expect(r.siklar).toEqual(inp as SikliSoru['siklar'])
    expect(r.dogru).toBe('B')
  })

  test('metinsel şıklar karışsa da doğru şık hep aynı METNİ gösterir (100 tur)', () => {
    for (let i = 0; i < 100; i++) {
      const r = siklariDuzenle(soru({ A: 'elma', B: 'armut', C: 'kiraz', D: 'muz', E: 'incir' }, 'C'))
      expect(r.siklar[r.dogru as 'A']).toBe('kiraz') // doğru cevap içeriği asla kaymaz
    }
  })

  test('sayiya: kesir/ondalık/negatif/çöp', () => {
    expect(sayiya('4/3')).toBeCloseTo(1.333, 2)
    expect(sayiya('1,5')).toBe(1.5)
    expect(sayiya('-2')).toBe(-2)
    expect(sayiya('elma')).toBeNull()
  })
})

describe('mapLimit — sınırlı eşzamanlılık', () => {
  test('aynı anda EN FAZLA `limit` iş çalışır', async () => {
    let acik = 0
    let tavan = 0
    const isle = async (): Promise<void> => {
      acik++
      tavan = Math.max(tavan, acik)
      await new Promise((r) => setTimeout(r, 5))
      acik--
    }
    await mapLimit(Array.from({ length: 20 }), 4, isle)
    expect(tavan).toBeLessThanOrEqual(4)
    expect(tavan).toBeGreaterThan(1) // gerçekten paralel çalıştı (seri değil)
  })

  test('SIRA korunur: sonuç[i] === fn(items[i])', async () => {
    const r = await mapLimit([10, 20, 30, 40], 2, async (x) => x * 2)
    expect(r).toEqual([20, 40, 60, 80])
  })

  test('boş girdi → boş sonuç', async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([])
  })
})

describe('gorselBagimli — şekli kaybolmuş soru örnek de olmaz, servis de edilmez', () => {
  test('kaybolan GRAFİK yakalanır (eksen etiketleri metne düşmüş)', () => {
    // 2023 AYT Matematik, birebir DB'den. Grafik yok; geriye eksen sayıları kalmış.
    expect(gorselBagimli(
      'Dik koordinat düzleminde bir f fonksiyonunun grafiği aşağıda verilmiştir. y 7 6 y = f(x) 5 4 3 2 1 x O 1 2 3 4 5 Gerçel sayılar kümesi üzerinde…',
    )).toBe(true)
  })

  test('TÜRKÇE EK kaçırılmaz — "grafiği" de "grafik" kadar tutar', () => {
    // Bu tam olarak bir kez ıskalandı: `\b(grafik)\b` deseni "grafiği"yi kaçırdı ve
    // "görsel gönderme %0" diye YANLIŞ bir ölçüm ürettim. Ek, kelime sınırını bozuyor.
    expect(gorselBagimli('… fonksiyonunun grafiği aşağıda verilmiştir.')).toBe(true)
    expect(gorselBagimli('Yukarıdaki tabloda verilenlere göre…')).toBe(true)
    expect(gorselBagimli('… yapılar aşağıdaki gibi şematize edilerek numaralandırılmıştır. 1 2 3 4 5')).toBe(true)
  })

  test('kaybolan ALT/ÜST İNDİS yakalanır (öksüz sayı dizisi)', () => {
    // log₂ ve log_{1/2} indisleri yok olunca "log 1 a … 2 2 2 2" kalıyor.
    expect(gorselBagimli(
      'A log2 a, log2 b, log2 c, log2 d B log 1 a, log 1 b, log 1 c, log 1 d 2 2 2 2 biçiminde tanımlanıyor.',
    )).toBe(true)
  })

  test('SAĞLAM soru geçer — düz metin, şekilsiz', () => {
    expect(gorselBagimli(
      'Rakamları birbirinden ve sıfırdan farklı üç basamaklı bir doğal sayının onlar basamağındaki rakam diğer basamaklarındaki rakamları tam bölüyorsa bu sayıya ortakatlı sayı denir. Buna göre, en büyük ortakatlı sayı ile en küçük ortakatlı sayının farkı kaçtır?',
    )).toBe(false)
  })

  test('SAĞLAM soru geçer — çok sayı içeren ama şekilsiz metin problemi', () => {
    // Sayı yoğunluğu tek başına kusur DEĞİL: gerçek ÖSYM kökünde ortalama 1.9 sayı var.
    expect(gorselBagimli(
      'Bir proje için Türkiye’nin 81 ilinin her birinden 16 okul belirlenmiş ve her okulun müdürüne bir mesaj gönderilmiştir. Sonra her müdür bu mesajı okulundaki 35 öğretmene göndermiştir. Buna göre toplam sayı kaçtır?',
    )).toBe(false)
  })
})

describe('sayiya — LaTeX şıkları SAYI olarak okunur (üç kapı da buna bağlı)', () => {
  // ⚠️ REGRESYON TESTİ. Charter modelden her formülü $...$ arasında istiyor → sayısal şık
  // artık "12" değil "$12$" geliyor. sayiya bunu okuyamazsa üç kapı da SESSİZCE yanlış çalışır
  // (kuşatma kapanır · artan sıra Fisher–Yates'e düşer · uzunluk kapısı yanlış alarm verir).
  test('$ sarmalı soyulur', () => {
    expect(sayiya('$12$')).toBe(12)
    expect(sayiya('$-2$')).toBe(-2)
    expect(sayiya('$$7$$')).toBe(7)
  })

  test('LaTeX kesri okunur — \\frac, \\dfrac, \\tfrac', () => {
    expect(sayiya('$\\frac{4}{3}$')).toBeCloseTo(4 / 3)
    expect(sayiya('$\\dfrac{1}{2}$')).toBe(0.5)
    expect(sayiya('$\\tfrac{1}{2}$')).toBe(0.5)
  })

  test('sarmalsız eski biçim ÇALIŞMAYA DEVAM EDER (havuzda 1730 çıkmış soru var)', () => {
    expect(sayiya('12')).toBe(12)
    expect(sayiya('4/3')).toBeCloseTo(4 / 3)
    expect(sayiya('1,5')).toBe(1.5)
  })

  test('SAYI OLMAYAN LaTeX null döner — kapılar o soruda kenara çekilsin', () => {
    // "sayısal değil" demek kapıların KAPANMASI demek değil; o kuralın o soruda ANLAMSIZ
    // olması demek (metinsel şıkta "alt/üst" yoktur). Yanlış sayıya çevirmektense null.
    expect(sayiya('$\\frac{\\sqrt{2}}{2}$')).toBeNull()
    expect(sayiya('$x^2$')).toBeNull()
    expect(sayiya('Hudeybiye Antlaşması')).toBeNull()
  })
})

describe('KOD KAPILARI LaTeX şıklarla ÇALIŞMAYA DEVAM EDER', () => {
  // Bu blok yoksa "prompt'u LaTeX'e çevirmek" sessizce üç kapıyı birden kapatırdı.
  test('celdiriciKusatmasi LaTeX şıkları görür (kapı açık kalır)', () => {
    // Doğru $30$; altında $10$,$20$ üstünde $40$,$50$ → kuşatılmış.
    expect(celdiriciKusatmasi(soru(
      { A: '$10$', B: '$20$', C: '$30$', D: '$40$', E: '$50$' }, 'C',
    ))).toBe('kusatilmis')
    // Hepsi doğrunun ÜSTÜNDE → tek-yanda. (sayiya LaTeX okumasaydı `null` dönerdi = kapı yok.)
    expect(celdiriciKusatmasi(soru(
      { A: '$10$', B: '$20$', C: '$30$', D: '$40$', E: '$50$' }, 'A',
    ))).toBe('tek-yanda')
  })

  test('siklariDuzenle LaTeX sayısal şıkları ARTAN dizer (rastgeleye düşmez)', () => {
    const d = siklariDuzenle(soru(
      { A: '$50$', B: '$10$', C: '$40$', D: '$20$', E: '$30$' }, 'A',
    ))
    expect([d.siklar.A, d.siklar.B, d.siklar.C, d.siklar.D, d.siklar.E])
      .toEqual(['$10$', '$20$', '$30$', '$40$', '$50$'])
    expect(d.dogru).toBe('E') // $50$ artan sırada sona gider → doğru harf onunla taşınır
  })

  test('sikUzunlukSizintisi LaTeX sayısal şıkta YANLIŞ ALARM vermez', () => {
    // "$5$" (3ch) vs "$1250$" (6ch): uzunluk farkı yapısaldır, sızıntı değil. sayiya LaTeX
    // okumasaydı bunlar "metinsel" sayılır ve sağlam soru elenirdi.
    expect(sikUzunlukSizintisi(soru(
      { A: '$5$', B: '$1250$', C: '$30$', D: '$400$', E: '$60$' }, 'B',
    ))).toBeNull()
  })
})

describe('latexDuzelt — delimiter çevirisi (KaTeX yalnız $ biçimini tanır)', () => {
  test('TeX parantezi $ biçimine çevrilir — remark-math \\(...\\) TANIMAZ', () => {
    // Bu, arızanın en sık biçimi: model geçerli LaTeX yazar ama frontend'in anlamadığı
    // sarmalayıcıyla. Öğrenci ekranda birebir "\(x^2\)" görür.
    expect(latexDuzelt('Buna göre \\(x^2 + 1\\) kaçtır?')).toBe('Buna göre $x^2 + 1$ kaçtır?')
    expect(latexDuzelt('\\[\\frac{a}{b}\\]')).toBe('$$\\frac{a}{b}$$')
  })

  test('ÇİFT sarmalama açılır — "$\\(x\\)$" matematik modunda geçersizdir', () => {
    // `\(` matematik modunun İÇİNDE geçersiz bir komuttur → KaTeX çizemez.
    expect(latexDuzelt('$\\(x^2\\)$')).toBe('$x^2$')
    expect(latexDuzelt('$$\\[x^2\\]$$')).toBe('$$x^2$$')
  })

  test('ZATEN DOĞRU olan metne DOKUNMAZ (bozan normalize normalize değildir)', () => {
    expect(latexDuzelt('$x^2$ ile $\\frac{1}{2}$ arasındaki fark')).toBe('$x^2$ ile $\\frac{1}{2}$ arasındaki fark')
    expect(latexDuzelt('Osmanlı Devleti 1299 yılında kurulmuştur.')).toBe('Osmanlı Devleti 1299 yılında kurulmuştur.')
  })
})

describe('latexBozuk — kod kapısı (öğrencinin GÖRDÜĞÜ bozulmayı yakalar)', () => {
  // ⚠️ BU KAPININ YOKLUĞU SESSİZDİ: denetçi LLM'i `\frac`i okuyabildiği için soruyu
  // kusursuz buluyordu. Bozulma yalnız ÖĞRENCİNİN ekranında vardı — kimse bakmıyordu.
  test('SARMALANMAMIŞ LaTeX yakalanır — öğrenci birebir "\\frac{1}{2}" görür', () => {
    expect(latexBozuk('Sonuç \\frac{1}{2} olur.')).toContain('\\frac')
    expect(latexBozuk('Sonuç \\frac{1}{2} olur.')).toContain('$...$ dışında')
  })

  test('DERLENMEYEN LaTeX yakalanır — frontend ham kaynağı basar', () => {
    // \frac argümansız → KaTeX fırlatır. Frontend throwOnError:false ile çökmez ama
    // formül yerine ham metni gösterir; öğrenci için sonuç aynı: bozuk.
    expect(latexBozuk('$\\frac$')).toContain('çizilemiyor')
    expect(latexBozuk('$\\sqrt{$')).toBeTruthy()
  })

  test('EŞLEŞMEMİŞ $ yakalanır — yarım kalan sarmal ekranda görünür', () => {
    expect(latexBozuk('Buna göre $x^2 kaçtır?')).toContain('eşleşmemiş')
  })

  test('BOŞ sarmal yakalanır', () => {
    expect(latexBozuk('Buna göre $$ kaçtır?')).toContain('boş matematik sarmalı')
  })

  test('SAĞLAM LaTeX geçer — kapı frontend’in ÇİZEBİLDİĞİNİ reddetmez', () => {
    expect(latexBozuk('$x^2 + 1$ ifadesinin türevi $\\frac{d}{dx}(x^2+1) = 2x$ olur.')).toBeNull()
    expect(latexBozuk('$$\\int_0^1 x\\,dx = \\frac{1}{2}$$')).toBeNull()
    expect(latexBozuk('$\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1$')).toBeNull()
  })

  test('LaTeX’siz düz Türkçe soru geçer — matematik olmayan derslerde kapı sessizdir', () => {
    // Havuzun büyük kısmı (Tarih, Coğrafya, Türkçe…) hiç formül içermez. Kapı onlara
    // dokunmamalı; yoksa sağlam soruları eleyen bir kapı olur.
    expect(latexBozuk('Rakamları birbirinden farklı üç basamaklı kaç sayı vardır?')).toBeNull()
    expect(latexBozuk('Kurtuluş Savaşı’nın hazırlık döneminde toplanan ilk kongre hangisidir?')).toBeNull()
  })

  test('UNICODE matematik geçer — strict:false, frontend de aynı ayarla çiziyor', () => {
    // Eski/çıkmış sorular Unicode taşıyor (π, ≤, ²). Bunlar düz metin olarak zaten
    // doğru görünür; kapı bunları LaTeX'e ZORLAMAZ.
    expect(latexBozuk('π < x < 2π aralığında kaç çözüm vardır?')).toBeNull()
    expect(latexBozuk('$a \\leq π$ olduğuna göre')).toBeNull()
  })
})

describe('soruLatexBozuk — ŞIK ve ÇÖZÜM de taranır (formül çoğu zaman orada)', () => {
  const q = (over: Partial<Parameters<typeof soruLatexBozuk>[0]>) => ({
    soru: 'Buna göre $x$ kaçtır?',
    siklar: { A: '$1$', B: '$2$', C: '$3$', D: '$4$', E: '$5$' },
    cozum: 'Denklem çözülürse $x = 3$ bulunur, yani C şıkkı.',
    ...over,
  })

  test('kök temiz ama ŞIK bozuk → yakalanır', () => {
    // Kök çoğu zaman düz Türkçedir; formül şıkta olur. Yalnız köke bakan bir kapı bunu kaçırır.
    expect(soruLatexBozuk(q({ siklar: { A: '\\frac{1}{2}', B: '$2$', C: '$3$', D: '$4$', E: '$5$' } })))
      .toContain('A şıkkında')
  })

  test('kök ve şıklar temiz ama ÇÖZÜM bozuk → yakalanır', () => {
    // Çözüm en uzun ve en formül-yoğun alandır; yanlış yapan öğrencinin gördüğü tek şeydir.
    expect(soruLatexBozuk(q({ cozum: 'Türev alınırsa \\frac{d}{dx}(x^2) = 2x olur.' })))
      .toContain('çözümde')
  })

  test('her yeri sağlam soru geçer', () => {
    expect(soruLatexBozuk(q({}))).toBeNull()
  })
})

describe('matematigiDuzelt — normalize sorunun TÜM öğrenci-yüzlü alanlarına uygulanır', () => {
  test('kök, beş şık ve çözüm birlikte düzelir; şekil korunur', () => {
    const duzeltilmis = matematigiDuzelt({
      soru: '\\(x^2\\) kaçtır?',
      siklar: { A: '\\(1\\)', B: '\\(2\\)', C: '\\(3\\)', D: '\\(4\\)', E: '\\(5\\)' },
      cozum: 'Sonuç \\(x = 3\\).',
      dogru: 'C', // ← taşınan ek alanlar korunmalı (generation.ts TaggedQuestion geçiriyor)
    })
    expect(duzeltilmis.soru).toBe('$x^2$ kaçtır?')
    expect(duzeltilmis.siklar.A).toBe('$1$')
    expect(duzeltilmis.cozum).toBe('Sonuç $x = 3$.')
    expect(duzeltilmis.dogru).toBe('C')
  })
})

describe('benzerlik — özgünlük ölçüsü (tekrarı yakalar, klasiği yakalamaz)', () => {
  // İKİ GERÇEK KOPYA — bu turda üretilip havuza giren ikizler, birebir DB'den.
  const IKIZ_A =
    'Dik koordinat düzleminde A(2, 4) ve B(8, 2) noktaları veriliyor. C noktası [AB] doğru parçasını |AC| = 2|BC| olacak şekilde içten bölen noktadır. D noktası ise A ve B noktalarına eşit uzaklıkta olup y ekseni üzerindedir. Buna göre, C ve D noktalarından geçen doğrunun eğimi kaçtır?'
  const IKIZ_B =
    'Dik koordinat düzleminde A(2, 4) ve B(6, 2) noktaları veriliyor. ABC bir ikizkenar üçgen olup |AC| = |BC| dir. C noktası y = x doğrusu üzerinde olduğuna göre, C noktasının koordinatları toplamı kaçtır?'
  // İKİ FARKLI GERÇEK ÖSYM SORUSU — aynı ders (Matematik), farklı senaryo.
  const OSYM_1 =
    'Rakamları birbirinden ve sıfırdan farklı üç basamaklı bir doğal sayının onlar basamağındaki rakam diğer basamaklarındaki rakamları tam bölüyorsa bu sayıya ortakatlı sayı denir. Buna göre, en büyük ortakatlı sayı ile en küçük ortakatlı sayının farkı kaçtır?'
  const OSYM_2 =
    'n doğal sayısı iki asal sayının çarpımına eşit olmak üzere, 66 · n ve 70 · n sayılarının asal bölenlerinin sayısı sırasıyla 5 ve 3 tür. Buna göre, n sayısının rakamları toplamı kaçtır?'

  test('SAYI MASKESİ: aynı senaryo + değişmiş sayılar = belirgin AYRIŞMA', () => {
    // Charter ÖZGÜNLÜK maddesinin ölçülebilir hâli. ÖLÇÜLDÜ: ikizler 0.311, alakasız gerçek
    // ÖSYM çiftleri 0.038-0.099 — arada 3× boşluk. Bu test EŞİĞİ değil AYRIŞMAYI korur;
    // üretim eşiği eval'in korpus dağılımından türetilir (uydurulmaz — kendi ilk sürümüm
    // 0.35 bekliyordu ve ölçüm 0.311 çıkınca düzeltildi: eşik uydurmama kuralı teste de uygulanır).
    expect(kokBenzerligi(IKIZ_A, IKIZ_B)).toBeGreaterThan(0.25)
  })

  test('iki FARKLI gerçek ÖSYM sorusu düşük benzerlikte kalır', () => {
    // Kapının yaşama hakkı: gerçek özgün çiftleri yakmamak. (Ölçülen: 0.099 / 0.038)
    expect(kokBenzerligi(OSYM_1, OSYM_2)).toBeLessThan(0.15)
    expect(kokBenzerligi(IKIZ_A, OSYM_1)).toBeLessThan(0.15)
  })

  test('TÜRKÇE EK kelime sınırını bozamaz (karakter shingle nedeni)', () => {
    // "telin uzunluğu" ↔ "tel uzunluğunu": kelime n-gram 0 verirdi; karakter shingle vermez.
    const a = 'Bir çiftçi nehir kenarındaki arazisine telin uzunluğu 120 metre olacak şekilde çit çekiyor ve alanı hesaplıyor.'
    const b = 'Bir çiftçi nehir kenarındaki arazisine tel uzunluğunu 90 metre seçerek çit çekiyor ve alanı hesaplıyor.'
    expect(kokBenzerligi(a, b)).toBeGreaterThan(0.5)
  })

  test('KISA metin ölçülmez (0) — gürültüden hüküm çıkmaz', () => {
    expect(kokBenzerligi('x kaçtır?', 'y kaçtır?')).toBe(0)
  })

  test('ÇELDİRİCİ-KÜME: metinsel 5/5 birebir küme = kopya (sıra bağımsız)', () => {
    const a = { A: 'Bedir Savaşı', B: 'Hendek Savaşı', C: 'Uhud Savaşı', D: 'Mute Savaşı', E: 'Hayber Fethi' }
    const b = { A: 'Hayber Fethi', B: 'Uhud Savaşı', C: 'Bedir Savaşı', D: 'Mute Savaşı', E: 'Hendek Savaşı' }
    expect(celdiriciKumesiAyni(a, b)).toBe(true)
  })

  test('ROMA kalıbı kopya SAYILMAZ — ÖSYM\'nin en yaygın kalıbı özdeş kümedir', () => {
    const roma = { A: 'Yalnız I', B: 'Yalnız II', C: 'I ve II', D: 'I ve III', E: 'I, II ve III' }
    expect(celdiriciKumesiAyni(roma, { ...roma })).toBe(false)
  })

  test('SAYISAL küme kopya SAYILMAZ — ardışık tamsayılar meşru tekrar eder', () => {
    // {1,2,3,4,5} gerçek ÖSYM'de defalarca geçer; sayısal kopya kök-benzerliğinin işi.
    const s = { A: '1', B: '2', C: '3', D: '4', E: '5' }
    expect(celdiriciKumesiAyni(s, { ...s })).toBe(false)
  })

  test('bir şık farklıysa küme kopya değildir (5/5 şartı, ≥4/5 değil)', () => {
    const a = { A: 'Bedir Savaşı', B: 'Hendek Savaşı', C: 'Uhud Savaşı', D: 'Mute Savaşı', E: 'Hayber Fethi' }
    const b = { A: 'Bedir Savaşı', B: 'Hendek Savaşı', C: 'Uhud Savaşı', D: 'Mute Savaşı', E: 'Tebük Seferi' }
    expect(celdiriciKumesiAyni(a, b)).toBe(false)
  })
})

describe('hamMatematikKacagi — ters-bölüsüz matematik (latexBozuk göremez)', () => {
  test('ham üs yakalanır: x^2 sarmalsız', () => {
    expect(hamMatematikKacagi('f(x) = x^2 + 3 fonksiyonu veriliyor.')).toContain('$...$')
  })

  test('ham indis yakalanır: a_1 sarmalsız', () => {
    expect(hamMatematikKacagi('Dizinin ilk terimi a_1 = 5 olarak veriliyor.')).not.toBeNull()
  })

  test('SARMALI üs temizdir — $x^2$ KaTeX\'in işi', () => {
    expect(hamMatematikKacagi('$f(x) = x^2 + 3$ fonksiyonu veriliyor.')).toBeNull()
  })

  test('düz Türkçe metin temizdir (sözel soru yanlış alarm almaz)', () => {
    expect(hamMatematikKacagi('Osmanlı Devleti kuruluş döneminde iskan politikası izlemiştir.')).toBeNull()
  })

  test('soruLatexBozuk yalnız bayrakla ham-mat denetler (ders-koşulluluk çağıranda)', () => {
    const q = { soru: 'f(x) = x^2 veriliyor.', siklar: { A: '1', B: '2', C: '3', D: '4', E: '5' }, cozum: 'Çözüm budur uzun uzun anlatılır.' }
    expect(soruLatexBozuk(q)).toBeNull()            // sözel yol: ham-mat bakılmaz
    expect(soruLatexBozuk(q, true)).toContain('^')  // sayısal yol: yakalar
  })
})
