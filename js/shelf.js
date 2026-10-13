// Lays books out as spines standing on wooden shelves, wrapping onto new shelves as needed.

import { urls, jitter } from './library.js';

const GAP = 3;
const DEFAULT_SPINE_ASPECT = 0.13;

export function shelfBookHeight() {
  return window.innerWidth < 520 ? 150 : 190;
}

export function spineSize(book, maxH = shelfBookHeight()) {
  const h = Math.round(maxH * (0.84 + 0.16 * jitter(book.id)));
  const aspect = book.images && book.images.spine ? book.spineAspect : DEFAULT_SPINE_ASPECT;
  const w = Math.round(Math.min(h * 0.4, Math.max(12, h * (aspect || DEFAULT_SPINE_ASPECT))));
  return { w, h };
}

export function renderShelves(container, books, { onPick, emptyText }) {
  container.innerHTML = '';
  const maxH = shelfBookHeight();
  container.style.setProperty('--shelf-h', `${maxH + 18}px`);
  const available = container.clientWidth - 28; // inner padding of a shelf row

  const rows = [[]];
  let used = 0;
  for (const book of books) {
    const size = spineSize(book, maxH);
    if (used + size.w > available && rows[rows.length - 1].length) {
      rows.push([]);
      used = 0;
    }
    rows[rows.length - 1].push({ book, size });
    used += size.w + GAP;
  }

  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'shelf-row';
    const booksEl = document.createElement('div');
    booksEl.className = 'shelf-books';
    for (const { book, size } of row) booksEl.appendChild(spineEl(book, size, onPick));
    if (!row.length && emptyText) {
      const p = document.createElement('p');
      p.className = 'shelf-empty';
      p.textContent = emptyText;
      booksEl.appendChild(p);
    }
    rowEl.appendChild(booksEl);
    container.appendChild(rowEl);
  }
}

function spineEl(book, { w, h }, onPick) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'spine';
  el.dataset.id = book.id;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.setAttribute('aria-label', book.author ? `${book.title} by ${book.author}` : book.title);
  el.title = book.title;

  const u = urls(book);
  if (u.spine) {
    el.style.backgroundImage = `url("${u.spine}")`;
  } else {
    el.classList.add('generated');
    el.style.setProperty('--c', book.color);
    const t = document.createElement('span');
    t.className = 'spine-text';
    t.textContent = book.title;
    el.appendChild(t);
  }
  if (book.status === 'reading') {
    const mark = document.createElement('span');
    mark.className = 'bookmark';
    el.appendChild(mark);
  }
  el.addEventListener('click', () => onPick(book, el));
  return el;
}
