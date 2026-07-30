import { useState } from 'react'
import { apiGet } from '../../lib/api'
import { useAsync } from '../../lib/useAsync'
import { dersAnahtar } from '../../lib/format'
import type { AdminHavuzYaniti } from '../../lib/types.admin'
import { Sayfa, PanoIskeleti } from '../../components/RolGecidi'
import { GlowButton, SubjectName } from '../../components/ui'
import { CanliSayi, Sayi } from '../../components/cekirdek'
import { Reveal } from '../../components/fx'
import { DersKapsamaTablosu, KaliteHistogrami, OlcumYok, ZorlukDagilimi } from '../../components/kule'
import { SorularSekmesi, KapsamaSekmesi } from '../../components/havuz-moderasyon'

/**
 * SORU HAVUZU — havuz kâşif sayfası (FİDAN v1.2 inline desen, `sh-*` scoped;
 * onaylı önizleme: docs/design/onizleme/soru-havuzu.html, 2026-07-23).
 *
 * ⚠️ MOCK YOK. Tek gerçek uç: GET /admin/havuz. Ölçülmeyen her yer `OlcumYok`
 * (ort. kalite eval koşmadıysa "—") — null ≠ 0.
 *
 * TELİF (§18 · kehribar RAFTA): ÖSYM sayısı görünür çünkü bu YÖNETİCİ iç
 * operasyonudur — hiçbir öğrenci/öğretmen yüzüne yayın yok. Ama eski brass/
 * kehribar kimlik rengi KULLANILMAZ: ÖSYM değeri nötr TOPRAK tonunda + "yalnız
 * iç kaynak (RAG)" etiketiyle gösterilir.
 *
 * HERO YOK: tek bir büyük gösterge yok, hepsi eşit ağırlıkta (sayfa başına ≤1
 * ışık kuralı TAVANDIR, kota değil). sh-* sınıfları KaliteHistogrami/
 * ZorlukDagilimi/DersKapsamaTablosu bileşenlerince de tüketilir — o üç bileşen
 * yalnız bu ekrandan render edilir (grep-doğrulandı).
 */
