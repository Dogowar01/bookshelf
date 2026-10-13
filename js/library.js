// In-memory view of the library, backed by IndexedDB, plus backup export/import.
//
// Removed books stay in the database as small "tombstones" ({ id, deleted: true }) so that
// sync can tell other devices about the removal. Everything outside this module and sync.js
// only ever sees live books.

import { getAllBooks, putBook } from './db.js';

export const GENRES = [
  'Thriller', 'Sci-Fi', 'Crime', 'Fantasy', 'Mystery', 'Horror', 'Romance',
  'Historical Fiction', 'Literary Fiction', 'Classic', 'Young Adult', 'Adventure',
  'Biography', 'Memoir', 'Non-Fiction', 'History', 'Science', 'Self-Help',
  'Poetry', 'Graphic Novel', 'Humour',
];

export const STATUSES = {
  want: 'Want to read',
  reading: 'Reading',
  read: 'Read',
};

export const FORMATS = {
  print: 'Print',
  ebook: 'Ebook',
  audiobook: 'Audiobook',
};

export const IMAGE_KEYS = ['front', 'spine', 'back'];

const SPINE_COLORS = ['#7a2e2e', '#2e4a7a', '#2f5d46', '#6b4a2b', '#4b2f6b', '#8a6a1f', '#1f5a66', '#5a1f3d', '#33373d'];

let records = []; // every record, including tombstones
const urlCache = new Map(); // id -> { front, spine, back } object URLs
const listeners = new Set();

export async function load() {
  records = await getAllBooks();
  return all();
}

export const all = () => records.filter((r) => !r.deleted);
export const get = (id) => records.find((r) => r.id === id && !r.deleted);

// For sync: every record, tombstones included.
export const allRecords = () => records;
export const record = (id) => records.find((r) => r.id === id);

// fn(source) is called after any change; source is 'local' or 'remote'.
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(source) {
  listeners.forEach((fn) => fn(source));
}

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

// Highest `order` in use, so a new book can go at the end of its shelf.
export function nextOrder() {
  return all().reduce((m, b) => Math.max(m, b.order || 0), 0) + 1;
}

export async function save(book) {
  await write({ ...book, updatedAt: Date.now() });
  emit('local');
  return get(book.id);
}

// Saves several books in one go (used when rearranging the shelf).
export async function saveMany(books) {
  const now = Date.now();
  for (const b of books) await write({ ...b, updatedAt: now });
  emit('local');
}

export async function remove(id) {
  const old = record(id);
  await write({ id, deleted: true, updatedAt: Date.now(), _synced: old && old._synced });
  emit('local');
}

// Stores a record exactly as given, without touching updatedAt. Used by sync.
export async function putRecord(rec, { quiet = false } = {}) {
  await write(rec);
  if (!quiet) emit('remote');
}

async function write(rec) {
  await putBook(rec);
  const i = records.findIndex((r) => r.id === rec.id);
  if (i >= 0) records[i] = rec;
  else records.push(rec);
  revokeUrls(rec.id);
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
  for (const b of all()) {
    const images = {};
    for (const k of IMAGE_KEYS) {
      if (b.images && b.images[k]) images[k] = await blobToDataUrl(b.images[k]);
    }
    const { _synced, ...rest } = b;
    out.push({ ...rest, images });
  }
  const json = JSON.stringify({ app: 'bookshelf', version: 2, exportedAt: new Date().toISOString(), books: out });
  return new Blob([json], { type: 'application/json' });
}

// Merges a backup into the library; books with the same id are overwritten.
export async function importBackup(file) {
  const data = JSON.parse(await file.text());
  if (!data || data.app !== 'bookshelf' || !Array.isArray(data.books)) {
    throw new Error('That file is not a Bookshelf backup.');
  }
  let count = 0;
  const now = Date.now();
  for (const raw of data.books) {
    if (!raw || !raw.id || !raw.title || raw.deleted) continue;
    const images = {};
    const imageRev = { ...(raw.imageRev || {}) };
    for (const k of IMAGE_KEYS) {
      const src = raw.images && raw.images[k];
      if (typeof src === 'string' && src.startsWith('data:image/')) {
        images[k] = await (await fetch(src)).blob();
        if (!imageRev[k]) imageRev[k] = newId();
      } else {
        delete imageRev[k];
      }
    }
    const { _synced, ...rest } = raw;
    await write({ ...rest, images, imageRev, _synced: record(raw.id) && record(raw.id)._synced, updatedAt: now });
    count++;
  }
  emit('local');
  return count;
}
