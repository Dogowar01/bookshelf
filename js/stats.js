// Year in review: what you finished, month by month, by genre, and your highlights.

import * as library from './library.js';
import { el, formatDate } from './ui.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const SVG = 'http://www.w3.org/2000/svg';

// Every finished read, including earlier reads of re-read books.
function finishes() {
  const out = [];
  for (const b of library.all()) {
    if (b.status === 'read' && b.finishedAt) out.push({ book: b, startedAt: b.startedAt, finishedAt: b.finishedAt, rating: b.rating || 0 });
    for (const r of b.reads || []) {
      if (r.finishedAt) out.push({ book: b, startedAt: r.startedAt, finishedAt: r.finishedAt, rating: r.rating || 0 });
    }
  }
  return out;
}

export function openStats() {
  const all = finishes();
  const years = [...new Set(all.map((f) => Number(f.finishedAt.slice(0, 4))))];
  const thisYear = new Date().getFullYear();
  if (!years.includes(thisYear)) years.push(thisYear);
  years.sort((a, b) => b - a);

  const root = el('div', 'sheet-overlay');
  const sheet = el('div', 'sheet stats-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Year in review');
  const head = el('div', 'sheet-head');
  const close = el('button', 'icon-btn', '✕');
  close.setAttribute('aria-label', 'Close');
  head.append(el('span', 'icon-spacer'), el('p', 'sheet-title', 'Year in review'), close);
  const yearRow = el('div', 'chips year-chips');
  const body = el('div', 'sheet-body');
  sheet.append(head, yearRow, body);
  root.append(sheet);
  document.body.append(root);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('visible'));

  const shut = () => {
    root.classList.remove('visible');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => {
      root.remove();
      document.body.classList.remove('no-scroll');
    }, 250);
  };
  const onKey = (e) => e.key === 'Escape' && shut();
  document.addEventListener('keydown', onKey);
  close.addEventListener('click', shut);

  const show = (year) => {
    [...yearRow.children].forEach((c) => c.classList.toggle('on', Number(c.dataset.year) === year));
    body.replaceChildren(...renderYear(year, all.filter((f) => f.finishedAt.startsWith(String(year)))));
    body.scrollTop = 0;
  };
  for (const y of years) {
    const c = el('button', 'chip', String(y));
    c.dataset.year = String(y);
    c.addEventListener('click', () => show(y));
    yearRow.append(c);
  }
  show(years[0]);
}

function renderYear(year, list) {
  if (!list.length) {
    return [el('h2', 'step-title', String(year)), el('p', 'step-text', 'No finished books yet this year. Your first one will show up here.')];
  }
  const out = [el('h2', 'step-title', String(year))];

  const pages = list.reduce((sum, f) => sum + (f.book.pages || 0), 0);
  const rated = list.filter((f) => f.rating);
  const avg = rated.length ? rated.reduce((s, f) => s + f.rating, 0) / rated.length : 0;
  const genres = countBy(list, (f) => f.book.genre || 'No genre');
  const topGenre = genres[0] && genres[0][0] !== 'No genre' ? genres[0][0] : (genres[1] && genres[1][0]) || '–';

  const tiles = el('div', 'stat-tiles');
  tiles.append(
    tile(String(list.length), list.length === 1 ? 'book finished' : 'books finished'),
    tile(pages ? pages.toLocaleString() : '–', 'pages read'),
    tile(avg ? `${avg.toFixed(1)}★` : '–', 'average rating'),
    tile(topGenre, 'favourite genre'),
  );
  out.push(tiles);

  // Books per month
  const perMonth = MONTHS.map(() => []);
  for (const f of list) perMonth[Number(f.finishedAt.slice(5, 7)) - 1].push(f);
  out.push(el('h3', 'stats-sub', 'Books finished each month'), monthChart(perMonth));

  // Genres
  const genreList = genres.filter(([g]) => g !== 'No genre');
  if (genreList.length) {
    out.push(el('h3', 'stats-sub', 'Genres'), genreBars(genreList.slice(0, 8), list.length));
  }

  // Highlights
  const hl = el('div', 'highlights');
  const withPages = list.filter((f) => f.book.pages);
  if (withPages.length) {
    const longest = withPages.reduce((a, b) => (b.book.pages > a.book.pages ? b : a));
    hl.append(highlight('Longest book', longest.book, `${longest.book.pages} pages`));
  }
  const timed = list.filter((f) => f.startedAt && f.finishedAt >= f.startedAt);
  if (timed.length) {
    const days = (f) => Math.round((new Date(f.finishedAt) - new Date(f.startedAt)) / 86400000) + 1;
    const quickest = timed.reduce((a, b) => (days(b) < days(a) ? b : a));
    hl.append(highlight('Quickest read', quickest.book, `${days(quickest)} day${days(quickest) === 1 ? '' : 's'}`));
  }
  if (hl.children.length) out.push(el('h3', 'stats-sub', 'Highlights'), hl);

  const top = [...rated].sort((a, b) => b.rating - a.rating || a.finishedAt.localeCompare(b.finishedAt)).slice(0, 5);
  if (top.length) {
    const ol = el('ol', 'top-rated');
    for (const f of top) {
      const li = el('li');
      li.append(cover(f.book), el('span', 'top-title', f.book.title), el('span', 'top-stars', '★'.repeat(f.rating)));
      ol.append(li);
    }
    out.push(el('h3', 'stats-sub', 'Top rated'), ol);
  }

  const ul = el('ul', 'finished-list');
  for (const f of [...list].sort((a, b) => a.finishedAt.localeCompare(b.finishedAt))) {
    const li = el('li');
    li.append(el('span', 'fl-date', formatDate(f.finishedAt)), el('span', 'fl-title', f.book.title), el('span', 'fl-author', f.book.author || ''));
    ul.append(li);
  }
  const all = el('details', 'all-finished');
  all.append(el('summary', null, `Every book finished in ${year}`), ul);
  out.push(all);
  return out;
}

