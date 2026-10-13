// Add / edit wizard: find the book, photograph the front, spine and back, then fill in your thoughts.

import { GENRES, FORMATS, newId, pickColor, nextOrder } from './library.js';
import { normaliseIsbn, lookupIsbn, searchBooks, fetchCover, canScan, scanIsbn } from './lookup.js';
import { fileToCanvas, rotate90, toJpeg } from './images.js';
import { Cropper } from './cropper.js';
import { el, starRow, today } from './ui.js';
import { SIZES } from './shelf.js';

const STEPS = ['find', 'front', 'spine', 'back', 'details'];

const PHOTO_COPY = {
  front: {
    title: 'Front cover',
    text: 'Lay the book flat and photograph the front cover, then drag the corners to fit it.',
  },
  spine: {
    title: 'Spine',
    text: 'Photograph the spine, standing up or lying flat (it will be turned upright). Crop tightly to its edges; this is what sits on your shelf.',
  },
  back: {
    title: 'Back cover',
    text: 'Turn the book over and photograph the back cover.',
  },
};

export function openEditor(existing, save) {
  return new Promise((resolve) => new Editor(existing, save, resolve));
}

class Editor {
  constructor(existing, save, resolve) {
    this.save = save;
    this.resolve = resolve;
    this.isNew = !existing;
    const id = existing ? existing.id : newId();
    this.draft = existing
      ? { ...existing, images: { ...(existing.images || {}) } }
      : {
          id, title: '', author: '', status: 'reading', format: 'print', size: 'standard', genre: '', rating: 0, notes: '',
          quotes: [], pages: null, currentPage: 0, isbn: '', year: null, startedAt: today(), finishedAt: '',
          images: {}, imageRev: {}, color: pickColor(id), order: nextOrder(), createdAt: Date.now(),
        };
    this.draft.imageRev = { ...(this.draft.imageRev || {}) };
    this.draft.quotes = (this.draft.quotes || []).map((q) => ({ ...q }));
    this.dirty = false;
    this.previewUrls = [];
    this.build();
    this.go(this.isNew ? 0 : STEPS.length - 1);
  }

  build() {
    this.root = el('div', 'sheet-overlay');
    const sheet = el('div', 'sheet');
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', this.isNew ? 'Add a book' : 'Edit book');

    const head = el('div', 'sheet-head');
    this.backBtn = el('button', 'icon-btn', '‹');
    this.backBtn.setAttribute('aria-label', 'Previous step');
    this.backBtn.addEventListener('click', () => this.go(this.step - 1));
    this.heading = el('p', 'sheet-title');
    const close = el('button', 'icon-btn', '✕');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', () => this.cancel());
    head.append(this.backBtn, this.heading, close);

    this.progress = el('div', 'progress');
    STEPS.forEach(() => this.progress.appendChild(el('span')));

    this.body = el('div', 'sheet-body');

    this.camInput = fileInput(true);
    this.libInput = fileInput(false);
    for (const input of [this.camInput, this.libInput]) {
      input.addEventListener('change', () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (file) this.startCrop(file);
      });
    }

