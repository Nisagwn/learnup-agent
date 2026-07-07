// ============================================================
// Bookmark (Favori) servisi — klasör organizasyonu
// ============================================================
// Koleksiyonlar (mobil ile paylaşımlı, AYNI proje):
//   bookmarks (top-level)            where studentId == uid
//   users/{uid}/bookmark_folders     özel klasörler
//
// SALT OKUMA + yalnız organizasyon alanlarına (folderId/tags/note) yazma.
// Soru içeriği (questionText/choices/answer) ve reviewCount/lastReviewedAt
// client'tan YAZILMAZ. itemCount backend trigger'ı (syncFolderCounts) tutar;
// client türetir (bookmark listesinden sayar).
// ============================================================
import { auth, db } from '../firebase';
import {
  collection, query, where, onSnapshot, doc, addDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch,
} from 'firebase/firestore';

const FOLDER_NAME_MAX = 60;
const TAGS_MAX = 12;
const NOTE_MAX = 500;

const uid = () => auth.currentUser?.uid || null;

const ms = (ts) => {
  if (!ts) return 0;
  if (typeof ts.toMillis === 'function') return ts.toMillis();
  if (typeof ts.toDate === 'function') return ts.toDate().getTime();
  if (ts instanceof Date) return ts.getTime();
  const p = new Date(ts).getTime();
  return Number.isNaN(p) ? 0 : p;
};

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

// bookmarks (studentId==uid), createdAt DESC (client sort — composite index gerekmez)
export function subscribeBookmarks(cb, onError) {
  const u = uid();
  if (!u) { cb([]); return () => {}; }
  const qB = query(collection(db, 'bookmarks'), where('studentId', '==', u));
  return onSnapshot(
    qB,
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
      cb(list);
    },
    (err) => { console.warn('bookmarks yüklenemedi:', err); onError?.(err); }
  );
}

// users/{uid}/bookmark_folders (özel klasörler)
export function subscribeBookmarkFolders(cb, onError) {
  const u = uid();
  if (!u) { cb([]); return () => {}; }
  return onSnapshot(
    collection(db, 'users', u, 'bookmark_folders'),
    (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
      cb(list);
    },
    (err) => { console.warn('bookmark_folders yüklenemedi:', err); onError?.(err); }
  );
}

// ── Klasör CRUD ──

export function createFolder(name, color = null, icon = null) {
  const u = uid();
  if (!u) throw new Error('Oturum yok');
  const clean = cleanName(name);
  if (!clean) throw new Error('Klasör adı boş olamaz');
  return addDoc(collection(db, 'users', u, 'bookmark_folders'), {
    name: clean,
    color: color || null,
    icon: icon || null,
    itemCount: 0,
    createdAt: serverTimestamp(),
  });
}

export function renameFolder(id, name) {
  const u = uid();
  if (!u) throw new Error('Oturum yok');
  const clean = cleanName(name);
  if (!clean) throw new Error('Klasör adı boş olamaz');
  return updateDoc(doc(db, 'users', u, 'bookmark_folders', id), { name: clean });
}

// Klasörü sil: içindeki bookmark'ların folderId'sini null'a düşür (batch) + folder doc sil.
export async function deleteFolder(id, bookmarksInFolder = []) {
  const u = uid();
  if (!u) throw new Error('Oturum yok');
  const batch = writeBatch(db);
  for (const b of bookmarksInFolder) {
    batch.update(doc(db, 'bookmarks', b.id), { folderId: null });
  }
  batch.delete(doc(db, 'users', u, 'bookmark_folders', id));
  return batch.commit();
}

// ── Bookmark organizasyonu (yalnız izin verilen alanlar) ──

export function moveToFolder(id, folderId) {
  return updateDoc(doc(db, 'bookmarks', id), { folderId: folderId ?? null });
}

export function setBookmarkTags(id, tags) {
  return updateDoc(doc(db, 'bookmarks', id), { tags: cleanTags(tags) });
}

export function setBookmarkNote(id, note) {
  return updateDoc(doc(db, 'bookmarks', id), { note: cleanNote(note) });
}

// Tek "Düzenle" sheet'i: folderId/tags/note birlikte güncellenir.
export function updateBookmarkOrganization(id, { folderId, tags, note } = {}) {
  const patch = {};
  if (folderId !== undefined) patch.folderId = folderId ?? null;
  if (tags !== undefined) patch.tags = cleanTags(tags);
  if (note !== undefined) patch.note = cleanNote(note);
  return updateDoc(doc(db, 'bookmarks', id), patch);
}

export function deleteBookmark(id) {
  return deleteDoc(doc(db, 'bookmarks', id));
}

// ── Toplu işlemler ──

export function bulkMove(ids, folderId) {
  const batch = writeBatch(db);
  for (const id of ids || []) batch.update(doc(db, 'bookmarks', id), { folderId: folderId ?? null });
  return batch.commit();
}

export function bulkDelete(ids) {
  const batch = writeBatch(db);
  for (const id of ids || []) batch.delete(doc(db, 'bookmarks', id));
  return batch.commit();
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
