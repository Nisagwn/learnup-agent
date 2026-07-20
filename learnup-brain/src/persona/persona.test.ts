/**
 * KURAL TESTLERİ — `bun test src/persona`
 *
 * Bu testler prompt'un İÇERİĞİNİ test etmez (onu ancak canlı ölçüm test eder: gen-smoke,
 * sik-dagilim). Burada test edilen şey KURALIN ZORLANIP ZORLANMADIĞI:
 *   · Model taksonomi/duygu listesi dışına çıkarsa gerçekten reddediliyor mu?
 *   · Prompt metni ile doğrulayıcı AYNI kaynaktan mı türüyor (kayma imkânsız mı)?
 *   · Ortak kurallar tek kaynaktan mı geliyor (kopyala-yapıştır kayması var mı)?
 */
import { expect, test, describe } from 'bun:test'
import { TAKSONOMI, TeshisSemasi, ATLAS_SYSTEM } from './atlas.charter.js'
import { DUYGU_DURUMLARI, AffectSemasi, NABIZ_SYSTEM, NOTR_AFFECT } from './nabiz.charter.js'
import { PERSONA_CHARTER } from './kaptan.charter.js'
import {
  OSYM_YAZAR_SYSTEM,
  OSYM_DENETCI_SYSTEM,
  ZORLUK_MERDIVENI,
  OSYM_SKOR_OLCEGI,
  MATEMATIK_BICIMI,
  MEKANIZMALAR,
  ZORLUK_TARIFI,
  dersAilesi,
  AILE_DERSLERI,
  zorlukAnahtari,
  COZUM_ORNEGI,
  denetciIstemi,
  onarimIstemi,
} from './osym.charter.js'
import { TESHIS_DILI_YOK, ORTAK_KURALLAR } from './ortak.js'
import { latexBozuk } from '../utils/latex.js'

const GECERLI_TESHIS = {
  misconception_id: 'momentum_korunumu_ihmali',
  taxonomy: 'kavram_karismasi',
  evidence: 'Öğrenci sistemi bütün olarak almıyor.',
  confidence: 0.8,
  prereq_hypothesis: null,
  remediation: { review_kazanim: null, then_microset: { count: 4, difficulty: 'kolay' } },
  student_facing_hint: 'İki cismi tek sistem gibi düşün.',
}

describe('ATLAS — teşhis sınır doğrulaması', () => {
  test('geçerli teşhis kabul edilir', () => {
    expect(TeshisSemasi.safeParse(GECERLI_TESHIS).success).toBe(true)
  })

  test('KÖR CAST KAPALI: taksonomide olmayan değer REDDEDİLİR', () => {
    // Eski kod: `verdict.taxonomy as Misconception['taxonomy']` → bu değer DB'ye yazılırdı.
    const r = TeshisSemasi.safeParse({ ...GECERLI_TESHIS, taxonomy: 'dikkatsizlik' })
    expect(r.success).toBe(false)
  })

  test('teşhisin kimliğini belirleyen alanlar boş geçilemez', () => {
    expect(TeshisSemasi.safeParse({ ...GECERLI_TESHIS, misconception_id: '' }).success).toBe(false)
    expect(TeshisSemasi.safeParse({ ...GECERLI_TESHIS, student_facing_hint: '' }).success).toBe(false)
  })

  test('ikincil alanlar toleranslı: bozuk confidence teşhisi düşürmez', () => {
    const r = TeshisSemasi.safeParse({ ...GECERLI_TESHIS, confidence: 7 })
    expect(r.success).toBe(true)
    expect(r.success && r.data.confidence).toBe(0.5)
  })

  test('KAYMA İMKÂNSIZ: prompt, doğrulayıcıyla aynı taksonomiyi listeler', () => {
    for (const anahtar of Object.keys(TAKSONOMI)) {
      expect(ATLAS_SYSTEM).toContain(anahtar)
    }
  })
})