function tile(value, label) {
  const t = el('div', 'stat-tile');
  t.append(el('span', 'stat-value', value), el('span', 'stat-label', label));
  return t;
}

function countBy(list, key) {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// Twelve bars on one axis; hover or tap a month to see which books.
function monthChart(perMonth) {
  const wrap = el('div', 'month-chart');
  const W = 340;
  const H = 150;
  const top = 14;
  const base = 124;
  const max = Math.max(1, ...perMonth.map((m) => m.length));
  const step = W / 12;
  const barW = step - 8;

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Books finished per month: ${perMonth.map((m, i) => `${MONTHS[i]} ${m.length}`).join(', ')}`);

  const ticks = max <= 4 ? [...Array(max + 1).keys()] : [0, Math.round(max / 2), max];
  for (const t of ticks) {
    const y = base - ((base - top) * t) / max;
    svg.append(svgEl('line', { x1: 0, x2: W, y1: y, y2: y, class: t === 0 ? 'axis' : 'grid' }));
    if (t) svg.append(svgEl('text', { x: W, y: y - 3, class: 'tick', 'text-anchor': 'end' }, String(t)));
  }

  const tip = el('div', 'chart-tip');
  tip.hidden = true;
  perMonth.forEach((books, i) => {
    const x = i * step + 4;
    const h = ((base - top) * books.length) / max;
    if (books.length) {
      // Rounded top, square bottom: a 4px-radius path anchored to the baseline.
      const r = Math.min(4, h, barW / 2);
      const y = base - h;
      svg.append(svgEl('path', {
        class: 'bar',
        d: `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${base} Z`,
      }));
    }
    svg.append(svgEl('text', { x: x + barW / 2, y: H - 8, class: 'tick', 'text-anchor': 'middle' }, MONTHS[i][0]));
    // Full-height invisible hit area, wider than the bar.
    const hit = svgEl('rect', { x: i * step, y: 0, width: step, height: H, class: 'hit', tabindex: books.length ? 0 : -1 });
    const showTip = () => {
      tip.hidden = false;
      tip.replaceChildren(el('strong', null, `${MONTHS[i]} · ${books.length} book${books.length === 1 ? '' : 's'}`));
      books.slice(0, 6).forEach((f) => tip.append(el('span', null, f.book.title)));
      if (books.length > 6) tip.append(el('span', null, `+${books.length - 6} more`));
      const pct = ((i * step + step / 2) / W) * 100;
      tip.style.left = `${Math.min(80, Math.max(20, pct))}%`;
    };
    hit.addEventListener('pointerenter', showTip);
    hit.addEventListener('focus', showTip);
    hit.addEventListener('click', showTip);
    hit.addEventListener('pointerleave', () => (tip.hidden = true));
    hit.addEventListener('blur', () => (tip.hidden = true));
    svg.append(hit);
  });
  wrap.append(svg, tip);
  return wrap;
}

function genreBars(rows, total) {
  const max = rows[0][1];
  const list = el('ul', 'genre-bars');
  for (const [genre, n] of rows) {
    const li = el('li');
    const bar = el('span', 'gb-bar');
    bar.style.width = `${(n / max) * 100}%`;
    const track = el('span', 'gb-track');
    track.append(bar);
    li.append(el('span', 'gb-label', genre), track, el('span', 'gb-value', `${n}`));
    li.title = `${genre}: ${n} of ${total}`;
    list.append(li);
  }
  return list;
}

function highlight(label, book, detail) {
  const card = el('div', 'hl-card');
  const text = el('div');
  text.append(el('span', 'hl-label', label), el('strong', null, book.title), el('span', 'hl-detail', detail));
  card.append(cover(book), text);
  return card;
}

function cover(book) {
  const c = el('span', 'mini-cover');
  const u = library.urls(book);
  if (u.front) c.style.backgroundImage = `url("${u.front}")`;
  else c.style.background = book.color;
  return c;
}

function svgEl(tag, attrs, text) {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
