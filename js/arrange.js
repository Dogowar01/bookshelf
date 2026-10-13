// Drag-to-reorder for spines while the bookcase is in "arrange" mode.
// Books can be moved anywhere within their own section (Reading, Want to read or Read).

const START_DISTANCE = 6;
const EDGE = 70; // px from the top/bottom of the screen where dragging scrolls the page

export function setupArrange(container, { isEnabled, onReorder }) {
  let drag = null;

  container.addEventListener('pointerdown', (e) => {
    if (!isEnabled()) return;
    const spine = e.target.closest('.spine');
    if (!spine || e.button > 0) return;
    e.preventDefault();
    drag = { spine, id: spine.dataset.id, section: spine.dataset.section, x: e.clientX, y: e.clientY, scrollY: window.scrollY, started: false, target: null, after: false };
    spine.setPointerCapture(e.pointerId);
  });

  container.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    // Include any page scrolling since the drag began, so the book stays under the finger.
    const dy = e.clientY - drag.y + (window.scrollY - drag.scrollY);
    if (!drag.started) {
      if (Math.hypot(dx, dy) < START_DISTANCE) return;
      drag.started = true;
      drag.spine.classList.add('dragging');
      container.classList.add('is-dragging');
    }
    drag.spine.style.transform = `translate(${dx}px, ${dy - 10}px) rotate(${Math.max(-8, Math.min(8, dx / 12))}deg)`;
    drag.lastY = e.clientY;
    pickTarget(e.clientX, e.clientY);
    autoScroll();
  });

  const end = () => {
    if (!drag) return;
    const { spine, started, target, after, id, section } = drag;
    clearMarks();
    spine.classList.remove('dragging');
    spine.style.transform = '';
    container.classList.remove('is-dragging');
    drag = null;
    if (!started || !target) return;
    const ids = [...container.querySelectorAll(`.spine[data-section="${section}"]`)].map((s) => s.dataset.id).filter((x) => x !== id);
    let index = ids.indexOf(target.dataset.id);
    if (after) index += 1;
    ids.splice(index, 0, id);
    onReorder(section, ids);
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);

  function pickTarget(x, y) {
    const candidates = [...container.querySelectorAll(`.spine[data-section="${drag.section}"]`)].filter((s) => s !== drag.spine);
    let best = null;
    let bestScore = Infinity;
    for (const s of candidates) {
      const r = s.getBoundingClientRect();
      // Prefer spines on the same shelf (vertical distance weighs heavily), then the nearest.
      const vy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const cx = r.left + r.width / 2;
      const score = vy * 4 + Math.abs(x - cx);
      if (score < bestScore) {
        bestScore = score;
        best = { s, after: x > cx };
      }
    }
    clearMarks();
    if (!best) {
      drag.target = null;
      return;
    }
    drag.target = best.s;
    drag.after = best.after;
    best.s.classList.add(best.after ? 'drop-after' : 'drop-before');
  }

  function clearMarks() {
    container.querySelectorAll('.drop-before, .drop-after').forEach((s) => s.classList.remove('drop-before', 'drop-after'));
  }

  function autoScroll() {
    if (!drag || drag.scrolling) return;
    const step = () => {
      if (!drag || !drag.started) return;
      const y = drag.lastY;
      const v = y < EDGE ? -(EDGE - y) / 4 : y > window.innerHeight - EDGE ? (y - (window.innerHeight - EDGE)) / 4 : 0;
      if (!v) {
        drag.scrolling = false;
        return;
      }
      window.scrollBy(0, v);
      requestAnimationFrame(step);
    };
    drag.scrolling = true;
    requestAnimationFrame(step);
  }
}