describe('NABIZ — duygu sınıflama sınır doğrulaması', () => {
  const GECERLI = { state: 'hüsran', evidence: '4 hata üst üste', coaching_stance: 'sakinleştirici', load_cap: 'micro' }

  test('geçerli sınıflama kabul edilir', () => {
    expect(AffectSemasi.safeParse(GECERLI).success).toBe(true)
  })

  test('KÖR CAST KAPALI: listede olmayan duygu REDDEDİLİR', () => {
    // Eski kod: `JSON.parse(raw) as AffectState` → "panik" Kaptan'ın ton mantığına akardı.
    expect(AffectSemasi.safeParse({ ...GECERLI, state: 'panik' }).success).toBe(false)
    expect(AffectSemasi.safeParse({ ...GECERLI, load_cap: 'sinirsiz' }).success).toBe(false)
  })

  test('nötr varsayılan kendi şemasından geçer (güvenli düşüş gerçekten güvenli)', () => {
    expect(AffectSemasi.safeParse(NOTR_AFFECT).success).toBe(true)
  })

  test('KAYMA İMKÂNSIZ: prompt, doğrulayıcıyla aynı durumları listeler', () => {
    for (const anahtar of Object.keys(DUYGU_DURUMLARI)) {
      expect(NABIZ_SYSTEM).toContain(anahtar)
    }
  })
})

describe('ORTAK — tek kaynak, kopyala-yapıştır kayması yok', () => {
  test('teşhis dili kuralı Kaptan ve Nabız\'da AYNI metinden gelir', () => {
    // Eskiden iki ayrı yerde ayrı ayrı yazılıydı → biri değişse diğeri sessizce kayardı.
    expect(PERSONA_CHARTER).toContain(TESHIS_DILI_YOK)
    expect(NABIZ_SYSTEM).toContain(TESHIS_DILI_YOK)
  })

  test('ortak kurallar üretim zincirindeki her prompt\'ta var', () => {
    for (const charter of [ATLAS_SYSTEM, NABIZ_SYSTEM, OSYM_YAZAR_SYSTEM]) {
      expect(charter).toContain(ORTAK_KURALLAR)
    }
  })

  test('ORTAK kurallar BİÇİM-AGNOSTİK — JSON\'a özgü talimat taşımaz', () => {
    // Ortak kurallar HER charter'a enjekte oluyor; ÖSYM yazarının sözleşmesi JSON değil
    // `[SORU]…` etiketli metin. JSON'a özgü bir talimat orada gürültüdür (en kötüsü modeli
    // yanlış biçime çeken sinyal). JSON'u gereken tek yerde response_format + şema zorluyor.
    expect(ORTAK_KURALLAR).not.toContain('JSON')
  })
})

