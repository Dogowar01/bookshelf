// Optional sync across devices through the user's own Supabase project.
//
// Each book is one row ({ id, data, deleted, updated_at }) plus up to three photos in storage
// at <user id>/<book id>/<kind>-<rev>.jpg. A photo's "rev" changes whenever it is retaken, so
// only changed photos are transferred. Conflicts resolve by last edit wins (per book).
//
// The sync logic (runSync) only talks to a small backend interface, so it can be tested
// without a real server; supabaseBackend() implements that interface for Supabase.

import * as library from './library.js';

const SUPABASE_URL = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.0/+esm';
const BUCKET = 'book-photos';
const CFG_KEY = 'bookshelf:sync-config';
const PULLED_KEY = 'bookshelf:sync-pulled';
const OVERLAP_MS = 60_000; // re-read a minute of history each pull in case of slow commits

// ---- The sync algorithm ----

/**
 * backend: {
 *   pull(sinceIso) -> [{ id, data, deleted, updated_at, synced_at }] (oldest first),
 *   push(row),                       // row: { id, data, deleted, updated_at }
 *   upload(bookId, kind, rev, blob),
 *   download(bookId, kind, rev) -> Blob,
 *   removePhoto(bookId, kind, rev),
 *   removePhotos(bookId),
 * }
 * Returns { pulled, pushed, cursor } where cursor is the newest synced_at seen.
 */
export async function runSync(backend, sinceIso) {
  let pulled = 0;
  let pushed = 0;
  let cursor = sinceIso || null;

  // Pull first so we don't overwrite newer remote edits with stale local ones.
  const since = sinceIso ? new Date(new Date(sinceIso).getTime() - OVERLAP_MS).toISOString() : null;
  const rows = await backend.pull(since);
  for (const row of rows) {
    if (row.synced_at && (!cursor || row.synced_at > cursor)) cursor = row.synced_at;
    const local = library.record(row.id);
    if (local && local.updatedAt >= row.updated_at) continue;
    await applyRemote(backend, row, local);
    pulled++;
  }

  for (const rec of [...library.allRecords()]) {
    if (rec._synced && rec._synced.updatedAt >= rec.updatedAt) continue;
    await pushRecord(backend, rec);
    pushed++;
  }
  return { pulled, pushed, cursor };
}

async function applyRemote(backend, row, local) {
  const synced = { updatedAt: row.updated_at, imageRev: {} };
  if (row.deleted) {
    await library.putRecord({ id: row.id, deleted: true, updatedAt: row.updated_at, _synced: synced });
    return;
  }
  const data = row.data || {};
  const imageRev = data.imageRev || {};
  const images = {};
  for (const kind of library.IMAGE_KEYS) {
    const rev = imageRev[kind];
    if (!rev) continue;
    const have = local && !local.deleted && local.imageRev && local.imageRev[kind] === rev && local.images && local.images[kind];
    images[kind] = have || (await backend.download(row.id, kind, rev));
  }
  synced.imageRev = { ...imageRev };
  await library.putRecord({ ...data, id: row.id, images, imageRev, updatedAt: row.updated_at, _synced: synced });
}

async function pushRecord(backend, rec) {
  if (rec.deleted) {
    await backend.push({ id: rec.id, data: {}, deleted: true, updated_at: rec.updatedAt });
    await backend.removePhotos(rec.id).catch(() => {});
  } else {
    const imageRev = { ...(rec.imageRev || {}) };
    const sent = (rec._synced && rec._synced.imageRev) || {};
    for (const kind of library.IMAGE_KEYS) {
      const blob = rec.images && rec.images[kind];
      if (!blob) {
        delete imageRev[kind];
        if (sent[kind]) await backend.removePhoto(rec.id, kind, sent[kind]).catch(() => {});
        continue;
      }
      if (!imageRev[kind]) imageRev[kind] = library.newId(); // books saved before photo revisions existed
      if (sent[kind] !== imageRev[kind]) {
        await backend.upload(rec.id, kind, imageRev[kind], blob);
        // The old version of a retaken photo is no longer needed.
        if (sent[kind]) await backend.removePhoto(rec.id, kind, sent[kind]).catch(() => {});
      }
    }
    const { images, _synced, ...data } = rec;
    data.imageRev = imageRev;
    await backend.push({ id: rec.id, data, deleted: false, updated_at: rec.updatedAt });
    rec = { ...rec, imageRev };
  }

  // The book may have been edited while we were uploading; only mark what we actually sent.
  const current = library.record(rec.id) || rec;
  const merged = current.updatedAt === rec.updatedAt ? { ...current, imageRev: rec.imageRev || current.imageRev } : current;
  merged._synced = { updatedAt: rec.updatedAt, imageRev: { ...(rec.imageRev || {}) } };
  await library.putRecord(merged, { quiet: true });
}

// ---- Supabase ----

let client = null;

export function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CFG_KEY));
  } catch {
    return null;
  }
}

function setConfig(cfg) {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    // Without storage the config only lasts for this visit.
  }
}

