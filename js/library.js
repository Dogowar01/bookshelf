// In-memory view of the library, backed by IndexedDB, plus backup export/import.

import { getAllBooks, putBook, deleteBook } from './db.js';

export const GENRES = [
  'Thriller', 'Sci-Fi', 'Crime', 'Fantasy', 'Mystery', 'Horror', 'Romance',
  'Historical Fiction', 'Literary Fiction', 'Classic', 'Young Adult', 'Adventure',
  'Biography', 'Memoir', 'Non-Fiction', 'History', 'Science', 'Self-Help',
  'Poetry', 'Graphic Novel', 'Humour',
];

const SPINE_COLORS = ['#7a2e2e', '#2e4a7a', '#2f5d46', '#6b4a2b', '#4b2f6b', '#8a6a1f', '#1f5a66', '#5a1f3d', '#33373d'];
const IMAGE_KEYS = ['front', 'spine', 'back'];

let books = [];
const urlCache = new Map(); // id -> { front, spine, back } object URLs

export async function load() {
  books = await getAllBooks();
  return books;
}

export const all = () => books;
export const get = (id) => books.find((b) => b.id === id);

export function newId() {
  return (crypto.randomUUID && crypto.randomUUID()) || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function pickColor(id) {
  return SPINE_COLORS[hash(id) % SPINE_COLORS.length];
}

// Stable pseudo-random number in [0, 1) for a book, used for natural-looking height variation.
export function jitter(id) {
  return (hash(id) % 1000) / 1000;
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function save(book) {
  book.updatedAt = Date.now();
  await putBook(book);
  const i = books.findIndex((b) => b.id === book.id);
  if (i >= 0) books[i] = book;
  else books.push(book);
  revokeUrls(book.id);
  return book;
}

export async function remove(id) {
  await deleteBook(id);
  books = books.filter((b) => b.id !== id);
  revokeUrls(id);
}

export function urls(book) {
  let u = urlCache.get(book.id);
  if (!u) {
    u = {};
    for (const k of IMAGE_KEYS) {
      const blob = book.images && book.images[k];
      if (blob) u[k] = URL.createObjectURL(blob);
    }
    urlCache.set(book.id, u);
  }
  return u;
}

function revokeUrls(id) {
  const u = urlCache.get(id);
  if (u) Object.values(u).forEach((url) => URL.revokeObjectURL(url));
  urlCache.delete(id);
}

// ---- Backup ----

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function exportBackup() {
  const out = [];
  for (const b of books) {
    const images = {};
    for (const k of IMAGE_KEYS) {
      if (b.images && b.images[k]) images[k] = await blobToDataUrl(b.images[k]);
    }
    out.push({ ...b, images });
  }
  const json = JSON.stringify({ app: 'bookshelf', version: 1, exportedAt: new Date().toISOString(), books: out });
  return new Blob([json], { type: 'application/json' });
}

// Merges a backup into the library; books with the same id are overwritten.
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.app !== 'bookshelf' || !Array.isArray(data.books)) {
    throw new Error('That file is not a Bookshelf backup.');
  }
  let count = 0;
  for (const raw of data.books) {
    if (!raw || !raw.id || !raw.title) continue;
    const images = {};
    for (const k of IMAGE_KEYS) {
      const src = raw.images && raw.images[k];
      if (typeof src === 'string' && src.startsWith('data:image/')) images[k] = await (await fetch(src)).blob();
    }
    await save({ ...raw, images });
    count++;
  }
  return count;
}
