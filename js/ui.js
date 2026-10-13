// Small DOM helpers shared across views.

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Five tappable stars. Tapping the current rating again clears it.
export function starRow(value, onChange, { large = false } = {}) {
  const row = el('div', large ? 'stars stars-large' : 'stars');
  row.setAttribute('role', 'radiogroup');
  row.setAttribute('aria-label', 'Rating');
  const draw = (v) => {
    [...row.children].forEach((s, i) => {
      s.classList.toggle('on', i < v);
      s.setAttribute('aria-checked', String(i + 1 === v));
    });
  };
  for (let i = 1; i <= 5; i++) {
    const s = el('button', 'star', '★');
    s.type = 'button';
    s.setAttribute('role', 'radio');
    s.setAttribute('aria-label', `${i} star${i > 1 ? 's' : ''}`);
    s.addEventListener('click', (e) => {
      e.stopPropagation();
      value = value === i ? 0 : i;
      draw(value);
      onChange(value);
    });
    row.appendChild(s);
  }
  draw(value);
  return row;
}

let toastTimer;
export function toast(message) {
  const t = document.getElementById('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

export function timeAgo(ms) {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}
