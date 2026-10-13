// The floating book: lifts out of the shelf as a 3D box (front, spine and back photos),
// turns to face you, and opens its cover to reveal your rating and notes.

import { urls, FORMATS } from './library.js';
import { formatDate, el, starRow, today } from './ui.js';
import { pageTurn, coverClose, slideOut } from './sound.js';

const FLY_MS = 850;
const COVER_MS = 750;
const DEFAULT_COVER_ASPECT = 0.66;

let active = null;

export function showBook(book, spine, actions) {
  if (active) return;
  active = new FloatingBook(book, spine, actions);
}

// The id of the book currently floating, so a redrawn shelf can keep its gap.
export const activeBookId = () => (active ? active.book.id : null);

export function closeActiveBook() {
  return active ? active.close() : Promise.resolve();
}

class FloatingBook {
  constructor(book, spine, actions) {
    this.book = book;
    this.spine = spine;
    this.actions = actions;
    this.isOpen = false;
    this.isFlipped = false;
    this.busy = true;

    this.measure();
    this.build();
    this.fly();
  }

  measure() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const coverAspect = this.book.coverAspect || DEFAULT_COVER_ASPECT;
    let H = Math.min(vh * 0.6, 520);
    let W = H * coverAspect;
    if (W > vw * 0.74) {
      W = vw * 0.74;
      H = W / coverAspect;
    }
    const s = this.spine.getBoundingClientRect();
    // Keep the box's depth in the same proportion as the spine on the shelf.
    const D = Math.min(W * 0.4, Math.max(8, (s.width / s.height) * H));
    Object.assign(this, { W, H, D });
    this.shift = vw >= 2 * W + 32 ? W / 2 : 0;
  }

  build() {
    const { W, H, D, book } = this;
    const u = urls(book);

    this.root = el('div', 'book-overlay');
    this.backdrop = el('div', 'book-backdrop');
    this.backdrop.addEventListener('click', () => this.close());

    const stage = el('div', 'book-stage');
    this.pos = el('div', 'book-pos');
    this.shiftEl = el('div', 'book-shift');
    this.shiftEl.style.setProperty('--shift', `${this.shift}px`);
    this.box = el('div', 'book3d');
    Object.assign(this.box.style, { width: `${W}px`, height: `${H}px` });
    Object.assign(this.pos.style, { width: `${W}px`, height: `${H}px` });

    const face = (cls, w, h, transform, left = 0, top = 0) => {
      const f = el('div', `face ${cls}`);
      Object.assign(f.style, { width: `${w}px`, height: `${h}px`, left: `${left}px`, top: `${top}px`, transform });
      this.box.appendChild(f);
      return f;
    };

    const back = face('face-back', W, H, `rotateY(180deg) translateZ(${D / 2}px)`);
    paint(back, u.back, book, 'back');
    back.addEventListener('click', () => this.flip());

    const spineFace = face('face-spine', D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, (W - D) / 2);
    paint(spineFace, u.spine, book, 'spine');

    face('face-edge edge-side', D, H, `rotateY(90deg) translateZ(${W / 2 - 2}px)`, (W - D) / 2);
    face('face-edge edge-top', W - 2, D, `rotateX(90deg) translateZ(${H / 2 - 1}px)`, 0, (H - D) / 2);
    face('face-edge edge-bottom', W - 2, D, `rotateX(-90deg) translateZ(${H / 2 - 1}px)`, 0, (H - D) / 2);

    this.page = face('page', W - 3, H - 4, `translateZ(${D / 2 - 1}px)`, 0, 2);
    this.page.style.fontSize = `${Math.max(12, Math.min(16, W * 0.05))}px`;
    this.renderPage();

    this.cover = el('div', 'cover');
    Object.assign(this.cover.style, { width: `${W}px`, height: `${H}px` });
    this.cover.style.setProperty('--z', `${D / 2}px`);
    const front = el('div', 'cover-front');
    paint(front, u.front, book, 'front');
    const inside = el('div', 'cover-inside');
    const firstQuote = book.quotes && book.quotes[0];
    inside.append(
      el('p', 'ex-libris', 'Ex Libris'),
      firstQuote ? el('p', 'inside-quote', `“${firstQuote.text}”`) : el('p', 'inside-title', book.title),
      el('p', 'inside-hint', 'Tap to close'),
    );
    this.cover.append(front, inside);
    this.cover.addEventListener('click', () => this.toggleCover());
    this.box.appendChild(this.cover);

    this.shiftEl.appendChild(this.box);
    this.pos.appendChild(this.shiftEl);
    stage.appendChild(this.pos);

    this.hint = el('p', 'book-hint', 'Tap the cover to open');
    this.flipBtn = el('button', 'btn btn-ghost', 'Turn over');
    this.flipBtn.addEventListener('click', () => this.flip());
    const closeBtn = el('button', 'btn btn-ghost', 'Back to shelf');
    closeBtn.addEventListener('click', () => this.close());
    const toolbar = el('div', 'book-toolbar');
    const btns = el('div', 'book-toolbar-btns');
    btns.append(this.flipBtn, closeBtn);
    toolbar.append(this.hint, btns);

    this.root.append(this.backdrop, stage, toolbar);
    document.body.appendChild(this.root);
    document.body.classList.add('no-scroll');

    this.onKey = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('keydown', this.onKey);
  }

  // Applies a change, then redraws the page with the saved book.
  async update(patch, message) {
    this.book = await this.actions.update(this.book, patch, message);
    this.renderPage();
  }

  renderPage() {
    const b = this.book;
    const inner = el('div', 'page-inner');

    const status = {
      want: `Want to read${b.wantedAt ? ` · added ${formatDate(b.wantedAt)}` : ''}`,
      reading: `Reading${b.startedAt ? ` · since ${formatDate(b.startedAt)}` : ''}`,
      read: `Read${b.finishedAt ? ` · finished ${formatDate(b.finishedAt)}` : ''}`,
    }[b.status] || '';
    inner.append(el('p', 'page-status', status), el('h2', 'page-title', b.title));
    if (b.author) inner.append(el('p', 'page-author', `by ${b.author}`));

    if (b.lentTo) {
      const lent = el('div', 'lent-note');
      lent.append(el('span', null, `Lent to ${b.lentTo}${b.lentAt ? ` on ${formatDate(b.lentAt)}` : ''}`));
      const back = el('button', 'btn btn-small', 'It’s back');
      back.addEventListener('click', () => this.update({ lentTo: '', lentAt: '' }, `“${b.title}” is back on the shelf`));
      lent.append(back);
      inner.append(lent);
    }

    if (b.status !== 'want') {
      inner.append(starRow(b.rating || 0, (r) => this.update({ rating: r })));
    }
    const tags = el('div', 'tags');
    if (b.genre) tags.append(el('span', 'genre-tag', b.genre));
    if (b.format && b.format !== 'print') tags.append(el('span', 'genre-tag tag-light', FORMATS[b.format]));
    const facts = [b.pages && `${b.pages} pages`, b.year].filter(Boolean).join(' · ');
    if (facts) tags.append(el('span', 'page-facts', facts));
    if (tags.children.length) inner.append(tags);

    if (b.status === 'reading') inner.append(this.progressBlock());

    if (b.status !== 'want' || b.notes) {
      inner.append(el('h3', 'page-sub', b.status === 'want' ? 'Notes' : 'My thoughts'));
      inner.append(el('p', b.notes ? 'page-notes' : 'page-notes empty', b.notes || 'No notes yet.'));
    }

    if (b.quotes && b.quotes.length) {
      inner.append(el('h3', 'page-sub', 'Favourite quotes'));
      for (const q of b.quotes) {
        const bq = el('blockquote', 'quote', q.text);
        if (q.page) bq.append(el('cite', null, `p. ${q.page}`));
        inner.append(bq);
      }
    }

    if (b.reads && b.reads.length) {
      const times = b.reads.length + (b.status === 'read' ? 1 : 0);
      inner.append(el('h3', 'page-sub', times > 1 ? `Read ${times} times · earlier reads` : 'Earlier reads'));
      for (const r of [...b.reads].reverse()) {
        const item = el('div', 'past-read');
        const when = [r.startedAt && formatDate(r.startedAt), r.finishedAt && formatDate(r.finishedAt)].filter(Boolean).join(' – ');
        item.append(el('p', 'past-when', `${when || 'Undated'}${r.rating ? ` · ${'★'.repeat(r.rating)}` : ''}`));
        if (r.notes) item.append(el('p', 'past-notes', r.notes));
        inner.append(item);
      }
    }

    inner.append(this.actionsBlock());
    this.page.replaceChildren(inner);
  }

  progressBlock() {
    const b = this.book;
    const box = el('div', 'progress-block');
    const pct = b.pages ? Math.min(100, Math.round(((b.currentPage || 0) / b.pages) * 100)) : null;
    if (pct !== null) {
      const bar = el('div', 'reading-bar');
      const fill = el('span');
      fill.style.width = `${pct}%`;
      bar.append(fill);
      box.append(bar);
    }
    const form = el('form', 'progress-form');
    const label = el('label', null, 'Page');
    const inp = el('input');
    inp.type = 'number';
    inp.min = '0';
    inp.inputMode = 'numeric';
    inp.value = b.currentPage || '';
    inp.placeholder = '0';
    if (b.pages) inp.max = String(b.pages);
    label.append(inp);
    form.append(label, el('span', null, b.pages ? `of ${b.pages}${pct !== null ? ` · ${pct}%` : ''}` : ''));
    const save = el('button', 'btn btn-small', 'Update');
    form.append(save);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const page = Math.max(0, Number(inp.value) || 0);
      if (b.pages && page >= b.pages && confirm('That’s the last page. Mark it as finished?')) {
        this.finish();
        return;
      }
      this.update({ currentPage: page });
    });
    box.append(form);
    return box;
  }

  finish() {
    pageTurn();
    return this.update({ status: 'read', finishedAt: this.book.finishedAt || today(), currentPage: this.book.pages || this.book.currentPage }, 'Finished! It’s moved to your Read shelf.');
  }

  actionsBlock() {
    const b = this.book;
    const acts = el('div', 'page-actions');
    const button = (label, cls, fn) => {
      const btn = el('button', `btn btn-small ${cls}`, label);
      btn.addEventListener('click', fn);
      acts.append(btn);
    };

    if (b.status === 'want') {
      button('Start reading', 'btn-primary', () => this.update({ status: 'reading', startedAt: today(), currentPage: 0 }, 'Enjoy it! It’s on your Currently reading shelf.'));
    } else if (b.status === 'reading') {
      button('Finished it!', 'btn-primary', () => this.finish());
    } else if (b.status === 'read') {
      button('Read again', '', () => {
        if (!confirm('Start a re-read? This read’s dates, rating and thoughts will be kept under “Earlier reads”.')) return;
        const past = { startedAt: b.startedAt || '', finishedAt: b.finishedAt || '', rating: b.rating || 0, notes: b.notes || '' };
        this.update({ reads: [...(b.reads || []), past], status: 'reading', startedAt: today(), finishedAt: '', currentPage: 0, rating: 0, notes: '' }, 'Back on your Currently reading shelf');
      });
    }

    if (!b.lentTo) {
      button('Lend', '', () => {
        const who = prompt('Who are you lending it to?');
        if (who && who.trim()) this.update({ lentTo: who.trim(), lentAt: today() }, `Lent to ${who.trim()}`);
      });
    }
    button('Edit', '', () => this.close().then(() => this.actions.onEdit(this.book)));
    button('Remove', 'btn-danger', async () => {
      if (!confirm(`Remove “${b.title}” from your library?`)) return;
      await this.close({ toShelf: false });
      this.actions.onDelete(b);
    });
    return acts;
  }

  transformAt(x, y, z, scale, angle) {
    return `translate(${x - this.W / 2}px, ${y - this.H / 2}px) translateZ(${z}px) scale3d(${scale}, ${scale}, ${scale}) rotateY(${angle}deg)`;
  }

  spineFrames() {
    const s = this.spine.getBoundingClientRect();
    const cx = s.left + s.width / 2;
    const cy = s.top + s.height / 2;
    const k = s.height / this.H;
    return {
      onShelf: this.transformAt(cx, cy, 0, k, 90),
      pulled: this.transformAt(cx, cy - s.height * 0.08, 80, k * 1.08, 90),
      centre: this.transformAt(window.innerWidth / 2, window.innerHeight * 0.44, 0, 1, 0),
    };
  }

  fly() {
    const f = this.spineFrames();
    this.spine.classList.add('lifted');
    this.root.classList.add('visible');
    slideOut();
    const anim = this.pos.animate(
      [
        { transform: f.onShelf },
        { transform: f.pulled, offset: 0.25 },
        { transform: f.centre },
      ],
      { duration: FLY_MS, easing: 'cubic-bezier(.25,.7,.25,1)', fill: 'forwards' },
    );
    anim.finished.then(() => {
      this.pos.style.transform = f.centre;
      anim.cancel();
      this.shiftEl.classList.add('settled');
      this.busy = false;
    });
  }

  toggleCover() {
    if (this.busy || this.isFlipped) return;
    this.isOpen = !this.isOpen;
    (this.isOpen ? pageTurn : coverClose)();
    this.root.classList.toggle('is-open', this.isOpen);
    this.hint.textContent = this.isOpen ? 'Tap the inside cover to close' : 'Tap the cover to open';
    this.flipBtn.disabled = this.isOpen;
  }

  flip() {
    if (this.busy || this.isOpen) return;
    this.isFlipped = !this.isFlipped;
    slideOut();
    this.root.classList.toggle('is-flipped', this.isFlipped);
    this.hint.textContent = this.isFlipped ? 'Tap to turn back over' : 'Tap the cover to open';
  }

  async close({ toShelf = true } = {}) {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      this.busy = true;
      if (this.isOpen || this.isFlipped) {
        if (this.isOpen) coverClose();
        this.root.classList.remove('is-open', 'is-flipped');
        this.isOpen = this.isFlipped = false;
        await wait(COVER_MS);
      }
      this.shiftEl.classList.remove('settled');
      this.root.classList.remove('visible');
      // The shelf may have been redrawn while the book was out (e.g. it was marked finished),
      // so find where its spine lives now before flying back.
      if (this.actions.onReturn) this.actions.onReturn();
      const fresh = document.querySelector(`.spine[data-id="${CSS.escape(this.book.id)}"]`);
      if (fresh && fresh !== this.spine) {
        this.spine = fresh;
        fresh.classList.add('lifted');
      }
      if (toShelf && this.spine.isConnected) {
        const f = this.spineFrames();
        const anim = this.pos.animate(
          [{ transform: f.centre }, { transform: f.pulled, offset: 0.75 }, { transform: f.onShelf }],
          { duration: FLY_MS * 0.85, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' },
        );
        await anim.finished;
      } else {
        this.pos.classList.add('vanish');
        await wait(300);
      }
      this.spine.classList.remove('lifted');
      this.root.remove();
      document.body.classList.remove('no-scroll');
      document.removeEventListener('keydown', this.onKey);
      if (this.spine.isConnected) this.spine.focus({ preventScroll: true });
      active = null;
    })();
    return this.closing;
  }
}

// Fills a face with a photo, or a generated design when no photo was taken.
function paint(node, url, book, kind) {
  if (url) {
    node.style.backgroundImage = `url("${url}")`;
    return;
  }
  node.classList.add('generated');
  node.style.setProperty('--c', book.color);
  if (kind === 'front') {
    node.append(el('span', 'gen-title', book.title));
    if (book.author) node.append(el('span', 'gen-author', book.author));
  } else if (kind === 'spine') {
    node.append(el('span', 'spine-text', book.title));
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
