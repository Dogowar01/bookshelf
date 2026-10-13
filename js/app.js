import * as library from './library.js';
import * as sync from './sync.js';
import { requestPersistence } from './db.js';
import { renderBookcase } from './shelf.js';
import { showBook, activeBookId } from './book3d.js';
import { openEditor } from './editor.js';
import { openStats } from './stats.js';
import { openSyncSheet } from './syncui.js';
import { setupArrange } from './arrange.js';
import { soundsOn, setSounds } from './sound.js';
import { install, onInstallChange, canOfferInstall, shouldShowBanner, dismissBanner } from './install.js';
import { el, toast, today, timeAgo } from './ui.js';

const $ = (id) => document.getElementById(id);

const BACKUP_EVERY_MS = 14 * 86400000;
const SNOOZE_MS = 3 * 86400000;

const state = {
  sort: localGet('sort') || 'finished',
  genre: null,
  query: '',
  arranging: false,
};

async function init() {
  requestPersistence();
  await library.load();
  $('sortSel').value = state.sort;
  bindChrome();
  render();

  library.onChange(() => {
    render();
    updateMenuNotes();
  });
  sync.onStatus(updateMenuNotes);
  sync.start();
  checkBackupReminder();
  updateInstallUI();
  onInstallChange(updateInstallUI);

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

// ---- Rendering ----

const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);

function render() {
  const books = library.all();
  const reading = books.filter((b) => b.status === 'reading').sort(byOrder);
  const want = books.filter((b) => b.status === 'want').sort(byOrder);
  const read = books.filter((b) => b.status === 'read');

  renderStats(read, reading, want);
  renderGenreChips(read);

  const shown = sortRead(read.filter((b) => !state.genre || b.genre === state.genre));
  const sections = [
    { key: 'reading', label: 'Currently reading', books: reading, emptyText: 'Nothing on the go. Add the book you’re reading.' },
  ];
  // The Want to read shelf only appears once you've added a book to it.
  if (want.length) sections.push({ key: 'want', label: 'Want to read', books: want });
  sections.push({ key: 'read', label: state.genre ? `Read · ${state.genre}` : 'Read', books: shown, emptyText: read.length ? 'No books in this genre yet.' : 'Finished books will line up here.' });

  const q = state.query.trim().toLowerCase();
  const match = q ? (b) => [b.title, b.author, b.genre, b.isbn, b.lentTo].some((v) => v && String(v).toLowerCase().includes(q)) : null;
  renderBookcase($('bookcase'), sections, { onPick: pickBook, match });
  $('bookcase').classList.toggle('arranging', state.arranging);
  const out = activeBookId();
  if (out) document.querySelector(`.spine[data-id="${CSS.escape(out)}"]`)?.classList.add('lifted');
}

function pickBook(book, spine) {
  if (state.arranging) return;
  showBook(book, spine, bookActions);
}

function renderStats(read, reading, want) {
  const year = String(new Date().getFullYear());
  const thisYear = read.filter((b) => (b.finishedAt || '').startsWith(year)).length;
  const parts = [];
  if (read.length) parts.push(`${read.length} read`);
  if (thisYear) parts.push(`${thisYear} in ${year}`);
  if (reading.length) parts.push(`${reading.length} on the go`);
  if (want.length) parts.push(`${want.length} to read`);
  $('stats').textContent = parts.join(' · ');
}

function renderGenreChips(read) {
  const box = $('genreChips');
  const genres = [...new Set(read.map((b) => b.genre).filter(Boolean))].sort();
  if (state.genre && !genres.includes(state.genre)) state.genre = null;
  box.replaceChildren();
  box.hidden = genres.length < 2 || state.arranging;
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
    custom: byOrder,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title),
    title: (a, b) => sortKey(a.title).localeCompare(sortKey(b.title)),
    author: (a, b) => surname(a.author).localeCompare(surname(b.author)) || a.title.localeCompare(b.title),
    genre: (a, b) => (a.genre || '~').localeCompare(b.genre || '~') || a.title.localeCompare(b.title),
  };
  return [...list].sort(by[state.sort] || by.finished);
}

const sortKey = (t) => t.toLowerCase().replace(/^(the|a|an)\s+/, '');
const surname = (name) => (name || '~').trim().split(/\s+/).pop().toLowerCase();

// ---- Book actions ----

const bookActions = {
  async update(book, patch, message) {
    const saved = await library.save({ ...book, ...patch });
    if (message) toast(message);
    return saved;
  },
  onEdit(book) {
    editBook(book);
  },
  async onDelete(book) {
    await library.remove(book.id);
    toast(`Removed “${book.title}”`);
  },
  onReturn: () => render(),
};

