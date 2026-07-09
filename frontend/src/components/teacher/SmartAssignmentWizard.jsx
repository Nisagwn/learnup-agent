import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Sparkles, Check, X, ChevronRight, ChevronLeft, AlertTriangle, Wand2 } from 'lucide-react';
import { supabase } from '../../supabase';
import { currentUid } from '../../services/authApi';
import Modal from '../ui/Modal';
import MathMarkdown from '../MathMarkdown';
import { FormField, Input, TextArea, Select } from '../ui/FormField';
import { useToast } from '../ToastProvider';
import { countMatchingQuestions, pickSmartSet, augmentWithAI } from '../../services/smartAssignmentApi';
import { approveQuestions } from '../../services/questionPoolApi';

const SUBJECTS = ['Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya', 'Din Kültürü', 'Felsefe'];
const GRADES = [9, 10, 11, 12];
const DUE_PRESETS = [
  { key: 'none', label: 'Yok', days: null },
  { key: 'tomorrow', label: 'Yarın', days: 1 },
  { key: '3d', label: '3 gün', days: 3 },
  { key: '1w', label: '1 hafta', days: 7 },
  { key: '2w', label: '2 hafta', days: 14 },
];

const splitCsv = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

export default function SmartAssignmentWizard({ isOpen, onClose }) {
  const { success, error } = useToast();
  const [step, setStep] = useState(1);

  // Adım 1
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Matematik');
  const [duePreset, setDuePreset] = useState('1w');

  // Adım 2 filtreler
  const [grades, setGrades] = useState(() => new Set([10]));
  const [difficulty, setDifficulty] = useState('mixed');
  const [topicsText, setTopicsText] = useState('');
  const [subTopicsText, setSubTopicsText] = useState('');
  const [count, setCount] = useState(5);
  const [strict, setStrict] = useState(true);

  const [matchCount, setMatchCount] = useState(null);
  const [rows, setRows] = useState([]);
  const [available, setAvailable] = useState(null);
  const [picking, setPicking] = useState(false);
  const [augmenting, setAugmenting] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());

  // Adım 3
  const [approving, setApproving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep(1); setTitle(''); setDescription(''); setSubject('Matematik'); setDuePreset('1w');
      setGrades(new Set([10])); setDifficulty('mixed'); setTopicsText(''); setSubTopicsText('');
      setCount(5); setStrict(true); setMatchCount(null); setRows([]); setAvailable(null); setExpanded(new Set());
    }
  }, [isOpen]);

  const filters = useMemo(() => ({
    subject,
    grades: Array.from(grades),
    difficulty,
    topics: splitCsv(topicsText),
    subTopics: splitCsv(subTopicsText),
    count: Number(count) || 5,
    strict,
  }), [subject, grades, difficulty, topicsText, subTopicsText, count, strict]);

  // Canlı "N soru uyuyor" — adım 2'de filtre değiştikçe
  useEffect(() => {
    if (!isOpen || step !== 2) return;
    let cancelled = false;
    setMatchCount('loading');
    countMatchingQuestions(filters)
      .then((n) => { if (!cancelled) setMatchCount(n); })
      .catch(() => { if (!cancelled) setMatchCount(0); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step, subject, difficulty, strict, topicsText, subTopicsText, Array.from(grades).join(',')]);

  const toggleGrade = (g) => setGrades((prev) => {
    const n = new Set(prev);
    if (n.has(g)) n.delete(g); else n.add(g);
    return n;
  });
  const toggleExpand = (id) => setExpanded((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const handlePick = async () => {
    setPicking(true);
    try {
      const res = await pickSmartSet(filters);
      setRows(res.rows);
      setAvailable(res.available);
    } catch (e) {
      error('Seçilemedi', e.message || 'Havuzdan soru seçilemedi.');
    } finally {
      setPicking(false);
    }
  };

  const missing = Math.max(0, (Number(count) || 5) - rows.length);

  const handleAugment = async () => {
    if (missing <= 0) return;
    setAugmenting(true);
    try {
      const aiRows = await augmentWithAI(filters, rows, missing);
      setRows((prev) => [...prev, ...aiRows]);
      success('AI Soruları Eklendi', `${aiRows.length} soru üretildi (onay bekliyor).`);
    } catch (e) {
      error('AI üretimi başarısız', e.message || 'Sorular üretilemedi.');
    } finally {
      setAugmenting(false);
    }
  };

  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  const unapprovedAI = rows.filter((r) => r.isAI && !r.verified);
  const canPublish = rows.length > 0 && unapprovedAI.length === 0;

  const handleApproveAll = async () => {
    const ids = unapprovedAI.map((r) => r.id);
    if (ids.length === 0) return;
    setApproving(true);
    try {
      await approveQuestions(ids);
      setRows((prev) => prev.map((r) => (ids.includes(r.id) ? { ...r, verified: true } : r)));
      success('Onaylandı', `${ids.length} AI sorusu yayına alındı.`);
    } catch (e) {
      error('Onaylanamadı', e.message || 'AI soruları onaylanamadı.');
    } finally {
      setApproving(false);
    }
  };

  const approveOne = async (id) => {
    try {
      await approveQuestions([id]);
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, verified: true } : r)));
    } catch (e) {
      error('Onaylanamadı', e.message || 'Soru onaylanamadı.');
    }
  };

  const computeDueDate = () => {
    const preset = DUE_PRESETS.find((p) => p.key === duePreset);
    if (!preset || preset.days == null) return null;
    const d = new Date();
    d.setDate(d.getDate() + preset.days);
    d.setHours(23, 59, 0, 0);
    return d;
  };

  const handlePublish = async () => {
    if (!canPublish || publishing) return;
    const uid = currentUid();
    if (!uid) return;
    setPublishing(true);
    try {
      const due = computeDueDate();
      // NOT: assignments tablosunda title/description/max_score kolonları yok — atlanır.
      const { error: insErr } = await supabase.from('assignments').insert({
        teacher_id: uid,
        subject,
        topic: filters.topics[0] || filters.subTopics[0] || 'Akıllı Set',
        question_count: rows.length,
        question_ids: rows.map((r) => r.id),
        due_date: due ? due.toISOString() : null,
        status: 'active',
        // created_at: DB varsayılanı now()
      });
      if (insErr) throw insErr;
      success('Ödev Yayınlandı! 🎯', `${rows.length} soruluk akıllı ödev sınıfa atandı.`);
      onClose();
    } catch (e) {
      console.error('Akıllı ödev yayınlanamadı:', e);
      error('Yayınlanamadı', e.message || 'Ödev oluşturulamadı.');
    } finally {
      setPublishing(false);
    }
  };

  const canNext = step === 1 ? (!!subject && title.trim().length > 0)
    : step === 2 ? rows.length > 0
    : step === 3 ? canPublish
    : true;

  const footer = (
    <>
      {step > 1 ? (
        <button type="button" className="ds-btn-ghost flex items-center gap-1" onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft size={15} /> Geri
        </button>
      ) : (
        <button type="button" className="ds-btn-ghost" onClick={onClose}>Vazgeç</button>
      )}
      {step < 4 ? (
        <button type="button" className="ds-btn-primary flex items-center gap-1" onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
          İleri <ChevronRight size={15} />
        </button>
      ) : (
        <button type="button" className="ds-btn-primary flex items-center gap-1.5" onClick={handlePublish} disabled={!canPublish || publishing}>
          {publishing ? <><Loader2 size={15} className="animate-spin" /> Yayınlanıyor…</> : <>Yayınla ({rows.length})</>}
        </button>
      )}
    </>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Akıllı Ödev Oluştur" footer={footer}>
      {/* Adım göstergesi */}
      <div className="flex items-center gap-2 mb-4 text-xs">
        {['Temel', 'Sorular', 'İnceleme', 'Yayınla'].map((label, i) => {
          const n = i + 1;
          return (
            <div key={label} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg ${step === n ? 'bg-lime-500/20 text-lime-700' : step > n ? 'text-emerald-400' : 'text-slate-500'}`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${step === n ? 'bg-lime-500 text-white' : step > n ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                {step > n ? <Check size={11} /> : n}
              </span>
              {label}
            </div>
          );
        })}
      </div>

      {/* ADIM 1 */}
      {step === 1 && (
        <div className="flex flex-col gap-3">
          <FormField label="Başlık" required>
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn: Türev Tekrar Ödevi" />
          </FormField>
          <FormField label="Açıklama">
            <TextArea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Öğrenciye görünür kısa açıklama (opsiyonel)" />
          </FormField>
          <div className="flex gap-3 flex-wrap">
            <FormField label="Ders" className="flex-1 min-w-[140px]">
              <Select value={subject} onChange={(e) => setSubject(e.target.value)}>
                {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </FormField>
            <FormField label="Son Tarih" className="flex-1 min-w-[140px]">
              <Select value={duePreset} onChange={(e) => setDuePreset(e.target.value)}>
                {DUE_PRESETS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </Select>
            </FormField>
          </div>
        </div>
      )}

      {/* ADIM 2 */}
      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1.5">Sınıflar</label>
            <div className="flex gap-1.5">
              {GRADES.map((g) => (
                <button key={g} type="button" onClick={() => toggleGrade(g)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${grades.has(g) ? 'bg-lime-500/20 text-lime-700 border-lime-600/50' : 'bg-white/5 text-slate-300 border-white/10'}`}>
                  {g}. Sınıf
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <FormField label="Zorluk" className="w-36">
              <Select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                <option value="mixed">Karışık</option>
                <option value="easy">Kolay</option>
                <option value="medium">Orta</option>
                <option value="hard">Zor</option>
              </Select>
            </FormField>
            <FormField label="Soru Sayısı" className="w-28">
              <Input type="number" min="1" max="30" value={count} onChange={(e) => setCount(e.target.value)} />
            </FormField>
            <label className="flex items-center gap-2 text-xs text-slate-300 mt-6">
              <input type="checkbox" checked={strict} onChange={(e) => setStrict(e.target.checked)} />
              Konu-dışı soru gelmesin (strict)
            </label>
          </div>
          <FormField label="Konular (virgülle, opsiyonel)">
            <Input type="text" value={topicsText} onChange={(e) => setTopicsText(e.target.value)} placeholder="Örn: Türev, İntegral" />
          </FormField>
          <FormField label="Alt konular (virgülle, opsiyonel)">
            <Input type="text" value={subTopicsText} onChange={(e) => setSubTopicsText(e.target.value)} placeholder="Örn: Zincir Kuralı" />
          </FormField>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-slate-400">
              {matchCount === 'loading' ? 'Sayılıyor…' : matchCount != null ? `Bu kriterlere ~${matchCount} soru uyuyor` : ''}
            </span>
            <button type="button" onClick={handlePick} disabled={picking} className="ds-btn-primary !py-1.5 !text-xs flex items-center gap-1.5">
              {picking ? <><Loader2 size={13} className="animate-spin" /> Seçiliyor…</> : <><Wand2 size={14} /> Havuzdan Seç</>}
            </button>
          </div>

          {available != null && (
            <div className="text-xs text-slate-400">
              Havuzdan {rows.filter((r) => !r.isAI).length} soru seçildi
              {missing > 0 && (
                <span className="ml-2 text-amber-400">— {missing} soru eksik.</span>
              )}
            </div>
          )}

          {missing > 0 && available != null && (
            <div className="self-start flex flex-col gap-1.5">
              <button type="button" onClick={handleAugment} disabled={augmenting} className="text-xs font-semibold px-3 py-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center gap-1.5 disabled:opacity-60">
                {augmenting ? <><Loader2 size={13} className="animate-spin" /> Hazırlanıyor…</> : <><Sparkles size={14} /> Eksik {missing} soruyu Yapay Zekâ ile üret</>}
              </button>
              {augmenting && (
                <span className="text-[11px] text-slate-400">Sorular üretiliyor ve kalite kontrolünden geçiriliyor — 30 saniyeye kadar sürebilir.</span>
              )}
            </div>
          )}

          {/* Seçili sorular */}
          {rows.length > 0 && (
            <div className="flex flex-col gap-2 mt-1">
              <p className="text-xs font-semibold text-slate-300">Seçili Sorular ({rows.length})</p>
              {rows.map((r) => (
                <div key={r.id} className="p-2.5 bg-white/5 border border-white/5 rounded-xl">
                  <div className="flex items-start gap-2">
                    <button type="button" onClick={() => toggleExpand(r.id)} className="text-left flex-1 min-w-0">
                      <div className="text-xs text-slate-100 line-clamp-2"><MathMarkdown inline>{r.text}</MathMarkdown></div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                        <span>{r.grade}. sınıf</span><span>· {({ easy: 'Kolay', medium: 'Orta', hard: 'Zor' }[r.difficulty]) || r.difficulty}</span>
                        {r.isAI && <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300">✨ Yapay Zekâ · onay bekliyor</span>}
                      </div>
                    </button>
                    <button type="button" onClick={() => removeRow(r.id)} aria-label="Çıkar" className="text-slate-400 hover:text-red-400"><X size={14} /></button>
                  </div>
                  {expanded.has(r.id) && Array.isArray(r.options) && (
                    <ul className="mt-2 text-[11px] flex flex-col gap-0.5">
                      {r.options.map((o, i) => (
                        <li key={i} className={o === r.answer ? 'text-emerald-400 font-semibold' : 'text-slate-400'}>
                          {['A', 'B', 'C', 'D', 'E'][i]}) <MathMarkdown inline>{String(o)}</MathMarkdown>{o === r.answer ? ' ✓' : ''}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ADIM 3 */}
      {step === 3 && (
        <div className="flex flex-col gap-3">
          {unapprovedAI.length > 0 ? (
            <div className="ds-card ds-card--compact !bg-amber-500/5 !border-amber-500/20 flex items-center gap-2 flex-wrap">
              <AlertTriangle size={16} className="text-amber-400" />
              <span className="text-xs text-amber-200 flex-1">{unapprovedAI.length} AI sorusu onay bekliyor — yayından önce onayla.</span>
              <button type="button" onClick={handleApproveAll} disabled={approving} className="text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg flex items-center gap-1">
                {approving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Tümünü Onayla
              </button>
            </div>
          ) : (
            <div className="ds-card ds-card--compact !bg-emerald-500/5 !border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <Check size={15} /> Tüm sorular yayına hazır ({rows.length}).
            </div>
          )}

          <div className="flex flex-col gap-2">
            {rows.map((r) => (
              <div key={r.id} className="p-2.5 bg-white/5 border border-white/5 rounded-xl flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-slate-100 line-clamp-2"><MathMarkdown inline>{r.text}</MathMarkdown></div>
                  <div className="flex items-center gap-1.5 mt-1 text-[10px] text-slate-400">
                    <span>{r.grade}. sınıf · {({ easy: 'Kolay', medium: 'Orta', hard: 'Zor' }[r.difficulty]) || r.difficulty}</span>
                    {r.isAI && (r.verified
                      ? <span className="text-emerald-400">✓ onaylı</span>
                      : <span className="text-amber-400">✨ Yapay Zekâ · onay bekliyor</span>)}
                  </div>
                </div>
                {r.isAI && !r.verified && (
                  <button type="button" onClick={() => approveOne(r.id)} className="text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1 rounded-lg">Onayla</button>
                )}
                <button type="button" onClick={() => removeRow(r.id)} aria-label="Çıkar" className="text-slate-400 hover:text-red-400"><X size={14} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ADIM 4 */}
      {step === 4 && (
        <div className="flex flex-col gap-3">
          <div className="ds-card ds-card--snug">
            <div className="text-sm font-bold text-white mb-2">{title || `${subject} Akıllı Ödevi`}</div>
            {description && <p className="text-xs text-slate-400 mb-2">{description}</p>}
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
              <div>Ders: <strong>{subject}</strong></div>
              <div>Soru: <strong>{rows.length}</strong></div>
              <div>Zorluk: <strong>{({ easy: 'Kolay', medium: 'Orta', hard: 'Zor', mixed: 'Karışık' }[difficulty]) || difficulty}</strong></div>
              <div>Son tarih: <strong>{DUE_PRESETS.find((p) => p.key === duePreset)?.label}</strong></div>
            </div>
          </div>
          {!canPublish && (
            <div className="text-xs text-amber-400 flex items-center gap-1.5"><AlertTriangle size={14} /> Önce tüm AI sorularını onayla.</div>
          )}
          <p className="text-xs text-slate-500">Öğrencilere yalnızca onaylı (verified) sorular gider.</p>
        </div>
      )}
    </Modal>
  );
}
