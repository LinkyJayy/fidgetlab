import { sound, setVolume, setMuted, unlockOnGesture } from './sound.js';
import {
  state, subscribe, updateSettings, addStat, refreshAccount,
  register, login, logout, changePassword, deleteAccount,
} from './state.js';
import { SCHEMES, applyTheme, schemeColors, onSystemModeChange } from './theme.js';
import popit from './fidgets/popit.js';
import spinner from './fidgets/spinner.js';
import cradle from './fidgets/cradle.js';
import joystick from './fidgets/joystick.js';
import knob from './fidgets/knob.js';
import toggles from './fidgets/toggles.js';

const FIDGETS = [popit, spinner, cradle, joystick, knob, toggles];

const STAT_LABELS = {
  pops: 'Bubbles popped',
  spins: 'Spinner spins',
  clacks: 'Cradle clacks',
  sparks: 'Sparks collected',
  clicks: 'Knob clicks',
  toggles: 'Switch flips',
};

const $ = (s, root = document) => root.querySelector(s);
const view = $('#view');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- shared context for fidgets ----------

const ctx = {
  sound,
  haptic(ms) {
    if (state.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch { /* not allowed */ }
    }
  },
  stat: (key, n = 1) => addStat(key, n),
  colors: () => schemeColors(state.settings),
};

// ---------- theme + sound settings ----------

function applySettings() {
  applyTheme(state.settings);
  setVolume(state.settings.volume);
  setMuted(state.settings.muted);
  const muteBtn = $('#muteBtn');
  muteBtn.setAttribute('aria-pressed', String(state.settings.muted));
  muteBtn.setAttribute('aria-label', state.settings.muted ? 'Unmute sounds' : 'Mute sounds');
  muteBtn.classList.toggle('muted', state.settings.muted);
  renderSettings();
}

// ---------- icons for fidget cards ----------

