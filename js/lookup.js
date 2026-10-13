// Finding a book's details: barcode scanning and lookups in Open Library (with Google Books as
// a fallback for ISBNs Open Library doesn't know).

const OL = 'https://openlibrary.org';
const OL_FIELDS = 'key,title,subtitle,author_name,number_of_pages_median,first_publish_year,subject,cover_i,isbn';
// Only loaded on browsers without the built-in BarcodeDetector (e.g. iPhone Safari).
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

// ---- ISBNs ----

// Accepts ISBN-10 or ISBN-13 with or without dashes; returns a valid ISBN-13 or null.
export function normaliseIsbn(input) {
  const s = String(input || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (s.length === 13 && /^97[89]\d{10}$/.test(s) && isbn13Check(s.slice(0, 12)) === s[12]) return s;
  if (s.length === 10 && /^\d{9}[\dX]$/.test(s)) {
    let sum = 0;
    for (let i = 0; i < 10; i++) sum += (s[i] === 'X' ? 10 : Number(s[i])) * (10 - i);
    if (sum % 11 !== 0) return null;
    const core = `978${s.slice(0, 9)}`;
    return core + isbn13Check(core);
  }
  return null;
}

function isbn13Check(twelve) {
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(twelve[i]) * (i % 2 ? 3 : 1);
  return String((10 - (sum % 10)) % 10);
}

// ---- Lookups ----

// Returns a book summary { title, author, pages, year, genre, isbn, coverUrl } or null.
export async function lookupIsbn(isbn) {
  const ol = await getJson(`${OL}/search.json?isbn=${isbn}&fields=${OL_FIELDS}&limit=1`).catch(() => null);
  const doc = ol && ol.docs && ol.docs[0];
  if (doc) return fromOpenLibrary(doc, isbn);

  const gb = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`).catch(() => null);
  const item = gb && gb.items && gb.items[0];
  if (item) return fromGoogle(item.volumeInfo, isbn);
  return null;
}

export async function searchBooks(query) {
  const q = encodeURIComponent(query.trim());
  const data = await getJson(`${OL}/search.json?q=${q}&fields=${OL_FIELDS}&limit=10`);
  return (data.docs || []).filter((d) => d.title).map((d) => fromOpenLibrary(d));
}

function fromOpenLibrary(d, isbn) {
  const title = d.subtitle && d.title.length < 30 ? `${d.title}: ${d.subtitle}` : d.title;
  return {
    title,
    author: (d.author_name || []).slice(0, 2).join(' & '),
    pages: d.number_of_pages_median || null,
    year: d.first_publish_year || null,
    genre: guessGenre(d.subject || []),
    isbn: isbn || pickIsbn(d.isbn),
    coverUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null,
    thumbUrl: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-S.jpg` : null,
  };
}

function fromGoogle(v, isbn) {
  const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
  return {
    title: v.subtitle && v.title.length < 30 ? `${v.title}: ${v.subtitle}` : v.title,
    author: (v.authors || []).slice(0, 2).join(' & '),
    pages: v.pageCount || null,
    year: v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null,
    genre: guessGenre(v.categories || []),
    isbn,
    coverUrl: img ? img.replace('http://', 'https://').replace('&edge=curl', '') : null,
    thumbUrl: img ? img.replace('http://', 'https://') : null,
  };
}

function pickIsbn(list) {
  if (!list) return '';
  for (const i of list) {
    const n = normaliseIsbn(i);
    if (n) return n;
  }
  return '';
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
  return res.json();
}

// Downloads a cover image as a Blob, or returns null if the server won't allow it.
export async function fetchCover(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    // Open Library returns a 1x1 placeholder when it has no cover.
    return blob.size > 1000 && blob.type.startsWith('image/') ? blob : null;
  } catch {
    return null;
  }
}

// Maps library subject headings onto the app's genres. Order matters: first match wins.
const GENRE_RULES = [
  ['Sci-Fi', /science fiction|sci-fi|space opera|dystopia|cyberpunk/],
  ['Fantasy', /fantasy|magic|dragons|wizards/],
  ['Horror', /horror|ghost stor|vampire|supernatural/],
  ['Crime', /crime|detective|police procedural|noir|murder/],
  ['Mystery', /mystery|whodunit/],
  ['Thriller', /thriller|suspense|espionage|spy/],
  ['Classic', /classic/],
  ['Romance', /romance|love stories/],
  ['Historical Fiction', /historical fiction/],
  ['Young Adult', /young adult|juvenile fiction|teen/],
  ['Graphic Novel', /comic|graphic novel/],
  ['Poetry', /poetry|poems/],
  ['Biography', /biography|autobiography/],
  ['Memoir', /memoir/],
  ['History', /^history|history,|world war/],
  ['Science', /science|physics|biology|mathematics|astronomy/],
  ['Self-Help', /self-help|self-actualization|personal development/],
  ['Humour', /humor|humour|comedy/],
  ['Literary Fiction', /literary fiction|fiction, general|^fiction$/],
];

export function guessGenre(subjects) {
  const list = subjects.slice(0, 30).map((s) => String(s).toLowerCase());
  for (const [genre, re] of GENRE_RULES) {
    if (list.some((s) => re.test(s))) return genre;
  }
  return '';
}

// ---- Barcode scanning ----

export function canScan() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

/**
 * Shows a live camera view in `video` and resolves with the first ISBN barcode seen.
 * Returns { result: Promise<string>, stop() }.
 */
export function scanIsbn(video) {
  let stopped = false;
  let cleanup = () => {};
  const stop = () => {
    stopped = true;
    cleanup();
  };

  const result = (async () => {
    if ('BarcodeDetector' in window) {
      const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
      if (formats.includes('ean_13')) return scanWithDetector(video, () => stopped, (fn) => (cleanup = fn));
    }
    return scanWithZxing(video, () => stopped, (fn) => (cleanup = fn));
  })();

  return { result, stop };
}

async function scanWithDetector(video, isStopped, setCleanup) {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
  setCleanup(() => stream.getTracks().forEach((t) => t.stop()));
  if (isStopped()) throw new Error('stopped');
  video.srcObject = stream;
  await video.play();
  const detector = new window.BarcodeDetector({ formats: ['ean_13'] });
  while (!isStopped()) {
    const codes = await detector.detect(video).catch(() => []);
    for (const c of codes) {
      const isbn = normaliseIsbn(c.rawValue);
      if (isbn) {
        stream.getTracks().forEach((t) => t.stop());
        return isbn;
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  throw new Error('stopped');
}

async function scanWithZxing(video, isStopped, setCleanup) {
  const { BrowserMultiFormatReader } = await import(ZXING_URL);
  if (isStopped()) throw new Error('stopped');
  const reader = new BrowserMultiFormatReader();
  return new Promise((resolve, reject) => {
    let controls;
    setCleanup(() => {
      if (controls) controls.stop();
      reject(new Error('stopped'));
    });
    reader
      .decodeFromConstraints({ video: { facingMode: 'environment' }, audio: false }, video, (res, _err, ctl) => {
        controls = ctl;
        const isbn = res && normaliseIsbn(res.getText());
        if (isbn) {
          ctl.stop();
          resolve(isbn);
        }
      })
      .then((ctl) => {
        controls = ctl;
        if (isStopped()) ctl.stop();
      })
      .catch(reject);
  });
}
