// Soft paper sounds made with the Web Audio API (no audio files to download).

const KEY = 'bookshelf:sounds';
let ctx = null;

export function soundsOn() {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setSounds(on) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    // Preference only.
  }
}

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// A short burst of filtered noise that sweeps like a page or cover turning.
function rustle({ duration = 0.32, from = 2600, to = 900, gain = 0.16, delay = 0 } = {}) {
  if (!soundsOn()) return;
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delay;
  const len = Math.floor(ac.sampleRate * duration);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    // Slightly crackly noise reads as paper rather than hiss.
    data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.08 ? 1 : 0.45);
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 0.8;
  band.frequency.setValueAtTime(from, t0);
  band.frequency.exponentialRampToValueAtTime(to, t0 + duration);
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + duration * 0.25);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(band).connect(env).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export const pageTurn = () => rustle();
export const coverClose = () => rustle({ duration: 0.22, from: 1800, to: 500, gain: 0.2 });
export const slideOut = () => rustle({ duration: 0.4, from: 900, to: 400, gain: 0.07 });