describe('ÖSYM — yazar ve denetçi AYNI cetveli kullanır', () => {
  test('zorluk merdiveni İKİ tarafta da var (tek kaynak, kayma imkânsız)', () => {
    // Eskiden merdiven YALNIZ yazardaydı: denetçiye "zor mu?" hiç sorulmuyordu, şemada alan
    // yoktu. Model kolay yazıp "zor" etiketleyince kapı fark etmiyordu (havuz: zor %3).
    expect(OSYM_YAZAR_SYSTEM).toContain(ZORLUK_MERDIVENI)
    expect(OSYM_DENETCI_SYSTEM).toContain(ZORLUK_MERDIVENI)
  })

  test('denetçi puan cetvelini görür — yoksa osymStyleScore\'un birimi yok', () => {
    // `osymStyleScore >= 4` her şeyi geçiren kapıydı ama 4'ün tanımı hiçbir yerde yazmıyordu.
    // Ölçüldü: havuzdaki 75 sorunun 66'sı TAM 4 → eşiğe yığılma. Sayı ölçmüyorsa eşik süzmez.
    expect(OSYM_DENETCI_SYSTEM).toContain(OSYM_SKOR_OLCEGI)
    expect(OSYM_SKOR_OLCEGI).toContain('osymStyleScore')
  })

  test('ZORLUK ADIM SAYISI DEĞİLDİR — iki taraf da bunu açıkça reddeder', () => {
    // KANIT (gerçek ÖSYM vs havuz, aynı cetvel): kök uzunluğu 50.3 vs 51.1 kelime — AYNI.
    // Yani üretilen sorular ÖSYM kadar uzun ama kolay. Eski merdiven "zor = 3+ adım" diyordu;
    // model bunu KUSURSUZ uyguladı ve formül zinciri üretti (bölme→orta dikme→eğim: uzun,
    // hiç tıkanmıyorsun). Gerçek ÖSYM'nin zoru kısa olabiliyor — iş, yolu BULMAKTA.
    // Merdiven adım saymaya geri dönerse bu test düşer.
    expect(ZORLUK_MERDIVENI).toContain('UZUNDUR, ZOR DEĞİLDİR')
    expect(ZORLUK_MERDIVENI).toContain('YOLUN GÖRÜNÜRLÜĞÜ')
    for (const mekanizma of ['GİRİŞ GİZLİ', 'ÖRTÜK VERİ', 'EŞ-ÇEKİMLİ ÇELDİRİCİ', 'AYIRT ETME', 'TERS YÖN']) {
      expect(ZORLUK_MERDIVENI).toContain(mekanizma)
    }
    // Hakem de adım saymamalı: yazara "adım ekleme" deyip hakeme "adım say" demek,
    // yazarın doğru davranışını cezalandıran bir cetvel kurardı.
    expect(denetciIstemi('[SORU] x', 'kanıt')).toContain('ADIM SAYMA')
  })

  test('zorluk KARŞITLIK ÖRNEĞİyle gösterilir (tarif değil)', () => {
    // "Uzun ≠ zor" soyut bir cümle; model onu okuyup yine formül zinciri yazabilir.
    // Aynı uzunlukta bir kolay ve bir zor soruyu YAN YANA görmek ölçüyü somutlaştırır.
    expect(ZORLUK_MERDIVENI).toContain('KARŞITLIK ÖRNEĞİ')
    expect(ZORLUK_MERDIVENI).toContain('UZUN AMA KOLAY')
    expect(ZORLUK_MERDIVENI).toContain('KISA AMA ZOR')
    expect(ZORLUK_MERDIVENI).toContain('KOPYALAMA') // örnek biçim içindir, içerik değil
  })

  test('denetçi istemi BAĞIMSIZ zorluk derecesi ister', () => {
    const istem = denetciIstemi('[SORU] x', 'kanıt', 'zor')
    expect(istem).toContain('actualDifficulty')
    expect(istem).toContain('zor') // sipariş edilen zorluk isteme geçer
  })

  test('denetçi istemi ÇELDİRİCİ KUŞATMASINI SORMAZ — o kural KODDA', () => {
    // utils/shufflers.celdiriciKusatmasi deterministik ve LLM'den ÖNCE çalışıyor.
    // Aynı işi bir de prompt'ta istemek ölü ağırlık: hakem soruyu gördüğünde kuşatma
    // zaten sağlanmış ya da soru onarıma gitmiş oluyor. (Altın set: ucuz hakemler
    // tam da bu kusuru kaçırıyordu — bu yüzden koda taşındı.)
    const istem = denetciIstemi('[SORU] x', 'kanıt')
    expect(istem).not.toContain('ALTINDA')
    expect(istem).not.toContain('tek yanında')
  })

  test('yazar KAPSAM DIŞI\'nı mutlak yasak olarak görür', () => {
    expect(OSYM_YAZAR_SYSTEM).toContain('KAPSAM DIŞI')
    // Zorluk ile kapsam arasındaki gerilim açıkça çözülmeli: zorlaştırmak ≠ kapsamı aşmak.
    expect(OSYM_YAZAR_SYSTEM).toContain('ZORLAŞTIRMAK, KAPSAMI AŞMAK DEĞİLDİR')
  })

  test('yazar çözümün nasıl yazılacağını bilir (örneklerde çözüm YOK)', () => {
    // Çıkmış soruların 1000/1000'inde solution = null → model çözümü örnekten öğrenemez.
    expect(OSYM_YAZAR_SYSTEM).toContain('ÇÖZÜM KURALI')
  })

  test('çözüm DERİNLİĞİ tarif değil ÖRNEKle gösterilir (few-shot)', () => {
    // "Adım adım yaz" demek, bir tane GÖSTERMEKTEN zayıftır; stil örneklerinde çözüm
    // olmadığı için (1000/1000 null) derinlik standardını charter'ın kendisi taşımalı.
    expect(OSYM_YAZAR_SYSTEM).toContain('ÇÖZÜM DERİNLİĞİ — ÖRNEK')
    expect(OSYM_YAZAR_SYSTEM).toContain('Adım 1')
    expect(OSYM_YAZAR_SYSTEM).toContain('KOPYALAMA') // örnek biçim içindir, içerik değil
  })

  test('puan cetveli SEZGİ değil KONTROL LİSTESİ dayatır', () => {
    for (const madde of ['ÖZGÜNLÜK', 'KURGU', 'ÇELDİRİCİ', 'DİL']) {
      expect(OSYM_SKOR_OLCEGI).toContain(madde)
    }
  })

  test('didaktik ton ÖSYM\'de EKSİ olarak işaretlenir', () => {
    // ÖSYM öğretmez, ölçer. "Didaktik ton" bir kalite kriteri DEĞİL, ders-kitabı kokusudur;
    // artı sayılsaydı hakem tam ters yöne puanlardı.
    expect(OSYM_SKOR_OLCEGI).toContain('ÖĞRETMEZ, ÖLÇER')
  })
})

