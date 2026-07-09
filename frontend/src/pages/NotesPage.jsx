import React, { useEffect, useMemo, useState } from 'react';
import { StickyNote, Plus, Pencil, Trash2 } from 'lucide-react';
import { supabase } from '../supabase';
import { currentUid } from '../services/authApi';
import { useToast } from '../components/ToastProvider';
import Modal from '../components/ui/Modal';
import { FormField, Input, TextArea, Select } from '../components/ui/FormField';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import { toDate, formatDate } from '../utils/formatDate';

const SUBJECTS = ['Genel', 'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Edebiyat', 'Coğrafya', 'Din Kültürü', 'Felsefe'];

export default function NotesPage() {
  const { success, error } = useToast();
  const [notes, setNotes] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [subject, setSubject] = useState('Genel');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loading = !loaded;

  useEffect(() => {
    const uid = currentUid();
    if (!uid) return;
    let active = true;
    // Satırları UI sözleşmesine indir (camelCase alias'lar tüketicileri kırmasın).
    const mapRow = (r) => ({ ...r, studentId: r.student_id, createdAt: r.created_at, updatedAt: r.updated_at });
    const loadNotes = async () => {
      const { data, error: err } = await supabase.from('notes').select('*').eq('student_id', uid);
      if (!active) return;
      if (err) { console.warn('Notlar yüklenemedi:', err); setLoadError(true); setLoaded(true); return; }
      setNotes((data || []).map(mapRow)); setLoadError(false); setLoaded(true);
    };
    loadNotes();
    // Realtime: notes tablosundaki kendi satırlarımdaki değişiklikleri dinle → yeniden çek.
    const ch = supabase.channel(`notes-${uid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes', filter: `student_id=eq.${uid}` }, loadNotes)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [reloadKey]);

  const sorted = useMemo(() => (
    [...notes].sort((a, b) => (toDate(b.updatedAt)?.getTime() || 0) - (toDate(a.updatedAt)?.getTime() || 0))
  ), [notes]);

  const openNew = () => {
    setEditing(null); setTitle(''); setBody(''); setSubject('Genel'); setEditorOpen(true);
  };
  const openEdit = (n) => {
    setEditing(n); setTitle(n.title || ''); setBody(n.body || ''); setSubject(n.subject || 'Genel'); setEditorOpen(true);
  };

  const handleSave = async () => {
    const uid = currentUid();
    if (!uid) return;
    if (!title.trim() || !body.trim()) {
      error('Eksik Bilgi', 'Başlık ve içerik alanları doldurulmalı.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        student_id: uid,
        title: title.trim(),
        body: body.trim(),
        subject: subject === 'Genel' ? null : subject,
        updated_at: new Date().toISOString(),
      };
      if (editing) {
        const { error: err } = await supabase.from('notes').update(payload).eq('id', editing.id);
        if (err) throw err;
        success('Not Güncellendi', 'Değişiklikler kaydedildi.');
      } else {
        // created_at DB'de now() ile otomatik dolar → yalnız updated_at'i biz set ederiz.
        const { error: err } = await supabase.from('notes').insert(payload);
        if (err) throw err;
        success('Not Eklendi', 'Notun kaydedildi.');
      }
      setEditorOpen(false);
    } catch (err) {
      console.error('Not kaydedilemedi:', err);
      error('Hata', 'Not kaydedilirken bir sorun oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const { error: err } = await supabase.from('notes').delete().eq('id', deleteTarget.id);
      if (err) throw err;
      success('Not Silindi', 'Not kaldırıldı.');
    } catch (err) {
      console.error('Not silinemedi:', err);
      error('Hata', 'Not silinemedi.');
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-6 mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><StickyNote size={26} /> Notlarım</h1>
          <p className="page-subtitle">Kişisel çalışma notlarını oluştur ve düzenle.</p>
        </div>
        <button onClick={openNew} className="ds-btn-primary flex items-center gap-1.5">
          <Plus size={16} /> Yeni Not
        </button>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      ) : loadError ? (
        <div className="ds-card">
          <ErrorState
            title="Notlar yüklenemedi"
            description="Notların alınırken bir sorun oluştu. Lütfen tekrar deneyin."
            onRetry={() => { setLoaded(false); setLoadError(false); setReloadKey(k => k + 1); }}
          />
        </div>
      ) : sorted.length === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={StickyNote}
            title="Henüz Not Yok"
            description="İlk çalışma notunu oluşturmak için 'Yeni Not' butonunu kullan."
            action={<button onClick={openNew} className="ds-btn-primary">İlk Notunu Oluştur</button>}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map(n => (
            <div key={n.id} className="ds-card flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-base font-bold text-white">{n.title}</h3>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(n)} className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg transition-colors" title="Düzenle">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => setDeleteTarget(n)} className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-colors" title="Sil">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2 mb-2 text-xs">
                {n.subject && <span className="px-2 py-0.5 bg-[#4D7C0F]/12 text-[#3F6212] rounded">{n.subject}</span>}
                <span className="text-slate-500">{formatDate(n.updatedAt)}</span>
              </div>
              <p className="text-sm text-slate-300 whitespace-pre-line line-clamp-4">{n.body}</p>
            </div>
          ))}
        </div>
      )}

      {/* Not oluştur / düzenle modalı */}
      <Modal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        size="md"
        title={editing ? 'Notu Düzenle' : 'Yeni Not'}
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setEditorOpen(false)}>Vazgeç</button>
            <button type="button" className="ds-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <FormField label="Başlık" required>
            <Input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Örn: Türev Kuralları" />
          </FormField>
          <FormField label="Konu" hint="Notu bir derse bağlayabilirsin (opsiyonel).">
            <Select value={subject} onChange={e => setSubject(e.target.value)}>
              {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </FormField>
          <FormField label="İçerik" required>
            <TextArea value={body} onChange={e => setBody(e.target.value)} rows={8} placeholder="Not içeriği..." />
          </FormField>
        </div>
      </Modal>

      {/* Silme onayı */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        size="sm"
        title="Notu Sil"
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setDeleteTarget(null)}>Vazgeç</button>
            <button type="button" className="ds-btn-primary !bg-red-600" onClick={handleDelete}>Sil</button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          "{deleteTarget?.title}" notunu silmek istediğine emin misin? Bu işlem geri alınamaz.
        </p>
      </Modal>
    </div>
  );
}