    sheet.append(head, this.progress, this.body, this.camInput, this.libInput);
    this.root.appendChild(sheet);
    document.body.appendChild(this.root);
    document.body.classList.add('no-scroll');
    requestAnimationFrame(() => this.root.classList.add('visible'));
  }

  go(i) {
    if (i < 0 || i >= STEPS.length) return;
    this.step = i;
    this.stopCrop();
    this.stopScan();
    [...this.progress.children].forEach((s, j) => s.classList.toggle('on', j <= i));
    this.backBtn.style.visibility = i > 0 ? 'visible' : 'hidden';
    this.heading.textContent = `${this.isNew ? 'Add a book' : 'Edit book'} · ${i + 1} of ${STEPS.length}`;
    this.revokePreviews();
    const kind = STEPS[i];
    if (kind === 'details') this.renderDetails();
    else if (kind === 'find') this.renderFind();
    else this.renderPhoto(kind);
    this.body.scrollTop = 0;
  }

  // ---- Photo steps ----

  renderPhoto(kind) {
    const copy = PHOTO_COPY[kind];
    const blob = this.draft.images[kind];
    const area = el('div', `photo-area photo-${kind}`);

    if (blob) {
      const img = el('img', 'photo-preview');
      img.alt = `${copy.title} photo`;
      img.src = this.preview(blob);
      area.appendChild(img);
    } else {
      area.appendChild(placeholder(kind));
    }

    const actions = el('div', 'step-actions');
    if (kind === 'front' && !blob && this.found && this.found.coverUrl) {
      const useCover = el('button', 'btn', 'Use the published cover');
      useCover.addEventListener('click', () => this.usePublishedCover(useCover));
      actions.append(useCover);
    }
    const take = el('button', 'btn btn-primary', blob ? 'Retake photo' : 'Take photo');
    take.addEventListener('click', () => this.camInput.click());
    const pick = el('button', 'btn', 'Choose from library');
    pick.addEventListener('click', () => this.libInput.click());
    actions.append(take, pick);

    const nav = el('div', 'step-nav');
    if (blob) {
      const rot = el('button', 'btn btn-ghost', 'Rotate ⟳');
      rot.addEventListener('click', () => this.rotateStored(kind));
      const remove = el('button', 'btn btn-ghost', 'Remove');
      remove.addEventListener('click', () => {
        delete this.draft.images[kind];
        delete this.draft.imageRev[kind];
        this.dirty = true;
        this.go(this.step);
      });
      nav.append(rot, remove);
    }
    const next = el('button', blob ? 'btn btn-primary' : 'btn btn-ghost', blob ? 'Next →' : 'Skip for now →');
    next.addEventListener('click', () => this.go(this.step + 1));
    nav.append(next);

    this.body.replaceChildren(el('h2', 'step-title', copy.title), el('p', 'step-text', copy.text), area, actions, nav);
  }

  async startCrop(file) {
    const kind = STEPS[this.step];
    let canvas;
    try {
      canvas = await fileToCanvas(file);
    } catch {
      alert('Sorry, that photo could not be opened. Try a JPEG or PNG.');
      return;
    }
    const host = el('div', `crop-host crop-${kind}`);
    const tools = el('div', 'step-nav');
    const rot = el('button', 'btn btn-ghost', 'Rotate ⟳');
    const reset = el('button', 'btn btn-ghost', 'Reset');
    const use = el('button', 'btn btn-primary', 'Use photo ✓');
    tools.append(rot, reset, use);

    this.body.replaceChildren(
      el('h2', 'step-title', `Crop the ${PHOTO_COPY[kind].title.toLowerCase()}`),
      el('p', 'step-text', 'Drag the box and its handles so only the book is inside.'),
      host,
      tools,
    );
    this.cropper = new Cropper(host, canvas, { narrow: kind === 'spine' });
    rot.addEventListener('click', () => this.cropper.rotate());
    reset.addEventListener('click', () => this.cropper.reset());
    use.addEventListener('click', async () => {
      use.disabled = true;
      let out = this.cropper.result();
      if (kind === 'spine' && out.width > out.height) out = rotate90(out, 1);
      await this.storeImage(kind, out);
      this.go(this.step + 1);
    });
  }

  stopCrop() {
    if (this.cropper) this.cropper.destroy();
    this.cropper = null;
  }

  async storeImage(kind, canvas) {
    const { blob, aspect } = await toJpeg(canvas, kind === 'spine' ? 1400 : 1200);
    this.draft.images[kind] = blob;
    this.draft.imageRev[kind] = newId();
    this.draft[`${kind === 'front' ? 'cover' : kind}Aspect`] = aspect;
    this.dirty = true;
  }

  async rotateStored(kind) {
    const canvas = await fileToCanvas(this.draft.images[kind], 1400);
    await this.storeImage(kind, rotate90(canvas, 1));
    this.go(this.step);
  }

  // ---- Find step ----

  renderFind() {
    const wrap = el('div', 'find');

    const scanBox = el('div', 'scan-box');
    const scanBtn = el('button', 'btn btn-primary btn-block', 'Scan the barcode');
    scanBtn.hidden = !canScan();
    scanBtn.addEventListener('click', () => this.startScan(scanBox, scanBtn));
    scanBox.append(scanBtn);

    const isbnForm = el('form', 'inline-form');
    const isbnInput = input('text', '', { inputmode: 'numeric', placeholder: 'ISBN, e.g. 9780141439518', autocomplete: 'off', 'aria-label': 'ISBN' });
    const isbnBtn = el('button', 'btn', 'Look up');
    isbnForm.append(isbnInput, isbnBtn);
    isbnForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const isbn = normaliseIsbn(isbnInput.value);
      if (!isbn) return this.findMessage('That ISBN doesn’t look right. It’s the 10 or 13 digit number by the barcode.');
      this.lookup(isbn);
    });

    const searchForm = el('form', 'inline-form');
    const searchInput = input('search', '', { placeholder: 'Title and/or author', autocomplete: 'off', 'aria-label': 'Search by title or author' });
    const searchBtn = el('button', 'btn', 'Search');
    searchForm.append(searchInput, searchBtn);
    searchForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!searchInput.value.trim()) return;
      this.findMessage('Searching…');
      try {
        const results = await searchBooks(searchInput.value);
        this.showResults(results);
      } catch {
        this.findMessage('Couldn’t reach the book database. Check your connection, or skip and type the details in.');
      }
    });

    this.findOut = el('div', 'find-out');
    if (this.found) this.showFound(this.found);

    const skip = el('button', 'btn btn-ghost', this.found ? 'Next →' : 'Skip, I’ll type it in →');
    skip.addEventListener('click', () => this.go(this.step + 1));
    const nav = el('div', 'step-nav');
    nav.append(skip);

    wrap.append(
      scanBox,
      el('p', 'or', 'or'),
      field('ISBN', isbnForm),
      field('Search', searchForm),
      this.findOut,
    );
    this.body.replaceChildren(
      el('h2', 'step-title', 'Find your book'),
      el('p', 'step-text', 'Scan the barcode on the back, or search, and the title, author and page count are filled in for you.'),
      wrap,
      nav,
    );
  }

  async startScan(box, btn) {
    btn.hidden = true;
    const video = el('video', 'scan-video');
    video.muted = true;
    video.setAttribute('playsinline', '');
    const frame = el('div', 'scan-frame');
    const cancel = el('button', 'btn btn-ghost btn-small', 'Cancel');
    const view = el('div', 'scan-view');
    view.append(video, frame);
    box.append(view, cancel);
    const reset = () => {
      view.remove();
      cancel.remove();
      btn.hidden = false;
    };
    cancel.addEventListener('click', () => {
      this.stopScan();
      reset();
    });
    this.scanner = scanIsbn(video);
    try {
      const isbn = await this.scanner.result;
      this.scanner = null;
      reset();
      this.lookup(isbn);
    } catch (err) {
      this.scanner = null;
      if (err.message === 'stopped') return;
      reset();
      this.findMessage(err.name === 'NotAllowedError'
        ? 'The camera was blocked. Allow camera access for this site, or type the ISBN instead.'
        : 'Couldn’t start the scanner on this device. Type the ISBN instead.');
    }
  }

  stopScan() {
    if (this.scanner) this.scanner.stop();
    this.scanner = null;
  }

  async lookup(isbn) {
    this.findMessage('Looking it up…');
    try {
      const book = await lookupIsbn(isbn);
      if (book) this.choose(book);
      else this.findMessage(`No details found for ISBN ${isbn}. Skip and type them in. The ISBN has been saved.`, () => {
        this.draft.isbn = isbn;
      });
    } catch {
      this.findMessage('Couldn’t reach the book database. Check your connection, or skip and type the details in.');
    }
  }

  findMessage(text, then) {
    this.findOut.replaceChildren(el('p', 'find-msg', text));
    if (then) then();
  }

  showResults(results) {
    if (!results.length) return this.findMessage('Nothing found. Try fewer words, or skip and type it in.');
    const list = el('ul', 'results');
    for (const r of results) {
      const li = el('li');
      const b = el('button', 'result');
      b.type = 'button';
      const thumb = el('span', 'result-thumb');
      if (r.thumbUrl) thumb.style.backgroundImage = `url("${r.thumbUrl}")`;
      const text = el('span', 'result-text');
      text.append(el('strong', null, r.title), el('span', null, [r.author, r.year].filter(Boolean).join(' · ')));
      b.append(thumb, text);
      b.addEventListener('click', () => this.choose(r));
      li.append(b);
      list.append(li);
    }
    this.findOut.replaceChildren(list);
  }

  choose(found) {
    this.found = found;
    const d = this.draft;
    d.title = found.title || d.title;
    d.author = found.author || d.author;
    if (found.pages) d.pages = found.pages;
    if (found.year) d.year = found.year;
    if (found.isbn) d.isbn = found.isbn;
    if (found.genre && !d.genre) d.genre = found.genre;
    this.dirty = true;
    this.showFound(found);
  }

  showFound(found) {
    const card = el('div', 'found');
    const thumb = el('span', 'result-thumb');
    if (found.thumbUrl) thumb.style.backgroundImage = `url("${found.thumbUrl}")`;
    const text = el('div', 'result-text');
    text.append(
      el('strong', null, found.title),
      el('span', null, [found.author, found.year, found.pages && `${found.pages} pages`].filter(Boolean).join(' · ')),
    );
    const next = el('button', 'btn btn-primary btn-small', 'That’s it →');
    next.addEventListener('click', () => this.go(this.step + 1));
    card.append(thumb, text, next);
    this.findOut.replaceChildren(card);
  }

  async usePublishedCover(btn) {
    btn.disabled = true;
    btn.textContent = 'Fetching cover…';
    const blob = await fetchCover(this.found.coverUrl);
    if (!blob) {
      btn.textContent = 'Cover not available';
      return;
    }
    const canvas = await fileToCanvas(blob, 1400);
    await this.storeImage('front', canvas);
    this.go(this.step);
  }

  // ---- Details step ----

  renderDetails() {
    const d = this.draft;
    const form = el('form', 'details-form');
    form.noValidate = true;

    const thumbs = el('div', 'thumbs');
    ['front', 'spine', 'back'].forEach((kind) => {
      const t = el('button', `thumb thumb-${kind}`);
      t.type = 'button';
      t.setAttribute('aria-label', `${PHOTO_COPY[kind].title} photo`);
      if (d.images[kind]) t.style.backgroundImage = `url("${this.preview(d.images[kind])}")`;
      else t.appendChild(el('span', null, '+'));
      t.appendChild(el('small', null, PHOTO_COPY[kind].title));
      t.addEventListener('click', () => this.go(STEPS.indexOf(kind)));
      thumbs.appendChild(t);
    });

    const title = field('Title', input('text', d.title, { required: true, autocomplete: 'off' }));
    const author = field('Author', input('text', d.author, { autocomplete: 'off' }));

    const statusSeg = el('div', 'segmented');
    const finishedField = field('Finished', input('date', d.finishedAt));
    const startedField = field('Started', input('date', d.startedAt));
    const pagesInput = input('number', d.pages || '', { min: 1, inputmode: 'numeric', placeholder: 'e.g. 320' });
    const currentInput = input('number', d.currentPage || '', { min: 0, inputmode: 'numeric', placeholder: '0' });
    const currentField = field('Page I’m on', currentInput);
    const setStatus = (s) => {
      d.status = s;
      [...statusSeg.children].forEach((b) => b.classList.toggle('on', b.dataset.value === s));
      finishedField.hidden = s !== 'read';
      startedField.hidden = s === 'want';
      currentField.hidden = s !== 'reading';
      if (s === 'read' && !finishedField.querySelector('input').value) finishedField.querySelector('input').value = today();
      if (s !== 'want' && !startedField.querySelector('input').value) startedField.querySelector('input').value = today();
    };
    [['want', 'Want to read'], ['reading', 'Reading'], ['read', 'Finished']].forEach(([value, label]) => {
      const b = el('button', null, label);
      b.type = 'button';
      b.dataset.value = value;
      b.addEventListener('click', () => {
        this.dirty = true;
        setStatus(value);
      });
      statusSeg.appendChild(b);
    });

    const formatSeg = el('div', 'segmented');
    for (const [value, label] of Object.entries(FORMATS)) {
      const b = el('button', (d.format || 'print') === value ? 'on' : null, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        d.format = value;
        this.dirty = true;
        [...formatSeg.children].forEach((c) => c.classList.toggle('on', c === b));
      });
      formatSeg.appendChild(b);
    }

    const sizeSeg = el('div', 'segmented');
    for (const [value, { label }] of Object.entries(SIZES)) {
      const b = el('button', d.size === value ? 'on' : null, label);
      b.type = 'button';
      b.addEventListener('click', () => {
        d.size = value;
        this.dirty = true;
        [...sizeSeg.children].forEach((c) => c.classList.toggle('on', c === b));
      });
      sizeSeg.appendChild(b);
    }

    const genreInput = input('text', d.genre, { list: 'genre-list', autocomplete: 'off', placeholder: 'e.g. Thriller' });
    const list = el('datalist');
    list.id = 'genre-list';
    GENRES.forEach((g) => {
      const o = el('option');
      o.value = g;
      list.appendChild(o);
    });
    const genreChips = el('div', 'genre-picks');
    ['Thriller', 'Sci-Fi', 'Crime', 'Fantasy', 'Mystery', 'Romance', 'Horror', 'Non-Fiction'].forEach((g) => {
      const c = el('button', 'chip', g);
      c.type = 'button';
      c.addEventListener('click', () => {
        genreInput.value = g;
        this.dirty = true;
      });
      genreChips.appendChild(c);
    });

    const stars = starRow(d.rating || 0, (r) => {
      d.rating = r;
      this.dirty = true;
    }, { large: true });

    const notes = el('textarea');
    notes.rows = 6;
    notes.value = d.notes || '';
    notes.placeholder = 'What did you think? Favourite moments, characters, quotes…';

    const dates = el('div', 'field-row');
    dates.append(startedField, finishedField);
    const pageRow = el('div', 'field-row');
    pageRow.append(field('Pages', pagesInput), currentField);

    const quotesBox = el('div', 'quotes-edit');
    const drawQuotes = () => {
      quotesBox.replaceChildren();
      d.quotes.forEach((q, i) => {
        const row = el('div', 'quote-row');
        const text = el('textarea');
        text.rows = 2;
        text.value = q.text;
        text.placeholder = 'A line you loved…';
        text.setAttribute('aria-label', `Quote ${i + 1}`);
        text.addEventListener('input', () => (q.text = text.value));
        const page = input('number', q.page || '', { min: 1, inputmode: 'numeric', placeholder: 'p.', 'aria-label': `Page of quote ${i + 1}` });
        page.addEventListener('input', () => (q.page = Number(page.value) || null));
        const rm = el('button', 'icon-btn quote-remove', '✕');
        rm.type = 'button';
        rm.setAttribute('aria-label', 'Remove quote');
        rm.addEventListener('click', () => {
          d.quotes.splice(i, 1);
          this.dirty = true;
          drawQuotes();
        });
        row.append(text, page, rm);
        quotesBox.append(row);
      });
      const add = el('button', 'btn btn-small', '+ Add a quote');
      add.type = 'button';
      add.addEventListener('click', () => {
        d.quotes.push({ text: '', page: null });
        drawQuotes();
        quotesBox.querySelectorAll('textarea')[d.quotes.length - 1].focus();
      });
      quotesBox.append(add);
    };
    drawQuotes();

    const saveBtn = el('button', 'btn btn-primary btn-block', this.isNew ? 'Put it on the shelf' : 'Save changes');
    saveBtn.type = 'submit';

    form.append(
      thumbs,
      title,
      author,
      field('Status', statusSeg),
      dates,
      pageRow,
      field('Format', formatSeg),
      field('Size on the shelf', sizeSeg),
      field('Genre', genreInput, list, genreChips),
      field('Rating', stars),
      field('My thoughts', notes),
      field('Favourite quotes', quotesBox),
      saveBtn,
    );
    form.addEventListener('input', () => {
      this.dirty = true;
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleInput = title.querySelector('input');
      if (!titleInput.value.trim()) {
        titleInput.focus();
        title.classList.add('invalid');
        return;
      }
      saveBtn.disabled = true;
      Object.assign(d, {
        title: titleInput.value.trim(),
        author: author.querySelector('input').value.trim(),
        genre: genreInput.value.trim(),
        notes: notes.value.trim(),
        startedAt: d.status === 'want' ? '' : startedField.querySelector('input').value,
        finishedAt: d.status === 'read' ? finishedField.querySelector('input').value : '',
        pages: Number(pagesInput.value) || null,
        currentPage: d.status === 'reading' ? Math.max(0, Number(currentInput.value) || 0) : d.currentPage || 0,
        quotes: d.quotes.map((q) => ({ text: q.text.trim(), page: q.page || null })).filter((q) => q.text),
      });
      if (d.status === 'want' && !d.wantedAt) d.wantedAt = today();
      if (!d.images.front && d.backAspect) d.coverAspect = d.backAspect;
      try {
        const saved = await this.save(d);
        this.finish(saved);
      } catch (err) {
        saveBtn.disabled = false;
        alert(`Could not save the book: ${err.message}`);
      }
    });

    setStatus(d.status);
    this.body.replaceChildren(form);
    if (this.isNew) title.querySelector('input').focus({ preventScroll: true });
  }

  // ---- Lifecycle ----

  preview(blob) {
    const url = URL.createObjectURL(blob);
    this.previewUrls.push(url);
    return url;
  }

  revokePreviews() {
    this.previewUrls.forEach((u) => URL.revokeObjectURL(u));
    this.previewUrls = [];
  }

  cancel() {
    if (this.dirty && !confirm(this.isNew ? 'Discard this book?' : 'Discard your changes?')) return;
    this.finish(null);
  }

  finish(result) {
    this.stopCrop();
    this.stopScan();
    this.root.classList.remove('visible');
    setTimeout(() => {
      this.revokePreviews();
      this.root.remove();
      document.body.classList.remove('no-scroll');
    }, 250);
    this.resolve(result);
  }
}

