import React, { useState, useEffect } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Users, AlertTriangle, TrendingUp, BarChart2, Key, Copy, Check, Plus, BookOpen, Activity, Sparkles, ShieldCheck, UserMinus, UserCheck, Search, Calendar, Megaphone, Trash2, RefreshCw, XCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, LineChart, Line, AreaChart, Area } from 'recharts';
import { supabase } from '../supabase';
import { apiInvoke } from '../services/apiClient';
import { currentUser } from '../services/authApi';
import { getProfile, updateProfile } from '../services/profileApi';
import { useToast } from '../components/ToastProvider';
import { toDate, dueLabel, formatDate } from '../utils/formatDate';
import useChartTheme, { tooltipStyle } from '../hooks/useChartTheme';
import Modal from '../components/ui/Modal';
import { FormField, Input, TextArea, Select } from '../components/ui/FormField';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import TargetedSetPanel from '../components/teacher/TargetedSetPanel';
import InboxCard from '../components/teacher/InboxCard';
import AtRiskCard from '../components/teacher/AtRiskCard';
import SmartAssignmentWizard from '../components/teacher/SmartAssignmentWizard';
import { fetchStudentAnalytics } from '../services/studentAnalyticsApi';
import { regenerateClassCode } from '../services/classApi';
import QuestionPool from './QuestionPool';
import TeacherProfile from './TeacherProfile';
import './TeacherDashboard.css';

// Quiz.jsx'teki getSubjectMapping ile uyumlu ders adları
const SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya', 'Din Kültürü', 'Felsefe'];

// --- MODALS ---
const CreateTestModal = ({ isOpen, onClose, user }) => {
  const { success, error } = useToast();
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!subject || !topic.trim()) {
      error('Eksik Bilgi', 'Lütfen ders ve konu alanlarını doldurun.');
      return;
    }
    setSaving(true);
    try {
      // createdAt OMIT → created_at DB varsayılanı now()
      const { error: insErr } = await supabase.from('assignments').insert({
        teacher_id: user.id,
        subject,
        topic: topic.trim(),
        question_count: Number(questionCount) || 5,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
        status: 'active',
      });
      if (insErr) throw insErr;
      success('Ödev Atandı!', `${subject} - ${topic} konusu sınıfınıza atandı.`);
      setSubject(''); setTopic(''); setQuestionCount(5); setDueDate('');
      onClose();
    } catch (err) {
      console.error('Ödev oluşturma hatası:', err);
      error('Hata', 'Ödev oluşturulurken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Yeni Ödev/Test Ataması"
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" onClick={handleCreate} disabled={saving} className="ds-btn-primary">
            {saving ? 'Kaydediliyor...' : 'Sınıfa Ata'}
          </button>
        </>
      }
    >
      <p className="text-slate-400 text-sm mb-4">Öğrencileriniz seçtiğiniz dersten, belirlediğiniz sayıda soru çözecek.</p>

      <div className="flex flex-col gap-3">
        <FormField label="Ders" required>
          <Select value={subject} onChange={e=>setSubject(e.target.value)}>
            <option value="">Seçiniz...</option>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormField>

        <FormField label="Konu Başlığı" required>
          <Input type="text" value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Örn: Kalıtım Kanunları" />
        </FormField>

        <div className="flex gap-3">
          <FormField label="Soru Sayısı" className="flex-1">
            <Input type="number" min="1" max="20" value={questionCount} onChange={e=>setQuestionCount(e.target.value)} />
          </FormField>
          <FormField label="Son Teslim" className="flex-1">
            <Input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} />
          </FormField>
        </div>
      </div>
    </Modal>
  );
};

// Sınıfa tek yönlü duyuru yayınlama modalı
const CreateAnnouncementModal = ({ isOpen, onClose, user, classCode }) => {
  const { success, error } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || !body.trim()) {
      error('Eksik Bilgi', 'Lütfen başlık ve içerik alanlarını doldurun.');
      return;
    }
    setSaving(true);
    try {
      // createdAt OMIT → created_at DB varsayılanı now()
      const { error: insErr } = await supabase.from('announcements').insert({
        teacher_id: user.id,
        class_code: classCode || null,
        title: title.trim(),
        body: body.trim(),
      });
      if (insErr) throw insErr;
      success('Duyuru Yayınlandı!', 'Tüm sınıfınız bu duyuruyu görebilecek.');
      setTitle(''); setBody('');
      onClose();
    } catch (err) {
      console.error('Duyuru oluşturma hatası:', err);
      error('Hata', 'Duyuru yayınlanırken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title="Sınıfa Duyuru Yayınla"
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" onClick={handleCreate} disabled={saving} className="ds-btn-primary">
            {saving ? 'Yayınlanıyor...' : 'Duyuruyu Yayınla'}
          </button>
        </>
      }
    >
      <p className="text-slate-400 text-sm mb-4">Yazdığınız duyuru tüm öğrencilerinizin panosunda görünür.</p>

      <div className="flex flex-col gap-3">
        <FormField label="Başlık" required>
          <Input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Örn: Hafta Sonu Tekrar Programı" />
        </FormField>
        <FormField label="İçerik" required>
          <TextArea value={body} onChange={e=>setBody(e.target.value)} rows={4} placeholder="Duyuru metni..." />
        </FormField>
      </div>
    </Modal>
  );
};

