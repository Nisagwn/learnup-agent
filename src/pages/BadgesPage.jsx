import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock } from 'lucide-react';
import Modal from '../components/ui/Modal';
import useBadges from '../hooks/useBadges';
import { BADGE_FAMILIES, BADGE_CATALOG, TOTAL_BADGES, getFamilyById } from '../utils/badges';
import './BadgesPage.css';

// Aile başlık gradyanı: tone renginden açık→koyu (gradKey teması yoksa).
const famGrad = (tone) => `linear-gradient(135deg, ${tone}, color-mix(in srgb, ${tone} 58%, #000))`;

// unlockedBadges değeri timestamp/boolean olabilir → varsa tarihe çevir.
function fmtUnlock(val) {
  if (!val) return null;
  try {
    if (typeof val.toDate === 'function') return val.toDate();
    if (typeof val.seconds === 'number') return new Date(val.seconds * 1000);
    if (val instanceof Date) return val;
    if (typeof val === 'number') return new Date(val);
    if (typeof val === 'string') { const d = new Date(val); return Number.isNaN(d.getTime()) ? null : d; }
  } catch { /* yoksay */ }
  return null;
}

export default function BadgesPage() {
  const navigate = useNavigate();
  const { unlockedMap, totalEarned } = useBadges();
  const [selected, setSelected] = useState(null);

  // Rozetleri ailelere göre grupla (katalog sırası korunur)
  const byFamily = useMemo(() => {
    const m = {};
    BADGE_CATALOG.forEach((b) => { (m[b.family] = m[b.family] || []).push(b); });
    return m;
  }, []);

  return (
    <div className="dashboard student-dashboard badges-page animate-fade-in pb-8">
      <div className="dashboard-header mb-5 mt-4 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="badges-back" aria-label="Geri">
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <h1 className="page-title">Rozetler ({totalEarned}/{TOTAL_BADGES})</h1>
      </div>

      {/* Hero pill */}
      <div className="badge-hero">
        <div className="badge-hero-circle" aria-hidden="true">🌿</div>
        <div className="min-w-0">
          <div className="badge-hero-kicker">ROZET KOLEKSİYONUN</div>
          <div className="badge-hero-count">{totalEarned} / {TOTAL_BADGES} kazanıldı</div>
          <div className="badge-hero-sub">Tohumdan ormana, damladan okyanusa</div>
        </div>
      </div>

      {/* 7 aile (mobil sırasıyla) */}
      <div className="badge-families">
        {BADGE_FAMILIES.map((f) => {
          const badges = byFamily[f.id] || [];
          const earned = badges.filter((b) => unlockedMap[b.id]).length;
          return (
            <section key={f.id} className="badge-fam ds-card !p-0">
              <header className="badge-fam-head" style={{ background: famGrad(f.tone) }}>
                <span className="badge-fam-emoji" aria-hidden="true">{f.icon}</span>
                <div className="badge-fam-info">
                  <strong>{f.label}</strong>
                  <small>{f.desc}</small>
                </div>
                <span className="badge-fam-count">{earned}/{badges.length}</span>
              </header>

              <div className="badge-grid">
                {badges.map((b) => {
                  const isUnlocked = !!unlockedMap[b.id];
                  return (
                    <button
                      key={b.id}
                      type="button"
                      className="badge-cell-wrap"
                      onClick={() => setSelected(b)}
                      aria-label={`${b.name} — ${isUnlocked ? 'kazanıldı' : 'kilitli'}`}
                    >
                      <span
                        className={`badge-cell ${isUnlocked ? '' : 'badge-cell--locked'}`}
                        style={isUnlocked ? { borderColor: f.tone, boxShadow: `0 4px 12px ${f.tone}33` } : undefined}
                      >
                        <span className="badge-cell-emoji" aria-hidden="true">{b.emoji}</span>
                        {!isUnlocked && <span className="badge-cell-lock"><Lock size={10} aria-hidden="true" /></span>}
                      </span>
                      <span className={`badge-cell-name ${isUnlocked ? '' : 'badge-cell-name--locked'}`}>{b.name}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Detay modalı */}
      <BadgeDetailModal badge={selected} unlockedMap={unlockedMap} onClose={() => setSelected(null)} />
    </div>
  );
}

function BadgeDetailModal({ badge, unlockedMap, onClose }) {
  const fam = badge ? getFamilyById(badge.family) : null;
  const unlockedVal = badge ? unlockedMap[badge.id] : null;
  const date = fmtUnlock(unlockedVal);
  const isUnlocked = !!unlockedVal;

  return (
    <Modal isOpen={!!badge} onClose={onClose} size="sm" title={badge?.name || 'Rozet'}>
      {badge && (
        <div className="badge-detail">
          <div className="badge-detail-emoji" style={isUnlocked ? { borderColor: fam?.tone } : undefined}>
            <span aria-hidden="true">{badge.emoji}</span>
          </div>
          {fam && <div className="badge-detail-fam" style={{ color: fam.tone }}>{fam.icon} {fam.label}</div>}
          <p className="badge-detail-desc">{badge.desc}</p>
          {isUnlocked ? (
            <div className="badge-detail-status badge-detail-status--on">
              ✓ Kazanıldı{date ? ` · ${date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}
            </div>
          ) : (
            <div className="badge-detail-status badge-detail-status--off">Henüz kazanılmadı</div>
          )}
        </div>
      )}
    </Modal>
  );
}