const CARD_ART = {
  popit: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="14" fill="var(--c1)"/>${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<circle cx="${18 + c * 14}" cy="${18 + r * 14}" r="5.5" fill="${(r + c) % 3 === 0 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.55)'}"/>`).join('')).join('')}</svg>`,
  spinner: `<svg viewBox="0 0 64 64"><g fill="var(--c1)"><circle cx="32" cy="32" r="13"/><circle cx="32" cy="13" r="10"/><circle cx="48.5" cy="41.5" r="10"/><circle cx="15.5" cy="41.5" r="10"/></g><g fill="rgba(255,255,255,.7)"><circle cx="32" cy="13" r="5"/><circle cx="48.5" cy="41.5" r="5"/><circle cx="15.5" cy="41.5" r="5"/></g><circle cx="32" cy="32" r="6" fill="var(--c2)"/></svg>`,
  cradle: `<svg viewBox="0 0 64 64"><rect x="8" y="8" width="48" height="5" rx="2.5" fill="var(--c1)"/><g stroke="currentColor" stroke-opacity=".45" stroke-width="1.4"><path d="M8 13 L4 36"/><path d="M24 13v26M32 13v26M40 13v26M48 13v26"/></g><circle cx="4" cy="38" r="5" fill="var(--c2)"/>${[24, 32, 40, 48].map((x) => `<circle cx="${x}" cy="44" r="4" fill="var(--c2)" opacity=".85"/>`).join('')}</svg>`,
  joystick: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="var(--c1)" opacity=".25"/><circle cx="32" cy="32" r="24" fill="none" stroke="var(--c1)" stroke-width="2.5"/><circle cx="38" cy="27" r="12" fill="var(--c2)"/><circle cx="35" cy="24" r="4" fill="rgba(255,255,255,.55)"/></svg>`,
  knob: `<svg viewBox="0 0 64 64">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<circle cx="${32 + Math.cos(a) * 27}" cy="${32 + Math.sin(a) * 27}" r="2" fill="var(--c2)" opacity="${i === 9 ? 1 : 0.35}"/>`; }).join('')}<circle cx="32" cy="32" r="20" fill="var(--c1)"/><circle cx="32" cy="32" r="15" fill="rgba(255,255,255,.25)"/><rect x="30" y="15" width="4" height="10" rx="2" fill="#fff"/></svg>`,
  toggles: `<svg viewBox="0 0 64 64">${[12, 30, 48].map((y, i) => `<rect x="12" y="${y - 6}" width="40" height="12" rx="6" fill="${i !== 1 ? 'var(--c1)' : 'currentColor'}" opacity="${i !== 1 ? 1 : 0.2}"/><circle cx="${i !== 1 ? 46 : 18}" cy="${y}" r="4.5" fill="#fff"/>`).join('')}</svg>`,
};

// ---------- views ----------

let cleanup = null;
let lastRoute = null;
let cameFromHome = false;

function renderHome() {
  const total = Object.values(state.stats).reduce((a, b) => a + b, 0);
  view.innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">${state.user ? `Welcome back, ${esc(state.user.username)}` : 'Welcome to the lab'}</p>
        <h2>Pick a fidget</h2>
      </div>
      <div class="hero-stat" title="Total interactions">
        <b data-total>${total.toLocaleString()}</b><span>fidgets</span>
      </div>
    </section>
    <section class="grid" aria-label="Fidgets">
      ${FIDGETS.map((f, i) => `
        <a class="card" href="#/${f.id}" style="--i:${i}">
          <span class="card-art" aria-hidden="true">${CARD_ART[f.id]}</span>
          <span class="card-text">
            <b>${f.name}</b>
            <span>${f.blurb}</span>
          </span>
          <span class="card-count" data-stat="${f.stat}">${(state.stats[f.stat] || 0).toLocaleString()}</span>
        </a>`).join('')}
    </section>
    ${state.user ? '' : `
    <section class="nudge">
      <div><b>Keep your progress</b><span>Accounts are optional — sign up to sync stats and colors across devices.</span></div>
      <button class="btn primary" data-open-account>Sign up</button>
    </section>`}`;
  view.querySelector('[data-open-account]')?.addEventListener('click', () => openSheet('account'));
}

function renderFidget(f) {
  view.innerHTML = `<section class="stage fidget-${f.id}"></section><p class="stage-hint">${f.blurb}</p>`;
  cleanup = f.mount(view.querySelector('.stage'), ctx);
}

function route() {
  if (cleanup) { cleanup(); cleanup = null; }
  const id = location.hash.replace(/^#\/?/, '');
  const f = FIDGETS.find((x) => x.id === id);
  cameFromHome = !!f && lastRoute === '';
  lastRoute = f ? id : '';
  document.body.classList.toggle('in-fidget', !!f);
  $('#backBtn').hidden = !f;
  $('#pageTitle').hidden = !f;
  $('.brand').classList.toggle('compact', !!f);
  if (f) {
    $('#pageTitle').textContent = f.name;
    document.title = `${f.name} · FidgetLab`;
    renderFidget(f);
  } else {
    document.title = 'FidgetLab';
    renderHome();
  }
  view.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function updateStatsInView() {
  const totalEl = view.querySelector('[data-total]');
  if (totalEl) totalEl.textContent = Object.values(state.stats).reduce((a, b) => a + b, 0).toLocaleString();
  view.querySelectorAll('[data-stat]').forEach((el) => {
    el.textContent = (state.stats[el.dataset.stat] || 0).toLocaleString();
  });
  if (!$('#accountSheet').hidden) {
    $('#accountSheet').querySelectorAll('[data-stat-v]').forEach((el) => {
      el.textContent = (state.stats[el.dataset.statV] || 0).toLocaleString();
    });
  }
}

// ---------- sheets ----------

let openName = null;
let lastFocus = null;

function openSheet(name) {
  closeSheet(true);
  openName = name;
  lastFocus = document.activeElement;
  const sheet = $(`#${name}Sheet`);
  if (name === 'account') renderAccount();
  $('#scrim').hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    $('#scrim').classList.add('show');
    sheet.classList.add('show');
  });
  sheet.querySelector('[data-close]').focus();
}

function closeSheet(instant = false) {
  if (!openName) return;
  const sheet = $(`#${openName}Sheet`);
  openName = null;
  sheet.classList.remove('show');
  $('#scrim').classList.remove('show');
  const done = () => { sheet.hidden = true; $('#scrim').hidden = true; };
  if (instant) done(); else setTimeout(done, 250);
  lastFocus?.focus?.();
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target.id === 'scrim') closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSheet();
});

// ---------- settings sheet ----------

