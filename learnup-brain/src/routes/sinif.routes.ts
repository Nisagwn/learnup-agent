import { Router } from 'express'
import { supabase } from '../clients/supabase.js'
import { kimlikAl, kimligiUnut, sinifiUnut } from '../lib/yetki.js'
import { HttpHatasi, bulunamadi, gecersizIstek } from '../lib/hata.js'

/**
 * SINIF KAYDI — ÖĞRENCİ TARAFI.
 *
 * ⚠️ Bu akış NEDEN VAR: `profiles.teacher_id` şemada 0001'den beri duruyor ama kod
 * tabanında onu YAZAN tek bir satır yoktu. Sınıf modeli vardı, KAYIT MEKANİZMASI yoktu →
 * her öğretmen boş sınıf görüyordu. (Ölçüldü: canlıda 3 öğrencinin 3'ünde de NULL.)
 *
 * ⚠️ YETKİ SINIRI: servis service-role kullanır → RLS bypass. Öğrenci YALNIZ KENDİ
 * satırını değiştirebilir; hedef satır her zaman `req.userId`'dir, gövdeden ASLA gelmez.
 *
 * LLM çağırmaz → standardLimiter yeterli. Limiter aynı zamanda kod deneme
 * (brute-force) yüzeyini de daraltır; kod 6 haneli hex (16^6 ≈ 16.7M).
 */
export const sinifRouter = Router()

/** GET /api/v1/sinif — "hangi sınıftayım?" (öğrencinin kendi görünümü) */
sinifRouter.get('/', async (req, res, next) => {
  try {
    const kimlik = await kimlikAl(req.userId!)
    if (!kimlik.teacherId) {
      res.json({ kayitli: false, ogretmen: null })
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, school, class_code')
      .eq('id', kimlik.teacherId)
      .maybeSingle()
    res.json({
      kayitli: true,
      ogretmen: data
        ? { id: data.id, name: data.name ?? null, school: data.school ?? null, classCode: data.class_code ?? null }
        : null,
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/sinif/katil — body: { classCode } */
sinifRouter.post('/katil', async (req, res, next) => {
  try {
    const userId = req.userId!
    const ham = String((req.body as { classCode?: unknown })?.classCode ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9]{4,12}$/.test(ham)) {
      throw gecersizIstek('gecersiz_kod', 'Sınıf kodu geçersiz görünüyor.')
    }

    const kimlik = await kimlikAl(userId)
    // Öğretmen/yönetici kendi sınıfına öğrenci olarak katılamaz — teacher_id
    // öğrenci alanıdır; öğretmene yazmak sinif_mevcudu'nda döngü üretirdi.
    if (kimlik.role !== 'student') {
      throw new HttpHatasi(403, 'ogrenci_degil', 'Yalnızca öğrenci hesapları sınıfa katılabilir.')
    }

    const { data: ogretmen, error } = await supabase
      .from('profiles')
      .select('id, name, school, class_code, is_approved')
      .eq('role', 'teacher')
      .eq('class_code', ham)
      .maybeSingle()
    if (error) throw new HttpHatasi(500, 'kod_okunamadi', 'Sınıf kodu doğrulanamadı.')
    // Kod yanlış da olsa, öğretmen onaysız da olsa AYNI mesaj: hangi kodların
    // gerçek olduğunu sızdırmayalım (numaralandırma yüzeyi).
    if (!ogretmen || ogretmen.is_approved !== true) {
      throw bulunamadi('sinif_bulunamadi', 'Bu koda ait bir sınıf bulunamadı.')
    }

    const oncekiOgretmen = kimlik.teacherId
    if (oncekiOgretmen === ogretmen.id) {
      res.json({
        katildi: true,
        degisti: false,
        ogretmen: { id: ogretmen.id, name: ogretmen.name ?? null, classCode: ogretmen.class_code ?? null },
      })
      return
    }

    const { error: yazHata } = await supabase
      .from('profiles')
      .update({ teacher_id: ogretmen.id })
      .eq('id', userId)
      .eq('role', 'student') // yarış koruması: rol arada değiştiyse yazma
    if (yazHata) throw new HttpHatasi(500, 'katilim_yazilamadi', 'Sınıfa katılım kaydedilemedi.')

    // Önbellekleri düşür: kendi kimliği (teacherId değişti) + İKİ öğretmenin mevcudu.
    // Eski öğretmen unutulmazsa ayrılan öğrenci onun listesinde 60sn daha görünür.
    await kimligiUnut(userId)
    sinifiUnut(ogretmen.id)
    if (oncekiOgretmen) sinifiUnut(oncekiOgretmen)

    res.json({
      katildi: true,
      degisti: true,
      oncekiSinifVardi: Boolean(oncekiOgretmen),
      ogretmen: { id: ogretmen.id, name: ogretmen.name ?? null, classCode: ogretmen.class_code ?? null },
    })
  } catch (err) {
    next(err)
  }
})

/** POST /api/v1/sinif/ayril — öğrenci kendi kaydını siler. */
sinifRouter.post('/ayril', async (req, res, next) => {
  try {
    const userId = req.userId!
    const kimlik = await kimlikAl(userId)
    if (!kimlik.teacherId) {
      res.json({ ayrildi: false, neden: 'zaten_sinifsiz' })
      return
    }
    const { error } = await supabase
      .from('profiles')
      .update({ teacher_id: null })
      .eq('id', userId)
      .eq('role', 'student')
    if (error) throw new HttpHatasi(500, 'ayrilma_yazilamadi', 'Sınıftan ayrılma kaydedilemedi.')

    await kimligiUnut(userId)
    sinifiUnut(kimlik.teacherId)
    res.json({ ayrildi: true })
  } catch (err) {
    next(err)
  }
})
