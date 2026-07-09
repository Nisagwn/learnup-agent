import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calculator, Atom, FlaskConical, Dna, Library, Globe, Heart, Lightbulb, Search, GraduationCap, Play, SearchX, FileText, Loader2 } from 'lucide-react';
import { currentUser } from '../services/authApi';
import { getProfile } from '../services/profileApi';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { useToast } from '../components/ToastProvider';
import { startAiQuiz } from '../services/aiService';
import TodayBriefCard from '../components/dashboard/TodayBriefCard';
import LearnFeed from '../components/dashboard/LearnFeed';

export default function LessonsPage() {
  const navigate = useNavigate();
  const { error: toastError } = useToast();
  const [searchParams] = useSearchParams();
  const [mockBusy, setMockBusy] = useState(null); // üretimi süren dersin adı
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  // URL'deki search parametresi ilk deger olarak alinir; sonraki guncellemeler
  // input onChange ve 'searchChange' event'i ile gelir.
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('search') || '');
  // Hata sonrası "Tekrar Dene" için fetch effect'ini yeniden tetikler
  const [reloadKey, setReloadKey] = useState(0);

  const handleRetry = () => {
    setLoading(true);
    setError(false);
    setReloadKey(k => k + 1);
  };

  useEffect(() => {
    let cancelled = false;
    const fetchUser = async () => {
      const user = currentUser();
      if (user) {
        try {
          const profile = await getProfile(user.id);
          if (!cancelled && profile) {
            setUserData(profile);
          }
        } catch (e) {
          console.error(e);
          if (!cancelled) setError(true);
        }
      }
      if (!cancelled) setLoading(false);
    };
    fetchUser();
    return () => { cancelled = true; };
  }, [reloadKey]);

  // Header'dan gelen canli arama event'ini dinle
  useEffect(() => {
    const handler = (e) => setSearchQuery(e.detail || '');
    window.addEventListener('searchChange', handler);
    return () => window.removeEventListener('searchChange', handler);
  }, []);

  const grade = userData?.grade || '9';

  const subjects = [
    { name: 'Matematik', icon: Calculator, color: 'text-lime-600', bg: 'bg-lime-500/10', border: 'border-lime-500/20', glow: 'shadow-[0_0_20px_rgba(132,204,22,0.15)]', desc: 'Sayılar, denklemler ve problem çözme becerileri.' },
    { name: 'Fizik', icon: Atom, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', glow: 'shadow-[0_0_20px_rgba(56,189,248,0.15)]', desc: 'Evrenin temel yasaları, kuvvet ve enerji.' },
    { name: 'Kimya', icon: FlaskConical, color: 'text-teal-400', bg: 'bg-teal-500/10', border: 'border-teal-500/20', glow: 'shadow-[0_0_20px_rgba(20,184,166,0.15)]', desc: 'Maddenin yapısı, reaksiyonlar ve elementler.' },
    { name: 'Biyoloji', icon: Dna, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', glow: 'shadow-[0_0_20px_rgba(16,185,129,0.15)]', desc: 'Canlıların dünyası, hücreler ve ekosistem.' },
    { name: 'Edebiyat', icon: Library, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', glow: 'shadow-[0_0_20px_rgba(245,158,11,0.15)]', desc: 'Türk dili, edebiyat akımları ve anlam bilgisi.' },
    { name: 'Coğrafya', icon: Globe, color: 'text-cyan-400', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20', glow: 'shadow-[0_0_20px_rgba(6,182,212,0.15)]', desc: 'Dünya haritası, iklimler ve beşeri sistemler.' },
    { name: 'Din Kültürü', icon: Heart, color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', glow: 'shadow-[0_0_20px_rgba(244,63,94,0.15)]', desc: 'Ahlaki değerler, inanç ve kültür bilgisi.' },
    { name: 'Felsefe', icon: Lightbulb, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20', glow: 'shadow-[0_0_20px_rgba(217,70,239,0.15)]', desc: 'Düşünce tarihi, mantık ve varlık felsefesi.' }
  ];

  const filteredSubjects = subjects.filter(sub => 
    sub.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleStartQuiz = (subjectName) => {
    navigate(`/student/quiz?subject=${encodeURIComponent(subjectName)}`);
  };

  // Mock sınav: 10 zor soruluk kapalı efemeral tur (havuza yazılmaz, source 'quiz').
  const handleMockExam = async (subjectName) => {
    if (mockBusy) return;
    setMockBusy(subjectName);
    try {
      await startAiQuiz({ topic: subjectName, subject: subjectName, count: 10, difficulty: 'hard', source: 'quiz', grade }, navigate);
    } catch (e) {
      toastError('Mock sınav başlatılamadı', e.message || 'Soru üretilemedi.');
    } finally {
      setMockBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-6xl mx-auto" aria-busy="true">
        <SkeletonCard className="mb-8" lines={2} />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} lines={3} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-6xl mx-auto">
        <ErrorState
          title="Dersler yüklenemedi"
          description="Profil bilgilerin alınırken bir sorun oluştu. Lütfen tekrar deneyin."
          onRetry={handleRetry}
        />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto animate-fade-in">
      {/* Üst Karşılama Alanı */}
      <div className="ds-card p-6 border-l-4 border-l-lime-500 bg-gradient-to-r from-lime-900/20 to-transparent rounded-2xl mb-8 flex justify-between items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2 mb-1.5">
            <GraduationCap className="text-lime-600" size={28} />
            Akıllı Ders Havuzu
          </h1>
          <p className="text-sm text-slate-400">
            {grade}. Sınıf müfredatına göre hazırlanmış derslerden birini seçerek anında yapay zeka destekli adaptif teste başla!
          </p>
        </div>
        
        {/* Arama Çubuğu */}
        <div className="relative w-full sm:w-64">
          <label htmlFor="lesson-search" className="sr-only">Ders ara</label>
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id="lesson-search"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Ders ara..."
            className="w-full pl-10 pr-4 py-2 bg-slate-500/5 hover:bg-slate-500/10 border border-white/5 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-lime-500 transition-all text-sm"
          />
        </div>
      </div>

      {/* Günün özeti + akıllı öneri feed'i (statik ders kartlarının ÜSTÜNDE) */}
      <TodayBriefCard />
      <LearnFeed />

      {/* Ders Kartları Izgarası */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {filteredSubjects.length > 0 ? (
          filteredSubjects.map((sub, idx) => {
            const IconComponent = sub.icon;
            return (
              <div 
                key={idx}
                className={`ds-card group relative overflow-hidden flex flex-col justify-between p-5 rounded-2xl border ${sub.border} bg-white/5 hover:bg-white/10 transition-all duration-300 ${sub.glow}`}
              >
                {/* Arka plan büyük siluet ikon */}
                <div className="absolute top-0 right-0 p-3 opacity-5 group-hover:opacity-10 group-hover:scale-[1.3] transition-all duration-500 pointer-events-none">
                  <IconComponent size={100} className={sub.color} />
                </div>

                <div>
                  <div className={`w-11 h-11 rounded-xl ${sub.bg} ${sub.color} flex items-center justify-center mb-4 border ${sub.border} transition-transform duration-300 group-hover:-translate-y-1`}>
                    <IconComponent size={22} />
                  </div>
                  <h3 className="font-extrabold text-lg text-white mb-2">{sub.name}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed mb-6">{sub.desc}</p>
                </div>

                <button
                  onClick={() => handleStartQuiz(sub.name)}
                  className="w-full py-2.5 bg-lime-600/10 hover:bg-lime-600 text-lime-700 hover:text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-lime-500/20 group-hover:border-transparent group-hover:shadow-lg group-hover:shadow-lime-600/30"
                >
                  <Play size={12} fill="currentColor" />
                  Teste Başla
                </button>
                <button
                  onClick={() => handleMockExam(sub.name)}
                  disabled={mockBusy === sub.name}
                  className="w-full mt-2 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 border border-white/10 disabled:opacity-60"
                >
                  {mockBusy === sub.name
                    ? <><Loader2 size={12} className="animate-spin" /> Hazırlanıyor…</>
                    : <><FileText size={12} /> Mock Sınav (10 zor)</>}
                </button>
              </div>
            );
          })
        ) : (
          <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-slate-500/5">
            <EmptyState
              icon={SearchX}
              title="Ders bulunamadı"
              description={`"${searchQuery}" aramasıyla eşleşen bir ders yok. Farklı bir anahtar kelime deneyin.`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
