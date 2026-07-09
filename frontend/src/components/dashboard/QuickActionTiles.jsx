import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Brain, ArrowUpRight } from 'lucide-react';

const TILES = [
  {
    key: 'assignments',
    icon: ClipboardList,
    title: 'Ödevlerim',
    desc: 'Öğretmenin atadıkları',
    route: '/student/assignments',
    tone: 'pink',
  },
  {
    key: 'ai',
    icon: Brain,
    title: 'Yapay Zekâ Asistanı',
    desc: 'Takıldığında sor',
    route: '/chatbot',
    tone: 'sky',
  },
];

export default function QuickActionTiles() {
  const navigate = useNavigate();

  return (
    <section className="quick-actions" aria-label="Hızlı eylemler">
      {TILES.map((t) => {
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            className={`quick-action quick-action--${t.tone}`}
            onClick={() => navigate(t.route)}
          >
            <span className="quick-action__icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <span className="quick-action__body">
              <strong>{t.title}</strong>
              <small>{t.desc}</small>
            </span>
            <ArrowUpRight size={16} className="quick-action__arrow" aria-hidden="true" />
          </button>
        );
      })}
    </section>
  );
}
