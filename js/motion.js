// Motion helpers: books dropping onto the shelves, gliding to new places, confetti and sparkles.
// Everything here is transform/opacity only (cheap on phones) and is skipped when the device asks
// for reduced motion.

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Remembers where every spine is before the shelf is redrawn…
export function snapshot(container) {
  const map = new Map();
  for (const s of container.querySelectorAll('.spine')) map.set(s.dataset.id, s.getBoundingClientRect());
  return map;
}

// …then slides each one from its old place to its new one, and fades newcomers in.
export function glide(container, before) {
  if (reducedMotion() || !before) return;
  const spines = [...container.querySelectorAll('.spine')];
  let fresh = 0;
  for (const s of spines) {
    const old = before.get(s.dataset.id);
    const now = s.getBoundingClientRect();
    if (!old) {
      s.animate(
        [{ opacity: 0, transform: 'translateY(-40px) scale(0.9)' }, { opacity: 1, transform: 'none' }],
        { duration: 500, delay: 80 + fresh++ * 40, easing: 'cubic-bezier(.2,.9,.3,1.25)', fill: 'backwards' },
      );
      continue;
    }
    // Measured from the bottom-left corner, which the animation scales around (books stand on it).
    const dx = old.left - now.left;
    const dy = old.bottom - now.bottom;
    const sx = old.width / (now.width || 1);
    const sy = old.height / (now.height || 1);
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.02 && Math.abs(sy - 1) < 0.02) continue;
    // Books changing shelf arc up and over; books shuffling along a shelf just slide.
    const hop = Math.abs(dy) > 20 ? -Math.min(60, Math.abs(dy) * 0.3) : 0;
    s.animate(
      [
        { transformOrigin: 'bottom left', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
        { transformOrigin: 'bottom left', transform: `translate(${dx / 2}px, ${dy / 2 + hop}px) scale(${(sx + 1) / 2}, ${(sy + 1) / 2})`, offset: 0.5 },
        { transformOrigin: 'bottom left', transform: 'none' },
      ],
      { duration: 520 + Math.min(300, Math.hypot(dx, dy)), easing: 'cubic-bezier(.3,.7,.3,1)' },
    );
  }
}

// First load: books drop onto their shelves one after another, with a little bounce.
export function dropIn(container) {
  if (reducedMotion()) return;
  const spines = [...container.querySelectorAll('.spine')];
  const step = Math.max(12, Math.min(45, 900 / Math.max(1, spines.length)));
  spines.forEach((s, i) => {
    s.animate(
      [
        { transform: 'translateY(-120%) rotate(-4deg)', opacity: 0 },
        { transform: 'translateY(4%) rotate(1deg)', opacity: 1, offset: 0.7 },
        { transform: 'translateY(-1.5%)', offset: 0.85 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 650, delay: 150 + i * step, easing: 'cubic-bezier(.45,0,.35,1)', fill: 'backwards' },
    );
  });
}

// A spine tipping forward off the shelf as it's tapped. Returns the animation (or null), which the
// caller cancels once the floating book has taken over.
export function tipOut(spine) {
  if (reducedMotion()) return null;
  return spine.animate(
    [
      { transform: 'none' },
      { transform: 'translateY(-10px) perspective(300px) rotateX(14deg) scale(1.04)', filter: 'brightness(1.15)' },
    ],
    { duration: 160, easing: 'ease-out', fill: 'forwards' },
  );
}

// Little gold sparks bursting from an element (used on star taps).
export function sparkle(target, count = 8) {
  if (reducedMotion()) return;
  const r = target.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'spark';
    p.style.left = `${cx}px`;
    p.style.top = `${cy}px`;
    document.body.append(p);
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
    const d = 18 + Math.random() * 18;
    p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 },
      ],
      { duration: 500 + Math.random() * 200, easing: 'cubic-bezier(.2,.8,.3,1)' },
    ).finished.then(() => p.remove());
  }
}

// Celebration when a book is finished: paper confetti and leaves falling from the top.
export function confetti() {
  if (reducedMotion()) return;
  const colours = ['#d9a441', '#c33a3a', '#2f5d46', '#2e4a7a', '#f3e9d8', '#8a6a1f', '#6b8f3a'];
  const n = 70;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  document.body.append(layer);
  const W = window.innerWidth;
  const H = window.innerHeight;
  const done = [];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    const leaf = i % 5 === 0;
    p.className = leaf ? 'confetti-leaf' : 'confetti-bit';
    p.style.background = leaf ? '' : colours[i % colours.length];
    p.style.left = `${Math.random() * W}px`;
    layer.append(p);
    const drift = (Math.random() - 0.5) * 160;
    const spin = (Math.random() - 0.5) * 1080;
    done.push(p.animate(
      [
        { transform: `translate(0, -20px) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${drift * 0.6}px, ${H * 0.55}px) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${drift}px, ${H + 40}px) rotate(${spin}deg)`, opacity: 0.6 },
      ],
      { duration: 1800 + Math.random() * 1400, delay: Math.random() * 400, easing: 'cubic-bezier(.25,.4,.5,1)', fill: 'backwards' },
    ).finished);
  }
  Promise.all(done).catch(() => {}).then(() => layer.remove());
}

// Staggered fade-up for the lines of an opened page.
export function revealChildren(parent, startDelay = 0) {
  if (reducedMotion()) return;
  [...parent.children].forEach((c, i) => {
    c.animate(
      [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }],
      { duration: 380, delay: startDelay + i * 55, easing: 'ease-out', fill: 'backwards' },
    );
  });
}

// Specks of dust drifting slowly through the sunlight over the bookcase.
export function addDust(layer, count = 16) {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const m = document.createElement('span');
    m.className = 'mote';
    // Mostly on the window (left) side, where the sunbeam falls.
    m.style.left = `${Math.random() ** 1.6 * 85}%`;
    m.style.top = `${15 + Math.random() * 80}%`;
    m.style.setProperty('--size', `${1.5 + Math.random() * 2.5}px`);
    m.style.setProperty('--dur', `${12 + Math.random() * 14}s`);
    m.style.setProperty('--delay', `${-Math.random() * 20}s`);
    m.style.setProperty('--dx', `${(Math.random() - 0.3) * 80}px`);
    m.style.setProperty('--dy', `${-60 - Math.random() * 140}px`);
    m.style.setProperty('--alpha', `${0.35 + Math.random() * 0.5}`);
    layer.append(m);
  }
}
