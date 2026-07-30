import { Link } from 'react-router-dom'

/**
 * Tanıtım (landing) — kimliksiz kök `/`. Onaylı önizleme `docs/design/onizleme/tanitim.html`
 * (2026-07-22, hero soru-reklam revizyonu dahil) portu; metinler AYNEN alınmıştır.
 *
 * İçerik sözleşmesi: EKRAN-HARITASI §0 KATI kuralları — uydurma sosyal kanıt YOK (sahte
 * kullanıcı sayısı/yorum/istatistik eklenmez); çıkmış soru YAYINI vaadi YOK (telif kararı
 * 2026-07-22); "ÖSYM formatına en yakın" yalnız BİÇİM iddiasıdır (şık düzeni · çeldirici
 * mantığı · soru dili), resmî bağ/onay iması taşımaz. Vinyetler ve sınıf kodu TEMSİLÎDİR
 * (canlı veri değil, illüstrasyon) — bu yüzden aria-hidden, ekran okuyucuya sahte sayı okunmaz.
 *
 * Chunk disiplini: yalnız react + react-router — framer-motion/three/recharts/katex ÇEKMEZ
 * (animasyonlar saf CSS, hepsi `prefers-reduced-motion: no-preference` kapısının içinde;
 * azalt tercihinde sayfa statik, kaydırma düz). Inline FİDAN deseni (ui.tsx'e yazılmaz);
 * sahne renkleri gibi tanıtıma özel token'lar `.tnt` kapsamında yerel tanımlıdır.
 */