function fileInput(camera) {
  const i = el('input');
  i.type = 'file';
  i.accept = 'image/*';
  if (camera) i.setAttribute('capture', 'environment');
  i.hidden = true;
  return i;
}

function input(type, value, attrs = {}) {
  const i = el('input');
  i.type = type;
  i.value = value || '';
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) i.setAttribute(k, '');
    else i.setAttribute(k, v);
  }
  return i;
}

function field(label, ...controls) {
  // Only wrap real form inputs in <label>; a label around buttons would forward stray taps to them.
  const isInput = ['INPUT', 'TEXTAREA', 'SELECT'].includes(controls[0].tagName);
  const wrap = el(isInput ? 'label' : 'div', 'field');
  wrap.appendChild(el('span', 'field-label', label));
  wrap.append(...controls);
  return wrap;
}

// Outline of a book with the part to photograph highlighted.
function placeholder(kind) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 120 140');
  svg.setAttribute('class', 'photo-placeholder');
  svg.setAttribute('aria-hidden', 'true');
  const shapes = {
    front: '<rect x="30" y="15" width="72" height="110" rx="3" class="hl"/><path d="M30 15 l-12 8 v110 l12 -8" class="dim"/><line x1="44" y1="40" x2="88" y2="40" class="ink"/><line x1="50" y1="50" x2="82" y2="50" class="ink"/>',
    spine: '<rect x="44" y="15" width="56" height="110" rx="3" class="dim"/><rect x="26" y="23" width="18" height="110" rx="2" class="hl"/><line x1="35" y1="40" x2="35" y2="110" class="ink"/>',
    back: '<rect x="18" y="15" width="72" height="110" rx="3" class="hl"/><path d="M90 15 l12 8 v110 l-12 -8" class="dim"/><line x1="30" y1="40" x2="78" y2="40" class="ink"/><line x1="30" y1="50" x2="78" y2="50" class="ink"/><line x1="30" y1="60" x2="70" y2="60" class="ink"/><rect x="58" y="100" width="22" height="14" class="ink-box"/>',
  };
  svg.innerHTML = shapes[kind];
  return svg;
}