async function editBook(book) {
  const saved = await openEditor(book, (draft) => library.save(draft));
  if (!saved) return;
  toast(book ? 'Saved' : `“${saved.title}” is on your shelf`);
  const spine = document.querySelector(`.spine[data-id="${CSS.escape(saved.id)}"]`);
  if (spine) {
    spine.scrollIntoView({ behavior: 'smooth', block: 'center' });
    spine.classList.add('arrived');
    setTimeout(() => spine.classList.remove('arrived'), 1400);
  }
}

// ---- Arranging ----

function setArranging(on) {
  state.arranging = on;
  if (on) {
    state.genre = null;
    state.query = '';
    $('searchInput').value = '';
  }
  $('arrangeBtn').textContent = on ? 'Done' : 'Arrange';
  $('arrangeBtn').setAttribute('aria-pressed', String(on));
  $('arrangeBtn').classList.toggle('btn-primary', on);
  $('arrangeHint').hidden = !on;
  $('searchInput').disabled = on;
  render();
}

async function reorder(section, ids) {
  const books = ids.map((id, i) => ({ ...library.get(id), order: i + 1 }));
  if (section === 'read' && state.sort !== 'custom') {
    state.sort = 'custom';
    $('sortSel').value = 'custom';
    localSet('sort', 'custom');
    toast('Your Read shelf is now in your own order');
  }
  await library.saveMany(books);
}

// ---- Backups ----

function checkBackupReminder() {
  const books = library.all();
  const last = Number(localGet('lastBackup') || 0);
  const snoozed = Number(localGet('backupSnooze') || 0) > Date.now();
  const since = last || Math.min(...books.map((b) => b.createdAt || Date.now()));
  const due = !sync.isConfigured() && !snoozed && books.length >= 3
    && books.some((b) => b.updatedAt > last) && Date.now() - since > BACKUP_EVERY_MS;
  $('backupBanner').hidden = !due;
}

async function exportBackup() {
  if (!library.all().length) return toast('Your library is empty, so there’s nothing to back up yet');
  const blob = await library.exportBackup();
  const a = el('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bookshelf-backup-${today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  localSet('lastBackup', String(Date.now()));
  checkBackupReminder();
  updateMenuNotes();
  toast('Backup downloaded. Keep it somewhere safe, like your cloud drive.');
}

function updateMenuNotes() {
  const last = Number(localGet('lastBackup') || 0);
  $('backupNote').textContent = last ? `Last backup ${timeAgo(last)}` : 'Never backed up';
  const st = sync.getStatus();
  $('syncNote').textContent = !sync.isConfigured() ? 'Off'
    : st.state === 'error' ? 'Needs attention'
    : st.email ? (st.lastAt ? `On · synced ${timeAgo(st.lastAt)}` : 'On') : 'Not signed in';
  $('soundsItem').textContent = `Sounds: ${soundsOn() ? 'on' : 'off'}`;
}

// ---- Installing ----

function updateInstallUI() {
  $('installItem').hidden = !canOfferInstall();
  $('installBanner').hidden = !shouldShowBanner();
}

// ---- Chrome ----

function bindChrome() {
  $('addBtn').addEventListener('click', () => editBook(null));

  $('sortSel').addEventListener('change', (e) => {
    state.sort = e.target.value;
    localSet('sort', state.sort);
    render();
  });

  let searchTimer;
  $('searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      render();
      const first = document.querySelector('.spine.match');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
  });

  $('arrangeBtn').addEventListener('click', () => setArranging(!state.arranging));
  setupArrange($('bookcase'), { isEnabled: () => state.arranging, onReorder: reorder });

  const menu = $('menu');
  const menuBtn = $('menuBtn');
  const setMenu = (open) => {
    menu.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    if (open) updateMenuNotes();
  };
  menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(menu.hidden);
  });
  document.addEventListener('click', () => setMenu(false));

  menu.addEventListener('click', async (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (action === 'export') exportBackup();
    else if (action === 'import') $('importInput').click();
    else if (action === 'install') install();
    else if (action === 'stats') openStats();
    else if (action === 'sync') openSyncSheet();
    else if (action === 'sounds') {
      setSounds(!soundsOn());
      toast(`Sounds ${soundsOn() ? 'on' : 'off'}`);
    }
  });

  $('installBanner').addEventListener('click', (e) => {
    const which = e.target.dataset.install;
    if (which === 'go') install();
    else if (which === 'later') {
      dismissBanner();
      updateInstallUI();
    }
  });

  $('backupBanner').addEventListener('click', (e) => {
    const which = e.target.dataset.banner;
    if (which === 'backup') exportBackup();
    else if (which === 'sync') openSyncSheet();
    else if (which === 'later') {
      localSet('backupSnooze', String(Date.now() + SNOOZE_MS));
      checkBackupReminder();
    }
  });

  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const n = await library.importBackup(file);
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
