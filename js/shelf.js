// Draws the bookcase from slices of images/bookcase.webp and stands books on its shelves.
//
// The photo is cut into horizontal bands: the crown at the top, one band per compartment
// (the open space books stand in), the plank under each compartment and the base. Compartments
// are stretched vertically so spines stay readable on small screens (the back panel is vertical
// boards, so stretching doesn't show) while planks keep their real thickness. When the books
// need more room, the middle compartments repeat and the bookcase grows taller.

import { urls, jitter } from './library.js';

// Measurements of images/bookcase.webp, in image pixels.
const IMG = { src: 'images/bookcase.webp', w: 941, h: 1672 };
const CROP_X = [118, 868]; // left/right edges of what's shown (the bookcase plus a little room)
const INTERIOR_X = [192, 794]; // inside faces of the side frames
const CROWN = [0, 210];
const COMPARTMENTS = [[210, 342], [358, 540], [556, 744], [760, 944], [964, 1142], [1174, 1352]];
const PLANKS = [[342, 358], [540, 556], [744, 760], [944, 964], [1142, 1174]];
const BASE = [1352, 1540];
const MIN_SHELVES = COMPARTMENTS.length;

const GAP = 2;
const SIDE_PAD = 6;
const SINK = 4; // how far book bottoms tuck behind the plank's front edge

// Height of a book as a fraction of the shelf's clearance. Ranges overlap a little so the shelf
// looks natural rather than in three neat steps.
export const SIZES = {
  paperback: { label: 'Paperback', range: [0.55, 0.7] },
  standard: { label: 'Standard', range: [0.68, 0.84] },
  hardback: { label: 'Hardback', range: [0.82, 0.98] },
};
const AUTO_RANGE = [0.58, 0.97];

// Page counts mapped onto spine thickness: a 60-page novella is slim, a 1,000-page epic is fat.
const THIN_PAGES = 60;
const THICK_PAGES = 1000;

export function spineSize(book, clearance) {
  const [lo, hi] = (SIZES[book.size] || {}).range || AUTO_RANGE;
  const h = Math.round(clearance * (lo + (hi - lo) * jitter(book.id)));

  // A floor on width keeps titles legible on very thin books; a ceiling stops doorstops
  // taking over the shelf.
  // The ceiling follows the shelf, not the book's height, so a fat paperback still looks fat;
  // it's only capped at 62% of its own height so it never looks like a box.
  const minW = Math.max(18, clearance * 0.12);
  const maxW = Math.max(minW + 10, Math.min(clearance * 0.36, h * 0.62));
  const photo = book.images && book.images.spine && book.spineAspect ? h * book.spineAspect : null;

  let w;
  if (book.pages) {
    // Square root spreads the common 150–500 page range out, so similar books still differ.
    const t = Math.sqrt(Math.min(1, Math.max(0, (book.pages - THIN_PAGES) / (THICK_PAGES - THIN_PAGES))));
    w = minW + t * (maxW - minW);
    // Keep a spine photo from being stretched or squashed out of recognition.
    if (photo) w = Math.min(Math.max(w, photo * 0.75), photo * 1.6);
  } else if (photo) {
    w = photo;
  } else {
    // No page count or photo: a believable, stable thickness per book.
    w = h * (0.1 + 0.1 * jitter(`${book.id}:w`));
  }
  return { w: Math.round(Math.min(maxW, Math.max(minW, w))), h };
}

/**
 * sections: [{ key, label, books, emptyText }]. Each section starts on a fresh shelf.
 * match: optional (book) => boolean; when given, matching spines glow and the rest dim.
 */