describe('ÖSYM — MATEMATİK BİÇİMİ: charter kendi kuralını YAŞAR', () => {
  test('yazar $...$ kuralını görür', () => {
    expect(OSYM_YAZAR_SYSTEM).toContain(MATEMATIK_BICIMI)
    expect(OSYM_YAZAR_SYSTEM).toContain(COZUM_ORNEGI)
  })

  test('ÇÖZÜM ÖRNEĞİ Unicode DEĞİL LaTeX öğretir — ORİJİNAL ARIZA TAM BUYDU', () => {
    // Charter çıktı sözleşmesinde "(LaTeX korunur)" diyordu ama KENDİ few-shot örneği
    // "v = v₀ + a·t", "a = 2 m/s²", "Δv = a·t" yazıyordu. Model parantez içindeki dileği
    // değil GÖRDÜĞÜ ÖRNEĞİ taklit eder → havuza Unicode gitti, KaTeX'in çizecek şeyi olmadı.
    // Bu test örneğin Unicode'a geri kaymasını imkânsız kılar.
    for (const unicode of ['v₀', 'm/s²', 'Δv', '·']) {
      expect(COZUM_ORNEGI).not.toContain(unicode)
    }
    expect(COZUM_ORNEGI).toContain('$v = v_0 + a \\cdot t$')
  })

  test('charter’ın ÖĞRETTİĞİ LaTeX GERÇEKTEN çizilir — kendi kapımızdan geçer', () => {
    // Bozuk bir few-shot örneği örneksiz olmaktan KÖTÜDÜR: modele bozuk LaTeX öğretir, sonra
    // kendi kapımız (utils/latex) o soruları eler — parasını ödediğimiz üretimi kendi elimizle
    // çöpe attırırdık. Örnek, öğrenciye gidecek metinle AYNI ölçüye vurulur: aynı KaTeX.
    expect(latexBozuk(COZUM_ORNEGI)).toBeNull()
  })

  test('kural, kapının ELEDİĞİ üç arızayı da açıkça yasaklar (dilek ile kapı aynı şeyi söyler)', () => {
    // Kapı bir şeyi eliyor ama prompt onu yasaklamıyorsa, model o hatayı yapmaya devam eder
    // ve biz üretimi eleyip dururuz — pahalı bir sessiz döngü. İkisi aynı üç şeyi hedeflemeli.
    expect(MATEMATIK_BICIMI).toContain('$...$')       // (b) sarmalanmamış LaTeX
    expect(MATEMATIK_BICIMI).toContain('UNICODE MATEMATİK KULLANMA')
    expect(MATEMATIK_BICIMI).toContain('\\(...\\)')   // normalize'ın çevirdiği biçim
    expect(MATEMATIK_BICIMI).toContain('eşleşmemiş $') // (c) öksüz dolar
    // Formül yalnız kökte değil ŞIKTA ve ÇÖZÜMDE olur — kapı üçünü de tarıyor, kural da öyle demeli.
    expect(MATEMATIK_BICIMI).toContain('ŞIK')
    expect(MATEMATIK_BICIMI).toContain('ÇÖZÜM')
  })
})

