// ============================================================
// Bookmark (Favori) servisi — klasör organizasyonu
// ============================================================
// Tablolar (mobil ile paylaşımlı, AYNI Supabase projesi):
//   bookmarks (top-level)            where student_id == uid
//   bookmark_folders (top-level)     where user_id == uid (özel klasörler)
//
// SALT OKUMA + yalnız organizasyon alanlarına (folder_id/tags/note) yazma.
// Soru içeriği (question_text/options/correct_answer) ve review_count/...
// client'tan YAZILMAZ. item_count backend trigger'ı tutar; client türetir.
// ============================================================
import { supabase } from '../supabase';
import { currentUid } from './authApi';

const FOLDER_NAME_MAX = 60;
const TAGS_MAX = 12;
const NOTE_MAX = 500;

const uid = () => currentUid();

const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

// bookmarks satırını uygulamanın beklediği camelCase alias'lı şekle çevirir.
const mapBookmarkRow = (r) => ({
  ...r,
  studentId: r.student_id,
  questionId: r.question_id,
  questionText: r.question_text,
  correctAnswer: r.correct_answer,
  answer: r.correct_answer,
  choices: Array.isArray(r.options) ? r.options : (r.choices || []),
  folderId: r.folder_id ?? null,
  reviewCount: r.review_count ?? 0,
  createdAt: r.created_at,
});

// bookmark_folders satırını camelCase alias'la döndürür.
const mapFolderRow = (r) => ({
  ...r,
  itemCount: r.item_count ?? 0,
  createdAt: r.created_at,
});

const cleanTags = (tags) => {
  const seen = new Set();
  const out = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    const v = String(t || '').trim();
    if (!v || seen.has(v.toLowerCase())) continue;
    seen.add(v.toLowerCase());
    out.push(v);
    if (out.length >= TAGS_MAX) break;
  }
  return out;
};

const cleanNote = (note) => String(note || '').slice(0, NOTE_MAX);
const cleanName = (name) => String(name || '').trim().slice(0, FOLDER_NAME_MAX);

// ── Dinleyiciler ──

// bookmarks (student_id==uid), createdAt DESC (client sort). Realtime kanal +
// başlangıç için tek seferlik select (ikisi de aynı emit'i besler).
export function subscribeBookmarks(cb, onError) {
  const u = uid();
  if (!u) { cb([]); return () => {}; }
  const emit = async () => {
    const { data, error } = await supabase.from('bookmarks').select('*').eq('student_id', u);
    if (error) { console.warn('bookmarks yüklenemedi:', error); onError?.(error); return; }
    const list = (data || []).map(mapBookmarkRow);
    list.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
    cb(list);
  };
  emit();
  const ch = supabase
    .channel(`bookmarks:${u}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmarks', filter: `student_id=eq.${u}` }, () => { emit(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// bookmark_folders (user_id==uid) — özel klasörler, createdAt ASC.
export function subscribeBookmarkFolders(cb, onError) {
  const u = uid();
  if (!u) { cb([]); return () => {}; }
  const emit = async () => {
    const { data, error } = await supabase.from('bookmark_folders').select('*').eq('user_id', u);
    if (error) { console.warn('bookmark_folders yüklenemedi:', error); onError?.(error); return; }
    const list = (data || []).map(mapFolderRow);
    list.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    cb(list);
  };
  emit();
  const ch = supabase
    .channel(`bookmark_folders:${u}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bookmark_folders', filter: `user_id=eq.${u}` }, () => { emit(); })
    .subscribe();
  return () => supabase.removeChannel(ch);
}

// ── Klasör CRUD ──

export async function createFolder(name, color = null, icon = null) {
  const u = uid();
  if (!u) throw new Error('Oturum yok');
  const clean = cleanName(name);
  if (!clean) throw new Error('Klasör adı boş olamaz');
  const { data, error } = await supabase
    .from('bookmark_folders')
    .insert({ user_id: u, name: clean, color: color || null, icon: icon || null, item_count: 0 })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function renameFolder(id, name) {
  const clean = cleanName(name);
  if (!clean) throw new Error('Klasör adı boş olamaz');
  const { error } = await supabase.from('bookmark_folders').update({ name: clean }).eq('id', id);
  if (error) throw error;
}

// Klasörü sil: içindeki bookmark'ların folder_id'sini null'a düşür + folder sil.
export async function deleteFolder(id, bookmarksInFolder = []) {
  const u = uid();
  if (!u) throw new Error('Oturum yok');
  const ids = (bookmarksInFolder || []).map((b) => b.id).filter(Boolean);
  if (ids.length) {
    const { error: upErr } = await supabase.from('bookmarks').update({ folder_id: null }).in('id', ids);
    if (upErr) throw upErr;
  }
  const { error } = await supabase.from('bookmark_folders').delete().eq('id', id);
  if (error) throw error;
}

// ── Bookmark organizasyonu (yalnız izin verilen alanlar) ──

export async function moveToFolder(id, folderId) {
  const { error } = await supabase.from('bookmarks').update({ folder_id: folderId ?? null }).eq('id', id);
  if (error) throw error;
}

export async function setBookmarkTags(id, tags) {
  const { error } = await supabase.from('bookmarks').update({ tags: cleanTags(tags) }).eq('id', id);
  if (error) throw error;
}

export async function setBookmarkNote(id, note) {
  const { error } = await supabase.from('bookmarks').update({ note: cleanNote(note) }).eq('id', id);
  if (error) throw error;
}

// Tek "Düzenle" sheet'i: folder_id/tags/note birlikte güncellenir.
export async function updateBookmarkOrganization(id, { folderId, tags, note } = {}) {
  const patch = {};
  if (folderId !== undefined) patch.folder_id = folderId ?? null;
  if (tags !== undefined) patch.tags = cleanTags(tags);
  if (note !== undefined) patch.note = cleanNote(note);
  const { error } = await supabase.from('bookmarks').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteBookmark(id) {
  const { error } = await supabase.from('bookmarks').delete().eq('id', id);
  if (error) throw error;
}

// ── Toplu işlemler ──

export async function bulkMove(ids, folderId) {
  const list = ids || [];
  if (!list.length) return;
  const { error } = await supabase.from('bookmarks').update({ folder_id: folderId ?? null }).in('id', list);
  if (error) throw error;
}

export async function bulkDelete(ids) {
  const list = ids || [];
  if (!list.length) return;
  const { error } = await supabase.from('bookmarks').delete().in('id', list);
  if (error) throw error;
}

// ── Client-side arama (questionText / note / tags substring) ──
export function searchBookmarks(list, q) {
  const term = String(q || '').trim().toLowerCase();
  if (!term) return list || [];
  return (list || []).filter(b => {
    if (String(b.questionText || '').toLowerCase().includes(term)) return true;
    if (String(b.note || '').toLowerCase().includes(term)) return true;
    if (Array.isArray(b.tags) && b.tags.some(t => String(t).toLowerCase().includes(term))) return true;
    return false;
  });
}

export const BOOKMARK_LIMITS = { FOLDER_NAME_MAX, TAGS_MAX, NOTE_MAX };
