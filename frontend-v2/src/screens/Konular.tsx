import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiGet, apiPost } from '../lib/api.js'
import { supabase } from '../lib/supabase.js'
import { useAuth } from '../lib/auth'
import { useAsync } from '../lib/useAsync'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { Sayfa, PanoIskeleti } from '../components/RolGecidi'
import { GlowButton } from '../components/ui'
import { Reveal } from '../components/fx'
import type { KonularYaniti, KonuDersi, KonuUnitesi, KonuOgesi } from '../lib/types'

/**
 * KONULAR — ders → ünite → konu (0026 konu katmanı, 0031 üniteler).
 *
 * ÜÇ SEVİYE, kart ızgarası. Kullanıcı kararı (2026-07-27): "ileride havuz genişleyecek,
 * ona göre bir tasarım yap, Kunduz'daki gibi görünebilir konular."
 *
 * ⚠️ SEYREK HAVUZ ENDİŞESİ KAYITLI: bugün ~310 çözülebilir soru 813 konuya dağılıyor,
 * yani konuların çoğu boş. Kart deseni boşluğu vitrine koyar. Karar bilinçli alındı —
 * havuz büyüdükçe bu düzen dolacak. O yüzden kartlar UYDURMA metinle doldurulmadı: her
 * sayı gerçek (konu adedi, soru adedi, öğrencinin kendi ilerlemesi ve başarısı). Sorusu
 * olmayan ünite "yakında" der ve tıklanmaz — dolu gibi görünüp boş sayfa açmaktansa
 * dürüst durur.
 *
 * ⚠️ BOŞ KONULAR GİZLENMEZ (kullanıcı kararı 2026-07-29: "boş da olsa tüm konular
 * gösterilsin"). Önceki sürümde sorusu olmayan konular gizliydi ve bir düğmeyle açılıyordu.
 * 0032 sözlüğü 313'ten 813 konuya inceltince bu ters etkiye döndü: öğrenci "Türev" altında
 * 11 alt başlık olduğunu göremiyor, ekran havuzun darlığını müfredatın kendisiymiş gibi
 * gösteriyordu. Bu liste bir ENVANTER değil MÜFREDAT HARİTASI.
 *
 * ⚠️ AÇIKLAMA CÜMLESİ YOK — KASTEN. Referanstaki kartlarda pazarlama cümlesi var
 * ("Dedektif Kunduz'la ... var mısın?"); bu hem projenin düz-isimlendirme kuralına aykırı
 * hem de 70 ünite için bakımı olmayan bir metin borcu. Onun yerine kartta o ünitenin İLK
 * KONULARI önizleniyor: bakımsız, her zaman doğru ve öğrenciye daha bilgilendirici.
 *
 * ⚠️ MEB HİYERARŞİSİ ÇİZİLMEZ. Sınıf (9-12) ve MEB ünite slug'ları arayüze çıkmaz.
 */
const ALANLAR = [
  { v: 'sayisal', etiket: 'Sayısal' },
  { v: 'esit_agirlik', etiket: 'Eşit Ağırlık' },
  { v: 'sozel', etiket: 'Sözel' },
] as const

/** Bu adedin altındaki konu seçilince üretim öncelik sinyali yazılır (0028). */
const SEYREK_ESIK = 10

const yuzde = (pay: number, payda: number): number => (payda > 0 ? Math.round((pay / payda) * 100) : 0)