export function renderBookcase(container, sections, { onPick, match = null }) {
  const width = container.clientWidth;
  if (!width) return;
  const s = width / (CROP_X[1] - CROP_X[0]);
  const naturalClearance = (COMPARTMENTS[1][1] - COMPARTMENTS[1][0]) * s;
  const clearance = Math.max(naturalClearance, width < 520 ? 140 : 165);
  const innerW = (INTERIOR_X[1] - INTERIOR_X[0]) * s - SIDE_PAD * 2;

  // Pack books into shelves.
  const shelves = [];
  for (const section of sections) {
    let shelf = { items: [], used: 0, label: section.label, empty: section.books.length ? null : section.emptyText };
    shelves.push(shelf);
    for (const book of section.books) {
      const size = spineSize(book, clearance);
      if (shelf.items.length && shelf.used + size.w > innerW) {
        shelf = { items: [], used: 0 };
        shelves.push(shelf);
      }
      shelf.items.push({ book, size, section: section.key });
      shelf.used += size.w + GAP;
    }
  }
  while (shelves.length < MIN_SHELVES) shelves.push({ items: [], used: 0 });

  const slice = (cls, [y0, y1], displayH) => {
    const node = document.createElement('div');
    node.className = cls;
    const sy = displayH / ((y1 - y0) * s);
    Object.assign(node.style, {
      height: `${displayH}px`,
      backgroundImage: `url("${IMG.src}")`,
      backgroundSize: `${IMG.w * s}px ${IMG.h * s * sy}px`,
      backgroundPosition: `${-CROP_X[0] * s}px ${-y0 * s * sy}px`,
    });
    return node;
  };

  const frag = document.createDocumentFragment();
  frag.appendChild(slice('case-crown', CROWN, (CROWN[1] - CROWN[0]) * s));

  shelves.forEach((shelf, i) => {
    const last = i === shelves.length - 1;
    // First and last compartments are distinctive; the middle four repeat as needed.
    const ci = i === 0 ? 0 : last ? COMPARTMENTS.length - 1 : 1 + ((i - 1) % 4);
    const compartment = slice('case-compartment', COMPARTMENTS[ci], clearance);

    const row = document.createElement('div');
    row.className = 'case-books';
    Object.assign(row.style, {
      left: `${(INTERIOR_X[0] - CROP_X[0]) * s + SIDE_PAD}px`,
      width: `${innerW}px`,
      bottom: `${-SINK}px`,
    });
    for (const { book, size, section } of shelf.items) {
      const spine = spineEl(book, size, onPick);
      spine.dataset.section = section;
      if (match) spine.classList.add(match(book) ? 'match' : 'dim');
      row.appendChild(spine);
    }
    if (shelf.empty) {
      const p = document.createElement('p');
      p.className = 'shelf-empty';
      p.textContent = shelf.empty;
      row.appendChild(p);
    }
    compartment.appendChild(row);
    frag.appendChild(compartment);

    const floor = last ? slice('case-base', BASE, (BASE[1] - BASE[0]) * s) : slice('case-plank', PLANKS[ci], (PLANKS[ci][1] - PLANKS[ci][0]) * s);
    if (shelf.label) {
      const plaque = document.createElement('span');
      plaque.className = 'plaque';
      plaque.textContent = shelf.label;
      plaque.style.left = `${(INTERIOR_X[0] - CROP_X[0]) * s + SIDE_PAD}px`;
      floor.appendChild(plaque);
    }
    frag.appendChild(floor);
  });

  container.replaceChildren(frag);
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
    // Fit the title along the spine: limited by spine width, then shrunk for long titles.
    const byWidth = Math.min(15, w * 0.48);
    const byLength = (h - 14) / (book.title.length * 0.58);
    el.style.setProperty('--fs', `${Math.max(8, Math.min(byWidth, byLength))}px`);
    const t = document.createElement('span');
    t.className = 'spine-text';
    t.textContent = book.title;
    el.appendChild(t);
  }
  if (book.status === 'reading') {
    // The ribbon hangs further down the spine the further through the book you are.
    const progress = book.pages ? Math.min(1, (book.currentPage || 0) / book.pages) : 0;
    const mark = document.createElement('span');
    mark.className = 'bookmark';
    mark.style.height = `${Math.round(18 + progress * (h * 0.55))}px`;
    el.appendChild(mark);
  }
  if (book.format === 'ebook' || book.format === 'audiobook') {
    const badge = document.createElement('span');
    badge.className = `format-badge ${book.format}`;
    badge.title = book.format === 'ebook' ? 'Ebook' : 'Audiobook';
    el.appendChild(badge);
  }
  if (book.lentTo) {
    el.classList.add('lent');
    el.setAttribute('aria-label', `${el.getAttribute('aria-label')}, lent to ${book.lentTo}`);
    const tag = document.createElement('span');
    tag.className = 'lent-tag';
    tag.textContent = 'Lent';
    el.appendChild(tag);
  }
  el.addEventListener('click', () => onPick(book, el));
  return el;
}
