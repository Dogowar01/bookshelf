import * as library from './library.js';
import { requestPersistence } from './db.js';
import { renderShelves } from './shelf.js';
import { showBook } from './book3d.js';
import { openEditor } from './editor.js';
import { el, toast, today } from './ui.js';

const $ = (id) => document.getElementById(id);

const state = {
  sort: localGet('sort') || 'finished',
  genre: null,
};

async function init() {
  requestPersistence();
  await library.load();
  $('sortSel').value = state.sort;
  bindChrome();
  render();

  let resizeTimer;
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return; // ignore mobile URL-bar height changes
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 150);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function render() {
  const books = library.all();
  const reading = books.filter((b) => b.status === 'reading').sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''));
  const read = books.filter((b) => b.status === 'read');

  $('readingCount').textContent = reading.length ? String(reading.length) : '';
  $('readCount').textContent = read.length ? String(read.length) : '';
  renderStats(read);
  renderGenreChips(read);

  const shown = sortRead(read.filter((b) => !state.genre || b.genre === state.genre));

  const pick = (book, spine) => showBook(book, spine, bookActions);
  renderShelves($('readingShelves'), reading, { onPick: pick, emptyText: 'Nothing on the go. Add the book you’re reading.' });
  renderShelves($('readShelves'), shown, {
    onPick: pick,
    emptyText: read.length ? 'No books in this genre yet.' : 'Finished books will line up here.',
  });
}

function renderStats(read) {
  const year = String(new Date().getFullYear());
  const thisYear = read.filter((b) => (b.finishedAt || '').startsWith(year)).length;
  const parts = [];
  if (read.length) parts.push(`${read.length} book${read.length === 1 ? '' : 's'} read`);
  if (thisYear) parts.push(`${thisYear} in ${year}`);
  $('stats').textContent = parts.join(' · ');
}

function renderGenreChips(read) {
  const box = $('genreChips');
  const genres = [...new Set(read.map((b) => b.genre).filter(Boolean))].sort();
  if (state.genre && !genres.includes(state.genre)) state.genre = null;
  box.replaceChildren();
  box.hidden = genres.length < 2;
  if (box.hidden) return;
  const chip = (label, value) => {
    const c = el('button', `chip${state.genre === value ? ' on' : ''}`, label);
    c.type = 'button';
    c.setAttribute('aria-pressed', String(state.genre === value));
    c.addEventListener('click', () => {
      state.genre = value;
      render();
    });
    box.appendChild(c);
  };
  chip('All', null);
  genres.forEach((g) => chip(g, g));
}

function sortRead(list) {
  const by = {
    finished: (a, b) => (b.finishedAt || '').localeCompare(a.finishedAt || '') || b.updatedAt - a.updatedAt,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    title: (a, b) => sortKey(a.title).localeCompare(sortKey(b.title)),
    author: (a, b) => surname(a.author).localeCompare(surname(b.author)) || a.title.localeCompare(b.title),
    genre: (a, b) => (a.genre || '~').localeCompare(b.genre || '~') || a.title.localeCompare(b.title),
  };
  return [...list].sort(by[state.sort] || by.finished);
}

const sortKey = (t) => t.toLowerCase().replace(/^(the|a|an)\s+/, '');
const surname = (name) => (name || '~').trim().split(/\s+/).pop().toLowerCase();

const bookActions = {
  async onRate(book, rating) {
    return library.save({ ...book, rating });
  },
  async onFinish(book) {
    const saved = await library.save({ ...book, status: 'read', finishedAt: book.finishedAt || today() });
    toast('Finished! It’ll move to your Read shelf.');
    return saved;
  },
  onEdit(book) {
    editBook(book);
  },
  async onDelete(book) {
    await library.remove(book.id);
    render();
    toast(`Removed “${book.title}”`);
  },
  onReturn: () => render(),
};

async function editBook(book) {
  const saved = await openEditor(book, (draft) => library.save(draft));
  if (!saved) return;
  render();
  toast(book ? 'Saved' : `“${saved.title}” is on your shelf`);
  const spine = document.querySelector(`.spine[data-id="${CSS.escape(saved.id)}"]`);
  if (spine) {
    spine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    spine.classList.add('arrived');
    setTimeout(() => spine.classList.remove('arrived'), 1400);
  }
}

function bindChrome() {
  $('addBtn').addEventListener('click', () => editBook(null));

  $('sortSel').addEventListener('change', (e) => {
    state.sort = e.target.value;
    localSet('sort', state.sort);
    render();
  });

  const menu = $('menu');
  const menuBtn = $('menuBtn');
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(menu.hidden);
  });
  document.addEventListener('click', () => setMenu(false));

  menu.addEventListener('click', async (e) => {
    const action = e.target.dataset.action;
    if (action === 'export') {
      if (!library.all().length) return toast('Your library is empty, so there’s nothing to back up yet');
      const blob = await library.exportBackup();
      const a = el('a');
      a.href = URL.createObjectURL(blob);
      a.download = `bookshelf-backup-${today()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('Backup downloaded');
    } else if (action === 'import') {
      $('importInput').click();
    }
  });

  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await library.importBackup(file);
      render();
      toast(`Imported ${n} book${n === 1 ? '' : 's'}`);
    } catch (err) {
      toast(err.message || 'Import failed');
    }
  });
}

function localGet(k) {
  try {
    return localStorage.getItem(`bookshelf:${k}`);
  } catch {
    return null;
  }
}

function localSet(k, v) {
  try {
    localStorage.setItem(`bookshelf:${k}`, v);
  } catch {
    // Preferences are a convenience only.
  }
}

init();
