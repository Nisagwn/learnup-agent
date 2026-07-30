import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { toast } from 'sonner'
import { apiGet, apiPatch, apiPost } from '../lib/api'
import { useAsync } from '../lib/useAsync'
import { cn } from '../lib/cn'
import { Icon } from '../ui'
import { MathMarkdown } from './MathMarkdown'
import type {
  AdminSoruDetayi, AdminSoruSatiri, AdminSorularYaniti, KapsamaYaniti, SoruMudahaleYanit,
} from '../lib/types.admin'

/**
 * HAVUZ MODERASYONU — yöneticinin soruya doğrudan müdahalesi (0025).
 *
 * ⚠️ YALNIZ AI HAVUZU. Çıkmış ÖSYM soruları burada da GÖRÜNMEZ (2026-07-22 telif
 * kararı). Yönetici arayüzü de bir yayın yüzeyidir; "iç araç" olması muafiyet vermez.
 *
 * ⚠️ METİN DÜZENLEME YOK — bilinçli. Soru gövdesini elle değiştirmek `content_hash`
 * dedup'unu ve eval ölçümünü yalanlar: hattın ürettiği metin ile ölçülen metin
 * ayrışır, kalite raporu anlamını yitirir. Bozuk soru DÜZELTİLMEZ, KARANTİNAYA ALINIR.
 *
 * ⚠️ KARANTİNA ≠ DOĞRULAMAYI GERİ ALMA. verified=false "doğrulama hattı eledi",
 * karantina=true "insan düşürdü" demektir. İkisi ayrı kolonda ve panelde ayrı
 * sayılır; birleştirmek hattın kalite oranını insan müdahalesiyle kirletirdi.
 */
const SAYFA = 25
const ZORLUKLAR = ['kolay', 'orta', 'zor'] as const

/**
 * KAPSAMA — ders × konu üretim açığı (0026 konu katmanı + 0028 talep).
 *
 * ⚠️ BU BİR İŞ KUYRUĞU, envanter dökümü DEĞİL. Sıralama "talebi çok ama sorusu az"
 * önce. Alfabetik ya da salt-boşluk sıralaması, kimsenin girmediği konuyu 12 kişinin
 * beklediği konunun önüne koyardı.
 *
 * ⚠️ `eslenmemisSoru` ETİKETLEME BORCUDUR, üretim açığı değil. Kazanımı hiçbir konuya
 * eşlenmemiş sorular öğrencinin konu listesinde HİÇ görünmez — havuzda var ama ulaşılamaz.
 * Bu yüzden ayrı ve uyarı tonunda gösterilir; toplama karıştırılmaz.
 */
