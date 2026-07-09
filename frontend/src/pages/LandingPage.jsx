import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion as Motion } from 'framer-motion';
import {
  Sparkles, ChevronRight, LogOut, LayoutDashboard, Check, Star, Flame,
  Lock, ArrowRight,
} from 'lucide-react';
import { signOutUser } from '../services/authApi';
import './LandingPage.css';

const TREE = '/assets/garden/trees/';

const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 220, damping: 24 } },
};
const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

// Adım adım büyüme (söğüt evreleri) — "Dünyanı büyüt" mesajını birebir gösterir.
const STEPS = [
  { n: 1, emoji: '✏️', title: 'Soruları Çöz', desc: 'Sana özel, seviyene uygun sorular karşına gelir.', img: 'Willow1' },
  { n: 2, emoji: '🪙', title: 'XP & Altın Kazan', desc: 'Her doğru cevap seni anında ödüllendirir.', img: 'Willow2' },
  { n: 3, emoji: '🎁', title: 'Ödülleri Aç', desc: 'Ağaçlar, çiçekler, dekorlar ve nadir parçalar.', img: 'Willow3' },
  { n: 4, emoji: '🌳', title: 'Dünyanı Büyüt', desc: 'Kendi doğa dünyanı tasarla ve büyüt.', img: 'Mega_tree2' },
];

// Bahçe vitrini — gerçek oyun varlıkları + nadirlik
const COLLECTIBLES = [
  { img: 'Willow3', name: 'Söğüt', rarity: 'Yaygın', tone: 'common' },
  { img: 'Blue-green_balls_tree3', name: 'Mavi Çam', rarity: 'Sıra Dışı', tone: 'uncommon' },
  { img: 'Mega_tree2', name: 'Dev Ağaç', rarity: 'Nadir', tone: 'rare' },
  { img: 'Living_gazebo1', name: 'Yaşayan Gazebo', rarity: 'Nadir', tone: 'rare' },
  { img: 'Tree_idol_dragon', name: 'Ejder Totem', rarity: 'Epik', tone: 'epic' },
  { img: 'Luminous_tree4', name: 'Parıltı Ağacı', rarity: 'Efsane', tone: 'legendary', locked: 'Lv.14' },
];

const PROGRESSION = [
  { emoji: '⭐', title: 'Seviyeler', desc: 'Her seviye yeni ödüller açar.' },
  { emoji: '🔥', title: 'Günlük Seri', desc: 'Her gün çöz, serini büyüt.' },
  { emoji: '🏅', title: 'Rozetler', desc: 'Başarılarını koleksiyon yap.' },
  { emoji: '🏆', title: 'Ligler', desc: 'Sıralamada yüksel, ödül kazan.' },
];

const SOCIAL = [
  { emoji: '👫', title: 'Arkadaş Düelloları', desc: 'Arkadaşınla yarış, kim daha hızlı?' },
  { emoji: '🏡', title: 'Bahçe Ziyaretleri', desc: 'Arkadaşlarının dünyasını gez.' },
  { emoji: '🏆', title: 'Sıralamalar', desc: 'Sınıfında ve global ligde yüksel.' },
];

const TESTIMONIALS = [
  { quote: 'Oğlum artık ödevden önce "bir tur soru çözeyim" diyor — ormanı için.', name: 'Ayşe', role: 'Veli', a: '🧑‍🦰' },
  { quote: '14 günlük serim var, bozmak istemiyorum 😅 Hem netlerim arttı.', name: 'Deniz', role: '9. sınıf', a: '🧒' },
  { quote: 'Çalışmak hiç bu kadar eğlenceli olmamıştı. Parıltı ağacını açtım!', name: 'Mert', role: '11. sınıf', a: '👦' },
];

