// The floating book: lifts out of the shelf as a 3D box (front, spine and back photos),
// turns to face you, and opens its cover to reveal your rating and notes.

import { urls } from './library.js';
import { formatDate, el, starRow } from './ui.js';

const FLY_MS = 850;
const COVER_MS = 750;
const DEFAULT_COVER_ASPECT = 0.66;

let active = null;

export function showBook(book, spine, actions) {
  if (active) return;
  active = new FloatingBook(book, spine, actions);
}

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
    inside.append(
      el('p', 'ex-libris', 'Ex Libris'),
      el('p', 'inside-title', book.title),
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

  renderPage() {
    const b = this.book;
    const inner = el('div', 'page-inner');

    const status = b.status === 'reading'
      ? `Reading${b.startedAt ? ` · since ${formatDate(b.startedAt)}` : ''}`
      : `Read${b.finishedAt ? ` · finished ${formatDate(b.finishedAt)}` : ''}`;
    inner.append(el('p', 'page-status', status), el('h2', 'page-title', b.title));
    if (b.author) inner.append(el('p', 'page-author', `by ${b.author}`));

    const stars = starRow(b.rating || 0, async (r) => {
      this.book = await this.actions.onRate(b, r);
      this.renderPage();
    });
    inner.append(stars);
    if (b.genre) inner.append(el('span', 'genre-tag', b.genre));

    inner.append(el('h3', 'page-sub', 'My thoughts'));
    inner.append(el('p', b.notes ? 'page-notes' : 'page-notes empty', b.notes || 'No notes yet.'));

    const acts = el('div', 'page-actions');
    if (b.status === 'reading') {
      const fin = el('button', 'btn btn-small btn-primary', 'Finished it!');
      fin.addEventListener('click', async () => {
        this.book = await this.actions.onFinish(b);
        this.renderPage();
      });
      acts.append(fin);
    }
    const edit = el('button', 'btn btn-small', 'Edit');
    edit.addEventListener('click', () => this.close().then(() => this.actions.onEdit(this.book)));
    const del = el('button', 'btn btn-small btn-danger', 'Remove');
    del.addEventListener('click', async () => {
      if (!confirm(`Remove “${b.title}” from your library?`)) return;
      await this.close({ toShelf: false });
      this.actions.onDelete(b);
    });
    acts.append(edit, del);
    inner.append(acts);

    this.page.replaceChildren(inner);
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
    this.root.classList.toggle('is-open', this.isOpen);
    this.hint.textContent = this.isOpen ? 'Tap the inside cover to close' : 'Tap the cover to open';
    this.flipBtn.disabled = this.isOpen;
  }

  flip() {
    if (this.busy || this.isOpen) return;
    this.isFlipped = !this.isFlipped;
    this.root.classList.toggle('is-flipped', this.isFlipped);
    this.hint.textContent = this.isFlipped ? 'Tap to turn back over' : 'Tap the cover to open';
  }

  async close({ toShelf = true } = {}) {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      this.busy = true;
      if (this.isOpen || this.isFlipped) {
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
