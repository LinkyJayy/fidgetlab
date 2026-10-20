// Local-first state. Guests keep everything in localStorage; signed-in users
// also sync settings and stats to their account.

export const STAT_KEYS = ['pops', 'spins', 'clacks', 'sparks', 'clicks', 'toggles'];

export const DEFAULT_SETTINGS = {
  scheme: 'candy',
  custom: { c1: '#8000ff', c2: '#ff3d9a', c3: '#ffb86b' },
  mode: 'system',
  volume: 0.8,
  muted: false,
  haptics: true,
};

const K = {
  settings: 'fl.settings',
  guestStats: 'fl.stats.guest',
  accountCache: 'fl.account',
};

const emptyStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

function read(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

const listeners = new Set();
const cached = read(K.accountCache, null);

export const state = {
  settings: { ...DEFAULT_SETTINGS, ...read(K.settings, {}), custom: { ...DEFAULT_SETTINGS.custom, ...(read(K.settings, {}).custom || {}) } },
  user: cached?.user || null,
  stats: { ...emptyStats(), ...(cached?.user ? cached.stats : read(K.guestStats, {})) },
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(what) {
  for (const fn of listeners) fn(what);
}

// ---------- API ----------

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function cacheAccount() {
  if (state.user) write(K.accountCache, { user: state.user, stats: state.stats });
  else try { localStorage.removeItem(K.accountCache); } catch { /* ignore */ }
}

function adoptAccount(data) {
  state.user = data.user;
  state.stats = { ...emptyStats(), ...data.stats };
  pending = {};
  if (data.settings) {
    state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    write(K.settings, state.settings);
  }
  cacheAccount();
  emit('account');
  emit('settings');
  emit('stats');
}

// ---------- settings ----------

let settingsTimer = null;
export function updateSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  if (patch.custom) state.settings.custom = { ...state.settings.custom, ...patch.custom };
  write(K.settings, state.settings);
  emit('settings');
  if (state.user) {
    clearTimeout(settingsTimer);
    settingsTimer = setTimeout(() => {
      api('/settings', { method: 'PUT', body: state.settings }).catch(handleSyncError);
    }, 600);
  }
}

// ---------- stats ----------

let pending = {};
let statsTimer = null;
let flushing = false;

export function addStat(key, n = 1) {
  state.stats[key] = (state.stats[key] || 0) + n;
  if (state.user) {
    pending[key] = (pending[key] || 0) + n;
    scheduleFlush();
    cacheAccount();
  } else {
    write(K.guestStats, state.stats);
  }
  emit('stats');
}

function scheduleFlush(delay = 2500) {
  clearTimeout(statsTimer);
  statsTimer = setTimeout(flushStats, delay);
}

export async function flushStats({ keepalive = false } = {}) {
  if (!state.user || flushing || !Object.keys(pending).length) return;
  const deltas = pending;
  pending = {};
  if (keepalive) {
    // Page is going away: fire and forget.
    fetch('/api/stats', {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deltas }),
    }).catch(() => {});
    return;
  }
  flushing = true;
  try {
    const { stats } = await api('/stats', { method: 'POST', body: { deltas } });
    // Server totals plus anything counted while the request was in flight.
    for (const k of STAT_KEYS) state.stats[k] = (stats[k] || 0) + (pending[k] || 0);
    cacheAccount();
    emit('stats');
  } catch (err) {
    // Put the deltas back so they are retried later.
    for (const [k, v] of Object.entries(deltas)) pending[k] = (pending[k] || 0) + v;
    handleSyncError(err);
    if (err.status !== 401) scheduleFlush(15000);
  } finally {
    flushing = false;
  }
}

function handleSyncError(err) {
  if (err.status === 401) {
    // Session expired or account removed elsewhere.
    signedOutLocally();
  }
}

function signedOutLocally() {
  state.user = null;
  pending = {};
  state.stats = { ...emptyStats(), ...read(K.guestStats, {}) };
  cacheAccount();
  emit('account');
  emit('stats');
}

// ---------- account ----------

export async function refreshAccount() {
  try {
    const data = await api('/me');
    if (data.user) {
      // Keep any offline-earned deltas on top of the server totals.
      const offline = pending;
      adoptAccount(data);
      pending = offline;
      for (const [k, v] of Object.entries(pending)) state.stats[k] += v;
      if (Object.keys(pending).length) scheduleFlush(500);
    } else if (state.user) {
      signedOutLocally();
    }
  } catch {
    // Offline: keep using the cached account.
  }
}

export async function register(username, password) {
  const data = await api('/register', {
    method: 'POST',
    body: { username, password, settings: state.settings, stats: state.stats },
  });
  // Guest progress moved into the account, so start the guest counter fresh.
  write(K.guestStats, emptyStats());
  adoptAccount(data);
}

export async function login(username, password) {
  adoptAccount(await api('/login', { method: 'POST', body: { username, password } }));
}

export async function logout() {
  await flushStats();
  try { await api('/logout', { method: 'POST', body: {} }); } catch { /* offline: still sign out here */ }
  signedOutLocally();
}

export async function changePassword(current, next) {
  await api('/password', { method: 'POST', body: { current, next } });
}

export async function deleteAccount(password) {
  await api('/account', { method: 'DELETE', body: { password } });
  signedOutLocally();
}

window.addEventListener('pagehide', () => flushStats({ keepalive: true }));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushStats({ keepalive: true });
});
