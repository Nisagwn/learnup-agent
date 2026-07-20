/** parseTagged çıktı sözleşmesi — `bun test src/lib` */
import { expect, test, describe } from 'bun:test'
import { parseTagged, partiIkizSuz } from './generation.js'

const govde = (cozum: string) =>
  `[SORU] Bir araç 4 m/s hızla giderken 2 m/s² ivmeyle hızlanıyor. 3 s sonra hızı kaçtır?
[A] 6
[B] 8
[C] 10
[D] 12
[E] 14
[DOGRU] C
[COZUM] ${cozum}
[KAZANIM] FİZ.11.1.1
[ZORLUK] orta`

describe('partiIkizSuz — parti-içi ikiz süzgeci', () => {
  // GERÇEK VAKA (2026-07-20): v4-pro'nun aynı hücrede yazdığı ikizler — ölçülen benzerlik
  // 0.620; eski Matematik eşiği (0.75) geçirmişti, ikisi de havuza yazıldı.
  const ikizA = 'Dik koordinat sisteminde $A(a, 2)$ noktasının $B(1, -1)$ noktasına olan uzaklığı $5$ birimdir. Buna göre $a$ nın alabileceği değerlerin toplamı kaçtır?'
  const ikizB = "Dik koordinat düzleminde A(2, a) noktasının B(–1, 2) noktasına uzaklığı 5 birimdir. Buna göre a'nın alabileceği değerlerin toplamı kaçtır?"
  const farkli = 'Bir dışbükey çokgenin bir köşesinden çizilen köşegenlerin oluşturduğu üçgen sayısı 7 olduğuna göre, bu çokgenin köşegen sayısı kaçtır?'

  test('gerçek ikiz çifti: ikincisi elenir, ilki kalır', () => {
    const { essiz, elenen } = partiIkizSuz([{ soru: ikizA }, { soru: ikizB }], [], 'Matematik')
    expect(essiz).toHaveLength(1)
    expect(essiz[0].soru).toBe(ikizA)
    expect(elenen).toHaveLength(1)
    expect(elenen[0].benzerlik).toBeGreaterThanOrEqual(0.62)
  })

  test('farklı sorular geçer', () => {
    const { essiz, elenen } = partiIkizSuz([{ soru: ikizA }, { soru: farkli }], [], 'Matematik')
    expect(essiz).toHaveLength(2)
    expect(elenen).toHaveLength(0)
  })

  test('bu koşuda KABUL EDİLMİŞLERE karşı da süzer (oncekiler)', () => {
    const { essiz, elenen } = partiIkizSuz([{ soru: ikizB }], [{ soru: ikizA }], 'Matematik')
    expect(essiz).toHaveLength(0)
    expect(elenen).toHaveLength(1)
  })
})

describe('parseTagged — NUMARALI etiket (ucuz modellerin yazım biçimi)', () => {
  // ÖLÇÜLDÜ (gemma-4-26b:free): çoklu soru istenince etiketler numaralanıyor (`[SORU 1]`).
  // Eski desen bunu tanımıyordu → kusursuz sorular SESSİZCE yitiyor, hücre "0 aday" veriyordu.
  const numarali = (n: number, harf: string) =>
    `[SORU ${n}] ${n}. soru: bir araç 4 m/s hızla giderken 2 m/s² ivmeyle hızlanıyor. 3 s sonra hızı kaçtır?
[A] 6
[B] 8
[C] 10
[D] 12
[E] 14
[DOGRU] ${harf}
[COZUM] v = v0 + a·t bağıntısı kullanılır. v = 4 + 2·3 = 10 m/s bulunur, bu ${harf} şıkkıdır.`

  test('[SORU 1] biçimi tanınır', () => {
    const q = parseTagged(numarali(1, 'C'))
    expect(q).toHaveLength(1)
    expect(q[0].dogru).toBe('C')
  })

  test('numaralı etiketle ÇOKLU soru ayrıştırılır', () => {
    const q = parseTagged(`${numarali(1, 'C')}\n${numarali(2, 'C')}`)
    expect(q).toHaveLength(2)
  })

  test('[SORU-3] ve [SORU4] biçimleri de tanınır', () => {
    expect(parseTagged(numarali(3, 'C').replace('[SORU 3]', '[SORU-3]'))).toHaveLength(1)
    expect(parseTagged(numarali(4, 'C').replace('[SORU 4]', '[SORU4]'))).toHaveLength(1)
  })
})

