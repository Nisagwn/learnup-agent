import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Sparkles, Pencil, Trash2, Library, Loader2, Check, SearchX, Tag, ChevronDown, ChevronRight } from 'lucide-react';
import { auth, db } from '../firebase';
import { useUserStats } from '../contexts/UserStatsContext';
import { collection, query, where, onSnapshot, addDoc, updateDoc, deleteDoc, doc, limit } from 'firebase/firestore';
import { safeServerTimestamp } from '../utils/safeTimestamp';
import { useToast } from '../components/ToastProvider';
import MathMarkdown from '../components/MathMarkdown';
import Modal from '../components/ui/Modal';
import { FormField, Input, TextArea, Select } from '../components/ui/FormField';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { subscribePendingAIQuestions } from '../services/questionPoolApi';
import { suggestTopicForQuestion } from '../utils/aiService'; // GEÇİCİ: etiketsiz pending için AI konu
import './QuestionPool.css';

// Quiz.jsx getSubjectMapping ile uyumlu — sorular `category` (İngilizce) ile sorgulanır
const SUBJECT_EN = {
  'Matematik': 'Mathematics',
  'Fizik': 'Physics',
  'Kimya': 'Chemistry',
  'Biyoloji': 'Biology',
  'Edebiyat': 'Turkish Language and Literature',
  'Coğrafya': 'Geography',
  'Din Kültürü': 'Religion and Ethics',
  'Felsefe': 'Philosophy',
};
const SUBJECTS = Object.keys(SUBJECT_EN);
const SUBJECT_TR = Object.fromEntries(Object.entries(SUBJECT_EN).map(([tr, en]) => [en, tr]));

// Yer-tutucu (anlamsız) etiket: boş, 'genel' ya da doğrudan ders adının kopyası.
// AI ile üretirken konu girilmezse topic ders adına düşüyor (functions/index.js) →
// sistem "etiketli" sanıyor ama gerçek konu yok. Bunları sıfırlayıp yeniden etiketleriz.
const isPlaceholderTopic = (q) => {
  const t = (q.topic || '').trim().toLowerCase();
  if (!t || t === 'genel') return true;
  const subj = String(q.subjectTr || SUBJECT_TR[q.category] || q.category || '').trim().toLowerCase();
  const cat = String(q.category || '').trim().toLowerCase();
  return (subj && t === subj) || (cat && t === cat);
};

// Sorunun Türkçe ders adı (chip mantığıyla aynı).
const subjOf = (q) => q.subjectTr || SUBJECT_TR[q.category] || q.category || '';