function renderSettings() {
  const s = state.settings;
  const schemes = $('#schemes');
  schemes.innerHTML = Object.entries(SCHEMES).map(([id, sc]) => {
    const cols = id === 'custom' ? [s.custom.c1, s.custom.c2, s.custom.c3] : sc.colors;
    return `
      <button class="scheme" role="radio" aria-checked="${s.scheme === id}" data-scheme="${id}">
        <span class="swatch" style="background:linear-gradient(135deg, ${cols[0]} 0%, ${cols[1]} 60%, ${cols[2]} 100%)">
          ${id === 'custom' ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>' : ''}
        </span>
        <span>${sc.name}</span>
      </button>`;
  }).join('');
  $('#customColors').hidden = s.scheme !== 'custom';
  for (const input of document.querySelectorAll('[data-color]')) input.value = s.custom[input.dataset.color];
  for (const b of document.querySelectorAll('#modeSeg [data-mode]')) b.setAttribute('aria-checked', String(s.mode === b.dataset.mode));
  $('#volume').value = Math.round(s.volume * 100);
  $('#soundSwitch').setAttribute('aria-checked', String(!s.muted));
  $('#hapticsSwitch').setAttribute('aria-checked', String(s.haptics));
}

$('#schemes').addEventListener('click', (e) => {
  const b = e.target.closest('[data-scheme]');
  if (!b) return;
  updateSettings({ scheme: b.dataset.scheme });
  sound.click(1.1, 0.6);
});
for (const input of document.querySelectorAll('[data-color]')) {
  input.addEventListener('input', () => updateSettings({ scheme: 'custom', custom: { [input.dataset.color]: input.value.toLowerCase() } }));
}
$('#modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (b) updateSettings({ mode: b.dataset.mode });
});
$('#volume').addEventListener('input', (e) => updateSettings({ volume: Number(e.target.value) / 100 }));
$('#volume').addEventListener('change', () => sound.pop());
$('#soundSwitch').addEventListener('click', () => updateSettings({ muted: !state.settings.muted }));
$('#hapticsSwitch').addEventListener('click', () => {
  updateSettings({ haptics: !state.settings.haptics });
  ctx.haptic(20);
});
$('#testSound').addEventListener('click', () => sound.pop());
$('#muteBtn').addEventListener('click', () => {
  updateSettings({ muted: !state.settings.muted });
  if (!state.settings.muted) sound.click();
});
$('#settingsBtn').addEventListener('click', () => openSheet('settings'));
$('#accountBtn').addEventListener('click', () => openSheet('account'));
$('#backBtn').addEventListener('click', () => {
  if (cameFromHome) history.back();
  else location.hash = '#/';
});
if (!('vibrate' in navigator)) $('#hapticsRow').hidden = true;

// ---------- account sheet ----------

let authMode = 'login';

function renderAccount() {
  const body = $('#accountBody');
  if (state.user) {
    body.innerHTML = `
      <div class="profile">
        <span class="profile-avatar">${esc(state.user.username[0].toUpperCase())}</span>
        <div><b>${esc(state.user.username)}</b><span>Member since ${new Date(state.user.createdAt).toLocaleDateString()}</span></div>
      </div>
      <h3 class="group-label">Your stats</h3>
      <dl class="stats">
        ${Object.entries(STAT_LABELS).map(([k, label]) => `<div><dt>${label}</dt><dd data-stat-v="${k}">${(state.stats[k] || 0).toLocaleString()}</dd></div>`).join('')}
      </dl>
      <p class="hint">Stats and color settings sync to your account automatically.</p>
      <button class="btn ghost wide" data-act="logout">Sign out</button>
      <details class="danger-zone">
        <summary>Account options</summary>
        <form data-form="password" class="form">
          <label>Current password<input type="password" name="current" autocomplete="current-password" required></label>
          <label>New password<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
          <p class="form-error" role="alert"></p>
          <button class="btn ghost wide">Change password</button>
        </form>
        <form data-form="delete" class="form">
          <label>Password<input type="password" name="password" autocomplete="current-password" required></label>
          <p class="form-error" role="alert"></p>
          <button class="btn danger wide">Delete account</button>
        </form>
      </details>`;
  } else {
    const isLogin = authMode === 'login';
    body.innerHTML = `
      <p class="lead">Accounts are <b>optional</b>. Everything works without one; signing in syncs your stats and colors across devices.</p>
      <div class="segmented" role="tablist">
        <button role="tab" aria-selected="${isLogin}" data-auth="login">Sign in</button>
        <button role="tab" aria-selected="${!isLogin}" data-auth="register">Create account</button>
      </div>
      <form data-form="auth" class="form">
        <label>Username<input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.\\-]+"></label>
        <label>Password<input type="password" name="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required ${isLogin ? '' : 'minlength="8"'}></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary wide">${isLogin ? 'Sign in' : 'Create account'}</button>
        ${isLogin ? '' : '<p class="hint">Your current stats and colors will move into the new account.</p>'}
      </form>
      <h3 class="group-label">On this device</h3>
      <dl class="stats">
        ${Object.entries(STAT_LABELS).map(([k, label]) => `<div><dt>${label}</dt><dd data-stat-v="${k}">${(state.stats[k] || 0).toLocaleString()}</dd></div>`).join('')}
      </dl>`;
  }
}

