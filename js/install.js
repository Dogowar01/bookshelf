// Installing the app to the home screen.
//
// Android/desktop Chrome and Edge: we catch the browser's install offer and trigger it from our
// own button. This makes a real installed app (a "WebAPK" on Android) with the proper icon,
// not a bookmark shortcut with a little browser badge on it.
// iPhone/iPad: Safari has no install button for websites, so we show the Add to Home Screen steps.

import { el, toast } from './ui.js';

const DISMISS_KEY = 'bookshelf:install-dismissed';
const DISMISS_MS = 14 * 86400000;

let deferred = null;
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());

// Registered as soon as this module loads, because the browser can fire it very early.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  changed();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  toast('Installed! Open My Bookshelf from your home screen.');
  changed();
});

export function onInstallChange(fn) {
  listeners.add(fn);
}

export const isInstalled = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isMobile = () => isIOS() || /android/i.test(navigator.userAgent);

// The menu item shows whenever the app isn't running installed.
export const canOfferInstall = () => !isInstalled();

// The banner is gentler: only on phones, and not again for two weeks after "Not now".
export function shouldShowBanner() {
  if (isInstalled() || !(deferred || isMobile())) return false;
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) > DISMISS_MS;
  } catch {
    return true;
  }
}

export function dismissBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Preference only.
  }
}

export async function install() {
  if (deferred) {
    const prompt = deferred;
    deferred = null;
    // An offer can only be used once; if it's turned down, the browser may make a new one later.
    prompt.prompt();
    await prompt.userChoice;
    changed();
    return;
  }
  showInstructions();
}

function showInstructions() {
  const ios = isIOS();
  const iosNotSafari = ios && /crios|fxios|edgios/i.test(navigator.userAgent);

  const root = el('div', 'sheet-overlay');
  const sheet = el('div', 'sheet install-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Install My Bookshelf');
  const head = el('div', 'sheet-head');
  const close = el('button', 'icon-btn', '✕');
  close.setAttribute('aria-label', 'Close');
  head.append(el('span', 'icon-spacer'), el('p', 'sheet-title', 'Install My Bookshelf'), close);
  const body = el('div', 'sheet-body');

  const icon = el('img', 'install-icon');
  icon.src = 'icons/app-icon-192.png';
  icon.alt = '';
  const steps = el('ol', 'install-steps');
  const step = (html) => {
    const li = el('li');
    li.innerHTML = html;
    steps.append(li);
  };

  if (ios) {
    if (iosNotSafari) step('If you don’t see <strong>Add to Home Screen</strong> below, open this page in <strong>Safari</strong> and do it there.');
    step('Tap the <strong>Share</strong> button <span class="glyph" aria-hidden="true">⬆︎</span> (at the bottom of Safari, or at the top on iPad).');
    step('Scroll down and tap <strong>Add to Home Screen</strong>.');
    step('Make sure <strong>Open as Web App</strong> is on if you see it, then tap <strong>Add</strong>.');
    step('Open <strong>Bookshelf</strong> from your home screen. It opens full screen with your bookcase icon.');
  } else {
    step('Open the browser menu <span class="glyph" aria-hidden="true">⋮</span> (top right in Chrome).');
    step('Tap <strong>Install app</strong>. If you only see <strong>Add to home screen</strong>, tap it and then choose <strong>Install</strong>, not <em>Create shortcut</em>.');
    step('Open <strong>Bookshelf</strong> from your home screen or app drawer.');
  }

  const note = el('p', 'step-text install-note');
  note.textContent = 'Already have an old Bookshelf shortcut with the wrong icon? Delete it from your home screen first, then add it again so the new icon is used. Your books aren’t affected.';

  body.append(icon, el('h2', 'step-title', ios ? 'Add it to your Home Screen' : 'Install it as an app'), steps, note);
  sheet.append(head, body);
  root.append(sheet);
  document.body.append(root);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('visible'));
  close.addEventListener('click', () => {
    root.classList.remove('visible');
    setTimeout(() => {
      root.remove();
      document.body.classList.remove('no-scroll');
    }, 250);
  });
}