const LandingPage = ({ user }) => {
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);

  const onRootScroll = (e) => setScrolled(e.currentTarget.scrollTop > 12);
  useEffect(() => { document.title = 'LearnUp — Öğren, Kazan, Dünyanı Büyüt'; }, []);

  const handleLogout = async () => {
    try { await signOutUser(); } catch (err) { console.error('Çıkış hatası:', err); }
  };
  const go = () => navigate('/login');
  const scrollTo = (id) => (e) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const treeImg = (f) => `${TREE}${f}.png`;

  return (
    <div className="landing-root" onScroll={onRootScroll}>
      {/* ── Navbar ── */}
      <header className={`landing-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <button className="landing-logo" onClick={() => navigate('/')} aria-label="LearnUp ana sayfa">
          <img src="/favicon.png" className="landing-logo-img" alt="LearnUp" />
          <span className="landing-logo-text">Learn<span>Up</span></span>
        </button>
        <nav className="landing-nav-links" aria-label="Bölümler">
          <a href="#nasil" onClick={scrollTo('nasil')}>Nasıl Çalışır</a>
          <a href="#bahce" onClick={scrollTo('bahce')}>Bahçe</a>
        </nav>
        <div className="landing-nav-actions">
          {user ? (
            <>
              <button className="nav-btn nav-btn-ghost" onClick={handleLogout} title="Çıkış Yap">
                <LogOut size={16} /><span>Çıkış</span>
              </button>
              <button className="nav-btn nav-btn-primary" onClick={() => navigate('/dashboard')}>
                <LayoutDashboard size={16} /><span>Panele Git</span>
              </button>
            </>
          ) : (
            <>
              <button className="nav-btn nav-btn-ghost" onClick={go}>Giriş Yap</button>
              <button className="nav-btn nav-btn-primary" onClick={go}>Ücretsiz Başla</button>
            </>
          )}
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-hero-copy">
          <Motion.div initial="hidden" animate="show" variants={stagger}>
            <Motion.div className="lp-hero-badge" variants={fadeUp}>
              <Sparkles size={14} /> Öğrenmeyi oyuna çeviren platform
            </Motion.div>
            <Motion.h1 className="lp-hero-title" variants={fadeUp}>
              Öğren. Kazan.<br /><span className="lp-grad">Dünyanı büyüt.</span>
            </Motion.h1>
            <Motion.p className="lp-hero-sub" variants={fadeUp}>
              Soruları çöz, XP ve altın kazan, ödüllerle kendi doğa dünyanı kur.
              Çalışmak ilk kez bu kadar keyifli.
            </Motion.p>
            <Motion.div className="lp-hero-cta" variants={fadeUp}>
              <button className="cta-btn cta-btn-primary" onClick={go}>
                Ücretsiz Başla <ChevronRight size={20} className="cta-icon" />
              </button>
              <button className="cta-btn cta-btn-secondary" onClick={scrollTo('nasil')}>
                Nasıl çalışır?
              </button>
            </Motion.div>
            <Motion.div className="lp-loop" variants={fadeUp} aria-hidden="true">
              <span className="lp-loop-chip">✏️ Çöz</span>
              <ArrowRight size={15} className="lp-loop-arrow" />
              <span className="lp-loop-chip">🪙 Kazan</span>
              <ArrowRight size={15} className="lp-loop-arrow" />
              <span className="lp-loop-chip">🌳 Büyüt</span>
            </Motion.div>
          </Motion.div>
        </div>

        {/* Animasyonlu bahçe önizleme + ödül HUD */}
        <Motion.div
          className="lp-hero-scene"
          initial={{ opacity: 0, scale: 0.96, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 160, damping: 22, delay: 0.15 }}
        >
          <div className="lp-scene-img" style={{ backgroundImage: `url('/assets/garden/forest_bg.png')` }} />
          <img src="/favicon.png" className="lp-scene-owl" alt="" aria-hidden="true" />
          <img src={treeImg('Luminous_tree4')} className="lp-scene-tree lp-scene-tree--1" alt="" aria-hidden="true" />
          <img src={treeImg('Mega_tree2')} className="lp-scene-tree lp-scene-tree--2" alt="" aria-hidden="true" />
          <div className="lp-hud lp-hud--xp">
            <div className="lp-hud-row"><Star size={14} /> 1.240 XP</div>
            <div className="lp-xpbar"><span style={{ width: '72%' }} /></div>
          </div>
          <div className="lp-hud lp-hud--coin">🪙 320</div>
          <div className="lp-hud lp-hud--streak"><Flame size={14} /> 14 gün</div>
          <div className="lp-hud lp-hud--pop">+50 🪙</div>
        </Motion.div>
      </section>

      {/* ── PROBLEM ── */}
      <section className="landing-section lp-problem">
        <Motion.div className="section-head" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp}>
          <span className="section-kicker">Neden LearnUp?</span>
          <h2 className="section-title">Çalışmak neden sıkıcı olsun ki?</h2>
        </Motion.div>
        <Motion.div className="lp-compare" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.3 }} variants={stagger}>
          <Motion.div className="lp-compare-card lp-compare-card--old" variants={fadeUp}>
            <div className="lp-compare-head">😴 Geleneksel çalışma</div>
            <ul>
              <li>Motivasyon yok</li>
              <li>Ödül yok</li>
              <li>Sürekli aynı tekrar</li>
              <li>Çabucak unutulur</li>
            </ul>
          </Motion.div>
          <Motion.div className="lp-compare-card lp-compare-card--new" variants={fadeUp}>
            <div className="lp-compare-head">🌱 LearnUp ile</div>
            <ul>
              <li><Check size={15} /> Her soru bir ödül</li>
              <li><Check size={15} /> XP · Altın · Rozet</li>
              <li><Check size={15} /> Çözdükçe dünyan büyür</li>
              <li><Check size={15} /> Akıllı tekrar tam zamanında hatırlatır</li>
            </ul>
          </Motion.div>
        </Motion.div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="nasil" className="landing-section">
        <Motion.div className="section-head" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} variants={fadeUp}>
          <span className="section-kicker">4 Adımda</span>
          <h2 className="section-title">Öğren → Kazan → Büyüt</h2>
          <p className="section-sub">Her doğru cevap, ormanını bir adım daha büyütür.</p>
        </Motion.div>
        <Motion.div className="lp-steps" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          {STEPS.map((s) => (
            <Motion.div key={s.n} className="lp-step" variants={fadeUp}>
              <span className="lp-step-num">{s.n}</span>
              <div className="lp-step-art"><img src={treeImg(s.img)} alt="" aria-hidden="true" /></div>
              <h3 className="lp-step-title">{s.emoji} {s.title}</h3>
              <p className="lp-step-text">{s.desc}</p>
            </Motion.div>
          ))}
        </Motion.div>
      </section>

      {/* ── GARDEN SHOWCASE (centerpiece) ── */}
      <section id="bahce" className="lp-showcase">
        <div className="lp-showcase-inner">
          <Motion.div className="section-head" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.5 }} variants={fadeUp}>
            <span className="section-kicker">Bahçeni Kur</span>
            <h2 className="section-title lp-title-light">Her doğru cevap, dünyanı büyütür.</h2>
            <p className="section-sub lp-sub-light">
              Söğütlerden parıltılı ağaçlara, gazebolardan totemlere — 100+ ödülle kendi ormanını tasarla.
            </p>
          </Motion.div>

          <Motion.div className="lp-collectibles" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
            {COLLECTIBLES.map((c) => (
              <Motion.div key={c.name} className={`lp-collectible lp-rar--${c.tone}`} variants={fadeUp}>
                {c.locked && <span className="lp-lock"><Lock size={12} /> {c.locked}</span>}
                <img src={treeImg(c.img)} alt={c.name} className={c.locked ? 'lp-locked-img' : ''} />
                <div className="lp-collectible-name">{c.name}</div>
                <span className={`lp-rarity lp-rarity--${c.tone}`}>{c.rarity}</span>
              </Motion.div>
            ))}
          </Motion.div>

          <Motion.div className="lp-showcase-cta" initial="hidden" whileInView="show" viewport={{ once: true }} variants={fadeUp}>
            <button className="cta-btn cta-btn-onbrand" onClick={go}>
              Kendi ormanını kurmaya başla <ChevronRight size={20} />
            </button>
          </Motion.div>
        </div>
      </section>

      {/* ── PROGRESSION ── */}
      <section className="landing-section">
        <Motion.div className="section-head" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} variants={fadeUp}>
          <span className="section-kicker">İlerleme</span>
          <h2 className="section-title">Oyun gibi ilerle, gelişimini gör</h2>
        </Motion.div>
        <Motion.div className="lp-prog" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          {PROGRESSION.map((p) => (
            <Motion.div key={p.title} className="lp-prog-card" variants={fadeUp}>
              <div className="lp-prog-emoji">{p.emoji}</div>
              <h3 className="lp-prog-title">{p.title}</h3>
              <p className="lp-prog-text">{p.desc}</p>
              {p.emoji === '⭐' && <div className="lp-xpbar lp-xpbar--lg"><span style={{ width: '64%' }} /></div>}
            </Motion.div>
          ))}
        </Motion.div>
      </section>

      {/* ── AI (supporting) ── */}
      <section className="landing-section lp-ai">
        <Motion.div className="lp-ai-card" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} variants={fadeUp}>
          <div className="lp-ai-icon"><Sparkles size={22} /></div>
          <h2 className="section-title">Sana göre öğrenir</h2>
          <p className="section-sub">
            Sistem seviyeni ölçer ve sana özel, sürekli yenilenen sorular üretir.
            Takıldığında ipucu verir — cevabı değil. Sen öğrenirken o uyum sağlar.
          </p>
        </Motion.div>
      </section>

      {/* ── SOCIAL ── */}
      <section className="landing-section">
        <Motion.div className="section-head" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} variants={fadeUp}>
          <span className="section-kicker">Sosyal · <span className="lp-soon">Yakında</span></span>
          <h2 className="section-title">Tek başına değilsin</h2>
        </Motion.div>
        <Motion.div className="lp-social" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          {SOCIAL.map((s) => (
            <Motion.div key={s.title} className="lp-social-card" variants={fadeUp}>
              <div className="lp-social-emoji">{s.emoji}</div>
              <h3 className="lp-prog-title">{s.title}</h3>
              <p className="lp-prog-text">{s.desc}</p>
            </Motion.div>
          ))}
        </Motion.div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="landing-section">
        <Motion.div className="section-head" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.6 }} variants={fadeUp}>
          <span className="section-kicker">Sevildi</span>
          <h2 className="section-title">Öğrenciler ve veliler ne diyor?</h2>
        </Motion.div>
        <Motion.div className="lp-testi" initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.2 }} variants={stagger}>
          {TESTIMONIALS.map((t, i) => (
            <Motion.div key={i} className="lp-testi-card" variants={fadeUp}>
              <div className="lp-stars">★★★★★</div>
              <p className="lp-testi-quote">“{t.quote}”</p>
              <div className="lp-testi-by">
                <span className="lp-testi-av" aria-hidden="true">{t.a}</span>
                <div><strong>{t.name}</strong><small>{t.role}</small></div>
              </div>
            </Motion.div>
          ))}
        </Motion.div>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="lp-final" style={{ backgroundImage: `url('/assets/garden/forest_bg.png')` }}>
        <div className="lp-final-mask" />
        <Motion.div
          className="lp-final-inner"
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        >
          <img src="/favicon.png" className="lp-final-owl" alt="" aria-hidden="true" />
          <h2 className="lp-final-title">Bugün başlarsan, öğrenirken bir orman kurabilirsin 🌳</h2>
          <p className="lp-final-sub">Ücretsiz. Reklamsız. İlk ağacın seni bekliyor.</p>
          <button className="cta-btn cta-btn-onbrand lp-final-btn" onClick={() => navigate(user ? '/dashboard' : '/login')}>
            {user ? 'Panele Git' : 'Ücretsiz Başla'} <ChevronRight size={20} />
          </button>
        </Motion.div>
      </section>

      {/* ── Footer ── */}
      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <button className="landing-logo" onClick={() => navigate('/')} aria-label="LearnUp">
            <img src="/favicon.png" className="landing-logo-img landing-logo-img--sm" alt="LearnUp" />
            <span className="landing-logo-text">Learn<span>Up</span></span>
          </button>
          <nav className="landing-footer-links">
            <a href="#nasil" onClick={scrollTo('nasil')}>Nasıl Çalışır</a>
            <a href="#bahce" onClick={scrollTo('bahce')}>Bahçe</a>
            <button className="linklike" onClick={go}>Öğretmen misiniz?</button>
            <button className="linklike" onClick={go}>Giriş Yap</button>
          </nav>
          <span className="landing-footer-copy">© {new Date().getFullYear()} LearnUp · KVKK uyumlu</span>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