describe('ÖSYM — yazar ve denetçi BAĞLAM PAYLAŞMAZ (format karışması imkânsız)', () => {
  test('onarım istemi denetçinin JSON şemasını TAŞIMAZ — yalnız düz metin eleştiri', () => {
    // Yazar ve denetçi AYRI LLM çağrılarıdır: yazarın system'i tagged sözleşme, denetçininki
    // JSON. Sınırı geçen tek şey `v.critique` — jsonCoz ile ayıklanmış DÜZ STRING. Yazar
    // JSON şemasını hiç görmez, dolayısıyla "iki format karışır" senaryosu doğamaz.
    const istem = onarimIstemi('[SORU] x\n[A] y', 'çeldiriciler tek yanda toplanmış', 'kanıt')
    expect(istem).not.toContain('osymStyleScore')
    expect(istem).not.toContain('verdict')
    expect(istem).not.toContain('JSON')
    expect(istem).toContain('çıktı sözleşmesine uy') // yazar KENDİ biçimine yönlendirilir
  })
})

describe('ZORLUK TARİFLERİ — aile bazında üretim reçetesi (kullanıcı kararı: ders başına değil aile başına)', () => {
  const AILELER = ['sayisal', 'kavramsal', 'metin'] as const
  const ZORLUKLAR = ['kolay', 'orta', 'zor'] as const

  test('her aile × zorluk hücresi DOLU — boş tarif sessiz gerileme olurdu', () => {
    for (const a of AILELER) for (const z of ZORLUKLAR) {
      expect(ZORLUK_TARIFI[a][z].trim().length).toBeGreaterThan(40)
    }
  })

  test('ÜÇ zor tarifi de [TASARIM] planı ister (mekanizmalardan İKİSİNİ seç)', () => {
    for (const a of AILELER) {
      expect(ZORLUK_TARIFI[a].zor).toContain('[TASARIM]')
      expect(ZORLUK_TARIFI[a].zor).toContain('İKİSİNİ')
    }
  })

  test('her zor tarifi KENDİ ailesinden gerçek, mekanizması işaretli örnek taşır', () => {
    // Ölçüldü: model tariften değil ÖRNEKTEN öğreniyor (karşıtlık örneği 9\'da 1 tuttu).
    expect(ZORLUK_TARIFI.sayisal.zor).toContain('Kutulara')
    expect(ZORLUK_TARIFI.kavramsal.zor).toContain('Hayber')
    expect(ZORLUK_TARIFI.metin.zor).toContain('kavuşturduğumuz')
  })

  test('MEKANİZMA ADLARI TEK KAYNAK: cetvelde VE denetçi isteminde birebir geçer', () => {
    // Yazar tarifle plan yapar, hakem taramayla ölçer, kod adla sayar — üçü aynı yazımı
    // görmezse "GİRİŞ GİZLİ" ile "giriş-gizli" iki ayrı şey sanılır ve zorluk türetilemez.
    const istem = denetciIstemi('[SORU] x', 'kanıt')
    for (const m of MEKANIZMALAR) {
      expect(ZORLUK_MERDIVENI).toContain(m)
      expect(istem).toContain(m)
    }
    expect(istem).toContain('"mechanisms"')
    expect(istem).toContain('kanit')
  })

  test('dersAilesi: bilinen dersler haritada, bilinmeyen ders üretimi KIRMAZ (kavramsal\'a düşer)', () => {
    expect(dersAilesi('Matematik')).toBe('sayisal')
    expect(dersAilesi('Tarih')).toBe('kavramsal')
    expect(dersAilesi('Türkçe')).toBe('metin')
    expect(AILE_DERSLERI.length).toBe(14)
    expect(dersAilesi('Astroloji')).toBe('kavramsal')
    expect(zorlukAnahtari('bilinmeyen')).toBe('orta')
  })

  test('onarım istemi [TASARIM] sözleşmesini TAŞIMAZ — onarılan soru plansız diye elenmemeli', () => {
    // Plan kapısı yalnız İLK adaya bakar (denetle başı); onarım yolu tasarım istemez.
    const istem = onarimIstemi('[SORU] x\n[A] y', 'eleştiri', 'kanıt')
    expect(istem).not.toContain('TASARIM')
  })
})