export function KapsamaSekmesi() {
  const k = useAsync<KapsamaYaniti>(() => apiGet('/admin/havuz/kapsama'), [])
  const [acik, setAcik] = useState<string | null>(null)

  if (k.loading && !k.data) return <div className="hm-bos">Kapsama hesaplanıyor…</div>
  if (k.error) return <div className="hm-bos">Kapsama alınamadı: {k.error}</div>
  const d = k.data
  if (!d) return null

  return (
    <div className="hm-kapsama">
      <div className="hm-sayfalama" style={{ marginBottom: 10 }}>
        <span>{d.toplamSoru} soru · {d.toplamKonu} konu</span>
        <span>{d.bosKonu} konu BOŞ</span>
        {d.eslenmemisSoru > 0 && (
          <span style={{ color: 'var(--yanlis)' }} title="Kazanımı hiçbir konuya eşlenmemiş sorular — öğrencinin konu listesinde görünmezler. bun run etiketle-konu -- --yaz">
            {d.eslenmemisSoru} soru konusuz (görünmüyor)
          </span>
        )}
      </div>

      {d.dersler.map((ders) => (
        <div key={ders.subject} style={{ marginBottom: 8 }}>
          <button
            type="button"
            className={cn('hm-satir', acik === ders.subject && 'hm-secili')}
            onClick={() => setAcik((s) => (s === ders.subject ? null : ders.subject))}
          >
            <div className="govde">
              <div className="metin">{ders.subject}</div>
              <div className="alt">
                <span className="hm-etiket">{ders.toplam} soru</span>
                <span className="hm-etiket">{ders.konuSayisi} konu</span>
                {ders.bosKonu > 0 && (
                  <span className="hm-etiket hm-dogrulanmamis">{ders.bosKonu} boş</span>
                )}
              </div>
            </div>
            <Icon
              name="chevronDown"
              size={14}
              color="var(--metin3)"
              style={{ transform: acik === ders.subject ? undefined : 'rotate(-90deg)', flexShrink: 0 }}
            />
          </button>

          {acik === ders.subject && (
            <div style={{ padding: '6px 0 0 10px' }}>
              {ders.konular.map((konu) => (
                <div key={konu.konuId} className="hm-satir" style={{ cursor: 'default' }}>
                  <div className="govde">
                    <div className="metin">{konu.ad}</div>
                    <div className="alt">
                      <span className="hm-etiket">{konu.sinav}</span>
                      <span className={cn('hm-etiket', konu.toplam === 0 && 'hm-dogrulanmamis')}>
                        {konu.toplam} soru
                      </span>
                      {konu.toplam > 0 && (
                        <span className="hm-etiket">
                          {konu.kolay}K · {konu.orta}O · {konu.zor}Z
                        </span>
                      )}
                      {konu.talep > 0 && (
                        <span className="hm-etiket hm-ders">{konu.talep} öğrenci bekliyor</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function SorularSekmesi({ dersler }: { dersler: string[] }) {
  const [subject, setSubject] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [durum, setDurum] = useState<'hepsi' | 'havuzda' | 'karantina' | 'dogrulanmamis'>('havuzda')
  const [ara, setAra] = useState('')
  const [sorgu, setSorgu] = useState('')
  const [sayfa, setSayfa] = useState(0)
  const [seciliId, setSeciliId] = useState<string | null>(null)
  /** Varsayılan TRİYAJ: en riskli önce. 236 soruyu kronolojik gezmek denetim değil
   *  gözden geçirmedir; yönetici kuyruk eritmeli. 'yeni' kronolojik akış için durur. */
  const [sirala, setSirala] = useState<'risk' | 'yeni'>('risk')

  useEffect(() => {
    const t = setTimeout(() => { setSorgu(ara.trim()); setSayfa(0) }, 300)
    return () => clearTimeout(t)
  }, [ara])

  const durumParam =
    durum === 'havuzda' ? { verified: 'true', karantina: 'false' }
      : durum === 'karantina' ? { karantina: 'true' }
        : durum === 'dogrulanmamis' ? { verified: 'false' }
          : {}

  const liste = useAsync<AdminSorularYaniti>(
    () => apiGet('/admin/havuz/sorular', {
      ...(subject ? { subject } : {}),
      ...(difficulty ? { difficulty } : {}),
      ...durumParam,
      ...(sorgu ? { q: sorgu } : {}),
      sirala,
      limit: SAYFA,
      offset: sayfa * SAYFA,
    }),
    // ⚠️ İLKEL bağımlılıklar — nesne geçmek sonsuz refetch üretir (useAsync.ts:19).
    [subject, difficulty, durum, sorgu, sayfa, sirala],
  )

  const detay = useAsync<AdminSoruDetayi | null>(
    () => (seciliId ? apiGet(`/admin/havuz/soru/${seciliId}`) : Promise.resolve(null)),
    [seciliId],
  )

  const tazele = (): void => { liste.reload(); if (seciliId) detay.reload() }

  const izUyar = (yazildi: boolean): void => {
    if (!yazildi) {
      toast.warning('İşlem tamam ama denetim defterine yazılamadı — 0020 migration uygulanmamış olabilir.', {
        duration: 9000,
      })
    }
  }

  const dogrulama = async (id: string, verified: boolean, neden: string | null): Promise<void> => {
    try {
      const y: SoruMudahaleYanit = await apiPost(`/admin/havuz/soru/${id}/dogrulama`, { verified, neden })
      toast.success(verified ? 'Soru havuza alındı' : 'Soru havuzdan düşürüldü')
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Doğrulama değiştirilemedi')
    }
  }

  const karantina = async (id: string, deger: boolean, neden: string | null): Promise<void> => {
    try {
      const y: SoruMudahaleYanit = await apiPost(`/admin/havuz/soru/${id}/karantina`, { karantina: deger, neden })
      toast.success(deger ? 'Soru karantinaya alındı — artık servis edilmiyor' : 'Soru karantinadan çıkarıldı')
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Karantina değiştirilemedi')
    }
  }

  const etiket = async (id: string, yama: { difficulty?: string | null; kazanimId?: number | null }): Promise<void> => {
    try {
      const y: SoruMudahaleYanit = await apiPatch(`/admin/havuz/soru/${id}`, yama)
      toast.success('Etiket güncellendi')
      izUyar(y.denetimYazildi)
      tazele()
    } catch (e: any) {
      toast.error(e?.message ?? 'Etiket güncellenemedi')
    }
  }

  const d = liste.data
  const sayfaSayisi = Math.max(1, Math.ceil((d?.total ?? 0) / SAYFA))

  return (
    <div className="hm-sarmal">
      <style>{`
        .hm-sarmal { margin-top: 18px; }
        .hm-kart { background: var(--cam); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 20px; box-shadow: var(--golge); padding: 18px 22px; }
        .hm-arac { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
        .hm-ara { flex: 1; min-width: 190px; display: flex; align-items: center; gap: 8px;
          border: 1.5px solid var(--cam-kenar); border-radius: 12px; padding: 9px 13px; color: var(--metin3); }
        .hm-ara input { flex: 1; min-width: 0; border: none; background: transparent; outline: none;
          font-size: 13px; color: var(--metin1); }
        .hm-sec { font-family: Inter, sans-serif; font-size: 12.5px; color: var(--metin1); background: var(--v0);
          border: 1.5px solid var(--cam-kenar); border-radius: 12px; padding: 9px 11px; min-height: 44px; outline: none; }
        .hm-sec:focus { border-color: var(--adacayi); }

        .hm-segment { display: inline-flex; background: var(--v0); border: 1px solid var(--cam-kenar);
          border-radius: 12px; padding: 3px; gap: 2px; }
        .hm-segment button { font-family: Inter, sans-serif; font-size: 12px; font-weight: 600; color: var(--metin3);
          background: transparent; border: none; border-radius: 9px; padding: 6px 12px; cursor: pointer; }
        .hm-segment button.hm-aktif { background: var(--mat); color: var(--vurgu); box-shadow: 0 2px 8px rgba(24,49,33,.08); }

        .hm-satir { display: flex; align-items: flex-start; gap: 12px; width: 100%; text-align: left;
          background: transparent; border: none; border-bottom: 1px solid var(--cam-kenar);
          padding: 12px 6px; cursor: pointer; font: inherit; }
        .hm-satir:hover { background: var(--v0); }
        .hm-satir.hm-secili { background: var(--v1); }
        .hm-satir .govde { flex: 1; min-width: 0; }
        .hm-satir .metin { font-size: 12.5px; color: var(--metin1); line-height: 1.5;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .hm-satir .alt { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-top: 6px; }
        .hm-etiket { font-size: 10px; font-weight: 700; padding: 2.5px 8px; border-radius: 8px;
          background: var(--v0); color: var(--metin3); white-space: nowrap; }
        .hm-etiket.hm-karantina { background: color-mix(in srgb, var(--yanlis) 15%, transparent); color: var(--yanlis); }
        .hm-etiket.hm-dogrulanmamis { background: color-mix(in srgb, var(--uyari) 15%, transparent); color: var(--uyari); }
        .hm-etiket.hm-ders { background: var(--v1); color: var(--vurgu); }

        .hm-sayfalama { display: flex; align-items: center; justify-content: space-between; margin-top: 14px;
          padding-top: 12px; border-top: 1px solid var(--cam-kenar);
          font-family: 'JetBrains Mono', monospace; font-size: 11px; color: var(--metin3); }
        .hm-btn { font-family: Outfit, sans-serif; font-weight: 600; font-size: 12px; border-radius: 11px;
          cursor: pointer; border: 1px solid var(--cam-kenar); background: var(--v0); color: var(--metin2);
          min-height: 40px; padding: 9px 14px; display: inline-flex; align-items: center; gap: 6px; }
        .hm-btn:hover:not(:disabled) { color: var(--metin1); border-color: var(--adacayi); }
        .hm-btn:disabled { opacity: .45; cursor: default; }
        .hm-btn-tehlike { color: var(--yanlis); border-color: color-mix(in srgb, var(--yanlis) 38%, transparent); }
        .hm-bos { text-align: center; padding: 32px 20px; font-size: 13px; color: var(--metin3); line-height: 1.6; }

        /* Çekmece (Radix Portal → body; <style> belge-global) */
        .hm-overlay { position: fixed; inset: 0; z-index: 85; background: rgba(12,18,14,.5); backdrop-filter: blur(3px); }
        .hm-cekmece { position: fixed; right: 0; top: 0; bottom: 0; z-index: 86; width: min(96vw, 560px);
          background: var(--cam); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
          border-left: 1px solid var(--cam-kenar); box-shadow: var(--golge);
          display: flex; flex-direction: column; }
        .hm-c-bas { display: flex; align-items: center; gap: 10px; padding: 16px 20px;
          border-bottom: 1px solid var(--cam-kenar); }
        .hm-c-bas h2 { font-family: Outfit, sans-serif; font-size: 15px; font-weight: 800; color: var(--metin1); }
        .hm-c-govde { flex: 1; overflow-y: auto; padding: 18px 20px; }
        .hm-c-alt { padding: 14px 20px; border-top: 1px solid var(--cam-kenar);
          display: flex; gap: 8px; flex-wrap: wrap; }
        .hm-kapat { margin-left: auto; background: transparent; border: none; cursor: pointer; color: var(--metin3);
          display: inline-grid; place-items: center; padding: 4px; border-radius: 8px; }
        .hm-kapat:hover { color: var(--metin1); }

        .hm-bolum { margin-top: 16px; padding-top: 13px; border-top: 1px solid var(--cam-kenar); }
        .hm-bolum:first-child { margin-top: 0; padding-top: 0; border-top: none; }
        .hm-bolum .baslik { font-family: Outfit, sans-serif; font-size: 10px; font-weight: 700;
          letter-spacing: .12em; text-transform: uppercase; color: var(--metin3); margin-bottom: 8px; }
        .hm-soru { font-size: 13.5px; color: var(--metin1); line-height: 1.7; }
        .hm-sik { display: flex; gap: 9px; align-items: flex-start; padding: 7px 0; font-size: 13px; color: var(--metin2); }
        .hm-sik .harf { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700;
          width: 20px; flex-shrink: 0; color: var(--metin3); }
        .hm-sik.hm-dogru { color: var(--dogru); }
        .hm-sik.hm-dogru .harf { color: var(--dogru); }
        .hm-cozum { font-size: 12.5px; color: var(--metin2); line-height: 1.65; }

        .hm-olcu { display: flex; align-items: center; gap: 8px; padding: 7px 0;
          border-bottom: 1px solid var(--cam-kenar); font-size: 12.5px; }
        .hm-olcu:last-child { border-bottom: none; }
        .hm-olcu .ad { flex: 1; color: var(--metin2); }
        .hm-olcu .deger { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; }
        .hm-iyi { color: var(--dogru); }
        .hm-kotu { color: var(--yanlis); }
        .hm-bilinmiyor { color: var(--metin3); }

        .hm-alan { display: flex; align-items: center; gap: 8px; margin-top: 9px; }
        .hm-alan .etiket { font-size: 11.5px; color: var(--metin2); width: 92px; flex-shrink: 0; }
        .hm-alan select, .hm-alan input { flex: 1; min-width: 0; font-family: Inter, sans-serif; font-size: 12.5px;
          color: var(--metin1); background: var(--v0); border: 1.5px solid var(--cam-kenar);
          border-radius: 10px; padding: 8px 10px; min-height: 40px; outline: none; }

        .hm-modal { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 88;
          width: min(92vw, 420px); background: var(--cam); backdrop-filter: blur(16px);
          border: 1px solid var(--cam-kenar); border-radius: 22px; box-shadow: var(--golge); padding: 22px 24px; }
        .hm-modal h2 { font-family: Outfit, sans-serif; font-size: 16px; font-weight: 800; color: var(--metin1); }
        .hm-modal p { margin-top: 6px; font-size: 12.5px; line-height: 1.55; color: var(--metin2); }
        .hm-modal input { width: 100%; margin-top: 12px; font-family: Inter, sans-serif; font-size: 13px;
          color: var(--metin1); background: var(--v0); border: 1.5px solid var(--cam-kenar);
          border-radius: 11px; padding: 10px 12px; min-height: 44px; outline: none; }
        .hm-modal .dugmeler { margin-top: 18px; display: flex; justify-content: flex-end; gap: 8px; }
      `}</style>

      <section className="hm-kart">
        <div className="hm-arac">
          <label className="hm-ara">
            <Icon name="search" size={14} color="currentColor" style={{ opacity: 0.55 }} />
            <input
              value={ara}
              onChange={(e) => setAra(e.target.value)}
              placeholder="Soru metninde ara"
              aria-label="Soru ara"
            />
          </label>
          <select className="hm-sec" value={subject} onChange={(e) => { setSubject(e.target.value); setSayfa(0) }} aria-label="Ders">
            <option value="">Tüm dersler</option>
            {dersler.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="hm-sec" value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setSayfa(0) }} aria-label="Zorluk">
            <option value="">Tüm zorluklar</option>
            {ZORLUKLAR.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
          <div className="hm-segment">
            {([
              ['havuzda', 'Havuzda'],
              ['karantina', 'Karantina'],
              ['dogrulanmamis', 'Doğrulanmamış'],
              ['hepsi', 'Hepsi'],
            ] as const).map(([v, etiketAdi]) => (
              <button
                key={v}
                type="button"
                aria-pressed={durum === v}
                className={durum === v ? 'hm-aktif' : undefined}
                onClick={() => { setDurum(v); setSayfa(0) }}
              >
                {etiketAdi}
              </button>
            ))}
          </div>
        </div>

        {liste.error ? (
          <p className="hm-bos">Sorular alınamadı: {liste.error}</p>
        ) : !d?.sorular.length ? (
          <p className="hm-bos">
            {durum === 'karantina'
              ? 'Karantinada soru yok — havuzdan hiçbir soru düşürülmemiş.'
              : 'Bu filtrelere uyan soru yok.'}
          </p>
        ) : (
          <>
            <div>
              {d.sorular.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={cn('hm-satir', s.id === seciliId && 'hm-secili')}
                  onClick={() => setSeciliId(s.id)}
                >
                  <div className="govde">
                    <div className="metin">{s.onizleme}</div>
                    <div className="alt">
                      <span className="hm-etiket hm-ders">{s.subject}</span>
                      {s.difficulty && <span className="hm-etiket">{s.difficulty}</span>}
                      {s.kazanimBaslik
                        ? <span className="hm-etiket">{s.kazanimBaslik.slice(0, 40)}</span>
                        : <span className="hm-etiket">kazanımsız</span>}
                      {s.karantina && <span className="hm-etiket hm-karantina">karantina</span>}
                      {!s.verified && <span className="hm-etiket hm-dogrulanmamis">doğrulanmamış</span>}
                      {/* AMPİRİK KANIT — zorluk düzeltmesi artık sezgiyle değil sayıyla verilir.
                          Oran null iken (örneklem < 5) yalnız çözülme adedi basılır; "%0 doğru"
                          yazmak 1 kişilik veriden zorluk iddia etmek olurdu. */}
                      {s.cozulme > 0 && (
                        <span className="hm-etiket">
                          {s.dogruOrani == null
                            ? `${s.cozulme} çözüm`
                            : `${s.cozulme} çözüm · %${Math.round(s.dogruOrani * 100)} doğru`}
                        </span>
                      )}
                      {/* Etiket ↔ ampirik çelişkisi: triyajın asıl avı. */}
                      {s.dogruOrani != null && s.difficulty === 'kolay' && s.dogruOrani < 0.4 && (
                        <span className="hm-etiket hm-dogrulanmamis">kolay ama zor çıktı</span>
                      )}
                      {s.dogruOrani != null && s.difficulty === 'zor' && s.dogruOrani > 0.85 && (
                        <span className="hm-etiket hm-dogrulanmamis">zor ama kolay çıktı</span>
                      )}
                    </div>
                  </div>
                  <Icon name="chevronDown" size={14} color="var(--metin3)" style={{ transform: 'rotate(-90deg)', flexShrink: 0 }} />
                </button>
              ))}
            </div>

            <div className="hm-sayfalama">
              <span>{sayfa * SAYFA + 1}–{Math.min((sayfa + 1) * SAYFA, d.total)} / {d.total}</span>
              <span>{d.karantinaToplam} karantinada</span>
              <button
                type="button"
                className="hm-btn"
                onClick={() => { setSirala((s) => (s === 'risk' ? 'yeni' : 'risk')); setSayfa(0) }}
                title={sirala === 'risk'
                  ? 'Şu an en riskli önce — kronolojik sıraya geç'
                  : 'Şu an en yeni önce — triyaj sırasına geç'}
              >
                {sirala === 'risk' ? 'Sıra: riskli önce' : 'Sıra: yeni önce'}
              </button>
              <span style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="hm-btn" disabled={sayfa === 0} onClick={() => setSayfa((s) => Math.max(0, s - 1))}>
                  Önceki
                </button>
                <button type="button" className="hm-btn" disabled={sayfa + 1 >= sayfaSayisi} onClick={() => setSayfa((s) => s + 1)}>
                  Sonraki
                </button>
              </span>
            </div>
          </>
        )}
      </section>

      <SoruCekmecesi
        detay={detay.data ?? null}
        yukleniyor={detay.loading && Boolean(seciliId)}
        acik={Boolean(seciliId)}
        onKapat={() => setSeciliId(null)}
        onDogrulama={dogrulama}
        onKarantina={karantina}
        onEtiket={etiket}
      />
    </div>
  )
}

/* ── Soru çekmecesi ──────────────────────────────────────────────────────── */

function SoruCekmecesi({ detay, yukleniyor, acik, onKapat, onDogrulama, onKarantina, onEtiket }: {
  detay: AdminSoruDetayi | null
  yukleniyor: boolean
  acik: boolean
  onKapat: () => void
  onDogrulama: (id: string, verified: boolean, neden: string | null) => Promise<void>
  onKarantina: (id: string, deger: boolean, neden: string | null) => Promise<void>
  onEtiket: (id: string, yama: { difficulty?: string | null; kazanimId?: number | null }) => Promise<void>
}) {
  const [zorluk, setZorluk] = useState('')
  const [kazanim, setKazanim] = useState('')

  useEffect(() => {
    setZorluk(detay?.soru.difficulty ?? '')
    setKazanim(detay?.soru.kazanimId != null ? String(detay.soru.kazanimId) : '')
  }, [detay?.soru.id, detay?.soru.difficulty, detay?.soru.kazanimId])

  return (
    <Dialog.Root open={acik} onOpenChange={(a) => { if (!a) onKapat() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="hm-overlay" />
        <Dialog.Content className="hm-cekmece" aria-describedby={undefined}>
          <div className="hm-c-bas">
            <Dialog.Title asChild><h2>Soru</h2></Dialog.Title>
            <button type="button" className="hm-kapat" onClick={onKapat} aria-label="Kapat">
              <Icon name="close" size={15} color="currentColor" />
            </button>
          </div>

          {yukleniyor || !detay ? (
            <div className="hm-c-govde"><p className="hm-bos">Yükleniyor…</p></div>
          ) : (
            <>
              <div className="hm-c-govde">
                <div className="hm-bolum">
                  <div className="baslik">Soru kökü</div>
                  {/* Matematik gövdeleri LaTeX içerir — mevcut MathMarkdown ile basılır. */}
                  <div className="hm-soru"><MathMarkdown>{detay.soru.questionText}</MathMarkdown></div>
                </div>

                <div className="hm-bolum">
                  <div className="baslik">Şıklar</div>
                  {Object.entries(detay.soru.options).map(([harf, metin]) => (
                    <div key={harf} className={cn('hm-sik', harf === detay.soru.correctOption && 'hm-dogru')}>
                      <span className="harf">{harf}</span>
                      <span><MathMarkdown>{String(metin)}</MathMarkdown></span>
                    </div>
                  ))}
                </div>

                {detay.soru.solution && (
                  <div className="hm-bolum">
                    <div className="baslik">Çözüm</div>
                    <div className="hm-cozum"><MathMarkdown>{detay.soru.solution}</MathMarkdown></div>
                  </div>
                )}

                {/* ── Sağlık: üretim hattının AYNI kapı fonksiyonlarıyla ölçüldü ── */}
                <div className="hm-bolum">
                  <div className="baslik">Sağlık</div>
                  <Olcu
                    ad="Şık uzunluğu sızıntısı"
                    durum={detay.saglik.sikUzunluk === null ? null : detay.saglik.sikUzunluk === 'temiz'}
                    deger={detay.saglik.sikUzunluk ?? 'ölçülmedi'}
                  />
                  <Olcu
                    ad="Çeldirici kuşatması"
                    durum={detay.saglik.celdirici === null ? null : detay.saglik.celdirici === 'kusatilmis'}
                    deger={detay.saglik.celdirici ?? 'ölçülmedi'}
                  />
                  <Olcu
                    ad="Var olmayan görsele gönderme"
                    durum={!detay.saglik.gorseleGonderme}
                    deger={detay.saglik.gorseleGonderme ? 'var' : 'yok'}
                  />
                  <Olcu
                    ad="Görsele bağımlı metin"
                    durum={!detay.saglik.gorselBagimli}
                    deger={detay.saglik.gorselBagimli ? 'var' : 'yok'}
                  />
                </div>

                <div className="hm-bolum">
                  <div className="baslik">Özgünlük</div>
                  <Olcu
                    ad={`En yakın komşu (eşik ${detay.ozgunluk.esik})`}
                    durum={detay.ozgunluk.enYakin === null ? null : !detay.ozgunluk.esikAsildi}
                    // null = karşılaştırılacak soru yok. 0 basmak "hiç benzemiyor" iddiası olurdu.
                    deger={detay.ozgunluk.enYakin === null ? 'komşu yok' : detay.ozgunluk.enYakin.toFixed(3)}
                  />
                  {detay.ozgunluk.esikAsildi && (
                    <p style={{ fontSize: 11.5, color: 'var(--yanlis)', lineHeight: 1.55, marginTop: 8 }}>
                      Bu soru aynı dersteki bir komşusuna eşiğin üstünde benziyor. Havuza girdikten SONRA
                      eşik düşürülmüş olabilir — karantinaya almayı değerlendir.
                    </p>
                  )}
                </div>

                {/* ── Etiket düzeltme: METİN DEĞİL, yalnız sınıflandırma ── */}
                <div className="hm-bolum">
                  <div className="baslik">Etiketler</div>
                  <div className="hm-alan">
                    <span className="etiket">Zorluk</span>
                    <select value={zorluk} onChange={(e) => setZorluk(e.target.value)}>
                      <option value="">etiketsiz</option>
                      {ZORLUKLAR.map((z) => <option key={z} value={z}>{z}</option>)}
                    </select>
                  </div>
                  <div className="hm-alan">
                    <span className="etiket">Kazanım id</span>
                    <input
                      value={kazanim}
                      onChange={(e) => setKazanim(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder={detay.soru.kazanimBaslik ?? 'kazanımsız'}
                      inputMode="numeric"
                    />
                  </div>
                  <button
                    type="button"
                    className="hm-btn"
                    style={{ marginTop: 10 }}
                    disabled={
                      zorluk === (detay.soru.difficulty ?? '') &&
                      kazanim === (detay.soru.kazanimId != null ? String(detay.soru.kazanimId) : '')
                    }
                    onClick={() => {
                      const yama: { difficulty?: string | null; kazanimId?: number | null } = {}
                      if (zorluk !== (detay.soru.difficulty ?? '')) yama.difficulty = zorluk || null
                      const mevcutK = detay.soru.kazanimId != null ? String(detay.soru.kazanimId) : ''
                      if (kazanim !== mevcutK) yama.kazanimId = kazanim ? Number(kazanim) : null
                      void onEtiket(detay.soru.id, yama)
                    }}
                  >
                    Etiketleri kaydet
                  </button>
                  <p style={{ fontSize: 11, color: 'var(--metin3)', lineHeight: 1.55, marginTop: 9 }}>
                    Soru metni ve şıklar panelden düzenlenemez: elle değiştirilen gövde, tekrar-üretim
                    kontrolünü (content_hash) ve eval ölçümünü yanıltır. Bozuk soru karantinaya alınır.
                  </p>
                </div>

                {detay.denetim.length > 0 && (
                  <div className="hm-bolum">
                    <div className="baslik">Bu soruda yapılanlar</div>
                    {detay.denetim.slice(0, 6).map((x) => (
                      <p key={x.id} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--metin3)', marginTop: 4 }}>
                        {new Date(x.createdAt).toLocaleDateString('tr-TR')} · {x.eylem} · {x.adminAdi ?? 'yönetici'}
                      </p>
                    ))}
                  </div>
                )}
              </div>

              <div className="hm-c-alt">
                <NedenliDugme
                  etiket={detay.soru.karantina ? 'Karantinadan çıkar' : 'Karantinaya al'}
                  tehlike={!detay.soru.karantina}
                  baslik={detay.soru.karantina ? 'Karantinadan çıkar' : 'Karantinaya al'}
                  aciklama={
                    detay.soru.karantina
                      ? 'Soru yeniden servis edilebilir hâle gelir (doğrulanmışsa).'
                      : 'Soru öğrenciye, ödevlere ve tekrar setlerine ARTIK GİRMEZ. Silinmez; istediğin an geri alabilirsin.'
                  }
                  nedenGerekli={!detay.soru.karantina}
                  onOnay={(neden) => onKarantina(detay.soru.id, !detay.soru.karantina, neden)}
                />
                <NedenliDugme
                  etiket={detay.soru.verified ? 'Havuzdan düşür' : 'Havuza al'}
                  tehlike={detay.soru.verified}
                  baslik={detay.soru.verified ? 'Doğrulamayı geri al' : 'Havuza al'}
                  aciklama={
                    detay.soru.verified
                      ? 'Soru doğrulanmamış sayılır ve servis dışı kalır. Bu, hattın kalite oranını da etkiler — insan müdahalesi için KARANTİNA daha doğru araçtır.'
                      : 'Doğrulama hattının elediği bu soruyu elle havuza alıyorsun.'
                  }
                  nedenGerekli={false}
                  onOnay={(neden) => onDogrulama(detay.soru.id, !detay.soru.verified, neden)}
                />
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** Tek ölçüt satırı. `durum === null` → ÖLÇÜLMEDİ (yeşil DEĞİL). */
function Olcu({ ad, durum, deger }: { ad: string; durum: boolean | null; deger: string }) {
  return (
    <div className="hm-olcu">
      <span className="ad">{ad}</span>
      <span className={cn('deger', durum === null ? 'hm-bilinmiyor' : durum ? 'hm-iyi' : 'hm-kotu')}>
        {deger}
      </span>
    </div>
  )
}

/** Gerekçeli onay diyaloğu — yıkıcı havuz müdahaleleri tek tıkla olmaz. */
function NedenliDugme({ etiket, baslik, aciklama, tehlike, nedenGerekli, onOnay }: {
  etiket: string
  baslik: string
  aciklama: string
  tehlike: boolean
  nedenGerekli: boolean
  onOnay: (neden: string | null) => Promise<void>
}) {
  const [neden, setNeden] = useState('')
  const [mesgul, setMesgul] = useState(false)

  return (
    <Dialog.Root onOpenChange={(a) => { if (!a) setNeden('') }}>
      <Dialog.Trigger asChild>
        <button type="button" className={cn('hm-btn', tehlike && 'hm-btn-tehlike')}>{etiket}</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="hm-overlay" style={{ zIndex: 87 }} />
        <Dialog.Content className="hm-modal">
          <Dialog.Title asChild><h2>{baslik}</h2></Dialog.Title>
          <Dialog.Description asChild><p>{aciklama}</p></Dialog.Description>
          <input
            value={neden}
            onChange={(e) => setNeden(e.target.value)}
            maxLength={500}
            placeholder={nedenGerekli ? 'Gerekçe (zorunlu)' : 'Gerekçe (isteğe bağlı)'}
          />
          <div className="dugmeler">
            <Dialog.Close asChild>
              <button type="button" className="hm-btn">Vazgeç</button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className={cn('hm-btn', tehlike && 'hm-btn-tehlike')}
                disabled={mesgul || (nedenGerekli && !neden.trim())}
                onClick={() => {
                  if (nedenGerekli && !neden.trim()) return
                  setMesgul(true)
                  void onOnay(neden.trim() || null).finally(() => setMesgul(false))
                }}
              >
                {etiket}
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
