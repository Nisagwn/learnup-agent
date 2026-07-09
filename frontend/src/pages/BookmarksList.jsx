import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Trash2, Eye, ChevronRight, Search, Plus, Check, ArrowLeft } from 'lucide-react';
import { currentUid } from '../services/authApi';
import { useToast } from '../components/ToastProvider';
import MathMarkdown from '../components/MathMarkdown';
import Modal from '../components/ui/Modal';
import { formatDate } from '../utils/formatDate';
import { SkeletonCard } from '../components/ui/Skeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import {
  subscribeBookmarks, subscribeBookmarkFolders, createFolder, renameFolder, deleteFolder,
  updateBookmarkOrganization, deleteBookmark, bulkMove, bulkDelete, searchBookmarks,
  BOOKMARK_LIMITS,
} from '../services/bookmarksApi';

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

// Bir bookmark'ın etkin klasörü: özel (auto: değil) → folderId; 'auto:*' → kendisi;
// null → dersine göre auto:{subject}.
const effFolderId = (b) => {
  const f = b.folderId;
  if (typeof f === 'string' && f && !f.startsWith('auto:')) return f;
  if (typeof f === 'string' && f.startsWith('auto:')) return f;
  return `auto:${b.subject || 'Genel'}`;
};

export default function BookmarksList() {
  const navigate = useNavigate();
  const { success, error } = useToast();

  const [items, setItems] = useState([]);
  const [folders, setFolders] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [openFolderId, setOpenFolderId] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  // Modallar
  const [reviewItem, setReviewItem] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState({ folderValue: '', tagsText: '', note: '' });
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameName, setRenameName] = useState('');
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveIds, setMoveIds] = useState([]);
  const [moveValue, setMoveValue] = useState('');
  const [busy, setBusy] = useState(false);

  const loading = !loaded;

  useEffect(() => {
    const uid = currentUid();
    if (!uid) return;
    const unsubB = subscribeBookmarks(
      (list) => { setItems(list); setLoadError(false); setLoaded(true); },
      () => { setLoadError(true); setLoaded(true); }
    );
    const unsubF = subscribeBookmarkFolders((list) => setFolders(list), () => {});
    return () => { unsubB?.(); unsubF?.(); };
  }, [reloadKey]);

  // Bookmark'ları etkin klasöre göre grupla
  const itemsByFolder = useMemo(() => {
    const m = {};
    for (const b of items) {
      const k = effFolderId(b);
      (m[k] = m[k] || []).push(b);
    }
    return m;
  }, [items]);

  // Otomatik klasörler (silinemez, türetilmiş)
  const autoFolders = useMemo(() => (
    Object.keys(itemsByFolder)
      .filter(k => k.startsWith('auto:'))
      .map(k => ({ id: k, label: k.slice(5), count: itemsByFolder[k].length, auto: true }))
      .sort((a, b) => b.count - a.count)
  ), [itemsByFolder]);

  // Özel klasörler (sayı türetilmiş)
  const customFolders = useMemo(() => (
    folders.map(f => ({ id: f.id, label: f.name, count: (itemsByFolder[f.id] || []).length, auto: false }))
  ), [folders, itemsByFolder]);

  const folderName = (id) => {
    if (!id) return 'Klasörsüz';
    if (id.startsWith('auto:')) return id.slice(5);
    return folders.find(f => f.id === id)?.name || 'Klasör';
  };

  // Görüntülenecek kartlar: arama varsa düz arama; klasör açıksa o klasör; yoksa genel görünüm.
  const searching = search.trim().length > 0;
  const currentItems = useMemo(() => {
    if (searching) return searchBookmarks(items, search);
    if (openFolderId) return itemsByFolder[openFolderId] || [];
    return [];
  }, [searching, search, items, openFolderId, itemsByFolder]);

  const moveOptions = useMemo(() => (
    [{ value: '', label: 'Klasörsüz (otomatik)' }, ...folders.map(f => ({ value: f.id, label: f.name }))]
  ), [folders]);

  // ── Seçim ──
  const clearSelection = () => setSelected(new Set());
  const toggleSelect = (id) => setSelected(prev => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const enterFolder = (id) => { setOpenFolderId(id); clearSelection(); setSearch(''); };
  const goOverview = () => { setOpenFolderId(null); clearSelection(); };

  // ── Aksiyonlar ──
  const handleRemove = async (id) => {
    try {
      await deleteBookmark(id);
      success('Kaldırıldı', 'Soru favorilerden çıkarıldı.');
    } catch (err) {
      console.error('Favori silinemedi:', err);
      error('Hata', 'Soru kaldırılamadı.');
    }
  };

  const openEdit = (b) => {
    setEditItem(b);
    setEditForm({
      folderValue: (b.folderId && !String(b.folderId).startsWith('auto:')) ? b.folderId : '',
      tagsText: Array.isArray(b.tags) ? b.tags.join(', ') : '',
      note: b.note || '',
    });
  };
  const saveEdit = async () => {
    if (!editItem) return;
    setBusy(true);
    try {
      const tags = editForm.tagsText.split(',').map(s => s.trim()).filter(Boolean);
      await updateBookmarkOrganization(editItem.id, {
        folderId: editForm.folderValue || null,
        tags,
        note: editForm.note,
      });
      success('Kaydedildi', 'Favori güncellendi.');
      setEditItem(null);
    } catch (err) {
      console.error('Org güncellenemedi:', err);
      error('Hata', err.message || 'Güncellenemedi.');
    } finally { setBusy(false); }
  };

  const handleCreateFolder = async () => {
    setBusy(true);
    try {
      await createFolder(newFolderName);
      success('Klasör oluşturuldu', newFolderName.trim());
      setNewFolderOpen(false); setNewFolderName('');
    } catch (err) {
      error('Hata', err.message || 'Klasör oluşturulamadı.');
    } finally { setBusy(false); }
  };

  const handleRename = async () => {
    if (!renameTarget) return;
    setBusy(true);
    try {
      await renameFolder(renameTarget.id, renameName);
      success('Yeniden adlandırıldı', renameName.trim());
      setRenameTarget(null); setRenameName('');
    } catch (err) {
      error('Hata', err.message || 'Yeniden adlandırılamadı.');
    } finally { setBusy(false); }
  };

  const handleDeleteFolder = async (folder) => {
    if (!window.confirm(`"${folder.label}" klasörü silinsin mi? İçindeki favoriler klasörsüze taşınır.`)) return;
    try {
      await deleteFolder(folder.id, itemsByFolder[folder.id] || []);
      success('Klasör silindi', 'Favoriler klasörsüze taşındı.');
      if (openFolderId === folder.id) goOverview();
    } catch (err) {
      error('Hata', err.message || 'Klasör silinemedi.');
    }
  };

  const openMove = (ids) => { setMoveIds(ids); setMoveValue(''); setMoveOpen(true); };
  const confirmMove = async () => {
    setBusy(true);
    try {
      await bulkMove(moveIds, moveValue || null);
      success('Taşındı', `${moveIds.length} favori ${moveValue ? folderName(moveValue) : 'klasörsüz'} konumuna taşındı.`);
      setMoveOpen(false); clearSelection();
    } catch (err) {
      error('Hata', err.message || 'Taşınamadı.');
    } finally { setBusy(false); }
  };

  const handleBulkDelete = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (!window.confirm(`${ids.length} favori silinsin mi?`)) return;
    try {
      await bulkDelete(ids);
      success('Silindi', `${ids.length} favori kaldırıldı.`);
      clearSelection();
    } catch (err) {
      error('Hata', err.message || 'Silinemedi.');
    }
  };

  const totalCount = items.length;

  return (
    <div className="dashboard student-dashboard animate-fade-in pb-8">
      <div className="dashboard-header mb-5 mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><Star size={26} /> Favori Sorularım</h1>
          <p className="page-subtitle">Klasörle, etiketle, not al — sonra incele.</p>
        </div>
        <button onClick={() => { setNewFolderName(''); setNewFolderOpen(true); }} className="ds-btn-ghost flex items-center gap-1.5 !text-xs">
          <Plus size={15} /> Yeni Klasör
        </button>
      </div>

      {/* Arama */}
      <div className="relative mb-4" style={{ maxWidth: 420 }}>
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          type="text"
          className="form-control"
          style={{ paddingLeft: 34, width: '100%' }}
          placeholder="Soru, not veya etikette ara…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); clearSelection(); }}
        />
      </div>

      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true">
          <SkeletonCard lines={2} /><SkeletonCard lines={2} /><SkeletonCard lines={2} />
        </div>
      ) : loadError ? (
        <div className="ds-card">
          <ErrorState
            title="Favoriler yüklenemedi"
            description="Favori soruların alınırken bir sorun oluştu. Lütfen tekrar deneyin."
            onRetry={() => { setLoaded(false); setLoadError(false); setReloadKey(k => k + 1); }}
          />
        </div>
      ) : totalCount === 0 ? (
        <div className="ds-card">
          <EmptyState
            icon={Star}
            title="Henüz Favori Yok"
            description="Test çözerken bir sorunun sağ üstündeki yıldıza dokunarak favorilerine ekleyebilirsin."
          />
        </div>
      ) : (searching || openFolderId) ? (
        // ── Klasör içi / arama sonucu liste ──
        <>
          <div className="flex items-center gap-2 mb-3">
            {!searching && (
              <button onClick={goOverview} className="ds-btn-ghost !py-1 !text-xs flex items-center gap-1.5">
                <ArrowLeft size={14} /> Klasörler
              </button>
            )}
            <span className="text-sm font-semibold text-slate-200">
              {searching ? `“${search.trim()}” için sonuçlar` : folderName(openFolderId)}
            </span>
            <span className="text-xs text-slate-500">{currentItems.length} favori</span>
          </div>

          {/* Toplu işlem çubuğu */}
          {selected.size > 0 && (
            <div className="ds-card ds-card--compact flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-xs font-semibold text-slate-200">{selected.size} seçili</span>
              <button onClick={() => openMove([...selected])} className="ds-btn-ghost !py-1 !text-xs">Taşı</button>
              <button onClick={handleBulkDelete} className="!py-1 !text-xs px-3 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold">Sil</button>
              <button onClick={clearSelection} className="text-xs text-slate-400 ml-auto">Seçimi temizle</button>
            </div>
          )}

          {currentItems.length === 0 ? (
            <div className="ds-card">
              <EmptyState icon={Star} title="Boş" description="Bu görünümde favori yok." />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {currentItems.map(b => {
                const isSel = selected.has(b.id);
                return (
                  <div key={b.id} className={`ds-card ${isSel ? 'ring-2 ring-lime-600/50' : ''}`}>
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(b.id)}
                        className="mt-1 flex-shrink-0"
                        aria-label="Seç"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 text-xs flex-wrap">
                          <span className="px-2 py-0.5 bg-[#4D7C0F]/12 text-[#3F6212] rounded">{b.subject || 'Genel'}</span>
                          {b.folderId && !String(b.folderId).startsWith('auto:') && (
                            <span className="px-2 py-0.5 bg-white/5 text-slate-300 rounded">📁 {folderName(b.folderId)}</span>
                          )}
                          <span className="text-slate-500">· {formatDate(b.createdAt)}</span>
                        </div>
                        <div className="text-sm text-slate-100 font-medium mb-2">
                          <MathMarkdown>{b.questionText || 'Soru metni kayıtlı değil.'}</MathMarkdown>
                        </div>
                        {Array.isArray(b.tags) && b.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mb-2">
                            {b.tags.map((t, i) => (
                              <span key={i} className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300">#{t}</span>
                            ))}
                          </div>
                        )}
                        {b.note && <p className="text-xs text-slate-400 mb-2 italic">“{b.note}”</p>}
                        <div className="flex gap-2 flex-wrap">
                          <button onClick={() => openEdit(b)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 transition-colors">Düzenle</button>
                          <button onClick={() => setReviewItem(b)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200 transition-colors"><Eye size={14} /> İncele</button>
                          <button onClick={() => handleRemove(b.id)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors"><Trash2 size={14} /> Kaldır</button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        // ── Klasör genel görünümü ──
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {customFolders.map(f => (
            <div key={f.id} className="ds-card flex flex-col gap-2">
              <button onClick={() => enterFolder(f.id)} className="flex items-center gap-2 text-left">
                <span className="text-2xl" aria-hidden="true">📁</span>
                <span className="font-semibold text-slate-100 flex-1 min-w-0 truncate">{f.label}</span>
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400">{f.count} favori</span>
                <button onClick={() => { setRenameTarget(f); setRenameName(f.label); }} className="ml-auto text-slate-400 hover:text-slate-200">Yeniden adlandır</button>
                <button onClick={() => handleDeleteFolder(f)} className="text-red-400 hover:text-red-300">Sil</button>
              </div>
            </div>
          ))}
          {autoFolders.map(f => (
            <button key={f.id} onClick={() => enterFolder(f.id)} className="ds-card flex items-center gap-2 text-left">
              <span className="text-2xl" aria-hidden="true">🗂️</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-slate-100 truncate">{f.label}</div>
                <div className="text-xs text-slate-400">{f.count} favori · otomatik</div>
              </div>
              <ChevronRight size={16} className="text-slate-400" />
            </button>
          ))}
        </div>
      )}

      {/* ── Soru inceleme modalı (salt-okuma) ── */}
      <Modal
        isOpen={!!reviewItem}
        onClose={() => setReviewItem(null)}
        size="lg"
        title="Soru İncelemesi"
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setReviewItem(null)}>Kapat</button>
            {reviewItem && (
              <button
                type="button"
                className="ds-btn-primary"
                onClick={() => navigate(`/student/quiz?subject=${encodeURIComponent(reviewItem.subject || 'Genel')}`)}
              >
                Konuyu Çöz <ChevronRight size={16} />
              </button>
            )}
          </>
        }
      >
        {reviewItem && (
          <div className="flex flex-col gap-4">
            <div className="text-sm text-slate-100 font-medium">
              <MathMarkdown>{reviewItem.questionText || ''}</MathMarkdown>
            </div>
            <ul className="flex flex-col gap-2">
              {(reviewItem.options || reviewItem.choices || []).map((o, i) => {
                const correct = o === (reviewItem.correctAnswer ?? reviewItem.answer);
                return (
                  <li
                    key={i}
                    className={`flex gap-2 items-start p-2.5 rounded-lg border text-sm ${
                      correct
                        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300 font-semibold'
                        : 'border-white/8 bg-white/5 text-slate-300'
                    }`}
                  >
                    <span className="font-mono font-bold flex-shrink-0">{LETTERS[i]}</span>
                    <MathMarkdown inline>{String(o)}</MathMarkdown>
                    {correct && <span className="ml-auto flex-shrink-0">✓</span>}
                  </li>
                );
              })}
            </ul>
            {reviewItem.explanation && (
              <div className="p-3 bg-[#4D7C0F]/8 border border-lime-500/20 rounded-xl text-sm text-slate-200">
                <div className="font-semibold text-lime-700 mb-1">Çözüm</div>
                <MathMarkdown>{reviewItem.explanation}</MathMarkdown>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* ── Düzenle (organizasyon) sheet'i ── */}
      <Modal
        isOpen={!!editItem}
        onClose={() => setEditItem(null)}
        size="sm"
        title="Favoriyi Düzenle"
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setEditItem(null)}>Vazgeç</button>
            <button type="button" className="ds-btn-primary" onClick={saveEdit} disabled={busy}>{busy ? 'Kaydediliyor…' : 'Kaydet'}</button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Klasör</label>
            <select className="form-control w-full" value={editForm.folderValue} onChange={(e) => setEditForm(f => ({ ...f, folderValue: e.target.value }))}>
              {moveOptions.map(o => <option key={o.value || 'root'} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Etiketler (virgülle ayır, en fazla {BOOKMARK_LIMITS.TAGS_MAX})</label>
            <input className="form-control w-full" value={editForm.tagsText} onChange={(e) => setEditForm(f => ({ ...f, tagsText: e.target.value }))} placeholder="ör. türev, sınav, zor" />
          </div>
          <div>
            <label className="text-xs text-slate-400 block mb-1">Not (en fazla {BOOKMARK_LIMITS.NOTE_MAX})</label>
            <textarea className="form-control w-full" rows={3} maxLength={BOOKMARK_LIMITS.NOTE_MAX} value={editForm.note} onChange={(e) => setEditForm(f => ({ ...f, note: e.target.value }))} placeholder="Bu soruyla ilgili kişisel notun…" />
          </div>
        </div>
      </Modal>

      {/* ── Yeni klasör ── */}
      <Modal
        isOpen={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        size="sm"
        title="Yeni Klasör"
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setNewFolderOpen(false)}>Vazgeç</button>
            <button type="button" className="ds-btn-primary" onClick={handleCreateFolder} disabled={busy || !newFolderName.trim()}><Check size={15} /> Oluştur</button>
          </>
        }
      >
        <label className="text-xs text-slate-400 block mb-1">Klasör adı (en fazla {BOOKMARK_LIMITS.FOLDER_NAME_MAX})</label>
        <input className="form-control w-full" value={newFolderName} maxLength={BOOKMARK_LIMITS.FOLDER_NAME_MAX} onChange={(e) => setNewFolderName(e.target.value)} placeholder="ör. Sınav Tekrarı" autoFocus />
      </Modal>

      {/* ── Yeniden adlandır ── */}
      <Modal
        isOpen={!!renameTarget}
        onClose={() => setRenameTarget(null)}
        size="sm"
        title="Klasörü Yeniden Adlandır"
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setRenameTarget(null)}>Vazgeç</button>
            <button type="button" className="ds-btn-primary" onClick={handleRename} disabled={busy || !renameName.trim()}>Kaydet</button>
          </>
        }
      >
        <input className="form-control w-full" value={renameName} maxLength={BOOKMARK_LIMITS.FOLDER_NAME_MAX} onChange={(e) => setRenameName(e.target.value)} autoFocus />
      </Modal>

      {/* ── Taşı (tekli/toplu) ── */}
      <Modal
        isOpen={moveOpen}
        onClose={() => setMoveOpen(false)}
        size="sm"
        title={`Taşı (${moveIds.length} favori)`}
        footer={
          <>
            <button type="button" className="ds-btn-ghost" onClick={() => setMoveOpen(false)}>Vazgeç</button>
            <button type="button" className="ds-btn-primary" onClick={confirmMove} disabled={busy}>Taşı</button>
          </>
        }
      >
        <label className="text-xs text-slate-400 block mb-1">Hedef klasör</label>
        <select className="form-control w-full" value={moveValue} onChange={(e) => setMoveValue(e.target.value)}>
          {moveOptions.map(o => <option key={o.value || 'root'} value={o.value}>{o.label}</option>)}
        </select>
      </Modal>
    </div>
  );
}