async function getClient() {
  const cfg = getConfig();
  if (!cfg) return null;
  if (!client) {
    const { createClient } = await import(SUPABASE_URL);
    client = createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bookshelf-auth' } });
  }
  return client;
}

function supabaseBackend(sb, uid) {
  const path = (id, kind, rev) => `${uid}/${id}/${kind}-${rev}.jpg`;
  const check = ({ data, error }) => {
    if (error) throw new Error(error.message || String(error));
    return data;
  };
  return {
    async pull(since) {
      const out = [];
      const PAGE = 200;
      for (let from = 0; ; from += PAGE) {
        let q = sb.from('books').select('id,data,deleted,updated_at,synced_at').order('synced_at').range(from, from + PAGE - 1);
        if (since) q = q.gt('synced_at', since);
        const rows = check(await q);
        out.push(...rows);
        if (rows.length < PAGE) return out;
      }
    },
    async push(row) {
      check(await sb.from('books').upsert({ ...row, user_id: uid }, { onConflict: 'user_id,id' }));
    },
    async upload(id, kind, rev, blob) {
      check(await sb.storage.from(BUCKET).upload(path(id, kind, rev), blob, { upsert: true, contentType: 'image/jpeg' }));
    },
    async download(id, kind, rev) {
      return check(await sb.storage.from(BUCKET).download(path(id, kind, rev)));
    },
    async removePhoto(id, kind, rev) {
      check(await sb.storage.from(BUCKET).remove([path(id, kind, rev)]));
    },
    async removePhotos(id) {
      const files = check(await sb.storage.from(BUCKET).list(`${uid}/${id}`));
      if (files.length) check(await sb.storage.from(BUCKET).remove(files.map((f) => `${uid}/${id}/${f.name}`)));
    },
  };
}

// ---- Status and scheduling ----

const status = { state: 'off', email: null, lastAt: null, error: null };
const statusListeners = new Set();

export const getStatus = () => ({ ...status });
export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
function setStatus(patch) {
  Object.assign(status, patch);
  statusListeners.forEach((fn) => fn(getStatus()));
}

let running = null;
let again = false;
let timer = null;

export async function syncNow() {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        const sb = await getClient();
        if (!sb) return;
        const { data } = await sb.auth.getSession();
        const session = data && data.session;
        if (!session) {
          setStatus({ state: 'signed-out', email: null });
          return;
        }
        setStatus({ state: 'syncing', email: session.user.email, error: null });
        const since = localStorage.getItem(PULLED_KEY);
        const { cursor } = await runSync(supabaseBackend(sb, session.user.id), since);
        if (cursor) localStorage.setItem(PULLED_KEY, cursor);
        setStatus({ state: 'idle', lastAt: Date.now() });
      } while (again);
    } catch (err) {
      setStatus({ state: 'error', error: navigator.onLine ? err.message : 'You’re offline. Changes will sync when you reconnect.' });
    } finally {
      running = null;
    }
  })();
  return running;
}

function schedule(ms = 2500) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, ms);
}

let started = false;
export async function start() {
  if (started || !getConfig()) return;
  started = true;
  library.onChange((source) => {
    if (source === 'local') schedule();
  });
  window.addEventListener('online', () => schedule(500));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (!status.lastAt || Date.now() - status.lastAt > 60_000)) schedule(500);
  });
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 5 * 60_000);
  const sb = await getClient().catch((err) => {
    setStatus({ state: 'error', error: `Couldn’t load sync: ${err.message}` });
    return null;
  });
  if (!sb) return;
  sb.auth.onAuthStateChange((_event, session) => {
    if (!session) setStatus({ state: 'signed-out', email: null });
  });
  syncNow();
}

// ---- Account actions (used by the sync settings sheet) ----

export async function connect(url, key) {
  url = url.trim().replace(/\/+$/, '');
  key = key.trim();
  if (!/^https:\/\/.+/.test(url)) throw new Error('The project URL should start with https://');
  if (key.length < 20) throw new Error('That doesn’t look like an API key.');
  setConfig({ url, key });
  client = null;
  await getClient();
}

export async function signIn(email, password, { create = false } = {}) {
  const sb = await getClient();
  const res = create ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
  if (res.error) throw new Error(res.error.message);
  if (create && !res.data.session) return 'confirm-email';
  localStorage.removeItem(PULLED_KEY); // first sync on a new sign-in reads everything
  await start();
  await syncNow();
  return 'signed-in';
}

export async function signOut() {
  const sb = await getClient();
  if (sb) await sb.auth.signOut();
  setStatus({ state: 'signed-out', email: null });
}

export async function disconnect() {
  await signOut().catch(() => {});
  setConfig(null);
  localStorage.removeItem(PULLED_KEY);
  client = null;
  setStatus({ state: 'off', email: null, lastAt: null, error: null });
}

export const isConfigured = () => !!getConfig();
export const isActive = () => status.state === 'idle' || status.state === 'syncing';
