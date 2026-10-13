// Touch-friendly crop box over a canvas. Drag inside to move, drag handles to resize.

import { rotate90, crop } from './images.js';

const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MIN = 24; // minimum crop size, in image pixels

export class Cropper {
  constructor(host, canvas, { narrow = false } = {}) {
    this.host = host;
    this.narrow = narrow;
    host.classList.add('cropper');
    host.innerHTML = '';

    this.box = document.createElement('div');
    this.box.className = 'crop-box';
    for (const h of HANDLES) {
      const el = document.createElement('span');
      el.className = `crop-handle ${h}`;
      el.dataset.handle = h;
      this.box.appendChild(el);
    }
    host.appendChild(this.box);
    this.setCanvas(canvas);

    this.box.addEventListener('pointerdown', (e) => this.start(e));
    this.ro = new ResizeObserver(() => this.layout());
    this.ro.observe(host);
  }

  destroy() {
    this.ro.disconnect();
  }

  setCanvas(canvas) {
    if (this.canvas) this.canvas.remove();
    this.canvas = canvas;
    canvas.className = 'crop-image';
    this.host.insertBefore(canvas, this.box);
    this.reset();
  }

  reset() {
    const { width: w, height: h } = this.canvas;
    if (this.narrow && h >= w) {
      // A spine is tall and thin: start with a narrow centred box.
      const bw = Math.max(MIN, w * 0.3);
      this.rect = { x: (w - bw) / 2, y: h * 0.05, w: bw, h: h * 0.9 };
    } else {
      this.rect = { x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 };
    }
    this.layout();
  }

  rotate() {
    this.setCanvas(rotate90(this.canvas, 1));
  }

  result() {
    return crop(this.canvas, this.rect);
  }

  layout() {
    const r = this.host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const { width: cw, height: ch } = this.canvas;
    this.scale = Math.min(r.width / cw, r.height / ch);
    this.ox = (r.width - cw * this.scale) / 2;
    this.oy = (r.height - ch * this.scale) / 2;
    Object.assign(this.canvas.style, {
      left: `${this.ox}px`,
      top: `${this.oy}px`,
      width: `${cw * this.scale}px`,
      height: `${ch * this.scale}px`,
    });
    this.render();
  }

  render() {
    const { x, y, w, h } = this.rect;
    const s = this.scale;
    Object.assign(this.box.style, {
      left: `${this.ox + x * s}px`,
      top: `${this.oy + y * s}px`,
      width: `${w * s}px`,
      height: `${h * s}px`,
    });
  }

  start(e) {
    e.preventDefault();
    const handle = e.target.dataset.handle || 'move';
    const startRect = { ...this.rect };
    const sx = e.clientX;
    const sy = e.clientY;
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);

    const move = (ev) => {
      const dx = (ev.clientX - sx) / this.scale;
      const dy = (ev.clientY - sy) / this.scale;
      this.rect = this.apply(handle, startRect, dx, dy);
      this.render();
    };
    const end = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', end);
      target.removeEventListener('pointercancel', end);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);
  }

  apply(handle, r, dx, dy) {
    const W = this.canvas.width;
    const H = this.canvas.height;
    if (handle === 'move') {
      return {
        ...r,
        x: clamp(r.x + dx, 0, W - r.w),
        y: clamp(r.y + dy, 0, H - r.h),
      };
    }
    let left = r.x;
    let top = r.y;
    let right = r.x + r.w;
    let bottom = r.y + r.h;
    if (handle.includes('w')) left = clamp(left + dx, 0, right - MIN);
    if (handle.includes('e')) right = clamp(right + dx, left + MIN, W);
    if (handle.includes('n')) top = clamp(top + dy, 0, bottom - MIN);
    if (handle.includes('s')) bottom = clamp(bottom + dy, top + MIN, H);
    return { x: left, y: top, w: right - left, h: bottom - top };
  }
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