describe('parseTagged — çözüm kapısı', () => {
  test('gerçek çözümü olan soru GEÇER', () => {
    const q = parseTagged(govde('v = v0 + a·t bağıntısı kullanılır. v = 4 + 2·3 = 10 m/s bulunur, bu C şıkkıdır.'))
    expect(q).toHaveLength(1)
    expect(q[0].dogru).toBe('C')
    expect(q[0].siklar.C).toBe('10')
  })

  test('BOŞ çözüm ELENİR (eskiden sessizce havuza girerdi)', () => {
    expect(parseTagged(govde(''))).toHaveLength(0)
  })

  test('"Cevap C\'dir" çözüm DEĞİLDİR → elenir', () => {
    expect(parseTagged(govde("Cevap C'dir."))).toHaveLength(0)
  })

  test('[COZUM] etiketi HİÇ yoksa elenir', () => {
    const eksik = `[SORU] Soru metni burada yeterince uzun bir cümledir.
[A] 6
[B] 8
[C] 10
[D] 12
[E] 14
[DOGRU] C
[ZORLUK] orta`
    expect(parseTagged(eksik)).toHaveLength(0)
  })

  test('çok satırlı çözüm birleştirilir ve geçer', () => {
    const cok = `[SORU] Bir araç 4 m/s hızla gidiyor, 2 m/s² ivmeyle hızlanıyor.
[A] 6
[B] 8
[C] 10
[D] 12
[E] 14
[DOGRU] C
[COZUM] Önce bağıntı yazılır: v = v0 + a·t
Sayılar yerine konur: v = 4 + 2·3
Sonuç 10 m/s olup C şıkkıdır.
[ZORLUK] zor`
    const q = parseTagged(cok)
    expect(q).toHaveLength(1)
    expect(q[0].cozum).toContain('bağıntı')
    expect(q[0].cozum).toContain('C şıkkıdır')
    expect(q[0].zorluk).toBe('zor')
  })
})

describe('parseTagged — [TASARIM] sözleşmesi', () => {
  const GOVDE = [
    '[A] 1', '[B] 2', '[C] 3', '[D] 4', '[E] 5', '[DOGRU] C',
    '[COZUM] Adım adım çözüm burada; test için yeterince uzun bir açıklama metni.',
    '[KAZANIM] MAT.10.3.2', '[ZORLUK] zor',
  ].join('\n')

  test('[TASARIM] sorudan ÖNCE gelir ve o soruya iliştirilir (öğrenci alanlarına SIZMAZ)', () => {
    const [q] = parseTagged(`[TASARIM] GİRİŞ GİZLİ + ÖRTÜK VERİ\n[SORU] Deneme kökü?\n${GOVDE}`)
    expect(q.tasarim).toBe('GİRİŞ GİZLİ + ÖRTÜK VERİ')
    expect(q.soru).toBe('Deneme kökü?')          // tasarım köke yapışmadı
    expect(q.cozum).not.toContain('TASARIM')     // çözüme de sızmadı
  })

  test('[TASARIM] iki soru arasında: İKİNCİ soruya gider, ilkine bulaşmaz', () => {
    const metin =
      `[SORU] Birinci kök?\n${GOVDE}\n[TASARIM] AYIRT ETME + TERS YÖN\n[SORU] İkinci kök?\n${GOVDE}`
    const [q1, q2] = parseTagged(metin)
    expect(q1.tasarim).toBeUndefined()
    expect(q2.tasarim).toBe('AYIRT ETME + TERS YÖN')
  })

  test('[TASARIM] yokluğu soruyu DÜŞÜRMEZ (kolay/orta siparişinde plan istenmez)', () => {
    const [q] = parseTagged(`[SORU] Plansız kök?\n${GOVDE}`)
    expect(q.soru).toBe('Plansız kök?')
    expect(q.tasarim).toBeUndefined()
  })
})