export function SoruHavuzu() {
  const [sekme, setSekme] = useState<'ozet' | 'sorular' | 'kapsama'>('ozet')
  const havuz = useAsync<AdminHavuzYaniti>(() => apiGet('/admin/havuz'), [])

  if (havuz.loading) return <PanoIskeleti sutun={2} />
  if (havuz.error) {
    return (
      <Sayfa>
        <div
          className="mx-auto max-w-md rounded-2xl px-6 py-8 text-center"
          style={{ background: 'var(--cam)', border: '1px solid var(--cam-kenar)', boxShadow: 'var(--golge)' }}
        >
          <p className="text-sm" style={{ color: 'var(--metin2)' }}>Havuz verisi alınamadı: {havuz.error}</p>
          <GlowButton className="mt-4" variant="outline" onClick={() => havuz.reload()}>Tekrar dene</GlowButton>
        </div>
      </Sayfa>
    )
  }

  const h = havuz.data!
  const kapsanmayan = h.kapsama.kazanimToplam - h.kapsama.herhangiKapsanan

  // ── Ders başına toplam soru (ÖSYM + AI) — kapsama tablosunun "Soru" sütunu.
  //    Gerçek sayılar; bir ders eşleşmezse tabloda "—" gösterilir (null ≠ 0). ──
  const soruSayilari: Record<string, number> = {}
  for (const d of h.osym.dersler) soruSayilari[d.subject] = (soruSayilari[d.subject] ?? 0) + d.count
  for (const d of h.ai.dersler) soruSayilari[d.subject] = (soruSayilari[d.subject] ?? 0) + d.count

  return (
    <Sayfa>
      <style>{`
        .sh-kart { position: relative; background: var(--cam); backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px); border: 1px solid var(--cam-kenar); border-radius: 20px;
          box-shadow: var(--golge); }
        .sh-baslik { padding: 16px 22px; display: flex; align-items: flex-start; justify-content: space-between;
          gap: 14px; flex-wrap: wrap; }
        .sh-baslik h1 { font-family: Outfit, sans-serif; font-weight: 800; font-size: clamp(20px, 2.4vw, 24px);
          color: var(--metin1); letter-spacing: -0.01em; }
        .sh-baslik .alt { font-size: 12.5px; color: var(--metin3); margin-top: 4px; line-height: 1.5; max-width: 560px; }
        .sh-durum { flex: 0 0 auto; font-family: 'JetBrains Mono', monospace; font-size: 10.5px;
          color: var(--metin3); white-space: nowrap; }

        .sh-statlar { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-top: 14px; }
        @media (max-width: 980px) { .sh-statlar { grid-template-columns: repeat(2, 1fr); } }
        .sh-stat { padding: 15px 18px; height: 100%; }
        .sh-stat .deger { font-family: Outfit, sans-serif; font-size: 23px; font-weight: 800; line-height: 1;
          color: var(--metin1); display: inline-flex; align-items: baseline; gap: 4px; }
        .sh-stat .deger.toprak { color: var(--toprak); }
        .sh-stat .etiket { margin-top: 5px; font-size: 10px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--metin3); }
        .sh-stat .alt { margin-top: 4px; font-size: 10.5px; color: var(--metin3); line-height: 1.45; }

        .sh-ikili { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 14px; align-items: start; }
        @media (max-width: 900px) { .sh-ikili { grid-template-columns: 1fr; } }

        .sh-panel-ic { padding: 18px 22px; }
        .sh-panel-bas { display: flex; align-items: center; gap: 9px; margin-bottom: 14px; }
        .sh-panel-bas h3 { font-family: Outfit, sans-serif; font-size: 14px; font-weight: 700; color: var(--metin1); }
        .sh-panel-bas .say { margin-left: auto; font-family: 'JetBrains Mono', monospace; font-size: 10px;
          color: var(--metin3); }

        /* histogram — dikey çubuklar (adet üstte, kalite 1–5 altta) */
        .sh-histo { display: flex; align-items: flex-end; gap: 8px; height: 130px; padding-top: 10px; }
        .sh-histo .bar { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; height: 100%; }
        .sh-histo .cubuk { width: 100%; border-radius: 6px 6px 0 0;
          background: linear-gradient(180deg, var(--yaprak), var(--adacayi)); margin-top: auto;
          transform-origin: bottom; }
        .sh-histo .adet { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--metin2); font-weight: 600; }
        .sh-histo .etk { font-family: 'JetBrains Mono', monospace; font-size: 9.5px; color: var(--metin3); }
        @media (prefers-reduced-motion: no-preference) {
          .sh-histo .cubuk { animation: sh-grow 0.6s cubic-bezier(0.2, 0.7, 0.3, 1) both; }
        }
        @keyframes sh-grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        .sh-histo-not { margin-top: 8px; font-family: 'JetBrains Mono', monospace; font-size: 10px;
          line-height: 1.5; color: var(--metin3); }

        /* zorluk — yatay satırlar (etiket · Meter · adet) */
        .sh-zor { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; font-size: 12px; }
        .sh-zor:last-of-type { margin-bottom: 0; }
        .sh-zor .et { width: 62px; flex: 0 0 auto; color: var(--metin2); font-weight: 600; }
        .sh-zor .n { width: 54px; flex: 0 0 auto; text-align: right; font-family: 'JetBrains Mono', monospace;
          font-size: 10.5px; color: var(--metin3); }

        /* ders kapsama tablosu */
        .sh-ktablo { width: 100%; border-collapse: collapse; font-size: 12px; }
        .sh-ktablo th { text-align: left; font-family: 'JetBrains Mono', monospace; font-size: 9.5px;
          letter-spacing: 0.1em; text-transform: uppercase; color: var(--metin3); font-weight: 500;
          padding: 7px 10px; border-bottom: 1px solid var(--cam-kenar); }
        .sh-ktablo th.sag { text-align: right; }
        .sh-ktablo td { padding: 9px 10px; border-bottom: 1px solid var(--cam-kenar); color: var(--metin2);
          vertical-align: middle; }
        .sh-ktablo tr:last-child td { border-bottom: none; }
        .sh-ktablo .ders { font-weight: 600; color: var(--metin1); }
        .sh-ktablo .sag { text-align: right; font-family: 'JetBrains Mono', monospace; font-size: 11.5px; }
        .sh-ktablo .dusuk { color: var(--uyari); font-weight: 600; }

        /* liste (yıl dağılımı · AI ders kırılımı) */
        .sh-liste { display: flex; align-items: center; justify-content: space-between; padding: 6px 0;
          font-size: 12px; border-bottom: 1px solid var(--cizgi); }
        .sh-liste:last-child { border-bottom: none; }
        .sh-liste .k { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3); }
        .sh-liste .v { font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin2); }

        .sh-rozet { margin-left: auto; font-size: 10px; font-weight: 700; padding: 3px 9px; border-radius: 8px;
          background: color-mix(in srgb, var(--uyari) 15%, transparent); color: var(--uyari); white-space: nowrap; }
        .sh-uyari { font-size: 11px; line-height: 1.55; color: var(--uyari); margin-top: 10px; }

        /* sekme şeridi (özet ↔ sorular) */
        .sh-sekmeler { display: inline-flex; margin-top: 16px; background: var(--v0);
          border: 1px solid var(--cam-kenar); border-radius: 12px; padding: 3px; gap: 2px; }
        .sh-sekmeler button { display: inline-flex; align-items: center; gap: 6px;
          font-family: Inter, sans-serif; font-size: 12.5px; font-weight: 600; color: var(--metin3);
          background: transparent; border: none; border-radius: 9px; padding: 7px 14px;
          cursor: pointer; min-height: 38px; }
        .sh-sekmeler button.sh-aktif { background: var(--mat); color: var(--vurgu);
          box-shadow: 0 2px 8px rgba(24,49,33,.08); }
        .sh-sekme-sayi { font-family: 'JetBrains Mono', monospace; font-size: 10px; padding: 1px 6px;
          border-radius: 7px; background: color-mix(in srgb, var(--yanlis) 15%, transparent); color: var(--yanlis); }
      `}</style>

      {/* ═══ BAŞLIK ═══ */}
      <Reveal>
        <section className="sh-kart sh-baslik">
          <div>
            <h1>Soru Havuzu</h1>
            <p className="alt">
              {sekme === 'ozet'
                ? 'Hacim, doğrulanmış oranı, kalite dağılımı ve müfredat kapsaması.'
                : 'Tek tek sorular — görüntüle, etiketini düzelt, bozuk olanı karantinaya al.'}
            </p>
          </div>
          <span className="sh-durum">
            son üretim {h.ai.sonUretim ? new Date(h.ai.sonUretim).toLocaleDateString('tr-TR') : '—'}
          </span>
        </section>
      </Reveal>

      {/* ═══ SEKME — ÖZET (ölçüm) ↔ SORULAR (müdahale) ═══
          Ayrı tutulur: ölçüme bakarken yanlışlıkla soru düşürülmesin. */}
      <div className="sh-sekmeler">
        {([['ozet', 'Özet'], ['sorular', 'Sorular'], ['kapsama', 'Kapsama']] as const).map(([v, etiket]) => (
          <button
            key={v}
            type="button"
            aria-pressed={sekme === v}
            className={sekme === v ? 'sh-aktif' : undefined}
            onClick={() => setSekme(v)}
          >
            {etiket}
            {v === 'sorular' && h.ai.karantinada > 0 && (
              <span className="sh-sekme-sayi">{h.ai.karantinada}</span>
            )}
          </button>
        ))}
      </div>

      {sekme === 'sorular' ? (
        <SorularSekmesi dersler={h.ai.dersler.map((x) => x.subject)} />
      ) : sekme === 'kapsama' ? (
        <KapsamaSekmesi />
      ) : (
      <>
      {/* ═══ STAT ŞERİDİ (4) — eşit ağırlık, hero yok ═══ */}
      <div className="sh-statlar">
        <Reveal delay={0.04}>
          <section className="sh-kart sh-stat">
            {/* TELİF: ÖSYM sayısı YÖNETİCİ iç operasyonu — nötr TOPRAK tonu, brass/kehribar DEĞİL. */}
            <div className="deger toprak"><CanliSayi value={h.osym.toplam} /></div>
            <div className="etiket">ÖSYM Çıkmış</div>
            <div className="alt">{h.osym.yillar.length} yıl · {h.osym.dersler.length} ders · yalnız iç kaynak (RAG)</div>
          </section>
        </Reveal>

        <Reveal delay={0.08}>
          <section className="sh-kart sh-stat">
            <div className="deger"><CanliSayi value={h.ai.toplam} /></div>
            <div className="etiket">AI Üretimi</div>
            <div className="alt">doğrulanmış %{Math.round(h.ai.verifiedOrani * 100)}</div>
          </section>
        </Reveal>

        <Reveal delay={0.12}>
          <section className="sh-kart sh-stat">
            <div className="deger">
              {/* null ≠ 0: hakem hiç kalite etiketi üretmediyse "ölçüm yok" — sıfır çizilmez. */}
              {h.ai.ortKalite == null
                ? <OlcumYok />
                : <Sayi value={h.ai.ortKalite} format={{ minimumFractionDigits: 1, maximumFractionDigits: 1 }} />}
            </div>
            <div className="etiket">Ortalama Kalite</div>
            <div className="alt">hakem ÖSYM-üslup skoru (1–5)</div>
          </section>
        </Reveal>

        <Reveal delay={0.16}>
          <section className="sh-kart sh-stat">
            <div className="deger"><CanliSayi value={h.kapsama.herhangiKapsanan} /></div>
            <div className="etiket">Kapsanan Kazanım</div>
            <div className="alt">{kapsanmayan} kazanımda HİÇ soru yok</div>
          </section>
        </Reveal>
      </div>

      {/* ═══ KALİTE HİSTOGRAMI + ZORLUK ═══ */}
      <div className="sh-ikili">
        <Reveal delay={0.1}><KaliteHistogrami veri={h.ai} /></Reveal>
        <Reveal delay={0.14}><ZorlukDagilimi zorluk={h.ai.zorluk} /></Reveal>
      </div>

      {/* ═══ DERS BAZLI KAPSAMA — düşük oranlar sıcak tonla, güzelleştirilmeden ═══ */}
      <Reveal delay={0.18}>
        <div style={{ marginTop: 14 }}>
          <DersKapsamaTablosu satirlar={h.kapsama.dersBazli} soruSayisi={soruSayilari} />
        </div>
      </Reveal>

      {/* ═══ ÖSYM YIL DAĞILIMI + AI DERS KIRILIMI ═══ */}
      <div className="sh-ikili">
        <Reveal delay={0.2}>
          <section className="sh-kart sh-panel-ic">
            <div className="sh-panel-bas">
              <h3>ÖSYM Yıl Dağılımı</h3>
              {/* TELİF: kaynak etiketi — yalnız iç RAG, kehribar mühür yok. */}
              <span className="say">yalnız RAG kaynağı</span>
            </div>
            {h.osym.yillar.length === 0 ? (
              <OlcumYok />
            ) : (
              <div>
                {h.osym.yillar.map((y) => (
                  <div key={y.year} className="sh-liste">
                    <span className="k">{y.year}</span>
                    <span className="v">{y.count}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </Reveal>

        <Reveal delay={0.24}>
          <section className="sh-kart sh-panel-ic">
            <div className="sh-panel-bas">
              <h3>AI Havuzu — Ders Kırılımı</h3>
              {h.ai.kazanimsiz > 0 && <span className="sh-rozet">{h.ai.kazanimsiz} kazanımsız</span>}
            </div>
            <div>
              {h.ai.dersler.map((d) => (
                <div key={d.subject} className="sh-liste">
                  <SubjectName subject={d.subject} anahtar={dersAnahtar(d.subject)} className="!text-[12px]" />
                  <span className="v">{d.verified}/{d.count}</span>
                </div>
              ))}
            </div>
            {/* DÜRÜST STOK: kazanıma bağlanmamış AI soruları servis edilemez — açıkça "ölü stok". */}
            {h.ai.kazanimsiz > 0 && (
              <p className="sh-uyari">
                Kazanıma bağlanmamış sorular konu listesine giremez — pratik akışında
                servis edilemeyen ölü stoktur.
              </p>
            )}
            {/* Karantina AYRI sayılır: `verified` sayımına dahil DEĞİL. İkisini toplamak
                havuzu olduğundan büyük gösterirdi. */}
            {h.ai.karantinada > 0 && (
              <p className="sh-uyari">
                {h.ai.karantinada} soru karantinada — doğrulamayı geçmiş ama yönetici düşürdüğü
                için servis edilmiyor. Yukarıdaki sayımlara dahil değil.
              </p>
            )}
          </section>
        </Reveal>
      </div>
      </>
      )}
    </Sayfa>
  )
}