export function Tanitim() {
  return (
    <div className="tnt relative min-h-screen font-sans" style={{ color: 'var(--metin1)', overflowX: 'clip' }}>
      <style>{`
        /* ── Tanıtıma özel sahne token'ları (iki tema) — FİDAN v1.2 önizleme değerleri ── */
        .tnt{ --cam-koyu:rgba(255,255,255,.92); --cta-metin:#F2F7F3;
          --tepe1:#DCE9DE; --tepe2:#C7DCCB; --agac:#7FA98A; --agac2:#5F8F6E; --gol:#CBE3E4;
          --gunes-lekesi:radial-gradient(circle, rgba(244,215,150,.30) 0%, transparent 70%); }
        .dark .tnt{ --cam-koyu:rgba(20,32,24,.9); --cta-metin:#EAF4EC;
          --tepe1:#16211A; --tepe2:#1C2B21; --agac:#2E4A38; --agac2:#3A5C46; --gol:#14252A;
          --gunes-lekesi:radial-gradient(circle, rgba(163,190,140,.08) 0%, transparent 70%); }

        .tnt h1,.tnt h2,.tnt h3{ font-family:'Outfit',sans-serif; }
        .tnt-mono{ font-family:var(--font-mono); font-size:10.5px; letter-spacing:.14em;
          text-transform:uppercase; color:var(--metin3); font-weight:500; }

        /* ── yapışkan site nav ── */
        .tnt-nav{ position:sticky; top:0; z-index:50; background:var(--cam);
          backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
          border-bottom:1px solid var(--cam-kenar); }
        .tnt-nav-ic{ max-width:1160px; margin:0 auto; display:flex; align-items:center;
          gap:26px; padding:13px 28px; }
        .tnt-logo{ font-family:'Outfit',sans-serif; font-weight:800; font-size:19px;
          display:flex; align-items:center; gap:7px; }
        .tnt-logo b{ color:var(--yaprak); font-weight:800; }
        .tnt-logo .tnt-filiz{ font-size:16px; }
        .tnt-nav-linkler{ display:flex; gap:2px; font-size:13px; font-weight:500;
          color:var(--metin2); margin-left:8px; }
        .tnt-nav-linkler a{ padding:7px 12px; border-radius:12px; text-decoration:none;
          color:inherit; transition:color .2s, background .2s; }
        .tnt-nav-linkler a:hover{ color:var(--vurgu); background:var(--v1); }
        .tnt-nav-sag{ margin-left:auto; display:flex; gap:9px; align-items:center; }
        @media(max-width:760px){ .tnt-nav-linkler{ display:none; } }

        /* ── butonlar (FİDAN: tık hedefi ≥44px — önizleme dolgusu korunur, min-height ile) ── */
        .tnt-btn{ font-weight:600; font-size:13.5px; border-radius:12px; cursor:pointer;
          border:none; text-decoration:none; display:inline-flex; align-items:center;
          justify-content:center; min-height:44px; transition:color .2s, border-color .2s,
          background .2s, filter .2s, box-shadow .2s; }
        .tnt-btn-birincil{ background:var(--cta); color:var(--cta-metin); padding:11px 22px;
          box-shadow:0 6px 16px rgba(30,70,32,.25); }
        .tnt-btn-birincil:hover{ filter:brightness(1.12); }
        .tnt-btn-buyuk{ padding:14px 30px; font-size:15px; border-radius:14px; }
        .tnt-btn-soluk{ background:transparent; color:var(--metin2); padding:10px 16px;
          border:1px solid var(--cam-kenar); }
        .tnt-btn-soluk:hover{ color:var(--metin1); border-color:var(--adacayi); }
        .tnt-btn-acik{ background:rgba(255,255,255,.92); color:#1E4620; padding:14px 30px;
          font-size:15px; border-radius:14px; }

        /* ── ambiyans: güneş lekeleri + süzülen yapraklar (yalnız geniş ekran + hareket-serbest) ── */
        .tnt-leke{ position:fixed; border-radius:50%; pointer-events:none; z-index:0; }
        .tnt-leke-a{ width:640px; height:640px; top:-160px; right:-120px; background:var(--gunes-lekesi); }
        .tnt-leke-b{ width:480px; height:480px; top:60%; left:-140px; background:var(--gunes-lekesi); }
        .tnt-yaprak{ display:none; position:fixed; top:-40px; font-size:16px; opacity:.5;
          pointer-events:none; z-index:1; }
        .tnt-y1{ left:18%; } .tnt-y2{ left:57%; } .tnt-y3{ left:86%; font-size:13px; }

        .tnt-govde{ max-width:1160px; margin:0 auto; padding:0 28px; position:relative; z-index:2; }

        /* ── hero ── */
        .tnt-hero{ display:grid; grid-template-columns:1.05fr 1fr; gap:44px; align-items:center;
          padding:64px 0 40px; }
        @media(max-width:900px){ .tnt-hero{ grid-template-columns:1fr; padding-top:40px; } }
        .tnt-hero h1{ font-size:clamp(32px,4.6vw,52px); font-weight:900; line-height:1.12;
          letter-spacing:-.02em; }
        .tnt-hero h1 em{ font-style:normal; color:var(--vurgu); position:relative; }
        .tnt-hero h1 em::after{ content:''; position:absolute; left:0; right:0; bottom:4px;
          height:10px; background:var(--v2); z-index:-1; border-radius:5px; }
        .tnt-hero-alt{ font-size:16px; color:var(--metin2); line-height:1.65; margin-top:18px;
          max-width:520px; }
        .tnt-hero-cta{ display:flex; gap:12px; margin-top:28px; flex-wrap:wrap; align-items:center; }
        .tnt-hero-notlar{ display:flex; gap:18px; margin-top:22px; flex-wrap:wrap; }
        .tnt-hero-not{ display:flex; align-items:center; gap:7px; font-size:12.5px;
          color:var(--metin2); font-weight:500; }
        .tnt-hero-not b{ color:var(--yaprak); font-size:14px; }

        /* ── hero sahnesi + temsilî vinyetler ── */
        .tnt-sahne-kap{ position:relative; }
        .tnt-sahne{ width:100%; border-radius:24px; display:block; box-shadow:var(--golge); }
        .tnt-vinyet{ position:absolute; background:var(--cam-koyu); backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px); border:1px solid var(--cam-kenar);
          border-radius:16px; box-shadow:var(--golge); padding:12px 15px; }
        .tnt-v-a{ top:8%; right:-14px; width:172px; }
        .tnt-v-b{ bottom:10%; left:-18px; width:190px; }
        @media(max-width:900px){ .tnt-v-a{ right:4px; } .tnt-v-b{ left:4px; } }
        .tnt-vinyet .tnt-mono{ display:block; margin-bottom:7px; font-size:9px; }
        .tnt-v-halka{ display:flex; align-items:center; gap:10px; }
        .tnt-halka{ width:44px; height:44px; border-radius:50%; flex:none; position:relative;
          background:conic-gradient(var(--yaprak) 70%, var(--v1) 0); }
        .tnt-halka::before{ content:''; position:absolute; inset:5px; border-radius:50%;
          background:var(--cam-koyu); }
        .tnt-halka span{ position:absolute; inset:0; display:flex; align-items:center;
          justify-content:center; font-family:'Outfit',sans-serif; font-weight:700;
          font-size:10.5px; color:var(--vurgu); }
        .tnt-v-metin{ font-size:11px; color:var(--metin2); line-height:1.4; }
        .tnt-v-isi{ display:flex; gap:4px; margin-top:2px; }
        .tnt-v-isi i{ width:20px; height:20px; border-radius:6px; }
        .tnt-i1{ background:var(--v1); } .tnt-i2{ background:var(--v2); }
        .tnt-i3{ background:var(--v3); } .tnt-i4{ background:var(--v4); }

        /* ── bölüm ortak ── */
        .tnt-bolum{ padding:56px 0; }
        .tnt-bolum-baslik{ text-align:center; max-width:620px; margin:0 auto 36px; }
        .tnt-bolum-baslik .tnt-mono{ color:var(--vurgu); }
        .tnt-bolum-baslik h2{ font-size:clamp(24px,3vw,32px); font-weight:800; margin-top:10px; }
        .tnt-bolum-baslik p{ font-size:14px; color:var(--metin2); margin-top:10px; line-height:1.6; }

        /* ── özellik kartları ── */
        .tnt-ozellikler{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
        @media(max-width:900px){ .tnt-ozellikler{ grid-template-columns:repeat(2,1fr); } }
        @media(max-width:600px){ .tnt-ozellikler{ grid-template-columns:1fr; } }
        .tnt-ozellik{ background:var(--cam); backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px); border:1px solid var(--cam-kenar);
          border-radius:20px; padding:24px; box-shadow:var(--golge); }
        .tnt-ozellik .tnt-ikon{ width:42px; height:42px; border-radius:13px; background:var(--v1);
          display:flex; align-items:center; justify-content:center; font-size:20px; margin-bottom:14px; }
        .tnt-ozellik h3{ font-size:15.5px; margin-bottom:7px; }
        .tnt-ozellik p{ font-size:12.5px; color:var(--metin2); line-height:1.6; }

        /* ── nasıl çalışır: kesikli yol + numaralı duraklar ── */
        .tnt-adimlar{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; position:relative; }
        @media(max-width:760px){ .tnt-adimlar{ grid-template-columns:1fr; } }
        .tnt-adimlar::before{ content:''; position:absolute; top:44px; left:12%; right:12%;
          height:2px; z-index:0;
          background:repeating-linear-gradient(90deg,var(--adacayi) 0 8px,transparent 8px 16px); }
        @media(max-width:760px){ .tnt-adimlar::before{ display:none; } }
        .tnt-adim{ text-align:center; position:relative; z-index:1; padding:0 14px; }
        .tnt-adim .tnt-no{ width:56px; height:56px; border-radius:50%; background:var(--cta);
          color:var(--cta-metin); font-family:'Outfit',sans-serif; font-weight:800; font-size:20px;
          display:flex; align-items:center; justify-content:center; margin:16px auto 16px;
          box-shadow:0 8px 20px rgba(30,70,32,.28); border:4px solid var(--grad-a); }
        .tnt-adim h3{ font-size:16px; margin-bottom:7px; }
        .tnt-adim p{ font-size:12.5px; color:var(--metin2); line-height:1.6; }

        /* ── öğretmen bandı + sınıf kodu kartı ── */
        .tnt-ogretmen{ background:var(--cam); backdrop-filter:blur(16px);
          -webkit-backdrop-filter:blur(16px); border:1px solid var(--cam-kenar);
          border-radius:24px; box-shadow:var(--golge); display:grid;
          grid-template-columns:1.1fr 1fr; gap:30px; padding:38px 40px; align-items:center; }
        @media(max-width:860px){ .tnt-ogretmen{ grid-template-columns:1fr; } }
        .tnt-ogretmen h2{ font-size:24px; font-weight:800; margin-top:10px; }
        .tnt-ogretmen-p{ font-size:13.5px; color:var(--metin2); line-height:1.65; margin-top:12px; }
        .tnt-o-liste{ list-style:none; margin:18px 0 0; padding:0; display:flex;
          flex-direction:column; gap:10px; }
        .tnt-o-liste li{ font-size:13px; color:var(--metin1); display:flex; gap:9px;
          align-items:flex-start; line-height:1.5; }
        .tnt-o-liste li::before{ content:'✓'; color:var(--yaprak); font-weight:700; flex:none; }
        .tnt-o-liste b{ font-weight:600; }
        .tnt-kod-karti{ background:var(--v0); border:1.5px dashed var(--adacayi);
          border-radius:18px; padding:26px; text-align:center; }
        .tnt-kod-karti .tnt-mono{ display:block; margin-bottom:12px; }
        .tnt-kod{ font-family:var(--font-mono); font-weight:500; font-size:24px;
          letter-spacing:.28em; color:var(--vurgu); background:var(--cam-koyu);
          border:1px solid var(--cam-kenar); border-radius:12px; padding:12px 18px;
          display:inline-block; }
        .tnt-kod-karti p{ font-size:12px; color:var(--metin2); margin-top:12px; line-height:1.55; }

        /* ── kapanış bandı (iki temada aynı derin orman gradyanı — bilinçli) ── */
        .tnt-kapanis{ background:linear-gradient(150deg,#1E4620 0%,#2A5A3B 100%);
          border-radius:28px; padding:52px 40px; text-align:center; position:relative;
          overflow:hidden; margin:56px 0; }
        .tnt-kapanis::before{ content:'🌿'; position:absolute; font-size:120px; opacity:.08;
          left:6%; top:-10px; transform:rotate(-15deg); }
        .tnt-kapanis::after{ content:'🍃'; position:absolute; font-size:100px; opacity:.08;
          right:7%; bottom:-14px; transform:rotate(20deg); }
        .tnt-kapanis h2{ color:#F2F7F3; font-size:clamp(24px,3.2vw,34px); font-weight:800; }
        .tnt-kapanis p{ color:rgba(242,247,243,.75); font-size:14.5px; margin:12px auto 26px;
          max-width:440px; line-height:1.6; }

        /* ── footer ── */
        .tnt-footer{ border-top:1px solid var(--cam-kenar); padding:26px 0 40px; display:flex;
          align-items:center; justify-content:space-between; gap:14px; flex-wrap:wrap;
          font-size:12.5px; color:var(--metin3); }
        .tnt-footer a{ color:var(--metin2); text-decoration:none; margin-left:16px; }
        .tnt-footer a:hover{ color:var(--vurgu); }

        /* ── HAREKET — tamamı azalt-kapılı: azalt tercihinde sayfa statik, kaydırma düz ── */
        @media (prefers-reduced-motion: no-preference) {
          html{ scroll-behavior:smooth; }
          .tnt-hero-metin{ animation:tnt-giris .6s cubic-bezier(.2,.7,.3,1) both; }
          @keyframes tnt-giris{ from{ opacity:0; transform:translateY(16px); } to{ opacity:1; transform:none; } }
          .tnt-sahne-kap{ animation:tnt-belir 1s .2s both; }
          @keyframes tnt-belir{ from{ opacity:0; transform:translateY(20px); } to{ opacity:1; transform:none; } }
          .tnt-vinyet{ animation:tnt-yuz 6s ease-in-out infinite; }
          .tnt-v-b{ animation-delay:1.6s; }
          @keyframes tnt-yuz{ 0%,100%{ transform:translateY(0); } 50%{ transform:translateY(-8px); } }
          .tnt-btn-birincil:hover, .tnt-btn-acik:hover{ transform:translateY(-1px); }
          .tnt-btn:active{ transform:scale(.98); }
          .tnt-ozellik{ transition:transform .25s; }
          .tnt-ozellik:hover{ transform:translateY(-3px); }
          @media(min-width:901px){
            .tnt-yaprak{ display:block; animation:tnt-suzul 17s linear infinite; }
            .tnt-y2{ animation-delay:6s; } .tnt-y3{ animation-delay:11s; }
          }
          @keyframes tnt-suzul{
            0%{ transform:translateY(-5vh) rotate(0) translateX(0); }
            50%{ transform:translateY(50vh) rotate(160deg) translateX(40px); }
            100%{ transform:translateY(108vh) rotate(320deg) translateX(-20px); }
          }
        }
      `}</style>

      {/* ── Yapışkan nav: logo · bölüm linkleri · ikincil Giriş + birincil Ücretsiz başla ── */}
      <nav className="tnt-nav">
        <div className="tnt-nav-ic">
          <span className="tnt-logo"><span className="tnt-filiz">🌱</span>Learn<b>Up</b></span>
          <div className="tnt-nav-linkler">
            <a href="#ozellikler">Özellikler</a>
            <a href="#nasil">Nasıl çalışır</a>
            <a href="#ogretmen">Öğretmenler için</a>
          </div>
          <div className="tnt-nav-sag">
            <Link className="tnt-btn tnt-btn-soluk" to="/giris">Giriş yap</Link>
            <Link className="tnt-btn tnt-btn-birincil" to="/giris?sekme=kayit">Ücretsiz başla</Link>
          </div>
        </div>
      </nav>

      {/* Ambiyans: güneş lekeleri + süzülen yapraklar (dekoratif; hareket-azaltta yapraklar hiç görünmez) */}
      <div aria-hidden className="tnt-leke tnt-leke-a" />
      <div aria-hidden className="tnt-leke tnt-leke-b" />
      <span aria-hidden className="tnt-yaprak tnt-y1">🍃</span>
      <span aria-hidden className="tnt-yaprak tnt-y2">🍃</span>
      <span aria-hidden className="tnt-yaprak tnt-y3">🍂</span>

      <main className="tnt-govde">
        {/* ═══ HERO — soruların reklamı (kullanıcı kararı 2026-07-22); biçim iddiası, resmî bağ iması yok ═══ */}
        <section className="tnt-hero">
          <div className="tnt-hero-metin">
            <h1>ÖSYM formatına <em>en yakın</em> sorular.</h1>
            <p className="tnt-hero-alt">LearnUp'ın soru motoru gerçek sınav dilinin analiziyle beslenir: şık düzeni,
              çeldirici mantığı ve zorluk dengesi ÖSYM standardında kurulur; her soru yayına çıkmadan
              çift kontrolden geçer. Ve hepsi senin zayıf konularına göre önüne gelir.</p>
            <div className="tnt-hero-cta">
              <Link className="tnt-btn tnt-btn-birincil tnt-btn-buyuk" to="/giris?sekme=kayit">Ücretsiz başla</Link>
              <a className="tnt-btn tnt-btn-soluk" href="#nasil">Nasıl çalışır?</a>
            </div>
            <div className="tnt-hero-notlar">
              <span className="tnt-hero-not"><b>✓</b> ÖSYM standardında şık &amp; çeldirici düzeni</span>
              <span className="tnt-hero-not"><b>✓</b> Çift kontrollü soru havuzu</span>
              <span className="tnt-hero-not"><b>✓</b> Ücretsiz kayıt</span>
            </div>
          </div>

          {/* Sahne + vinyetler TEMSİLÎ illüstrasyondur (canlı veri değil) → aria-hidden:
              ekran okuyucuya "%70 · 21/30" gibi sahte sayılar okunmaz. */}
          <div className="tnt-sahne-kap" aria-hidden>
            {/* katmanlı orman + göl + filiz sahnesi */}
            <svg className="tnt-sahne" viewBox="0 0 520 360">
              <defs>
                <linearGradient id="tnt-gok" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--grad-a)" /><stop offset="1" stopColor="var(--tepe1)" />
                </linearGradient>
              </defs>
              <rect width="520" height="360" rx="24" fill="url(#tnt-gok)" />
              <circle cx="418" cy="72" r="34" fill="#F4D796" opacity=".85" />
              <circle cx="418" cy="72" r="52" fill="#F4D796" opacity=".22" />
              <path d="M0,208 Q130,150 260,196 T520,186 V360 H0 Z" fill="var(--tepe1)" />
              <path d="M0,252 Q150,204 300,240 T520,232 V360 H0 Z" fill="var(--tepe2)" />
              <g fill="var(--agac)">
                <path d="M84,232 L104,190 L124,232 Z" /><rect x="101" y="232" width="6" height="14" fill="#8A6B4F" />
                <path d="M150,224 L166,192 L182,224 Z" /><rect x="163" y="224" width="5" height="11" fill="#8A6B4F" />
              </g>
              <g fill="var(--agac2)">
                <path d="M372,238 L394,192 L416,238 Z" /><rect x="390" y="238" width="7" height="15" fill="#8A6B4F" />
                <path d="M440,246 L456,214 L472,246 Z" /><rect x="453" y="246" width="5" height="11" fill="#8A6B4F" />
              </g>
              <ellipse cx="262" cy="316" rx="180" ry="34" fill="var(--gol)" />
              <ellipse cx="262" cy="316" rx="120" ry="20" fill="#FFFFFF" opacity=".12" />
              <g transform="translate(250,268)">
                <rect x="-3" y="0" width="6" height="26" rx="3" fill="#5F8F6E" />
                <path d="M0,6 C-16,-2 -20,-18 -6,-22 C0,-12 0,-4 0,6 Z" fill="var(--yaprak)" />
                <path d="M0,10 C16,2 22,-12 8,-18 C2,-8 0,0 0,10 Z" fill="var(--adacayi)" />
              </g>
            </svg>

            {/* yüzen arayüz vinyetleri (statik/temsilî) */}
            <div className="tnt-vinyet tnt-v-a">
              <span className="tnt-mono">GÜNLÜK HEDEF</span>
              <div className="tnt-v-halka">
                <div className="tnt-halka"><span>%70</span></div>
                <div className="tnt-v-metin">21/30 soru<br />devam et 🌿</div>
              </div>
            </div>
            <div className="tnt-vinyet tnt-v-b">
              <span className="tnt-mono">USTALIK HARİTASI</span>
              <div className="tnt-v-isi"><i className="tnt-i2" /><i className="tnt-i4" /><i className="tnt-i1" /><i className="tnt-i3" /><i className="tnt-i4" /><i className="tnt-i2" /></div>
              <div className="tnt-v-isi"><i className="tnt-i3" /><i className="tnt-i1" /><i className="tnt-i4" /><i className="tnt-i2" /><i className="tnt-i3" /><i className="tnt-i4" /></div>
              <div className="tnt-v-metin" style={{ marginTop: 7 }}>Konu konu nerede olduğunu gör</div>
            </div>
          </div>
        </section>

        {/* ═══ ÖZELLİKLER — yalnız MEVCUT özellikler, vaat yok (EKRAN-HARITASI §0) ═══ */}
        <section className="tnt-bolum" id="ozellikler">
          <div className="tnt-bolum-baslik">
            <span className="tnt-mono">NEDEN LEARNUP</span>
            <h2>Sana göre kurulan bir hazırlık</h2>
            <p>Hepsi bugün üründe olan özellikler — parlak vaat yok, çalışan sistem var.</p>
          </div>
          <div className="tnt-ozellikler">
            <div className="tnt-ozellik"><div className="tnt-ikon" aria-hidden>📝</div><h3>ÖSYM Formatında Sorular</h3>
              <p>Şık düzeni, çeldirici mantığı ve soru dili gerçek sınav standardında kurulur; her soru kod kapıları + bağımsız denetçi modelden geçmeden havuza giremez.</p></div>
            <div className="tnt-ozellik"><div className="tnt-ikon" aria-hidden>🗺️</div><h3>Kişisel Çalışma Planı</h3>
              <p>Her güne bir blok: zayıf kazanımın + tam vakti gelen tekrar + pekiştirme. Plan senin verinle kurulur, sen geliştikçe güncellenir.</p></div>
            <div className="tnt-ozellik"><div className="tnt-ikon" aria-hidden>📊</div><h3>Analizler</h3>
              <p>Ustalık haritası, gelişim trendi, sık düştüğün tuzaklar ve hız karşılaştırması — neyi neden çalıştığını hep bilirsin.</p></div>
            <div className="tnt-ozellik"><div className="tnt-ikon" aria-hidden>🌿</div><h3>Koç</h3>
              <p>Çalışma verini görebilen yapay zekâ rehber: "bugün ne çalışayım" diye sor, soruyu anlamadıysan açıklat.</p></div>
            <div className="tnt-ozellik"><div className="tnt-ikon" aria-hidden>🔁</div><h3>Aralıklı Tekrar</h3>
              <p>Öğrendiğin konu tam unutulmaya yüz tuttuğunda karşına gelir — bilimsel tekrar aralıklarıyla kalıcı öğrenme.</p></div>
            <div className="tnt-ozellik"><div className="tnt-ikon" aria-hidden>🌳</div><h3>Oyunlaştırma</h3>
              <p>Çalıştıkça büyüyen seri fidanı, haftalık lig, rozetler ve kendi 3D bahçen — motivasyon skorla değil, kökle büyür.</p></div>
          </div>
        </section>

        {/* ═══ NASIL ÇALIŞIR — 3 adım, kesikli yol çizgisi ═══ */}
        <section className="tnt-bolum" id="nasil">
          <div className="tnt-bolum-baslik">
            <span className="tnt-mono">NASIL ÇALIŞIR</span>
            <h2>Üç adımda kök salarsın</h2>
          </div>
          <div className="tnt-adimlar">
            <div className="tnt-adim"><div className="tnt-no">1</div><h3>Kaydol, tanış</h3>
              <p>Ücretsiz hesabını aç; kısa tanışma sınavıyla motor seviyeni öğrenir. Öğretmenin verdiyse sınıf kodunla bağlan.</p></div>
            <div className="tnt-adim"><div className="tnt-no">2</div><h3>Planın kurulsun</h3>
              <p>Zayıf kazanımların, tekrar vadelerin ve hedefin birleşir — haftalık bloklar hazır. Gerekçesiyle birlikte.</p></div>
            <div className="tnt-adim"><div className="tnt-no">3</div><h3>Çöz, izle, büyü</h3>
              <p>Her çözdüğün soru haritanı netleştirir, serini ve fidanını büyütür. Analizler gelişimini gösterir.</p></div>
          </div>
        </section>

        {/* ═══ ÖĞRETMENLER İÇİN + temsilî sınıf kodu kartı ═══ */}
        <section className="tnt-bolum" id="ogretmen">
          <div className="tnt-ogretmen">
            <div>
              <span className="tnt-mono" style={{ color: 'var(--vurgu)' }}>ÖĞRETMENLER İÇİN</span>
              <h2>Sınıfını tek panodan izle</h2>
              <p className="tnt-ogretmen-p">Öğrencilerin nerede zorlanıyor, kim sessizce geride kalıyor — tahmin etme, gör.</p>
              <ul className="tnt-o-liste">
                <li><span><b>Sınıf panosu:</b> aktivite, doğruluk ve risk işaretli öğrenci listesi</span></li>
                <li><span><b>Kazanım ısı haritası:</b> sınıfın konu konu fotoğrafı</span></li>
                <li><span><b>Öğrenci analizi:</b> kavram yanılgısı teşhisi dahil derin görünüm</span></li>
                <li><span><b>Ödev atölyesi:</b> kazanım seç, havuzdan derle, sınıfa veya kişiye gönder</span></li>
              </ul>
            </div>
            <div className="tnt-kod-karti">
              <span className="tnt-mono">SINIF KODUYLA BAĞLAN</span>
              <span className="tnt-kod">ABC-724</span>
              <p>Öğrencilerin kayıt olurken kodunu girer — sınıfın kendiliğinden kurulur.
                Kod temsilîdir; her öğretmene özel üretilir.</p>
            </div>
          </div>
        </section>

        {/* ═══ KAPANIŞ — fidan sloganı burada yaşar (hero soru-reklamına döndü) ═══ */}
        <section className="tnt-kapanis">
          <h2>Fidanını bugün dik.</h2>
          <p>YKS yolculuğu uzun — ama her gün bir blok, her blok bir kök. Başlamak ücretsiz.</p>
          <Link className="tnt-btn tnt-btn-acik" to="/giris?sekme=kayit">Ücretsiz başla</Link>
        </section>

        <footer className="tnt-footer">
          <span>🌱 LearnUp © 2026</span>
          <span>
            {/* Sayfalar henüz yok (GELECEK) — önizlemedeki yer tutucu bağlantılar korunur */}
            <a href="#">KVKK &amp; Gizlilik</a><a href="#">Kullanım Koşulları</a><a href="#">İletişim</a>
          </span>
        </footer>
      </main>
    </div>
  )
}

export default Tanitim
