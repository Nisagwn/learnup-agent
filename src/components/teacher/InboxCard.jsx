import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, ClipboardCheck, Sparkles, Crosshair, Calendar, ChevronRight } from 'lucide-react';
import { auth } from '../../firebase';
import { subscribeTeacherInbox } from '../../services/teacherInboxApi';

// Öğretmen Aksiyon Merkezi: 4 sayaç + ilgili bölüme link. 0 ise sönük.
export default function InboxCard() {
  const navigate = useNavigate();
  const [inbox, setInbox] = useState({ pendingSubmissions: 0, pendingAIQuestions: 0, completedTargetedSets: 0, upcomingDeadlines: 0 });

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const unsubs = subscribeTeacherInbox(uid, setInbox);
    return () => unsubs.forEach((u) => { try { u(); } catch { /* yoksay */ } });
  }, []);

  const items = [
    { key: 'pendingSubmissions', label: 'Bekleyen Gönderim', icon: ClipboardCheck, count: inbox.pendingSubmissions, to: '/teacher/tests' },
    { key: 'pendingAIQuestions', label: 'Onay Bekleyen AI Soru', icon: Sparkles, count: inbox.pendingAIQuestions, to: '/teacher/questions?tab=pending' },
    { key: 'completedTargetedSets', label: 'Tamamlanan Hedefli (7g)', icon: Crosshair, count: inbox.completedTargetedSets, to: '/teacher/students' },
    { key: 'upcomingDeadlines', label: 'Yaklaşan Teslim (24s)', icon: Calendar, count: inbox.upcomingDeadlines, to: '/teacher/tests' },
  ];

  return (
    <div className="ds-card mb-6">
      <h2 className="section-title flex items-center gap-2 mb-4">
        <Inbox size={20} className="text-lime-600" /> Aksiyon Merkezi
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {items.map((it) => {
          const Icon = it.icon;
          const active = it.count > 0;
          return (
            <button
              key={it.key}
              type="button"
              onClick={() => navigate(it.to)}
              className={`text-left p-3 rounded-xl border transition flex flex-col gap-1.5 ${
                active ? 'bg-lime-500/10 border-lime-500/30 hover:bg-lime-500/15' : 'bg-white/5 border-white/5 opacity-60 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-1.5 text-xs text-slate-300">
                <Icon size={15} className={active ? 'text-lime-700' : 'text-slate-400'} aria-hidden="true" />
                <span className="flex-1">{it.label}</span>
                <ChevronRight size={13} className="text-slate-500" />
              </div>
              <span className={`text-2xl font-extrabold ${active ? 'text-white' : 'text-slate-500'}`}>{it.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
