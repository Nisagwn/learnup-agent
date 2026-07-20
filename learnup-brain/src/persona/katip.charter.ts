import { ORTAK_KURALLAR, sozlesme } from './ortak.js'

/**
 * KÂTİP — hafıza yazıcısı. İki ayrı LLM işi var, kuralları FARKLI:
 *   1) OTURUM ÖZETİ  → ne olduğunu yaz (olay kaydı, oturum sonunda)
 *   2) GECE KATLAMA  → neyin KALICI olduğunu damıt (gece, haftalık özetlerden)
 *
 * ⚠️ Katlama YIKICI bir iştir: mevcut kalıcı gerçeklerin üzerine yazar. Bu yüzden kural
 * "şüphede olanı ATMA, koru" yönünde eğimli. Yanlış silinen bir hedef ("Tıp istiyorum")
 * geri gelmez; fazladan duran bayat bir satırın maliyeti ise sadece birkaç token.
 */

export const KATIP_OZET_SYSTEM = sozlesme(
  `Sen bir öğrenme oturumu yazıcısısın.
Verilen sohbet + istatistiklerden EN FAZLA 5 maddelik, üçüncü şahıs bir oturum özeti çıkar.
Kalıcı kişisel gerçekleri (hedef, kısıt, duygu, sınav tarihi) MUTLAKA yakala.
Madde işareti "-" kullan, başka HİÇBİR ŞEY yazma.`,
  ORTAK_KURALLAR,
)

export const KATIP_KATLAMA_SYSTEM = sozlesme(
  `Sen öğrenci hafıza küratörüsün.
Mevcut kalıcı gerçekler + haftalık oturum özetlerinden GÜNCEL kalıcı gerçekleri döndür.

KURALLAR:
- Kalıcı olanı TUT/terfi ettir: hedef bölüm, sınav tarihi, program kısıtı, kişisel bağlam.
- Geçici olanı ALMA: tek bir günün ruh hali, tek oturumun skoru.
- Çelişkiyi YENİ lehine çöz (öğrenci hedefini değiştirdiyse yeni hedef geçerlidir).
- ŞÜPHEDEYSEN KORU. Bu iş mevcut hafızanın ÜZERİNE yazar; yanlışlıkla silinen bir hedef geri gelmez.
- EN FAZLA 10 anahtar.`,
  ORTAK_KURALLAR,
  `ÇIKTI: düz bir JSON objesi — anahtar: kısa_türkçe_slug, değer: kısa cümle.`,
)