// Konu tekilleştirme anahtarı: boşlukları sadeleştir + Türkçe küçük harf.
// "Türev" / "türev " / "TÜREV" → aynı anahtar (mantıksız tekrarları önler).
const normTopic = (s) => String(s || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
// Daha "düzgün yazılmış" varyantı seç (baş harfi büyük olanı tercih et).
const TITLE_RE = /^[A-ZÇĞİÖŞÜ]/;

// Öğretmenin serbest-metin branşını ('Matematik Öğretmeni') bir SUBJECTS girdisine
// eşler. Birden çok eşleşmede en uzun olanı seçer; eşleşme yoksa null.
const resolveBranchSubject = (branch) => {
  const b = String(branch || '').trim().toLowerCase();
  if (!b) return null;
  return SUBJECTS.filter((s) => b.includes(s.toLowerCase())).sort((a, c) => c.length - a.length)[0] || null;
};

const DIFFICULTIES = [
  { value: 'easy', label: 'Kolay' },
  { value: 'medium', label: 'Orta' },
  { value: 'hard', label: 'Zor' },
];
const GRADES = ['9', '10', '11', '12'];

const FIREBASE_PROJECT_ID = 'learnup-3cdb7';
const BACKEND_BASE = import.meta.env.VITE_BACKEND_BASE_URL || (import.meta.env.DEV
  ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/us-central1`
  : `https://us-central1-${FIREBASE_PROJECT_ID}.cloudfunctions.net`);

// Form verisinden kaydedilebilir Firestore döküman gövdesi üretir
const buildQuestionDoc = (subjectTr, topic, grade, difficulty, options, correctIndex, questionText, explanation, teacherId, isAI, qualityScore) => {
  const correctText = options[correctIndex];
  const docBody = {
    category: SUBJECT_EN[subjectTr] || subjectTr,
    subject: SUBJECT_EN[subjectTr] || subjectTr,
    subjectTr,
    topic: topic.trim(),
    sub_topic: topic.trim(),
    text: questionText.trim(),
    question_text: questionText.trim(),
    options: options.map(o => o.trim()),
    correctAnswer: correctText.trim(),
    correct_answer: correctText.trim(),
    difficulty,
    grade: String(grade),
    explanation: (explanation || '').trim(),
    teacherId,
    is_ai_generated: !!isAI,
    isAI: !!isAI,
    // Manuel sorular güvenilir → doğrudan yayında; AI soruları onay bekler.
    verified: !isAI,
  };
  // Backend verifier puanı (1-5). Yalnızca sayıysa yaz — düzenlemede mevcut puanı silmesin.
  if (typeof qualityScore === 'number') docBody.qualityScore = qualityScore;
  return docBody;
};

// ─── MANUEL SORU EDİTÖRÜ ─────────────────────────────────────────────
const QuestionEditorModal = ({ isOpen, onClose, teacherId, editing, defaultSubject = 'Matematik' }) => {
  const { success, error } = useToast();
  const [subject, setSubject] = useState(defaultSubject);
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('10');
  const [difficulty, setDifficulty] = useState('medium');
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setSubject(SUBJECT_TR[editing.category] || editing.subjectTr || 'Matematik');
      setTopic(editing.topic || '');
      setGrade(String(editing.grade || '10'));
      setDifficulty(editing.difficulty || 'medium');
      setQuestionText(editing.text || editing.question_text || '');
      const opts = Array.isArray(editing.options) ? editing.options : [];
      const padded = [0, 1, 2, 3].map(i => opts[i] || '');
      setOptions(padded);
      const correct = editing.correctAnswer || editing.correct_answer;
      const idx = padded.findIndex(o => o === correct);
      setCorrectIndex(idx >= 0 ? idx : 0);
      setExplanation(editing.explanation || '');
    } else {
      setSubject(defaultSubject); setTopic(''); setGrade('10'); setDifficulty('medium');
      setQuestionText(''); setOptions(['', '', '', '']); setCorrectIndex(0); setExplanation('');
    }
  }, [isOpen, editing, defaultSubject]);

  const handleSave = async () => {
    if (!topic.trim() || !questionText.trim() || options.some(o => !o.trim())) {
      error('Eksik Bilgi', 'Konu, soru metni ve tüm seçenekler doldurulmalı.');
      return;
    }
    // Tek doğru cevap güvencesi: şıklar birbirinden farklı olmalı
    const trimmedOpts = options.map(o => o.trim());
    if (new Set(trimmedOpts).size !== trimmedOpts.length) {
      error('Tekrarlanan Şık', 'Şıklar birbirinden farklı olmalı — her sorunun tek bir doğru cevabı olmalı.');
      return;
    }
    setSaving(true);
    try {
      const docBody = buildQuestionDoc(subject, topic, grade, difficulty, options, correctIndex, questionText, explanation, teacherId, editing?.is_ai_generated);
      if (editing) {
        await updateDoc(doc(db, 'questions', editing.id), docBody);
        success('Soru Güncellendi', 'Değişiklikler kaydedildi.');
      } else {
        await addDoc(collection(db, 'questions'), { ...docBody, createdAt: safeServerTimestamp() });
        success('Soru Eklendi', 'Soru havuzunuza eklendi.');
      }
      onClose();
    } catch (err) {
      console.error('Soru kaydetme hatası:', err);
      error('Hata', 'Soru kaydedilirken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="md"
      title={editing ? 'Soruyu Düzenle' : 'Yeni Soru Ekle'}
      footer={
        <>
          <button type="button" className="ds-btn-ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" onClick={handleSave} disabled={saving} className="ds-btn-primary">
            {saving ? 'Kaydediliyor...' : (editing ? 'Değişiklikleri Kaydet' : 'Soruyu Ekle')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <FormField label="Ders" className="flex-1">
            <Select value={subject} onChange={e => setSubject(e.target.value)}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="Sınıf" className="w-24">
            <Select value={grade} onChange={e => setGrade(e.target.value)}>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </Select>
          </FormField>
          <FormField label="Zorluk" className="w-28">
            <Select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
              {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </Select>
          </FormField>
        </div>

        <FormField label="Konu Başlığı" required>
          <Input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Örn: Kalıtım Kanunları" />
        </FormField>

        <FormField label="Soru Metni" required>
          <TextArea value={questionText} onChange={e => setQuestionText(e.target.value)} rows={3} placeholder="Soru metni..." />
        </FormField>

        <fieldset className="form-field">
          <legend className="form-field__label">Seçenekler <span className="qp-hint-inline">(doğru olanı işaretleyin)</span></legend>
          <div className="flex flex-col gap-2 mt-1">
            {options.map((opt, idx) => {
              const letter = ['A', 'B', 'C', 'D'][idx];
              return (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correctOption"
                    checked={correctIndex === idx}
                    onChange={() => setCorrectIndex(idx)}
                    className="accent-emerald-500 w-4 h-4 flex-shrink-0"
                    aria-label={`${letter} seçeneğini doğru cevap olarak işaretle`}
                  />
                  <span className="qp-opt-letter" aria-hidden="true">{letter}</span>
                  <Input
                    type="text"
                    value={opt}
                    onChange={e => { const next = [...options]; next[idx] = e.target.value; setOptions(next); }}
                    placeholder={`${letter} seçeneği`}
                    aria-label={`${letter} seçeneği metni`}
                  />
                </div>
              );
            })}
          </div>
        </fieldset>

        <FormField label="Açıklama" hint="Opsiyonel — öğrenciye gösterilecek çözüm açıklaması">
          <TextArea value={explanation} onChange={e => setExplanation(e.target.value)} rows={2} placeholder="Çözüm açıklaması..." />
        </FormField>
      </div>
    </Modal>
  );
};

// ─── AI SORU ÜRETİCİ ─────────────────────────────────────────────────
const AIQuestionGeneratorModal = ({ isOpen, onClose, teacherId, defaultSubject = 'Matematik' }) => {
  const { success, error } = useToast();
  const [subject, setSubject] = useState(defaultSubject);
  const [topic, setTopic] = useState('');
  const [grade, setGrade] = useState('10');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState('medium');
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState([]); // [{...q, _saved}]

  useEffect(() => {
    if (isOpen) { setSubject(defaultSubject); }
    else { setGenerated([]); setTopic(''); }
  }, [isOpen, defaultSubject]);

  const handleGenerate = async () => {
    if (!topic.trim()) { error('Eksik Bilgi', 'Lütfen bir konu girin.'); return; }
    setLoading(true);
    setGenerated([]);
    try {
      const diffLabel = DIFFICULTIES.find(d => d.value === difficulty)?.label || 'Orta';
      const res = await fetch(`${BACKEND_BASE.replace(/\/$/, '')}/generateQuestions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: teacherId,
          subject,
          topic: topic.trim(),
          grade,
          count: Number(count) || 5,
          difficulty: diffLabel,
          quality: true, // öğretmen/havuz üretimi → 70b + verifier + top-up (düşük hacim, kaliteli)
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Üretim başarısız.');
      setGenerated((data.questions || []).map(q => ({ ...q, _saved: false })));
    } catch (err) {
      console.error('AI soru üretimi hatası:', err);
      error('Üretim Hatası', err.message || 'Sorular üretilemedi.');
    } finally {
      setLoading(false);
    }
  };

  // Üretilen bir soruyu havuza (questions koleksiyonu) kaydeder
  const handleAdd = async (idx) => {
    const q = generated[idx];
    if (!q || q._saved) return;
    try {
      const correctIndex = q.options.findIndex(o => o === q.correct_answer);
      const docBody = buildQuestionDoc(
        subject, topic, grade, difficulty,
        q.options, correctIndex >= 0 ? correctIndex : 0,
        q.question_text, q.explanation, teacherId, true,
        q.qualityScore,
      );
      await addDoc(collection(db, 'questions'), { ...docBody, createdAt: safeServerTimestamp() });
      setGenerated(prev => prev.map((item, i) => i === idx ? { ...item, _saved: true } : item));
      success('Eklendi', 'Soru havuzunuza eklendi.');
    } catch (err) {
      console.error('AI soru kaydetme hatası:', err);
      error('Hata', 'Soru kaydedilemedi.');
    }
  };

  const handleAddAll = async () => {
    for (let i = 0; i < generated.length; i++) {
      if (!generated[i]._saved) await handleAdd(i);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Yapay Zekâ ile Soru Üret">
      <p className="qp-modal-hint">Yapay zekânın ürettiği soruları inceleyip onayladıklarınızı havuza ekleyin.</p>

      <div className="flex gap-3 flex-wrap">
        <FormField label="Ders" className="flex-1 min-w-[140px]">
          <Select value={subject} onChange={e => setSubject(e.target.value)}>
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </Select>
        </FormField>
        <FormField label="Sınıf" className="w-24">
          <Select value={grade} onChange={e => setGrade(e.target.value)}>
            {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
          </Select>
        </FormField>
        <FormField label="Zorluk" className="w-28">
          <Select value={difficulty} onChange={e => setDifficulty(e.target.value)}>
            {DIFFICULTIES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
          </Select>
        </FormField>
        <FormField label="Adet" className="w-24">
          <Input type="number" min="1" max="10" value={count} onChange={e => setCount(e.target.value)} />
        </FormField>
      </div>

      <FormField label="Konu" required className="mt-3">
        <Input type="text" value={topic} onChange={e => setTopic(e.target.value)} placeholder="Örn: Mol Kavramı" />
      </FormField>

      <button onClick={handleGenerate} disabled={loading} className="ds-btn-primary w-full p-3 text-base mt-4 disabled:opacity-50 flex items-center justify-center gap-2">
        {loading ? <><Loader2 size={18} className="animate-spin" /> Hazırlanıyor…</> : <><Sparkles size={18} /> Soruları Üret</>}
      </button>
      {loading && (
        <p className="qp-modal-hint" style={{ marginTop: '0.6rem', textAlign: 'center' }}>
          Sorular üretiliyor ve kalite kontrolünden geçiriliyor — bu 30 saniyeye kadar sürebilir, lütfen bekleyin.
        </p>
      )}

      {generated.length > 0 && (
        <div className="qp-gen">
          <div className="qp-gen-head">
            <h3 className="qp-gen-title">Üretilen Sorular ({generated.length})</h3>
            <button onClick={handleAddAll} className="qp-link-btn">Tümünü Havuza Ekle</button>
          </div>
          <div className="qp-gen-list">
            {generated.map((q, idx) => (
              <div key={idx} className="qp-gen-card">
                <div className="qp-gen-q">
                  <MathMarkdown>{q.question_text}</MathMarkdown>
                </div>
                <ul className="qp-gen-opts">
                  {q.options.map((o, i) => (
                    <li key={i} className={o === q.correct_answer ? 'is-correct' : ''}>
                      <span className="qp-opt-letter">{['A', 'B', 'C', 'D', 'E'][i]})</span>
                      <MathMarkdown inline>{o}</MathMarkdown>
                      {o === q.correct_answer && <span>✓</span>}
                    </li>
                  ))}
                </ul>
                {q._saved ? (
                  <span className="qp-gen-saved"><Check size={14} /> Havuza eklendi</span>
                ) : (
                  <button onClick={() => handleAdd(idx)} className="qp-gen-add">
                    <Plus size={14} /> Havuza Ekle
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
};

// ─── ANA SORU HAVUZU SEKMESİ ─────────────────────────────────────────
export default function QuestionPool() {
  const { success, error } = useToast();
  const [searchParams] = useSearchParams();
  const teacherId = auth.currentUser?.uid;
  const [ownQuestions, setOwnQuestions] = useState([]);   // teacherId == me (her ders/durum)
  const [poolQuestions, setPoolQuestions] = useState([]); // branş havuzu (category in)
  const [pendingAI, setPendingAI] = useState([]);         // TEK KAYNAK onay kuyruğu (Inbox ile aynı)
  const [taggingId, setTaggingId] = useState(null);       // GEÇİCİ: AI ile etiketlenen satır
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [tab, setTab] = useState(searchParams.get('tab') === 'pending' ? 'pending' : 'all'); // 'all' | 'pending'

  // ── Akıllı filtreler (sınıf + konu/alt-konu + ders) ──
  const { userProfile } = useUserStats();
  const branchSubject = useMemo(() => resolveBranchSubject(userProfile?.branch), [userProfile?.branch]);
  const [selSubject, setSelSubject] = useState(null); // null = otomatik (branş); aksi halde 'all' | ders
  const [selTopics, setSelTopics] = useState(() => new Set()); // boş = tüm konular; '__none__' = Etiketsiz; çoklu seçim
  const [selGrades, setSelGrades] = useState(() => new Set()); // boş = tüm sınıflar
  const [collapsed, setCollapsed] = useState(() => new Set()); // kapalı grup anahtarları
  const [topicMenuOpen, setTopicMenuOpen] = useState(false);
  const topicMenuRef = useRef(null);

  // İki abonelik: (1) kendi sorularım, (2) branş havuzu (category in [EN, TR]).
  useEffect(() => {
    if (!teacherId) return undefined;
    let ownReady = false; let poolReady = false;
    const markLoaded = () => { if (ownReady && poolReady) setLoaded(true); };
    const unsubs = [];

    unsubs.push(onSnapshot(
      query(collection(db, 'questions'), where('teacherId', '==', teacherId)),
      (snap) => { setOwnQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoadError(false); ownReady = true; markLoaded(); },
      (err) => { console.warn('Kendi sorular yüklenemedi:', err); setLoadError(true); ownReady = true; markLoaded(); },
    ));

    if (branchSubject) {
      const cats = [...new Set([SUBJECT_EN[branchSubject], branchSubject].filter(Boolean))];
      unsubs.push(onSnapshot(
        query(collection(db, 'questions'), where('category', 'in', cats), limit(500)),
        (snap) => { setPoolQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); poolReady = true; markLoaded(); },
        (err) => { console.warn('Branş havuzu yüklenemedi:', err); poolReady = true; markLoaded(); }, // havuz hatası bloklamasın
      ));
    } else {
      poolReady = true; // branş yok → havuz aboneliği yok; merge yalnız kendi sorularımı kullanır
    }
    markLoaded();
    return () => unsubs.forEach(u => u());
  }, [teacherId, branchSubject]);

  // Onay bekleyen AI soruları — TEK KAYNAK (öğretmen Inbox sayacıyla AYNI sorgu).
  // Genel kuyruk (is_ai_generated && !verified); ana sayfa rozetiyle çatışmaz.
  useEffect(() => {
    if (!teacherId) return undefined;
    return subscribePendingAIQuestions(setPendingAI);
  }, [teacherId]);

  // Birleştir: branş havuzundan yalnız onaylı (verified!==false) ya da bana ait olanlar;
  // kendi sorularım her durumda. id'ye göre tekille (kendi sorum havuzdakini ezer).
  const questions = useMemo(() => {
    const map = new Map();
    if (branchSubject) {
      poolQuestions.forEach(q => { if (q.verified !== false || q.teacherId === teacherId) map.set(q.id, q); });
    }
    ownQuestions.forEach(q => map.set(q.id, q));
    return [...map.values()];
  }, [ownQuestions, poolQuestions, teacherId, branchSubject]);

  const handleDelete = async (id) => {
    try {
      await deleteDoc(doc(db, 'questions', id));
      success('Silindi', 'Soru havuzdan kaldırıldı.');
    } catch (err) {
      console.error('Soru silme hatası:', err);
      error('Hata', 'Soru silinemedi.');
    }
  };

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (q) => { setEditing(q); setEditorOpen(true); };

  // AI üretip onay bekleyen soruyu tek tıkla yayına alır (verified:true + onay izi).
  const handleApprove = async (id) => {
    try {
      await updateDoc(doc(db, 'questions', id), { verified: true, approvedBy: teacherId, approvedAt: safeServerTimestamp() });
      success('Onaylandı', 'Soru havuzda yayında.');
    } catch (err) {
      console.error('Soru onaylama hatası:', err);
      error('Hata', 'Soru onaylanamadı.');
    }
  };

  // GEÇİCİ (kullanıcı isteği): etiketsiz pending soruyu AI ile etiketle → topic/sub_topic yaz.
  // Soru pending kalır (verified değişmez); yalnız konu eklenir, "Etiketsiz" rozeti kalkar.
  const handleAiTag = async (q) => {
    if (taggingId) return;
    setTaggingId(q.id);
    try {
      const topic = await suggestTopicForQuestion({ text: q.text || q.question_text, subject: subjOf(q), grade: q.grade });
      await updateDoc(doc(db, 'questions', q.id), { topic, sub_topic: topic });
      success('Etiketlendi', `Konu: ${topic}`);
    } catch (err) {
      console.warn('AI etiketleme hatası:', err);
      error('Etiketlenemedi', 'AI konu öneremedi; "Konu Ekle" ile elle girebilirsin.');
    } finally {
      setTaggingId(null);
    }
  };

  // Onay bekleyen tüm AI sorularını toplu yayına alır.
  const handleApproveAll = async () => {
    const ids = pending.map((q) => q.id);
    if (ids.length === 0) return;
    try {
      await Promise.all(ids.map((id) => updateDoc(doc(db, 'questions', id), { verified: true, approvedBy: teacherId, approvedAt: safeServerTimestamp() })));
      success('Tümü Onaylandı', `${ids.length} soru yayında.`);
    } catch (err) {
      console.error('Toplu onay hatası:', err);
      error('Hata', 'Bazı sorular onaylanamadı.');
    }
  };

  // Onay bekleyen = TEK KAYNAK genel kuyruk (pendingAI). "Tüm Sorular" = yayında (verified!==false).
  // (Eskiden pending yerel merge'ten süzülüyordu → Inbox ile çatışıyordu; artık tek sorgu.)
  const pending = pendingAI;
  const visible = tab === 'pending' ? pendingAI : questions.filter(q => q.verified !== false);

  // ── Filtre seçeneklerini havuzdaki gerçek etiketlerden türet ──
  const subjectsPresent = useMemo(() => {
    const set = new Set();
    questions.forEach(q => { const s = subjOf(q); if (s) set.add(s); });
    return [...set].sort((a, b) => a.localeCompare(b, 'tr'));
  }, [questions]);

  // Seçili ders: kullanıcı seçtiyse o; seçmediyse branş (havuzda varsa) → otomatik. (Efekt yok.)
  const resolvedSubject = selSubject !== null
    ? selSubject
    : ((branchSubject && subjectsPresent.includes(branchSubject)) ? branchSubject : 'all');

  // Konu anahtarı → görünen etiket (en düzgün varyant). Tüm havuzdan; gruplama da kullanır.
  const topicLabelByKey = useMemo(() => {
    const m = new Map();
    questions.forEach(q => {
      if (isPlaceholderTopic(q)) return;
      const raw = (q.topic || '').trim().replace(/\s+/g, ' ');
      if (!raw) return;
      const key = normTopic(raw);
      const cur = m.get(key);
      if (!cur) m.set(key, raw);
      else if (TITLE_RE.test(raw) && !TITLE_RE.test(cur)) m.set(key, raw); // baş harfi büyük olanı yeğle
    });
    return m;
  }, [questions]);

  // Konu seçenekleri = yalnız `topic` (alt-konu/İngilizce gürültüsü yok), Türkçe-tekil.
  const topicOptions = useMemo(() => {
    const keys = new Set();
    questions.forEach(q => {
      if (resolvedSubject !== 'all' && subjOf(q) !== resolvedSubject) return;
      if (isPlaceholderTopic(q)) return;
      const k = normTopic(q.topic);
      if (k) keys.add(k);
    });
    return [...keys]
      .map(k => ({ key: k, label: topicLabelByKey.get(k) || k }))
      .sort((a, b) => a.label.localeCompare(b.label, 'tr'));
  }, [questions, resolvedSubject, topicLabelByKey]);

  const hasUntagged = useMemo(() => questions.some(isPlaceholderTopic), [questions]);

  // Konular açılır kutusu — dışarı tık / Esc ile kapat.
  useEffect(() => {
    if (!topicMenuOpen) return undefined;
    const onDown = (e) => { if (topicMenuRef.current && !topicMenuRef.current.contains(e.target)) setTopicMenuOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setTopicMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [topicMenuOpen]);

  // Aktif filtre (arama + ders + sınıf + konu) — tab sayaçları ve liste AYNI kümeyi kullansın
  // ki "Tüm Sorular" rozeti her zaman "listeleniyor" sayısıyla eşleşsin (ders dışı sapma olmasın).
  const matchesFilters = useCallback((q) => {
    const s = search.toLowerCase();
    const hay = `${q.topic || ''} ${q.text || q.question_text || ''} ${q.subjectTr || ''}`.toLowerCase();
    if (!hay.includes(s)) return false;
    if (resolvedSubject !== 'all' && subjOf(q) !== resolvedSubject) return false;
    if (selGrades.size && !selGrades.has(String(q.grade))) return false;
    if (selTopics.size) {
      const ok = (selTopics.has('__none__') && isPlaceholderTopic(q)) || selTopics.has(normTopic(q.topic));
      if (!ok) return false;
    }
    return true;
  }, [search, resolvedSubject, selGrades, selTopics]);

  // Süzme + branş-öncelikli, konu/sınıf sıralı liste.
  const organized = useMemo(() => {
    // Onay kuyruğu genel/filtresiz (Inbox sayısıyla birebir); "Tüm Sorular" filtreli.
    const base = tab === 'pending' ? visible : visible.filter(matchesFilters);
    const keyOf = (q) => {
      const subj = subjOf(q);
      const branchRank = (branchSubject && subj === branchSubject) ? 0 : 1;
      const topicKey = isPlaceholderTopic(q) ? '￿' : normTopic(q.topic);
      return [branchRank, subj.toLowerCase(), topicKey, String(q.grade)];
    };
    return [...base].sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      for (let i = 0; i < ka.length; i++) {
        const c = String(ka[i]).localeCompare(String(kb[i]), 'tr');
        if (c) return c;
      }
      return 0;
    });
  }, [visible, matchesFilters, branchSubject, tab]);

  // Tab rozet sayaçları — aktif filtreye göre (liste sayısıyla birebir eşleşsin).
  const allCount = useMemo(
    () => questions.filter(q => q.verified !== false && matchesFilters(q)).length,
    [questions, matchesFilters],
  );
  // Onay bekleyen rozeti = genel kuyruğun tamamı (filtresiz) → ana sayfa Inbox ile AYNI sayı.
  const pendingCount = pendingAI.length;

  // Konu (placeholder → "Etiketsiz") başlıklarına göre grupla — organized zaten sıralı.
  const multiSubject = subjectsPresent.length > 1 && resolvedSubject === 'all';
  const groups = useMemo(() => {
    const out = [];
    organized.forEach(q => {
      const subj = subjOf(q);
      const untag = isPlaceholderTopic(q);
      const tkey = untag ? '__none__' : normTopic(q.topic);
      const label = untag ? 'Etiketsiz' : (topicLabelByKey.get(tkey) || (q.topic || '').trim());
      const key = `${subj}|${tkey}`;
      const last = out[out.length - 1];
      if (last && last.key === key) last.items.push(q);
      else out.push({ key, subject: subj, topic: label, isUntagged: untag, items: [q] });
    });
    return out;
  }, [organized, topicLabelByKey]);

  const toggleGrade = (g) => setSelGrades(prev => {
    const n = new Set(prev); if (n.has(g)) n.delete(g); else n.add(g); return n;
  });
  const toggleGroup = (key) => setCollapsed(prev => {
    const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n;
  });
  const toggleTopic = (t) => setSelTopics(prev => {
    const n = new Set(prev); if (n.has(t)) n.delete(t); else n.add(t); return n;
  });
  const filtersActive = resolvedSubject !== 'all' || selTopics.size > 0 || selGrades.size > 0;
  const clearFilters = () => { setSelSubject('all'); setSelTopics(new Set()); setSelGrades(new Set()); };
  const changeSubject = (v) => { setSelSubject(v); setSelTopics(new Set()); };
  const topicButtonLabel = selTopics.size === 0
    ? 'Tüm Konular'
    : (selTopics.size === 1
      ? ([...selTopics][0] === '__none__' ? 'Etiketsiz' : (topicLabelByKey.get([...selTopics][0]) || [...selTopics][0]))
      : `${selTopics.size} konu seçili`);

  // Tek bir soru satırı (gruplar içinde yeniden kullanılır).
  const renderRow = (q) => {
    const subj = subjOf(q);
    const tag = (q.topic || '').trim();
    const untag = isPlaceholderTopic(q);
    return (
      <div key={q.id} className="qp-row">
        <div className="qp-row-main">
          <p className={`qp-row-q ${tab === 'pending' ? '' : 'qp-row-q--clamp'}`}>
            <MathMarkdown inline>{q.text || q.question_text}</MathMarkdown>
          </p>
          <div className="qp-row-meta">
            <span className="qp-badge qp-badge--subject">{subj}</span>
            {!untag
              ? <span className="qp-badge qp-badge--topic">{tag}</span>
              : <span className="qp-badge qp-badge--untagged">Etiketsiz</span>}
            <span className="qp-row-dot">{q.grade}. sınıf</span>
            {q.is_ai_generated && <span className="qp-row-dot qp-row-ai">✨ Yapay Zekâ</span>}
            {q.verified === false && <span className="qp-row-dot qp-row-pending">⏳ Onay bekliyor</span>}
          </div>
          {tab === 'pending' && Array.isArray(q.options) && q.options.length > 0 && (
            <ul className="qp-row-opts">
              {q.options.map((o, i) => {
                const correct = o === (q.correctAnswer || q.correct_answer);
                return (
                  <li key={i} className={correct ? 'is-correct' : ''}>
                    <span className="qp-opt-letter">{['A', 'B', 'C', 'D', 'E'][i]})</span> <MathMarkdown inline>{String(o)}</MathMarkdown>{correct ? ' ✓' : ''}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="qp-row-actions">
          {untag && (
            <>
              {/* GEÇİCİ: AI ile konu öner ve yaz */}
              <button onClick={() => handleAiTag(q)} disabled={taggingId === q.id} className="qp-konu-btn qp-konu-btn--ai" title="AI ile konu öner ve ekle">
                {taggingId === q.id
                  ? <><Loader2 size={13} className="animate-spin" aria-hidden="true" /> Etiketleniyor…</>
                  : <><Sparkles size={13} aria-hidden="true" /> AI ile Etiketle</>}
              </button>
              <button onClick={() => openEdit(q)} className="qp-konu-btn" title="Bu soruya konu ekle">
                <Tag size={13} aria-hidden="true" /> Konu Ekle
              </button>
            </>
          )}
          {q.verified === false && (
            <button onClick={() => handleApprove(q.id)} className="qp-approve-btn" title="Onayla">
              <Check size={14} aria-hidden="true" /> Onayla
            </button>
          )}
          <button onClick={() => openEdit(q)} className="qp-icon-btn" aria-label="Soruyu düzenle" title="Düzenle">
            <Pencil size={15} aria-hidden="true" />
          </button>
          <button onClick={() => handleDelete(q.id)} className="qp-icon-btn qp-icon-btn--danger" aria-label="Soruyu sil" title="Sil">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    );
  };

  const defaultSubject = branchSubject || 'Matematik';

  return (
    <div className="qp-page">
      <div className="qp-head">
        <h1 className="page-title">Soru Havuzu</h1>
        {branchSubject && <span className="qp-branch-chip">{branchSubject} havuzu</span>}
      </div>

      {/* Sekmeler */}
      <div className="qp-tabs">
        <button onClick={() => setTab('all')} className={`qp-tab ${tab === 'all' ? 'active' : ''}`}>
          Tüm Sorular
          <span className="qp-tab-count">{allCount}</span>
        </button>
        <button onClick={() => setTab('pending')} className={`qp-tab ${tab === 'pending' ? 'active' : ''}`}>
          Onay Bekleyen
          {pendingCount > 0 && <span className="qp-tab-count qp-tab-count--warn">{pendingCount}</span>}
        </button>
      </div>

      {/* Üst eylem çubuğu */}
      <div className="ds-card ds-card--compact qp-toolbar">
        <label htmlFor="question-search" className="sr-only">Soru ara</label>
        <input
          id="question-search"
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Konu veya soru metni ile ara..."
          className="qp-search"
        />
        <div className="qp-toolbar-actions">
          <button onClick={openNew} className="ds-btn-primary qp-tbtn">
            <Plus size={16} /> Yeni Soru
          </button>
          <button onClick={() => setAiOpen(true)} className="qp-btn qp-btn--violet">
            <Sparkles size={16} /> Yapay Zekâ ile Üret
          </button>
        </div>
      </div>

      {!branchSubject && loaded && (
        <div className="qp-note">
          Branşın ayarlı değil; yalnızca kendi soruların gösteriliyor. Havuzdan alanındaki tüm soruları görmek için <strong>Ayarlar → Branş</strong>'ı doldur.
        </div>
      )}

      {/* Akıllı filtre çubuğu — yalnız "Tüm Sorular" sekmesinde (onay kuyruğu geneldir) */}
      {loaded && !loadError && questions.length > 0 && tab !== 'pending' && (
        <div className="ds-card ds-card--compact qp-filterbar">
          <div>
            <span className="qp-filter-label">Sınıflar</span>
            <div className="qp-chips">
              {GRADES.map(g => (
                <button key={g} type="button" onClick={() => toggleGrade(g)}
                  className={`qp-chip ${selGrades.has(g) ? 'active' : ''}`}>
                  {g}. Sınıf
                </button>
              ))}
            </div>
          </div>
          <div className="qp-filter-row">
            {subjectsPresent.length > 1 && (
              <FormField label="Ders" className="qp-field-sm">
                <Select value={resolvedSubject} onChange={e => changeSubject(e.target.value)}>
                  <option value="all">Tüm Dersler</option>
                  {subjectsPresent.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </FormField>
            )}
            {(topicOptions.length > 0 || hasUntagged) && (
              <FormField label="Konular" className="qp-field-md">
                <div className="qp-dropdown-wrap" ref={topicMenuRef}>
                  <button type="button" onClick={() => setTopicMenuOpen(o => !o)}
                    className="qp-select-btn" aria-haspopup="listbox" aria-expanded={topicMenuOpen}>
                    <span className="qp-select-label">{topicButtonLabel}</span>
                    <ChevronDown size={15} className={`qp-select-caret ${topicMenuOpen ? 'open' : ''}`} aria-hidden="true" />
                  </button>
                  {topicMenuOpen && (
                    <div className="qp-dropdown" role="listbox">
                      {selTopics.size > 0 && (
                        <button type="button" onClick={() => setSelTopics(new Set())} className="qp-dropdown-clear">
                          Seçimi temizle
                        </button>
                      )}
                      {topicOptions.map(opt => (
                        <label key={opt.key} className="qp-dropdown-item">
                          <input type="checkbox" checked={selTopics.has(opt.key)} onChange={() => toggleTopic(opt.key)} />
                          <span className="qp-dropdown-text">{opt.label}</span>
                        </label>
                      ))}
                      {hasUntagged && (
                        <label className="qp-dropdown-item qp-dropdown-item--warn">
                          <input type="checkbox" checked={selTopics.has('__none__')} onChange={() => toggleTopic('__none__')} />
                          <span>Etiketsiz</span>
                        </label>
                      )}
                    </div>
                  )}
                </div>
              </FormField>
            )}
            {filtersActive && (
              <button type="button" onClick={clearFilters} className="ds-btn-ghost qp-clear-btn">Filtreleri Temizle</button>
            )}
          </div>
        </div>
      )}

      {/* Soru listesi */}
      {!loaded ? (
        <div aria-busy="true" className="qp-skeletons">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
      ) : loadError ? (
        <div className="ds-card">
          <ErrorState
            title="Soru havuzu yüklenemedi"
            description="Sorularınız alınırken bir sorun oluştu. Sayfayı yenileyip tekrar deneyin."
            onRetry={() => window.location.reload()}
          />
        </div>
      ) : organized.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={tab === 'pending' ? Check : (questions.length === 0 ? Library : SearchX)}
            title={tab === 'pending'
              ? 'Onay Bekleyen Soru Yok'
              : (questions.length === 0 ? 'Soru Havuzunuz Boş' : 'Eşleşen Soru Yok')}
            description={tab === 'pending'
              ? 'Yapay Zekâ ile üretilen sorular burada onayını bekler.'
              : (questions.length === 0
                ? '"Yeni Soru" ya da "Yapay Zekâ ile Üret" ile havuzunuza soru ekleyin.'
                : 'Filtreleri veya arama kriterini değiştirerek tekrar deneyin.')}
          />
        </div>
      ) : (
        <div className="ds-card qp-list">
          <div className="qp-list-head">
            <p className="qp-list-count">{organized.length} soru listeleniyor</p>
            {tab === 'pending' && organized.length > 0 && (
              <button onClick={handleApproveAll} className="qp-approveall">
                <Check size={13} /> Tümünü Onayla
              </button>
            )}
          </div>
          {groups.map(group => {
            const isCollapsed = collapsed.has(group.key);
            const label = multiSubject ? `${group.subject} · ${group.topic}` : group.topic;
            return (
              <div key={group.key} className="qp-group">
                <button type="button" onClick={() => toggleGroup(group.key)} className="qp-group-head">
                  {isCollapsed ? <ChevronRight size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                  <span className={group.isUntagged ? 'qp-group-title qp-group-title--warn' : 'qp-group-title'}>{label}</span>
                  <span className="qp-group-count">({group.items.length})</span>
                </button>
                {!isCollapsed && <div className="qp-group-items">{group.items.map(renderRow)}</div>}
              </div>
            );
          })}
        </div>
      )}

      <QuestionEditorModal isOpen={editorOpen} onClose={() => setEditorOpen(false)} teacherId={teacherId} editing={editing} defaultSubject={defaultSubject} />
      <AIQuestionGeneratorModal isOpen={aiOpen} onClose={() => setAiOpen(false)} teacherId={teacherId} defaultSubject={defaultSubject} />
    </div>
  );
}
