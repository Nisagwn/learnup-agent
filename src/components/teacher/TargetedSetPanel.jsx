import React, { useEffect, useMemo, useState } from 'react';
import {
  Crosshair, Send, Trash2, CheckCircle2, Loader2, Plus, X, Check,
  ShieldCheck, AlertTriangle, ChevronLeft, Eye,
} from 'lucide-react';
import { FormField, Input, TextArea, Select } from '../ui/FormField';
import MathMarkdown from '../MathMarkdown';
import { useToast } from '../ToastProvider';
import { formatDate } from '../../utils/formatDate';
import {
  createTargetedAssignment, subscribeStudentTargetedAssignments, deleteTargetedAssignment,
  fetchTargetedQuestions, publishTargetedAssignment,
} from '../../services/targetedAssignmentsApi';
import { approveQuestions } from '../../services/questionPoolApi';

const SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya', 'Din Kültürü', 'Felsefe'];

// Öğretmen → öğrenciye hedefli set: oluştur → ÖNİZLE → onayla → gönder. StudentDetailModal içinde gömülü.
// Set backend'de `status:'draft'` oluşturulur (öğrenciye görünmez); yalnız onaylanıp yayınlanınca gider.
export default function TargetedSetPanel({ student, weakSubTopics = [] }) {
  const { success, error } = useToast();
  const [subject, setSubject] = useState('');
  const [focus, setFocus] = useState(() => new Set());
  const [manual, setManual] = useState('');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [source, setSource] = useState('ai');
  const [rationale, setRationale] = useState('');
  const [sending, setSending] = useState(false);

  // Önizleme / onay aşaması
  const [phase, setPhase] = useState('form'); // 'form' | 'preview'
  const [draftId, setDraftId] = useState(null);
  const [preview, setPreview] = useState([]);
  const [approving, setApproving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [history, setHistory] = useState([]);

  useEffect(() => {
    if (!student?.id) return;
    const unsub = subscribeStudentTargetedAssignments(student.id, (list) => setHistory(list), () => {});
    return () => unsub?.();
  }, [student?.id]);

  const toggleFocus = (st) => setFocus((prev) => {
    const n = new Set(prev);
    if (n.has(st)) n.delete(st); else n.add(st);
    return n;
  });

  const focusList = useMemo(() => {
    const manualArr = manual.split(',').map((s) => s.trim()).filter(Boolean);
    return Array.from(new Set([...focus, ...manualArr]));
  }, [focus, manual]);

  const resetForm = () => {
    setPhase('form'); setDraftId(null); setPreview([]);
    setFocus(new Set()); setManual(''); setRationale('');
  };

  // 1) Taslak oluştur + soruları önizlemeye getir (öğrenciye HENÜZ gitmez)
  const handleCreate = async () => {
    if (!subject) { error('Eksik Bilgi', 'Lütfen ders seçin.'); return; }
    if (sending) return;
    setSending(true);
    try {
      // Sözleşme: focusSubTopics max 5, rationale max 300; ilk eleman backend'de odak konu olur.
      const { id, questionIds } = await createTargetedAssignment({
        studentId: student.id,
        subject,
        focusSubTopics: focusList.slice(0, 5),
        count: Number(count) || 5,
        difficulty,                       // "easy" | "medium" | "hard" — backend filtre/üretim parametresi
        source,                           // "pool" | "ai" — backend kaynağı belirler
        rationale: rationale.trim().slice(0, 300),
      });
      const qs = await fetchTargetedQuestions(questionIds);
      setDraftId(id);
      setPreview(qs);
      setPhase('preview');
    } catch (e) {
      error('Oluşturulamadı', e.message || 'Set oluşturulamadı.');
    } finally {
      setSending(false);
    }
  };

  const unverified = useMemo(() => preview.filter((q) => q.isAI && !q.verified), [preview]);

  const handleApproveAll = async () => {
    if (approving || unverified.length === 0) return;
    setApproving(true);
    try {
      await approveQuestions(unverified.map((q) => q.id));
      setPreview((prev) => prev.map((q) => ({ ...q, verified: true })));
      success('Onaylandı', `${unverified.length} soru onaylandı.`);
    } catch (e) {
      error('Onaylanamadı', e.message || 'Sorular onaylanamadı.');
    } finally {
      setApproving(false);
    }
  };

  // 2) Onayla (gerekiyorsa) + öğrenciye gönder (draft → assigned)
  const handlePublish = async () => {
    if (publishing || !draftId) return;
    setPublishing(true);
    try {
      if (unverified.length > 0) {
        await approveQuestions(unverified.map((q) => q.id));
        setPreview((prev) => prev.map((q) => ({ ...q, verified: true })));
      }
      await publishTargetedAssignment(draftId, {
        focusSubTopics: focusList.slice(0, 5),
        rationale: rationale.trim().slice(0, 300),
      });
      success('Hedefli Set Gönderildi 🎯', `${student.name || student.email} için ${preview.length} soruluk set yayınlandı.`);
      resetForm();
    } catch (e) {
      error('Gönderilemedi', e.message || 'Set gönderilemedi.');
    } finally {
      setPublishing(false);
    }
  };

  // Taslağı iptal et (öğrenciye hiç gitmemişti) ve forma dön
  const handleDiscardDraft = async () => {
    const id = draftId;
    resetForm();
    if (id) {
      try { await deleteTargetedAssignment(id); } catch { /* yoksay */ }
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu hedefli set silinsin mi?')) return;
    try {
      await deleteTargetedAssignment(id);
      success('Silindi', 'Hedefli set kaldırıldı.');
    } catch (e) {
      error('Hata', e.message || 'Silinemedi.');
    }
  };

  return (
    <div className="mt-6 p-4 bg-white/5 border border-white/10 rounded-xl">
      <h3 className="text-md font-semibold text-lime-700 flex items-center gap-2 mb-3">
        <Crosshair size={18} /> Hedefli Set Gönder
      </h3>

      {phase === 'form' ? (
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 flex-wrap">
            <FormField label="Ders" required className="flex-1 min-w-[140px]">
              <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">Seçiniz...</option>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField label="Soru Sayısı" className="w-28">
              <Select value={count} onChange={(e) => setCount(e.target.value)}>
                {[3, 5, 10].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </FormField>
            <FormField label="Zorluk" className="w-32">
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="easy">Kolay</option>
                <option value="medium">Orta</option>
                <option value="hard">Zor</option>
              </Select>
            </FormField>
            <FormField label="Kaynak" className="w-36">
              <Select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="ai">Yapay Zekâ üret</option>
                <option value="pool">Havuzdan</option>
              </Select>
            </FormField>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Odak alt konular (öğrencinin zayıf konularından)</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {weakSubTopics.length === 0 && <span className="text-xs text-slate-500">Zayıf konu verisi yok — manuel ekleyebilirsin.</span>}
              {weakSubTopics.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => toggleFocus(st)}
                  className={`text-[11px] px-2 py-1 rounded-lg border transition ${
                    focus.has(st) ? 'bg-lime-500/20 text-lime-700 border-lime-600/50' : 'bg-white/5 text-slate-300 border-white/10 hover:text-white'
                  }`}
                >
                  {focus.has(st) ? '✓ ' : ''}{st}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Plus size={13} className="text-slate-400" />
              <Input type="text" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Manuel alt konu (virgülle ayır)" />
            </div>
          </div>

          <FormField label="Not (öğrenciye görünür, opsiyonel)">
            <TextArea value={rationale} onChange={(e) => setRationale(e.target.value)} rows={2} placeholder="Örn: Türev konusunda eksiklerin var, bu seti çöz." />
          </FormField>

          <button type="button" onClick={handleCreate} disabled={sending} className="ds-btn-primary self-start flex items-center gap-1.5 disabled:opacity-60">
            {sending ? <><Loader2 size={15} className="animate-spin" /> Hazırlanıyor…</> : <><Eye size={15} /> Oluştur ve Önizle</>}
          </button>
          {sending && (
            <span className="text-[11px] text-slate-400">Sorular hazırlanıyor ve kalite kontrolünden geçiriliyor — 30 saniyeye kadar sürebilir.</span>
          )}
        </div>
      ) : (
        /* ── ÖNİZLEME / ONAY ── */
        <div className="flex flex-col gap-3">
          {unverified.length > 0 ? (
            <div className="ds-card ds-card--compact !bg-amber-500/5 !border-amber-500/20 flex items-center gap-2 flex-wrap">
              <AlertTriangle size={16} className="text-amber-400" />
              <span className="text-xs text-amber-200 flex-1">
                {unverified.length} soru onay bekliyor. Önizleyip onayladıktan sonra öğrenciye gönderebilirsin.
              </span>
              <button type="button" onClick={handleApproveAll} disabled={approving} className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-60">
                {approving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Tümünü Onayla
              </button>
            </div>
          ) : (
            <div className="ds-card ds-card--compact !bg-emerald-500/5 !border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <ShieldCheck size={15} /> Tüm sorular onaylı — öğrenciye göndermeye hazır ({preview.length}).
            </div>
          )}

          <p className="text-xs font-semibold text-slate-300">Önizleme — {preview.length} soru</p>
          <div className="flex flex-col gap-2 max-h-[46vh] overflow-y-auto pr-1">
            {preview.length === 0 && (
              <div className="text-xs text-slate-500 italic">Soru yüklenemedi. Vazgeçip tekrar deneyin.</div>
            )}
            {preview.map((q, idx) => (
              <div key={q.id || idx} className="p-2.5 bg-white/5 border border-white/5 rounded-xl">
                <div className="flex items-start gap-2">
                  <span className="text-[11px] font-bold text-slate-500 mt-0.5">{idx + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-slate-100"><MathMarkdown inline>{q.question}</MathMarkdown></div>
                    {Array.isArray(q.choices) && q.choices.length > 0 && (
                      <ul className="mt-1.5 text-[11px] flex flex-col gap-0.5">
                        {q.choices.map((o, i) => (
                          <li key={i} className={o === q.answer ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                            {['A', 'B', 'C', 'D', 'E'][i]}) <MathMarkdown inline>{String(o)}</MathMarkdown>{o === q.answer ? ' ✓' : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="flex items-center gap-1.5 mt-1.5 text-[10px] text-slate-400">
                      {q.grade && <span>{q.grade}. sınıf</span>}
                      <span>· {({ easy: 'Kolay', medium: 'Orta', hard: 'Zor' }[q.difficulty]) || q.difficulty}</span>
                      {q.isAI && (q.verified
                        ? <span className="text-emerald-400">✓ onaylı</span>
                        : <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">✨ Yapay Zekâ · onay bekliyor</span>)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
            <button type="button" onClick={handleDiscardDraft} disabled={publishing} className="ds-btn-ghost !text-xs flex items-center gap-1.5 disabled:opacity-60">
              <ChevronLeft size={14} /> Vazgeç
            </button>
            <button type="button" onClick={handlePublish} disabled={publishing || preview.length === 0} className="ds-btn-primary flex items-center gap-1.5 disabled:opacity-60">
              {publishing ? <><Loader2 size={15} className="animate-spin" /> Gönderiliyor…</> : <><Send size={15} /> Onayla ve Öğrenciye Gönder</>}
            </button>
          </div>
          <p className="text-[11px] text-slate-500">Öğrenciye yalnızca onayladığın sorular ve sen gönderdikten sonra ulaşır.</p>
        </div>
      )}

      {/* Geçmiş */}
      {history.length > 0 && (
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-slate-300 mb-2">Gönderilen Setler</h4>
          <div className="flex flex-col gap-2">
            {history.map((t) => {
              const done = t.status === 'completed';
              const draft = t.status === 'draft';
              return (
                <div key={t.id} className="flex items-center gap-2 p-2.5 bg-white/5 rounded-lg border border-white/5 text-xs">
                  <span className="px-2 py-0.5 bg-lime-500/15 text-lime-700 rounded">{t.subject}</span>
                  <span className="text-slate-400 truncate flex-1">{t.focusSubTopics.join(', ') || '—'}</span>
                  {done ? (
                    <span className="text-emerald-300 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={12} /> {t.score != null ? `${t.score}/${t.maxScore}` : 'Bitti'}
                    </span>
                  ) : draft ? (
                    <span className="text-slate-400 font-semibold">Taslak (gönderilmedi)</span>
                  ) : (
                    <span className="text-amber-300 font-semibold">Aktif</span>
                  )}
                  <span className="text-slate-500">{formatDate(t.createdAtMs ? new Date(t.createdAtMs) : null)}</span>
                  <button type="button" onClick={() => handleDelete(t.id)} aria-label="Sil" className="text-red-400 hover:text-red-300">
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