const StudentDetailModal = ({ student, isOpen, onClose, answers }) => {
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [recentMistakes, setRecentMistakes] = useState(null); // null=yükleniyor
  const chart = useChartTheme();

  useEffect(() => {
    setAiRecommendation('');
    setAiLoading(false);
    setRecentMistakes(null);
    if (!student?.id) return;
    let cancelled = false;
    fetchStudentAnalytics(student.id)
      .then((res) => { if (!cancelled) setRecentMistakes(res.recentMistakes || []); })
      .catch(() => { if (!cancelled) setRecentMistakes([]); });
    return () => { cancelled = true; };
  }, [student]);

  if (!isOpen || !student) return null;

  // Filter user_answers for this student
  const studentAnswers = answers.filter(a => a.user_id === student.id);
  const totalSolved = studentAnswers.length;
  const correctCount = studentAnswers.filter(a => a.isCorrect).length;
  const accuracyRate = totalSolved > 0 ? Math.round((correctCount / totalSolved) * 100) : 0;
  const avgDuration = totalSolved > 0 ? Math.round(studentAnswers.reduce((sum, a) => sum + (Number(a.duration) || 0), 0) / totalSolved) : 0;

  // Group by sub_topic for weakest topic
  const subTopicStats = {};
  studentAnswers.forEach(a => {
    const topic = a.sub_topic || 'Genel';
    if (!subTopicStats[topic]) subTopicStats[topic] = { total: 0, correct: 0 };
    subTopicStats[topic].total += 1;
    if (a.isCorrect) subTopicStats[topic].correct += 1;
  });

  let weakestSubtopic = 'Henüz yok';
  let minRate = 101;
  Object.entries(subTopicStats).forEach(([topic, data]) => {
    const rate = Math.round((data.correct / data.total) * 100);
    if (rate < minRate) {
      minRate = rate;
      weakestSubtopic = topic;
    }
  });

  // En zayıf alt konular (hedefli set önerisi için) — başarı oranı düşük olanlar önce
  const weakSubTopics = Object.entries(subTopicStats)
    .map(([t, data]) => ({ t, rate: Math.round((data.correct / data.total) * 100) }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 6)
    .map((x) => x.t);

  // Calculate success trend (last 7 days)
  const dayNames = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    last7Days.push(d);
  }

  const chartData = last7Days.map(dayStart => {
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const dayLabel = dayNames[dayStart.getDay()];

    const dayAnswers = studentAnswers.filter(a => {
      const ts = a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp ? new Date(a.timestamp) : null);
      return ts && ts >= dayStart && ts < dayEnd;
    });

    const dayTotal = dayAnswers.length;
    const dayCorrect = dayAnswers.filter(a => a.isCorrect).length;
    const score = dayTotal > 0 ? Math.round((dayCorrect / dayTotal) * 100) : null;
    return { day: dayLabel, score };
  });

  const handleGenerateAIRecommendation = async () => {
    setAiLoading(true);
    try {
      const studentName = student.name || student.email || 'Öğrenci';
      const aiPrompt = `Sen LearnUp platformunun Uzman Eğitim Danışmanısın. Öğretmenler için öğrencilerin akademik performans verilerini analiz edersin.
Lütfen aşağıdaki öğrenci performans verilerini inceleyerek, öğretmene bu öğrencinin gelişimi için tam olarak 3 maddelik, son derece yapıcı, pratik ve pedagojik aksiyon tavsiyeleri sun:

Öğrenci Adı/E-posta: ${studentName}
Çözülen Toplam Soru Sayısı: ${totalSolved}
Ortalama Doğruluk Oranı: %${accuracyRate}
Ortalama Soru Çözme Süresi: ${avgDuration} saniye
En Zayıf Olduğu Alt Konu: ${weakestSubtopic}

Yanıtını Türkçe, samimi ve profesyonel bir dille yaz. Maddeler net, uygulanabilir ve motive edici olsun.`;

      const { data, error: fnErr } = await apiInvoke('get-ai-response', {
        body: { userMessage: aiPrompt },
      });
      if (fnErr) throw new Error("API çağrısı başarısız.");
      setAiRecommendation(data?.reply || "Tavsiye üretilemedi.");
    } catch (err) {
      console.error(err);
      setAiRecommendation("Yapay zekâ analizi sırasında bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Öğrenci Detay Analizi">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-lime-500/20 border border-lime-500/30 flex items-center justify-center text-xl font-bold text-lime-700" aria-hidden="true">
            {(student.name || student.email)?.[0]?.toUpperCase() || '?'}
          </div>
          <div>
            <h3 className="text-xl font-bold">{student.name || student.email}</h3>
            <p className="text-slate-400">{student.grade || '?'}. Sınıf Öğrencisi</p>
          </div>
        </div>

        {/* Öğrenci Özet İstatistikleri */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
            <div className="text-xl font-bold text-white">{totalSolved}</div>
            <div className="text-xs text-slate-400">Toplam Çözülen</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
            <div className="text-xl font-bold text-emerald-400">%{accuracyRate}</div>
            <div className="text-xs text-slate-400">Başarı Oranı</div>
          </div>
          <div className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
            <div className="text-xl font-bold text-amber-400">{avgDuration} sn</div>
            <div className="text-xs text-slate-400">Ort. Çözme Süresi</div>
          </div>
        </div>

        {/* Yapay Zekâ Öğretmen Asistanı — paylaşılan backend (Claude Sonnet 4.6) */}
        <div className="mb-6 p-4 bg-lime-500/10 border border-lime-500/20 rounded-xl">
          <h3 className="text-md font-semibold text-lime-700 flex items-center gap-2 mb-2">
            <Sparkles size={18} /> Yapay Zekâ Öğretmen Asistanı
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Öğrencinin güçlü/zayıf yönlerini ve çözüm sürelerini analiz ederek kişiselleştirilmiş gelişim önerileri hazırlayın.
          </p>
          {aiLoading ? (
            <div className="flex items-center gap-2 text-sm text-lime-600">
              <Spinner size="sm" />
              Yapay zekâ verileri analiz ediyor, lütfen bekleyin...
            </div>
          ) : aiRecommendation ? (
            <div className="ai-recommendation-box text-sm p-3 rounded-lg whitespace-pre-line animate-fade-in leading-relaxed">
              {aiRecommendation}
            </div>
          ) : (
            <button 
              onClick={handleGenerateAIRecommendation}
              className="bg-lime-600 hover:bg-lime-700 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Sparkles size={14} /> Gelişim Önerisi Üret
            </button>
          )}
        </div>

        {/* Son 7 Günlük Başarı Trendi */}
        <h3 className="text-md font-semibold text-slate-300 mb-4">Son 7 Günlük Başarı Trendi</h3>
        {chartData.some(d => d.score !== null) ? (
          <div className="flex items-center justify-center overflow-x-auto" style={{ height: 220 }}>
            {/* Modal içinde ResponsiveContainer yüksekliği yanlış ölçtüğü için sabit boyut kullanılır */}
            <LineChart width={560} height={200} data={chartData} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="day" stroke={chart.axis} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke={chart.axis} fontSize={12} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
              <RechartsTooltip
                contentStyle={tooltipStyle(chart)}
                formatter={(value) => [value !== null ? `%${value}` : 'Veri yok', 'Başarı']}
              />
              <Line type="monotone" dataKey="score" stroke={chart.c1} strokeWidth={3} dot={{ fill: chart.c1, strokeWidth: 2 }} connectNulls />
            </LineChart>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10 mb-4">
            <EmptyState
              icon={Activity}
              title="Çözüm verisi yok"
              description="Bu öğrencinin son 7 güne ait çözümü bulunmuyor."
            />
          </div>
        )}

        {/* Detaylı Alt Konu Analizleri */}
        {Object.keys(subTopicStats).length > 0 && (
          <>
            <h3 className="text-md font-semibold text-slate-300 mt-6 mb-4">Alt Konu Bazlı Performans</h3>
            <div className="flex flex-col gap-2">
              {Object.entries(subTopicStats).map(([subj, data]) => {
                const rate = Math.round((data.correct / data.total) * 100);
                return (
                  <div key={subj} className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5">
                    <span className="flex-1 text-sm text-slate-200 font-medium">{subj}</span>
                    <span className="text-xs text-slate-400">{data.total} soru</span>
                    <div className="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full ${rate >= 70 ? 'bg-emerald-500' : rate >= 40 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${rate}%` }} />
                    </div>
                    <span className={`text-sm font-bold min-w-[40px] text-right ${rate >= 70 ? 'text-emerald-400' : rate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>%{rate}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Son Yanlışlar */}
        <div className="mt-6">
          <h3 className="text-md font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <XCircle size={18} className="text-red-400" /> Son Yanlışlar
          </h3>
          {recentMistakes === null ? (
            <div className="text-sm text-slate-500">Yükleniyor…</div>
          ) : recentMistakes.length === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed border-white/10 rounded-xl p-4 text-center">Kayıtlı yanlış yok.</div>
          ) : (
            <div className="flex flex-col gap-2">
              {recentMistakes.map((m) => (
                <div key={m.id} className="p-3 bg-white/5 border border-white/5 rounded-xl">
                  <div className="flex items-center gap-2 text-[11px] mb-1 flex-wrap">
                    <span className="px-2 py-0.5 bg-lime-500/15 text-lime-700 rounded">{m.subject}</span>
                    {m.subTopic && <span className="text-slate-400">{m.subTopic}</span>}
                    <span className="text-slate-500 ml-auto">{m.tsMs ? formatDate(new Date(m.tsMs)) : ''}</span>
                  </div>
                  <div className="text-xs text-slate-200 line-clamp-2">{m.question}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hedefli set gönderme + geçmiş */}
        <TargetedSetPanel student={student} weakSubTopics={weakSubTopics} />
    </Modal>
  );
};


// --- ANALYTICS TAB ---
const AnalyticsTab = ({ stats, weakTopics, chartData, masteryChartData, weeklyTrendData, students, openStudentDetail }) => {
  const chart = useChartTheme();
  return (
  <>
    {/* Aksiyon Merkezi + Dikkat gereken öğrenciler */}
    <InboxCard />
    <AtRiskCard students={students} openStudentDetail={openStudentDetail} />

    <div className="stats-grid">
      <div className="ds-card flex items-center gap-4 !p-5">
        <div className="stat-icon bg-success-light"><Users size={24} className="text-success" /></div>
        <div className="stat-info"><span className="stat-value">{stats.totalStudents}</span><span className="stat-label">Toplam Öğrenci</span></div>
      </div>
      <div className="ds-card flex items-center gap-4 !p-5">
        <div className="stat-icon bg-warning-light"><Activity size={24} className="text-warning" /></div>
        <div className="stat-info"><span className="stat-value">{stats.totalQuestions}</span><span className="stat-label">Toplam Soru Çözümü</span></div>
      </div>
      <div className="ds-card flex items-center gap-4 !p-5">
        <div className="stat-icon bg-accent-light"><TrendingUp size={24} className="text-accent" /></div>
        <div className="stat-info"><span className="stat-value">%{stats.successRate}</span><span className="stat-label">Sınıf Başarı Oranı</span></div>
      </div>
    </div>

    {/* Grafikler Alanı */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
      {/* Ders Bazlı Mastery Dağılımı */}
      <div className="ds-card">
        <h2 className="section-title flex items-center gap-2 mb-6">
          <BarChart2 size={20} className="text-lime-600" /> Ders Bazlı 'Mastery' Dağılımı (Sınıf Ortalaması)
        </h2>
        {masteryChartData.length > 0 ? (
          <div className="chart-wrapper" style={{ height: 260 }}>
            <ResponsiveContainer width="99%" height={260}>
              <BarChart data={masteryChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="subject" stroke={chart.axis} fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke={chart.axis} fontSize={11} unit="%" axisLine={false} tickLine={false} domain={[0, 100]} />
                <RechartsTooltip
                  contentStyle={tooltipStyle(chart)}
                  cursor={{ fill: 'rgba(139,92,246,0.06)' }}
                />
                <Bar dataKey="score" fill="url(#masteryGradient)" radius={[6, 6, 0, 0]} maxBarSize={45} />
                <defs>
                  <linearGradient id="masteryGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.c1} stopOpacity={0.85}/>
                    <stop offset="100%" stopColor={chart.c1} stopOpacity={0.3}/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10">
            <EmptyState
              icon={BarChart2}
              title="Yeterli veri yok"
              description="Mastery dağılımını çizmek için henüz yeterli öğrenci verisi yok."
            />
          </div>
        )}
      </div>

      {/* Sınıf Genel Başarı Trendi */}
      <div className="ds-card">
        <h2 className="section-title flex items-center gap-2 mb-6">
          <Activity size={20} className="text-cyan-400" /> Sınıfın Genel Başarı Trendi (Zaman Serisi)
        </h2>
        <div className="chart-wrapper" style={{ height: 260 }}>
          <ResponsiveContainer width="99%" height={260}>
            <AreaChart data={weeklyTrendData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
              <XAxis dataKey="day" stroke={chart.axis} fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke={chart.axis} fontSize={11} axisLine={false} tickLine={false} unit="%" domain={[0, 100]} />
              <RechartsTooltip contentStyle={tooltipStyle(chart)} />
              <Area type="monotone" dataKey="successRate" stroke={chart.c2} strokeWidth={3} fillOpacity={1} fill="url(#successGradient)" />
              <defs>
                <linearGradient id="successGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={chart.c2} stopOpacity={0.3}/>
                  <stop offset="95%" stopColor={chart.c2} stopOpacity={0.0}/>
                </linearGradient>
              </defs>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>

    {/* Alt Bölüm */}
    <div className="grid grid-cols-3 gap-6 mt-6">
      <div className="col-span-2 ds-card">
        <div className="flex justify-between items-center mb-6">
          <h2 className="section-title flex items-center gap-2">
            <BarChart2 size={20} className="text-[#EC4899]" /> Detaylı Soru Çözüm Analizleri
          </h2>
        </div>
        {chartData.length > 0 ? (
          <div className="chart-wrapper" style={{ height: 240 }}>
            <ResponsiveContainer width="99%" height={240}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="subject" stroke={chart.axis} fontSize={11} tickMargin={10} axisLine={false} tickLine={false} />
                <YAxis stroke={chart.axis} fontSize={11} unit="%" axisLine={false} tickLine={false} />
                <RechartsTooltip
                  contentStyle={tooltipStyle(chart)}
                  cursor={{ fill: 'rgba(139,92,246,0.06)' }}
                />
                <Bar dataKey="success" fill="url(#colorSuccess)" radius={[6, 6, 0, 0]} maxBarSize={50} />
                <defs>
                  <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.c3} stopOpacity={0.8}/>
                    <stop offset="100%" stopColor={chart.c3} stopOpacity={0.4}/>
                  </linearGradient>
                </defs>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-white/10">
            <EmptyState icon={BarChart2} title="Veri yok" description="Grafik için yeterli çözüm verisi bulunamadı." />
          </div>
        )}
      </div>

      <div className="col-span-1 ds-card h-full flex flex-col">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <AlertTriangle size={20} className="text-danger" /> Sınıfın Zorlandığı Konular
        </h2>
        <p className="text-xs text-slate-400 mb-4">Hata oranı %50'den yüksek olan konular aşağıda listelenmiştir.</p>
        <div className="flex flex-col gap-3 overflow-y-auto pr-2">
          {weakTopics.length > 0 ? weakTopics.map((topic, i) => (
            <div key={i} className="p-3 bg-danger-light/20 border border-danger/20 rounded-xl flex justify-between items-center">
              <span className="font-medium text-slate-200 text-xs">{topic.subject}</span>
              <span className="text-danger font-bold text-xs">Hata: %{topic.errorRate}</span>
            </div>
          )) : (
            <div className="text-center p-6 text-slate-500 border border-dashed border-slate-700 rounded-xl">
              Riskli konu tespit edilmedi. 🎉
            </div>
          )}
        </div>
      </div>
    </div>
  </>
  );
};


// --- STUDENTS TAB & MANAGEMENT ---
const StudentsTab = ({ students, openStudentDetail, userAnswers, handleApproveStudent, handleRemoveStudent }) => {
  const [filterGrade, setFilterGrade] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Segregate approved and pending students
  const approvedStudents = students.filter(s => s.isApproved === true);
  const pendingStudents = students.filter(s => s.isApproved !== true);

  const filterAndSearch = (list) => {
    return list.filter(s => {
      const matchesGrade = filterGrade === 'all' ? true : s.grade === filterGrade;
      const matchesSearch = (s.name || s.email || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesGrade && matchesSearch;
    });
  };

  const filteredApproved = filterAndSearch(approvedStudents);
  const filteredPending = filterAndSearch(pendingStudents);

  const renderStudentStats = (studentId) => {
    const sAnswers = userAnswers.filter(a => a.user_id === studentId);
    const total = sAnswers.length;
    const correct = sAnswers.filter(a => a.isCorrect).length;
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    const speed = total > 0 ? Math.round(sAnswers.reduce((sum, a) => sum + (Number(a.duration) || 0), 0) / total) : 0;

    // Weakest subtopic calculation
    const subTopicStats = {};
    sAnswers.forEach(a => {
      const topic = a.sub_topic || 'Genel';
      if (!subTopicStats[topic]) subTopicStats[topic] = { total: 0, correct: 0 };
      subTopicStats[topic].total += 1;
      if (a.isCorrect) subTopicStats[topic].correct += 1;
    });

    let weakestSubtopic = 'Henüz yok';
    let minRate = 101;
    Object.entries(subTopicStats).forEach(([topic, data]) => {
      const rate = Math.round((data.correct / data.total) * 100);
      if (rate < minRate) {
        minRate = rate;
        weakestSubtopic = topic;
      }
    });

    return { total, accuracy, speed, weakestSubtopic };
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Filtreleme ve Arama Çubuğu */}
      <div className="ds-card ds-card--compact flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative flex-1 w-full">
          <label htmlFor="student-search" className="sr-only">Öğrenci ara</label>
          <Search className="absolute left-3 top-3 text-ink-soft" size={18} aria-hidden="true" />
          <input
            id="student-search"
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Öğrenci adı veya e-posta adresi ile ara..."
            className="w-full pl-10 pr-4 py-2.5 bg-card border border-hairline rounded-lg text-ink focus:outline-none focus:border-leaf text-sm"
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <label htmlFor="grade-filter" className="sr-only">Sınıfa göre filtrele</label>
          <select id="grade-filter" value={filterGrade} onChange={e=>setFilterGrade(e.target.value)} className="bg-card border border-hairline rounded-lg p-2.5 text-sm outline-none text-ink focus:border-leaf w-full md:w-auto">
            <option value="all">Tüm Sınıflar</option>
            <option value="9">9. Sınıf</option>
            <option value="10">10. Sınıf</option>
            <option value="11">11. Sınıf</option>
            <option value="12">12. Sınıf</option>
          </select>
        </div>
      </div>

      {/* Onay Bekleyen Öğrenciler Paneli */}
      {filteredPending.length > 0 && (
        <div className="ds-card !border-yellow-500/20 bg-yellow-500/5">
          <h2 className="section-title text-yellow-400 flex items-center gap-2 mb-4">
            <ShieldCheck size={20} /> Onay Bekleyen Öğrenciler ({filteredPending.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPending.map(student => (
              <div key={student.id} className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center hover:border-yellow-500/20 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 text-yellow-300 flex items-center justify-center font-bold">
                    {(student.name || student.email)?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div>
                    <div className="font-semibold text-white text-sm">{student.name || student.email}</div>
                    <div className="text-xs text-slate-400">{student.grade || '?'}. Sınıf</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApproveStudent(student.id)}
                    className="p-2 bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 rounded-lg transition-colors"
                    aria-label={`${student.name || student.email} öğrencisini sınıfa kabul et`}
                    title="Sınıfa Kabul Et"
                  >
                    <UserCheck size={16} aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => handleRemoveStudent(student.id)}
                    className="p-2 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg transition-colors"
                    aria-label={`${student.name || student.email} öğrencisini reddet`}
                    title="Reddet / Çıkar"
                  >
                    <UserMinus size={16} aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aktif Sınıf Öğrencileri İzleme Kartları */}
      <div className="ds-card">
        <h2 className="section-title mb-6 flex items-center gap-2">
          <Users size={20} className="text-lime-600" /> Sınıftaki Öğrenciler & Detaylı İzleme Kartları
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredApproved.map(student => {
            const stats = renderStudentStats(student.id);
            return (
              <div key={student.id} className="p-5 bg-card border border-hairline rounded-xl flex flex-col gap-3 hover:border-leaf/40 hover:shadow-md transition-all duration-300 group">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 shrink-0 rounded-xl bg-leaf/10 border border-leaf/20 text-leaf-deep flex items-center justify-center font-bold">
                      {(student.name || student.email)?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-ink text-base truncate">{student.name || student.email}</h3>
                      <p className="text-xs text-ink-soft">{student.grade}. Sınıf</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => openStudentDetail(student)}
                      className="bg-leaf/10 hover:bg-leaf/20 text-leaf-deep px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
                      aria-label={`${student.name || student.email} için detaylı analizi aç`}
                    >
                      Detaylı Analiz
                    </button>
                    <button
                      onClick={() => handleRemoveStudent(student.id)}
                      className="p-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-lg transition-colors"
                      aria-label={`${student.name || student.email} öğrencisini sınıftan çıkar`}
                      title="Sınıftan Çıkar"
                    >
                      <UserMinus size={14} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {/* Entegrasyon Analitik Verileri */}
                <div className="grid grid-cols-3 gap-2 py-3 border-y border-hairline">
                  <div className="text-center">
                    <span className="block text-xs text-ink-soft mb-0.5">Doğruluk</span>
                    <span className="text-sm font-bold text-emerald-500">%{stats.accuracy}</span>
                  </div>
                  <div className="text-center border-x border-hairline">
                    <span className="block text-xs text-ink-soft mb-0.5">Çözme Süresi</span>
                    <span className="text-sm font-bold text-cyan-600">{stats.speed} sn</span>
                  </div>
                  <div className="text-center">
                    <span className="block text-xs text-ink-soft mb-0.5">Çözülen Soru</span>
                    <span className="text-sm font-bold text-leaf-deep">{stats.total}</span>
                  </div>
                </div>

                <div className="text-xs leading-relaxed">
                  <span className="font-semibold text-ink-soft">En Zayıf Alt Konu: </span>
                  <span className="text-red-500 font-medium" title={stats.weakestSubtopic}>{stats.weakestSubtopic}</span>
                </div>
              </div>
            );
          })}
          {filteredApproved.length === 0 && (
            <div className="col-span-2 rounded-xl border border-dashed border-white/10">
              <EmptyState
                icon={Users}
                title="Onaylı öğrenci yok"
                description="Sınıfınızda henüz onaylanmış bir öğrenci bulunmuyor. Sınıf kodunu öğrencilerinizle paylaşın."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// --- TESTS / ÖDEVLER TAB ---
const TestsTab = ({ assignments, submissions, students }) => {
  const approvedCount = students.filter(s => s.isApproved === true).length;
  const { success, error } = useToast();
  const [deletingId, setDeletingId] = useState(null);

  const handleDelete = async (a) => {
    const ok = typeof window !== 'undefined' && window.confirm(
      `"${a.subject} — ${a.topic}" ödevini silmek istediğine emin misin? Bu işlem geri alınamaz.`
    );
    if (!ok) return;
    setDeletingId(a.id);
    try {
      const { error: delErr } = await supabase.from('assignments').delete().eq('id', a.id);
      if (delErr) throw delErr;
      success('Silindi', 'Ödev kaldırıldı.');
    } catch (err) {
      console.error('Ödev silinemedi:', err);
      error('Hata', 'Ödev silinemedi. Lütfen tekrar deneyin.');
    } finally {
      setDeletingId(null);
    }
  };

  if (assignments.length === 0) {
    return (
      <div className="ds-card">
        <EmptyState
          icon={BookOpen}
          title="Henüz Ödev Yok"
          description='Sağ üstteki "Yeni Test/Ödev" butonu ile sınıfınıza ilk ödevi atayın.'
        />
      </div>
    );
  }

  const sorted = [...assignments].sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));

  // İki gönderim şeması: küratörlü/CF (maxScore sayısal var; score/autoScore = HAM doğru sayısı)
  // vs basit/client (maxScore yok; score zaten 0-100 yüzde). Yüzdeyi şemaya göre hesapla.
  const subPercent = (s) => {
    const raw = s.score ?? s.autoScore ?? 0;
    const max = Number(s.maxScore);
    if (Number.isFinite(max) && max > 0) return Math.round((raw / max) * 100);
    return Math.round(raw);
  };
  // Çip etiketi: küratörlüde "{ham}/{maxScore} (%yüzde)", basitte "%{score}".
  const subScoreLabel = (s) => {
    const raw = s.score ?? s.autoScore ?? 0;
    const max = Number(s.maxScore);
    if (Number.isFinite(max) && max > 0) return `${raw}/${max} (%${Math.round((raw / max) * 100)})`;
    return `%${Math.round(raw)}`;
  };

  return (
    <div className="flex flex-col gap-4">
      {sorted.map(a => {
        const subs = submissions.filter(s => s.assignmentId === a.id);
        const completed = subs.length;
        const avgScore = completed > 0 ? Math.round(subs.reduce((sum, s) => sum + subPercent(s), 0) / completed) : 0;
        const pct = approvedCount > 0 ? Math.round((completed / approvedCount) * 100) : 0;
        const due = dueLabel(a.dueDate);
        return (
          <div key={a.id} className="ds-card">
            <div className="flex justify-between items-start mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-bold text-white">{a.subject} — {a.topic}</h3>
                <p className="text-xs text-slate-400 mt-1">{a.questionCount || 5} soruluk ödev</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold flex items-center gap-1.5 ${due.cls}`}>
                  <Calendar size={15} aria-hidden="true" /> {due.text}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(a)}
                  disabled={deletingId === a.id}
                  title="Ödevi sil"
                  aria-label={`${a.subject} ${a.topic} ödevini sil`}
                  className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
                <div className="text-xl font-bold text-lime-600">{completed}/{approvedCount}</div>
                <div className="text-xs text-slate-400">Tamamlayan</div>
              </div>
              <div className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
                <div className="text-xl font-bold text-emerald-400">%{avgScore}</div>
                <div className="text-xs text-slate-400">Ortalama Puan</div>
              </div>
              <div className="p-3 bg-white/5 rounded-xl text-center border border-white/5">
                <div className="text-xl font-bold text-cyan-400">%{pct}</div>
                <div className="text-xs text-slate-400">Katılım Oranı</div>
              </div>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mt-4">
              <div className="h-2 bg-lime-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
            {completed > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {subs.map(s => {
                  const stu = students.find(st => st.id === s.studentId);
                  return (
                    <span key={s.id} className="text-xs px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-slate-300">
                      {stu?.name || stu?.email || 'Öğrenci'} · <span className="text-emerald-400 font-semibold">{subScoreLabel(s)}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};


// --- MAIN COMPONENT ---
export default function TeacherDashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { success, error } = useToast();

  const [classCode, setClassCode] = useState('Yükleniyor...');
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [students, setStudents] = useState([]);
  const [userAnswers, setUserAnswers] = useState([]);
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [isAnnounceModalOpen, setIsAnnounceModalOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    const fetchProfile = async () => {
      const user = currentUser();
      if (!user) { navigate('/login'); return; }

      const profile = await getProfile(user.id);
      if (profile && profile.role === 'teacher') {
        setClassCode(profile.classCode || 'KOD YOK');
      } else {
        navigate('/');
      }
    };
    fetchProfile();
  }, [navigate]);

  useEffect(() => {
    const user = currentUser();
    if (!user) return;
    const uid = user.id;

    // Öğrenci listesi — canlı güncelleme (profiles, teacher_id = bu öğretmen)
    const loadStudents = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('teacher_id', uid);
      setStudents((data || [])
        .filter(student => student.role === 'student'));
    };
    loadStudents();
    const chStudents = supabase
      .channel(`td-students-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `teacher_id=eq.${uid}` }, () => loadStudents())
      .subscribe();

    // user_logs (istatistikler için) — sadece bu öğretmenin sınıfının logları + alan
    // normalizasyonu (user_logs şeması `student_id` kullanır; tüketici kod `user_id` bekler)
    const loadAnswers = async () => {
      const { data } = await supabase.from('user_logs').select('*').eq('teacher_id', uid);
      setUserAnswers((data || []).map(x => ({
        id: x.id,
        user_id: x.student_id,
        isCorrect: x.is_correct === true,
        duration: x.time_spent ?? 0,
        sub_topic: x.sub_topic || x.subject || 'Genel',
        subject: x.subject || 'Genel',
        timestamp: x.created_at,
      })));
    };
    loadAnswers();
    const chAnswers = supabase
      .channel(`td-answers-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_logs', filter: `teacher_id=eq.${uid}` }, () => loadAnswers())
      .subscribe();

    // assignments & submissions (öğretmenin kendi sınıfı) — camelCase alias'lı
    const mapAssignment = (r) => ({
      ...r,
      teacherId: r.teacher_id,
      questionCount: r.question_count,
      questionIds: r.question_ids ?? [],
      dueDate: r.due_date ?? null,
      createdAt: r.created_at ?? null,
    });
    const loadAssignments = async () => {
      const { data } = await supabase.from('assignments').select('*').eq('teacher_id', uid);
      setAssignments((data || []).map(mapAssignment));
    };
    loadAssignments();
    const chAssign = supabase
      .channel(`td-assignments-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `teacher_id=eq.${uid}` }, () => loadAssignments())
      .subscribe();

    const mapSubmission = (r) => ({
      ...r,
      assignmentId: r.assignment_id,
      studentId: r.student_id,
      teacherId: r.teacher_id,
      autoScore: r.auto_score ?? null,
      maxScore: r.max_score ?? null,
      correctCount: r.correct_count ?? null,
    });
    const loadSubmissions = async () => {
      const { data } = await supabase.from('assignment_submissions').select('*').eq('teacher_id', uid);
      setSubmissions((data || []).map(mapSubmission));
    };
    loadSubmissions();
    const chSubs = supabase
      .channel(`td-submissions-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignment_submissions', filter: `teacher_id=eq.${uid}` }, () => loadSubmissions())
      .subscribe();

    return () => {
      try { supabase.removeChannel(chStudents); } catch (err) { console.warn('Student listener cleanup failed:', err); }
      try { supabase.removeChannel(chAnswers); } catch (err) { console.warn('Answers listener cleanup failed:', err); }
      try { supabase.removeChannel(chAssign); } catch (err) { console.warn('Assignment listener cleanup failed:', err); }
      try { supabase.removeChannel(chSubs); } catch (err) { console.warn('Submission listener cleanup failed:', err); }
    };
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(classCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateClassCode = async () => {
    const user = currentUser();
    if (!user || regenerating) return;
    if (!window.confirm('Sınıf kodunu yenilemek istediğine emin misin? Eski kod çalışmayı durduracak, mevcut öğrenciler etkilenmez.')) return;
    setRegenerating(true);
    try {
      const code = await regenerateClassCode(user.id);
      setClassCode(code);
      success('Kod Yenilendi', `Yeni sınıf kodu: ${code}`);
    } catch (e) {
      console.error('Kod yenilenemedi:', e);
      error('Hata', e.message || 'Kod yenilenemedi.');
    } finally {
      setRegenerating(false);
    }
  };

  const handleApproveStudent = async (studentId) => {
    try {
      const user = currentUser();
      if (!user) return;
      // Öğrencinin kendi satırını güncelle. NOT: RLS yalnızca kullanıcının KENDİ
      // satırını yazmasına izin verdiği için öğretmenin başka bir profili yazması
      // engellenebilir → best-effort (bkz. missingColumns: profiles.is_approved).
      await updateProfile(studentId, { isApproved: true });
      // Öğretmenin kendi students dizisine ekle (kendi satırı → izinli). arrayUnion
      // yerine jsonb diziyi JS'te oku-değiştir-yaz.
      const me = await getProfile(user.id);
      const list = Array.isArray(me?.students) ? me.students : [];
      if (!list.includes(studentId)) {
        await updateProfile(user.id, { students: [...list, studentId] });
      }
      success("Kabul Edildi", "Öğrenci başarıyla onaylandı ve sınıfa eklendi.");
    } catch (err) {
      console.error(err);
    }
  };

  const handleRemoveStudent = async (studentId) => {
    try {
      const user = currentUser();
      if (!user) return;
      // Öğrencinin kendi satırı → RLS nedeniyle best-effort (bkz. yukarıdaki not).
      await updateProfile(studentId, { teacherId: null, isApproved: false });
      // Öğretmenin students dizisinden çıkar (kendi satırı → izinli).
      const me = await getProfile(user.id);
      const list = Array.isArray(me?.students) ? me.students : [];
      await updateProfile(user.id, { students: list.filter((s) => s !== studentId) });
      success("Çıkarıldı", "Öğrenci sınıftan başarıyla çıkarıldı.");
    } catch (err) {
      console.error(err);
    }
  };

  // --- STATS AGGREGATION ---
  const studentIds = students.map(s => s.id);
  const relevantAnswers = userAnswers.filter(a => studentIds.includes(a.user_id));

  const totalStudents = students.filter(s => s.isApproved === true).length;
  const totalQuestions = relevantAnswers.length;
  const correctAnswers = relevantAnswers.filter(a => a.isCorrect).length;
  const successRate = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;

  // Son 7 günde aktif (en az 1 çözüm yapan) benzersiz öğrenci sayısı (profil özeti)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const activeLast7 = new Set(
    relevantAnswers
      .filter(a => {
        const ts = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
        return ts >= sevenDaysAgo;
      })
      .map(a => a.user_id)
  ).size;

  // Ders Bazlı Mastery Dağılımı (Sınıf Ortalaması)
  const classMastery = {};
  students.filter(s => s.isApproved === true).forEach(s => {
    const mastery = s.mastery || {};
    Object.entries(mastery).forEach(([subject, score]) => {
      const subName = subject.charAt(0).toUpperCase() + subject.slice(1);
      if (!classMastery[subName]) classMastery[subName] = { totalScore: 0, count: 0 };
      classMastery[subName].totalScore += score;
      classMastery[subName].count += 1;
    });
  });

  const masteryChartData = Object.entries(classMastery).map(([subject, data]) => ({
    subject,
    score: Math.round(data.totalScore / data.count)
  }));

  // Sınıf Başarı Trendi (Zaman Serisi - Son 7 Gün)
  const dayNames = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const weeklyTrendData = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dayStart = d;
    const dayEnd = new Date(d);
    dayEnd.setDate(dayEnd.getDate() + 1);
    
    const dayAnswers = relevantAnswers.filter(a => {
      const ts = a.timestamp?.toDate ? a.timestamp.toDate() : (a.timestamp ? new Date(a.timestamp) : null);
      return ts && ts >= dayStart && ts < dayEnd;
    });
    
    const total = dayAnswers.length;
    const correct = dayAnswers.filter(a => a.isCorrect).length;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;
    
    weeklyTrendData.push({
      day: dayNames[d.getDay()],
      successRate: rate
    });
  }

  // Konu Bazlı Performans Dağılımı (BarChart)
  const subjectMap = {};
  relevantAnswers.forEach(ans => {
    const sName = ans.sub_topic || 'Genel';
    if(!subjectMap[sName]) subjectMap[sName] = { total: 0, correct: 0 };
    subjectMap[sName].total += 1;
    if(ans.isCorrect) subjectMap[sName].correct += 1;
  });

  const chartData = Object.keys(subjectMap).map(sub => {
    const total = subjectMap[sub].total;
    const correct = subjectMap[sub].correct;
    return { subject: sub, success: Math.round((correct/total)*100) };
  }).slice(0, 6);

  const weakTopics = Object.keys(subjectMap).map(sub => {
    const total = subjectMap[sub].total;
    const err = total - subjectMap[sub].correct;
    const errRate = Math.round((err/total)*100);
    return { subject: sub, errorRate: errRate };
  }).filter(t => t.errorRate > 50).sort((a,b) => b.errorRate - a.errorRate).slice(0, 5);

  const currentPath = location.pathname;
  let activeTabName = "Analiz Panosu";
  if(currentPath.includes("students")) activeTabName = "Öğrenci İzleme & Yönetim";
  if(currentPath.includes("tests")) activeTabName = "Atanan Ödevler & Testler";
  if(currentPath.includes("questions")) activeTabName = "Soru Havuzu";
  if(currentPath.includes("profile")) activeTabName = "Öğretmen Profili";

  return (
    <div className="dashboard animate-fade-in relative pb-20">
      <div className="dashboard-header mb-6 flex justify-between items-center">
        <div>
          <h1 className="page-title">{activeTabName}</h1>
          <p className="page-subtitle">Sınıfınızın genel gelişimini, analizlerini ve öğrenci durumlarını buradan takip edebilirsiniz.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={()=>setIsWizardOpen(true)} className="ds-btn-primary text-sm">
            <Sparkles size={18} /> Akıllı Ödev
          </button>

          <button onClick={()=>setIsTestModalOpen(true)} className="text-sm flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold transition-colors">
            <Plus size={18} /> Basit Ödev
          </button>

          <button onClick={()=>setIsAnnounceModalOpen(true)} className="text-sm flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-lime-500/40 bg-lime-500/10 hover:bg-lime-500/20 text-lime-700 font-semibold transition-colors">
            <Megaphone size={18} /> Duyuru Yayınla
          </button>

          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-card border border-hairline">
            <div className="flex items-center gap-1.5 text-ink-soft">
              <Key size={16} style={{ color: 'var(--accent-primary)' }} aria-hidden="true" />
              <span className="text-sm font-medium">Sınıf Kodu</span>
            </div>
            <span className="px-3 py-1 rounded-lg bg-leaf/10 border border-leaf/30 text-leaf-deep font-extrabold text-lg tracking-[0.25em] font-mono select-all">{classCode}</span>
            <div className="flex items-center gap-1">
              <button onClick={handleCopy} className="p-1.5 hover:bg-leaf/10 rounded-md transition-colors" style={{ color: 'var(--text-secondary)' }} aria-label={copied ? 'Sınıf kodu kopyalandı' : 'Sınıf kodunu kopyala'} title="Kodu Kopyala">
                {copied ? <Check size={16} style={{ color: 'var(--success)' }} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
              </button>
              <button onClick={handleRegenerateClassCode} disabled={regenerating} className="p-1.5 hover:bg-leaf/10 rounded-md transition-colors disabled:opacity-50" style={{ color: 'var(--text-secondary)' }} aria-label="Sınıf kodunu yenile" title="Kodu Yenile">
                <RefreshCw size={15} className={regenerating ? 'animate-spin' : ''} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <Routes>
        <Route index element={<AnalyticsTab stats={{totalStudents, totalQuestions, successRate}} weakTopics={weakTopics} chartData={chartData} masteryChartData={masteryChartData} weeklyTrendData={weeklyTrendData} students={students} openStudentDetail={(s)=>setSelectedStudent(s)} />} />
        <Route path="students" element={<StudentsTab students={students} openStudentDetail={(s)=>setSelectedStudent(s)} userAnswers={userAnswers} handleApproveStudent={handleApproveStudent} handleRemoveStudent={handleRemoveStudent} />} />
        <Route path="tests" element={<TestsTab assignments={assignments} submissions={submissions} students={students} />} />
        <Route path="questions" element={<QuestionPool />} />
        <Route path="profile" element={<TeacherProfile summary={{ totalStudents, successRate, activeLast7 }} classCode={classCode} />} />
      </Routes>

      <CreateTestModal isOpen={isTestModalOpen} onClose={()=>setIsTestModalOpen(false)} user={currentUser()} />
      <SmartAssignmentWizard isOpen={isWizardOpen} onClose={()=>setIsWizardOpen(false)} />
      <CreateAnnouncementModal isOpen={isAnnounceModalOpen} onClose={()=>setIsAnnounceModalOpen(false)} user={currentUser()} classCode={classCode} />
      <StudentDetailModal isOpen={!!selectedStudent} student={selectedStudent} onClose={()=>setSelectedStudent(null)} answers={userAnswers} />
    </div>
  );
}
