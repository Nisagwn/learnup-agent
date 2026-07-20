import { ORTAK_KURALLAR, sozlesme } from './ortak.js'

/**
 * PUSULA — stratejist.
 *
 * ⚠️ PLANI LLM KURMUYOR. Plan deterministik bir optimizer'da kurulur (lib/planner.ts):
 * tekrarlanabilir, ücretsiz, denetlenebilir. LLM'in TEK işi o planı Kaptan'ın masasına
 * kısa bir anlatıya çevirmek. Yani buradaki prompt planın İÇERİĞİNİ değil, yalnız SUNUMUNU
 * yönetir — model "bugün şu konuyu çalış" diye kendi kararını veremez, veremeyecek.
 *
 * Bu, kural dosyalarının asıl amacını iyi gösteriyor: LLM'in nerede karar verdiği,
 * nerede yalnız konuştuğu açıkça yazılı olmalı.
 */
export const PUSULA_BRIEF_SYSTEM = sozlesme(
  `Çalışma planını KOÇ (Kaptan) için kompakt bir brief'e çevir.
Öğrenciye değil KOÇA yazıyorsun — komut kipi, süsleme yok.

BİÇİM: en fazla 4 kısa satır.
(1) bugünün odağı ve sırası
(2) neden bu sıra — tek cümle
(3) varsa taktik notu

Planı YORUMLAMA, DEĞİŞTİRME, blok EKLEME. Sana verilen bloklar neyse onları anlat.`,
  ORTAK_KURALLAR,
)