export function Konular() {
  const nav = useNavigate()
  const { user } = useAuth()
  const [dersAdi, setDersAdi] = useState<string | null>(null)
  const [uniteAnahtari, setUniteAnahtari] = useState<string | null>(null)
  const [alanYaziliyor, setAlanYaziliyor] = useState(false)

  // ⚠️ MÜFREDATIN TAMAMI HER ZAMAN GÖRÜNÜR (`tumu: 1` sabit).
  // Önce sorusu olmayan konular gizleniyor, bir düğmeyle açılıyordu. Sözlük 813 konuya
  // inince bu ters etki yaptı: öğrenci "Türev" altında 11 alt başlık olduğunu göremiyor,
  // ekran havuzun bugünkü darlığını müfredatın kendisiymiş gibi gösteriyordu. Konu listesi
  // bir ENVANTER değil, MÜFREDAT HARİTASI — soru yokluğu konuyu yok saymaz, "yakında"
  // rozetiyle gösterir ve boş konuya tıklamak talep kaydı düşürür (üretim sırasını belirler).
  const veri = useAsync<KonularYaniti>(() => apiGet('/questions/ai/konular', { tumu: 1 }), [])

  // ⚠️ `uniteler` TEK NOKTADA normalize edilir. Sunucu bu alanı 0031 ile kazandı; eski bir
  // imaj (ya da ileride kısmi bir yanıt) onsuz dönerse DersKarti `uniteler.length` okurken
  // tüm ekran ErrorBoundary'ye düşüyordu — ölçüldü. Eksik alan boş listedir, çökme değil:
  // ders "0 Ünite" görünür, kullanıcı diğer derslere erişmeye devam eder.
  const dersler = useMemo(
    () => (veri.data?.dersler ?? []).map((d) => ({ ...d, uniteler: d.uniteler ?? [] })),
    [veri.data],
  )
  const alan = veri.data?.alan ?? null
  const ders = useMemo(() => dersler.find((d) => d.subject === dersAdi) ?? null, [dersler, dersAdi])
  const unite = useMemo(
    () => ders?.uniteler.find((u) => `${u.sinav}|${u.ad}` === uniteAnahtari) ?? null,
    [ders, uniteAnahtari],
  )
  const toplam = useMemo(() => dersler.reduce((s, d) => s + d.toplam, 0), [dersler])

  const alanSec = async (deger: string) => {
    if (!user || alanYaziliyor) return
    setAlanYaziliyor(true)
    try {
      const { error } = await supabase.from('profiles').update({ alan: deger }).eq('id', user.id)
      if (!error) veri.reload()
    } finally {
      setAlanYaziliyor(false)
    }
  }

  const coz = (k: KonuOgesi) => {
    if (k.soruSayisi === 0 || !ders) return
    if (k.soruSayisi < SEYREK_ESIK) {
      void apiPost('/questions/ai/konu-talep', { konuId: k.konuId }).catch(() => {})
    }
    nav('/coz', {
      state: { source: 'konu', konuId: k.konuId, subject: ders.subject, title: `${ders.subject} — ${k.ad}` },
    })
  }

  if (veri.loading && !veri.data) return <PanoIskeleti sutun={1} />

  if (veri.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Konular alınamadı: {veri.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => veri.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  return (
    <Sayfa>
      {/* KIRINTI YOLU — üç seviyede de nerede olduğunu ve nasıl geri döneceğini gösterir.
          Seviye state'te tutuluyor (rota değil): geri tuşu uygulamadan çıkarmasın diye
          değil, aksine bu ekranın tek bir görevi var ve üç adımı da aynı görevin parçası. */}
      <Reveal>
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px]" aria-label="Konum">
          <button
            type="button"
            onClick={() => { setDersAdi(null); setUniteAnahtari(null) }}
            className={cn('cursor-pointer font-semibold', !ders && 'pointer-events-none')}
            style={{ color: ders ? 'var(--yaprak)' : 'var(--metin1)' }}
          >
            Konular
          </button>
          {ders && (
            <>
              <Icon name="chevronRight" size={13} color="var(--metin3)" />
              <button
                type="button"
                onClick={() => setUniteAnahtari(null)}
                className={cn('cursor-pointer font-semibold', !unite && 'pointer-events-none')}
                style={{ color: unite ? 'var(--yaprak)' : 'var(--metin1)' }}
              >
                {ders.subject}
              </button>
            </>
          )}
          {unite && (
            <>
              <Icon name="chevronRight" size={13} color="var(--metin3)" />
              <span className="font-semibold" style={{ color: 'var(--metin1)' }}>{unite.ad}</span>
            </>
          )}
        </nav>
      </Reveal>

      {/* Alan + boş konu anahtarı YALNIZ ders listesinde: alt seviyelerde gürültü olur. */}
      {!ders && (
        <Reveal>
          <div
            className="mb-5 rounded-2xl px-4 py-3.5"
            style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)' }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold" style={{ color: 'var(--metin2)' }}>Alanın:</span>
              {ALANLAR.map((a) => (
                <button
                  key={a.v}
                  type="button"
                  disabled={alanYaziliyor}
                  onClick={() => alanSec(a.v)}
                  className={cn(
                    'cursor-pointer rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-all',
                    alanYaziliyor && 'opacity-60',
                  )}
                  style={
                    alan === a.v
                      ? {
                          background: 'color-mix(in srgb, var(--yaprak) 16%, transparent)',
                          color: 'var(--yaprak)',
                          border: '1px solid color-mix(in srgb, var(--yaprak) 35%, transparent)',
                        }
                      : { background: 'var(--ic)', color: 'var(--metin2)', border: '1px solid transparent' }
                  }
                >
                  {a.etiket}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11.5px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
              {alan
                ? `TYT dersleri herkeste görünür; AYT dersleri alanına göre listelenir. Havuzda ${toplam} soru var.`
                : 'Alanını seçmedin — şu an yalnız TYT dersleri görünüyor. Seçersen AYT dersleri de eklenir.'}
            </p>
          </div>
        </Reveal>
      )}

      {/* ═══ SEVİYE 1 — DERSLER ═══ */}
      {!ders && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {dersler.map((d) => (
            <Reveal key={d.subject}>
              <DersKarti ders={d} onSec={() => { setDersAdi(d.subject); setUniteAnahtari(null) }} />
            </Reveal>
          ))}
          {dersler.length === 0 && (
            <div
              className="col-span-full rounded-2xl px-6 py-8 text-center"
              style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)' }}
            >
              {/* Liste artık havuza bağlı değil (tüm konular görünür); ders yoksa sebep
                  kapsamdır — alan seçilmemiş ya da hiçbir ders TYT/alan filtresini geçmiyor. */}
              <p className="text-sm" style={{ color: 'var(--metin2)' }}>
                Gösterilecek ders yok. Alanını seçersen AYT dersleri de listelenir.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ═══ SEVİYE 2 — ÜNİTELER ═══ */}
      {ders && !unite && (
        <>
          <h2 className="mb-3 text-[17px] font-bold" style={{ color: 'var(--metin1)' }}>Üniteler</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ders.uniteler.map((u) => (
              <Reveal key={`${u.sinav}|${u.ad}`}>
                <UniteKarti unite={u} onSec={() => setUniteAnahtari(`${u.sinav}|${u.ad}`)} />
              </Reveal>
            ))}
            {ders.uniteler.length === 0 && (
              <div
                className="col-span-full rounded-2xl px-6 py-8 text-center"
                style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)' }}
              >
                <p className="text-sm" style={{ color: 'var(--metin2)' }}>
                  Bu derste henüz çözülebilir soru yok.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {/* ═══ SEVİYE 3 — KONULAR ═══ */}
      {ders && unite && (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[17px] font-bold" style={{ color: 'var(--metin1)' }}>{unite.ad}</h2>
            <span className="text-[12.5px] font-semibold" style={{ color: 'var(--metin3)' }}>
              {unite.konular.length} konu · {unite.toplam} soru
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {unite.konular.map((k) => {
              const bos = k.soruSayisi === 0
              return (
                <button
                  key={k.konuId}
                  type="button"
                  disabled={bos}
                  onClick={() => coz(k)}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-colors',
                    bos ? 'cursor-default' : 'cursor-pointer hover:brightness-[0.98]',
                  )}
                  style={{
                    background: 'var(--cam)',
                    border: '1px solid var(--cam-kenar)',
                    opacity: bos ? 0.55 : 1,
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[14px] font-semibold" style={{ color: 'var(--metin1)' }}>
                      {k.ad}
                    </span>
                    {k.soruSayisi > 0 && (
                      <span className="mt-0.5 text-[11px]" style={{ color: 'var(--metin3)' }}>
                        {k.kolay} kolay · {k.orta} orta · {k.zor} zor
                        {k.cozulen > 0 && ` — ${k.cozulen} çözdün`}
                      </span>
                    )}
                  </span>
                  <span
                    className="shrink-0 text-[12.5px] font-semibold"
                    style={{ color: bos ? 'var(--metin3)' : 'var(--yaprak)' }}
                  >
                    {bos ? 'yakında' : `${k.soruSayisi} soru`}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Sayfa>
  )
}

/** Ders kartı — ünite/konu/soru sayıları ve öğrencinin kendi ilerlemesi. */
function DersKarti({ ders, onSec }: { ders: KonuDersi; onSec: () => void }) {
  const tamamlandi = yuzde(ders.cozulen, ders.toplam)
  const basari = yuzde(ders.dogru, ders.cozulen)
  return (
    <button
      type="button"
      onClick={onSec}
      className="flex h-full w-full cursor-pointer flex-col rounded-2xl px-4 py-4 text-left transition-transform hover:-translate-y-0.5"
      style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
    >
      <span className="flex items-center gap-2">
        <span className="text-[15.5px] font-bold" style={{ color: 'var(--metin1)' }}>{ders.subject}</span>
        {ders.ayt && (
          <span
            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
            style={{ background: 'color-mix(in srgb, var(--yaprak) 14%, transparent)', color: 'var(--yaprak)' }}
          >
            AYT
          </span>
        )}
      </span>
      <span className="mt-2 text-[12px]" style={{ color: 'var(--metin2)' }}>
        {ders.uniteler.length} Ünite · {ders.konuSayisi} Konu · {ders.toplam} Soru
      </span>
      <IlerlemeSeridi tamamlandi={tamamlandi} basari={basari} cozulen={ders.cozulen} />
    </button>
  )
}

/** Ünite kartı — konu önizlemesi + sayılar + ilerleme. */
function UniteKarti({ unite, onSec }: { unite: KonuUnitesi; onSec: () => void }) {
  const bos = unite.toplam === 0
  const tamamlandi = yuzde(unite.cozulen, unite.toplam)
  const basari = yuzde(unite.dogru, unite.cozulen)
  // Açıklama cümlesi yerine ilk konular: bakımsız ve her zaman doğru.
  const onizleme = unite.konular.slice(0, 4).map((k) => k.ad).join(' · ')
  const kalan = unite.konular.length - 4

  return (
    <button
      type="button"
      disabled={bos}
      onClick={onSec}
      className={cn(
        'flex h-full w-full flex-col rounded-2xl px-4 py-4 text-left transition-transform',
        bos ? 'cursor-default' : 'cursor-pointer hover:-translate-y-0.5',
      )}
      style={{
        background: 'var(--cam)',
        border: '1px solid var(--cam-kenar)',
        boxShadow: 'var(--golge)',
        opacity: bos ? 0.55 : 1,
      }}
    >
      <span className="flex items-start justify-between gap-2">
        <span className="text-[15px] font-bold" style={{ color: 'var(--metin1)' }}>{unite.ad}</span>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold"
          style={{ background: 'var(--ic)', color: 'var(--metin3)' }}
        >
          {unite.sinav}
        </span>
      </span>

      <span className="mt-1.5 line-clamp-2 text-[11.5px] leading-relaxed" style={{ color: 'var(--metin3)' }}>
        {onizleme}{kalan > 0 && ` · +${kalan}`}
      </span>

      <span className="mt-2.5 text-[12px] font-semibold" style={{ color: 'var(--metin2)' }}>
        {unite.konular.length} Konu · {bos ? 'yakında' : `${unite.toplam} Soru`}
      </span>

      {!bos && <IlerlemeSeridi tamamlandi={tamamlandi} basari={basari} cozulen={unite.cozulen} />}
    </button>
  )
}

/**
 * İLERLEME ŞERİDİ — "%N Tamamlandı · %N Başarı".
 * ⚠️ Hiç çözülmemişken BAŞARI GÖSTERİLMEZ: 0/0'dan "%0 Başarı" basmak, öğrenciye hiç
 * denemediği bir konuda başarısız olduğunu söylemek olurdu.
 */
function IlerlemeSeridi({ tamamlandi, basari, cozulen }: { tamamlandi: number; basari: number; cozulen: number }) {
  return (
    <span className="mt-auto block pt-3">
      <span className="block h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--ic)' }}>
        <span
          className="block h-full rounded-full"
          style={{ width: `${tamamlandi}%`, background: 'var(--yaprak)' }}
        />
      </span>
      <span className="mt-1.5 flex items-center justify-between text-[11px]" style={{ color: 'var(--metin3)' }}>
        <span>%{tamamlandi} tamamlandı</span>
        {cozulen > 0 && <span>%{basari} başarı</span>}
      </span>
    </span>
  )
}
