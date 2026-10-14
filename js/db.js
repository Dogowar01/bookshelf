// Thin promise wrapper around IndexedDB. Books are stored whole.
//
// Photos are stored as raw bytes ({ type, bytes: ArrayBuffer }), not as Blobs. Safari has a long-
// standing bug where a Blob read back from IndexedDB and saved again becomes unreadable, which
// silently wiped photos when a book was edited (WebKit bugs 235687 and 240216). Raw bytes are
// copied into the record itself, so re-saving is always safe. The rest of the app still sees Blobs.

const DB_NAME = 'bookshelf';
const STORE = 'books';
const VERSION = 1;

let dbPromise;

function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const isStoredImage = (v) => v && typeof v === 'object' && v.bytes instanceof ArrayBuffer;

// Records come back with photos as fresh in-memory Blobs. Photos saved by older versions of the
// app are still real Blobs; those books are flagged with `legacyImages` so they can be converted.
export async function getAllBooks() {
  const rows = await run('readonly', (s) => s.getAll());
  return rows.map((row) => {
    if (!row.images) return row;
    const images = {};
    let legacy = false;
    for (const [k, v] of Object.entries(row.images)) {
      if (isStoredImage(v)) images[k] = new Blob([v.bytes], { type: v.type || 'image/jpeg' });
      else if (v instanceof Blob) {
        images[k] = v;
        legacy = true;
      }
    }
    return legacy ? { ...row, images, legacyImages: true } : { ...row, images };
  });
}

// Reads every photo into raw bytes first (that can't happen inside an IndexedDB transaction).
// A photo that can no longer be read is left out rather than failing the whole save.
export async function putBook(book) {
  const { legacyImages, ...rec } = book;
  if (rec.images) {
    const images = {};
    for (const [k, v] of Object.entries(rec.images)) {
      if (!(v instanceof Blob)) continue;
      try {
        images[k] = { type: v.type || 'image/jpeg', bytes: await v.arrayBuffer() };
      } catch {
        // Unreadable (already broken by the Safari bug): drop it so the book shows a plain spine.
      }
    }
    rec.images = images;
  }
  return run('readwrite', (s) => s.put(rec));
}

export const deleteBook = (id) => run('readwrite', (s) => s.delete(id));

// Ask the browser not to evict our data when storage runs low.
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}