$('#accountBody').addEventListener('click', async (e) => {
  const tab = e.target.closest('[data-auth]');
  if (tab) {
    authMode = tab.dataset.auth;
    renderAccount();
    $('#accountBody input[name=username]').focus();
    return;
  }
  if (e.target.closest('[data-act="logout"]')) {
    await logout();
    closeSheet();
    toast('Signed out');
  }
});

$('#accountBody').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const err = form.querySelector('.form-error');
  const btn = form.querySelector('button');
  const data = Object.fromEntries(new FormData(form));
  err.textContent = '';
  btn.disabled = true;
  try {
    if (form.dataset.form === 'auth') {
      if (authMode === 'login') await login(data.username.trim(), data.password);
      else await register(data.username.trim(), data.password);
      closeSheet();
      toast(authMode === 'login' ? `Welcome back, ${state.user.username}!` : `Account created. Hi ${state.user.username}!`);
      sound.chime();
    } else if (form.dataset.form === 'password') {
      await changePassword(data.current, data.next);
      form.reset();
      toast('Password changed');
    } else if (form.dataset.form === 'delete') {
      if (!confirm('Delete your account and its synced stats? This cannot be undone.')) return;
      await deleteAccount(data.password);
      closeSheet();
      toast('Account deleted');
    }
  } catch (ex) {
    err.textContent = ex.status ? ex.message : 'Could not reach the server. Are you offline?';
  } finally {
    btn.disabled = false;
  }
});

function renderAvatar() {
  const btn = $('#accountBtn');
  const initial = btn.querySelector('.avatar-initial');
  const svg = btn.querySelector('svg');
  if (state.user) {
    initial.textContent = state.user.username[0].toUpperCase();
    initial.hidden = false;
    svg.style.display = 'none';
    btn.classList.add('signed-in');
    btn.setAttribute('aria-label', `Account: ${state.user.username}`);
  } else {
    initial.hidden = true;
    svg.style.display = '';
    btn.classList.remove('signed-in');
    btn.setAttribute('aria-label', 'Account');
  }
}

// ---------- toast ----------

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 250);
  }, 2400);
}

// ---------- PWA install + service worker ----------

let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('#installBlock').hidden = false;
  $('#installBtn').hidden = false;
  $('#installHint').textContent = '';
});
$('#installBtn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  $('#installBlock').hidden = true;
});
const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (!standalone && /iphone|ipad|ipod/i.test(navigator.userAgent)) {
  $('#installBlock').hidden = false;
  $('#installBtn').hidden = true;
  $('#installHint').textContent = 'To install on iPhone or iPad: tap Share, then "Add to Home Screen".';
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW registration failed', err));
  });
}

// ---------- boot ----------

subscribe((what) => {
  if (what === 'settings') applySettings();
  if (what === 'stats') updateStatsInView();
  if (what === 'account') {
    renderAvatar();
    if (openName === 'account') renderAccount();
    if (!location.hash.replace(/^#\/?/, '')) renderHome();
  }
});
onSystemModeChange(() => applyTheme(state.settings));
window.addEventListener('hashchange', route);

unlockOnGesture();
applySettings();
renderAvatar();
route();
refreshAccount();
