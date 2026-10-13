// Settings sheet for syncing across devices.

import * as sync from './sync.js';
import { el, toast, timeAgo } from './ui.js';

const SETUP_URL = 'https://github.com/dogowar01/bookshelf#syncing-across-devices';

export function openSyncSheet() {
  const root = el('div', 'sheet-overlay');
  const sheet = el('div', 'sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', 'Sync across devices');
  const head = el('div', 'sheet-head');
  const close = el('button', 'icon-btn', '✕');
  close.setAttribute('aria-label', 'Close');
  head.append(el('span', 'icon-spacer'), el('p', 'sheet-title', 'Sync across devices'), close);
  const body = el('div', 'sheet-body');
  sheet.append(head, body);
  root.append(sheet);
  document.body.append(root);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('visible'));

  const off = sync.onStatus(() => draw());
  const shut = () => {
    off();
    root.classList.remove('visible');
    setTimeout(() => {
      root.remove();
      document.body.classList.remove('no-scroll');
    }, 250);
  };
  close.addEventListener('click', shut);

  function draw() {
    const st = sync.getStatus();
    if (!sync.isConfigured()) drawConnect();
    else if (st.email) drawSignedIn(st);
    else drawSignIn(st);
  }

  function drawConnect() {
    const form = el('form', 'details-form');
    const url = input('url', 'Project URL', 'https://abcdefgh.supabase.co');
    const key = input('text', 'Anon public key', 'eyJhbGciOi…');
    const err = el('p', 'form-error');
    const go = el('button', 'btn btn-primary btn-block', 'Connect');
    form.append(url.wrap, key.wrap, err, go);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      go.disabled = true;
      err.textContent = '';
      try {
        await sync.connect(url.input.value, key.input.value);
        draw();
      } catch (ex) {
        err.textContent = ex.message;
        go.disabled = false;
      }
    });
    const link = el('a', null, 'Step-by-step setup guide');
    link.href = SETUP_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    body.replaceChildren(
      el('h2', 'step-title', 'Keep your library everywhere'),
      el('p', 'step-text', 'Sync keeps your books, photos and notes safe online, and the same on your phone, tablet and computer. It uses your own free Supabase project, so your data stays in an account you control.'),
      el('p', 'step-text', 'Create the project once (about 10 minutes), then paste its URL and anon key here on each device.'),
      link,
      form,
    );
  }

  function drawSignIn(st) {
    const form = el('form', 'details-form');
    const email = input('email', 'Email', 'you@example.com');
    email.input.autocomplete = 'email';
    const pass = input('password', 'Password', '');
    pass.input.autocomplete = 'current-password';
    const err = el('p', 'form-error', st.state === 'error' ? st.error : '');
    const signIn = el('button', 'btn btn-primary btn-block', 'Sign in');
    const create = el('button', 'btn btn-block', 'Create an account');
    create.type = 'button';
    form.append(email.wrap, pass.wrap, err, signIn, create);
    const run = async (createAccount) => {
      err.textContent = '';
      if (!email.input.value || pass.input.value.length < 6) {
        err.textContent = 'Enter your email and a password of at least 6 characters.';
        return;
      }
      signIn.disabled = create.disabled = true;
      try {
        const res = await sync.signIn(email.input.value.trim(), pass.input.value, { create: createAccount });
        if (res === 'confirm-email') {
          err.textContent = 'Check your email and tap the confirmation link, then come back and sign in here.';
        } else {
          toast('Signed in. Your library is syncing.');
        }
      } catch (ex) {
        err.textContent = ex.message;
      }
      signIn.disabled = create.disabled = false;
    };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      run(false);
    });
    create.addEventListener('click', () => run(true));
    body.replaceChildren(
      el('h2', 'step-title', 'Sign in'),
      el('p', 'step-text', 'Use the same email and password on every device. The first time, choose “Create an account”.'),
      form,
      disconnectButton(),
    );
  }

  function drawSignedIn(st) {
    const state = {
      syncing: 'Syncing…',
      idle: st.lastAt ? `Up to date · synced ${timeAgo(st.lastAt)}` : 'Up to date',
      error: `Sync problem: ${st.error}`,
    }[st.state] || '';
    const now = el('button', 'btn btn-primary btn-block', 'Sync now');
    now.disabled = st.state === 'syncing';
    now.addEventListener('click', () => sync.syncNow());
    const out = el('button', 'btn btn-block', 'Sign out');
    out.addEventListener('click', async () => {
      await sync.signOut();
      toast('Signed out. Your books stay on this device.');
    });
    body.replaceChildren(
      el('h2', 'step-title', 'Sync is on'),
      el('p', 'step-text', `Signed in as ${st.email}.`),
      el('p', st.state === 'error' ? 'form-error' : 'step-text sync-state', state),
      el('p', 'step-text', 'Changes sync automatically whenever you’re online.'),
      now,
      out,
      disconnectButton(),
    );
  }

  function disconnectButton() {
    const b = el('button', 'btn btn-ghost btn-block btn-danger', 'Stop syncing on this device');
    b.addEventListener('click', async () => {
      if (!confirm('Stop syncing on this device? Your books stay here, and your online copy is kept.')) return;
      await sync.disconnect();
      draw();
    });
    return b;
  }

  draw();
}

function input(type, label, placeholder) {
  const wrap = el('label', 'field');
  const i = el('input');
  i.type = type;
  i.placeholder = placeholder;
  i.required = true;
  i.autocapitalize = 'off';
  i.spellcheck = false;
  wrap.append(el('span', 'field-label', label), i);
  return { wrap, input: i };
}
