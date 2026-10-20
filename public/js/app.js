import { sound, setVolume, setMuted, unlockOnGesture } from './sound.js';
import {
  state, subscribe, updateSettings, addStat, refreshAccount, DEFAULT_BOARD,
  register, login, logout, changePassword, deleteAccount,
} from './state.js';
import { SCHEMES, applyTheme, schemeColors, onSystemModeChange } from './theme.js';
import popit from './fidgets/popit.js';
import spinner from './fidgets/spinner.js';
import cradle from './fidgets/cradle.js';
import joystick from './fidgets/joystick.js';
import knob from './fidgets/knob.js';
import toggles from './fidgets/toggles.js';
import gears from './fidgets/gears.js';
import slider from './fidgets/slider.js';

const FIDGETS = [popit, spinner, cradle, toggles, knob, slider, gears, joystick];
const byId = Object.fromEntries(FIDGETS.map((f) => [f.id, f]));
const BOARD_COLS = 2;
const BOARD_ROWS = 8;

const STAT_LABELS = {
  pops: 'Bubbles popped',
  spins: 'Spinner spins',
  clacks: 'Cradle clacks',
  toggles: 'Switch flips',
  clicks: 'Knob clicks',
  slides: 'Slider notches',
  gears: 'Gear turns',
  sparks: 'Joystick pushes',
};

const $ = (s, root = document) => root.querySelector(s);
const view = $('#view');
const pager = $('#pager');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- one shared animation loop ----------
// Fidgets register a per-frame callback; it only runs while their element is
// on screen, so a full board of 16 fidgets stays cheap.

const loops = new Set();
let rafId = 0;
let lastFrame = 0;
const visibility = new IntersectionObserver((entries) => {
  for (const e of entries) e.target.__visible = e.isIntersecting;
});

function tick(now) {
  const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  for (const l of loops) if (l.el.__visible !== false) l.fn(now, dt);
  rafId = loops.size ? requestAnimationFrame(tick) : 0;
}

function animate(el, fn) {
  const entry = { el, fn };
  loops.add(entry);
  visibility.observe(el);
  if (!rafId) {
    lastFrame = 0;
    rafId = requestAnimationFrame(tick);
  }
  return () => {
    loops.delete(entry);
    visibility.unobserve(el);
  };
}

let uidCounter = 0;
const ctx = {
  sound,
  animate,
  uid: () => ++uidCounter,
  haptic(ms) {
    if (state.settings.haptics && navigator.vibrate) {
      try { navigator.vibrate(ms); } catch { /* not allowed */ }
    }
  },
  stat: (key, n = 1) => addStat(key, n),
  colors: () => schemeColors(state.settings),
};

// ---------- mounting ----------

let mounted = [];
function unmountAll() {
  for (const fn of mounted) fn?.();
  mounted = [];
}
function mountInto(host, f) {
  host.dataset.fidget = f.id;
  mounted.push(f.mount(host, ctx));
}

function boardIds() {
  const b = state.settings.board;
  return Array.isArray(b) && b.length === BOARD_COLS * BOARD_ROWS && b.every((id) => byId[id]) ? b : DEFAULT_BOARD;
}

let rendered = null; // which layout + board is currently on screen

function render(force = false) {
  const layout = state.settings.layout === 'swipe' ? 'swipe' : 'board';
  const key = layout === 'board' ? `board:${boardIds().join(',')}:${editing}` : 'swipe';
  if (!force && key === rendered) return;
  rendered = key;
  unmountAll();
  document.body.dataset.layout = layout;
  if (layout === 'board') renderBoard();
  else renderSwipe(0);
}

// ---------- board ----------

let editing = false;

function renderBoard() {
  const ids = boardIds();
  view.innerHTML = `
    <header class="board-head">
      <span class="logo-tile"><img src="/img/logo.png" alt="" width="297" height="384"></span>
      <span class="wordmark">Fidget<b>Lab</b></span>
    </header>
    <section class="board${editing ? ' editing' : ''}" aria-label="Fidget board">
      ${ids.map((id, i) => `
        <div class="cell" data-cell="${i}" data-row="${Math.floor(i / BOARD_COLS)}">
          <div class="host"></div>
          ${editing ? `<button class="cell-edit" data-pick="${i}" aria-label="Change cell ${i + 1} (${byId[id].name})"><span>${byId[id].name}</span></button>` : ''}
        </div>`).join('')}
    </section>`;
  view.querySelectorAll('.cell').forEach((cell, i) => mountInto(cell.querySelector('.host'), byId[ids[i]]));
  $('#doneEditing').hidden = !editing;
  renderPager(BOARD_ROWS, currentRow(), (i) => {
    view.querySelector(`.cell[data-row="${i}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function currentRow() {
  const cells = view.querySelectorAll('.cell[data-row]');
  const mid = window.innerHeight / 2;
  let best = 0;
  let bestD = Infinity;
  for (const c of cells) {
    const r = c.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - mid);
    if (d < bestD) { bestD = d; best = Number(c.dataset.row); }
  }
  return best;
}

let scrollQueued = false;
window.addEventListener('scroll', () => {
  if (scrollQueued || document.body.dataset.layout !== 'board') return;
  scrollQueued = true;
  requestAnimationFrame(() => {
    scrollQueued = false;
    setPagerActive(currentRow());
  });
}, { passive: true });

view.addEventListener('click', (e) => {
  const pick = e.target.closest('[data-pick]');
  if (pick) openPicker(Number(pick.dataset.pick));
});

function setEditing(on) {
  editing = on;
  render();
}
$('#doneEditing').addEventListener('click', () => setEditing(false));

let pickingCell = -1;
function openPicker(i) {
  pickingCell = i;
  const current = boardIds()[i];
  $('#picker').innerHTML = FIDGETS.map((f) => `
    <button class="pick${f.id === current ? ' current' : ''}" data-choose="${f.id}">
      <span class="pick-art" aria-hidden="true">${ICONS[f.id]}</span>
      <span>${f.name}</span>
    </button>`).join('');
  openSheet('picker');
}
$('#picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-choose]');
  if (!b || pickingCell < 0) return;
  const board = [...boardIds()];
  board[pickingCell] = b.dataset.choose;
  updateSettings({ board });
  sound.click(1.1, 0.6);
  closeSheet();
});

// ---------- swipe to switch ----------

let swipeIndex = (() => {
  try { return Math.max(0, FIDGETS.findIndex((f) => f.id === localStorage.getItem('fl.swipe'))); } catch { return 0; }
})();

function renderSwipe(dir) {
  const f = FIDGETS[swipeIndex];
  try { localStorage.setItem('fl.swipe', f.id); } catch { /* ignore */ }
  view.innerHTML = `
    <section class="swipe">
      <div class="swipe-zone" id="swipeZone" aria-label="Swipe left or right here to switch fidgets">
        <span class="logo-tile small"><img src="/img/logo.png" alt="" width="297" height="384"></span>
        <button class="arrow" data-step="-1" aria-label="Previous fidget"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg></button>
        <div class="swipe-title"><b>${f.name}</b><span>Swipe here to switch</span></div>
        <button class="arrow" data-step="1" aria-label="Next fidget"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg></button>
      </div>
      <div class="swipe-stage">
        <div class="host big${dir ? (dir > 0 ? ' from-right' : ' from-left') : ''}"></div>
      </div>
    </section>`;
  mountInto(view.querySelector('.host'), f);
  document.title = `${f.name} · FidgetLab`;
  renderPager(FIDGETS.length, swipeIndex, (i) => go(i - swipeIndex));
  bindSwipeZone($('#swipeZone'));
}

function go(step) {
  if (!step) return;
  unmountAll();
  swipeIndex = (swipeIndex + step + FIDGETS.length) % FIDGETS.length;
  sound.tick(step > 0 ? 1.1 : 0.9, 0.6);
  ctx.haptic(6);
  renderSwipe(Math.sign(step));
}

function bindSwipeZone(zone) {
  let start = null;
  zone.addEventListener('click', (e) => {
    const b = e.target.closest('[data-step]');
    if (b) go(Number(b.dataset.step));
  });
  zone.addEventListener('pointerdown', (e) => {
    if (e.target.closest('[data-step]')) return;
    start = { id: e.pointerId, x: e.clientX, y: e.clientY };
    zone.setPointerCapture(e.pointerId);
  });
  zone.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    zone.style.setProperty('--dx', `${Math.max(-60, Math.min(60, dx * 0.4))}px`);
  });
  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    start = null;
    zone.style.removeProperty('--dx');
    // Swipe left = next, swipe right = previous (like turning pages).
    if (e.type === 'pointerup' && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) go(dx < 0 ? 1 : -1);
  };
  zone.addEventListener('pointerup', end);
  zone.addEventListener('pointercancel', end);
}

document.addEventListener('keydown', (e) => {
  if (document.body.dataset.layout !== 'swipe' || openName) return;
  if (e.target.closest?.('.host, input, [role="slider"]')) return;
  if (e.key === 'ArrowRight') go(1);
  if (e.key === 'ArrowLeft') go(-1);
});

// ---------- pager (the dot rail on the right) ----------

let pagerJump = null;
function renderPager(count, active, onJump) {
  pagerJump = onJump;
  pager.innerHTML = Array.from({ length: count }, (_, i) => `<button class="dot" data-dot="${i}" aria-label="Go to ${i + 1}"></button>`).join('');
  setPagerActive(active);
}
function setPagerActive(i) {
  pager.querySelectorAll('.dot').forEach((d, j) => {
    d.classList.toggle('active', i === j);
    if (i === j) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
  });
}
pager.addEventListener('click', (e) => {
  const d = e.target.closest('[data-dot]');
  if (d && pagerJump) pagerJump(Number(d.dataset.dot));
});

// ---------- small icons (picker) ----------

const ICONS = {
  popit: `<svg viewBox="0 0 64 64"><rect x="6" y="6" width="52" height="52" rx="12" fill="var(--panel)"/>${[0, 1, 2].map((r) => [0, 1, 2].map((c) => `<circle cx="${18 + c * 14}" cy="${18 + r * 14}" r="5.5" fill="${(r + c) % 2 ? 'var(--c2)' : 'var(--c1)'}"/>`).join('')).join('')}</svg>`,
  spinner: `<svg viewBox="0 0 64 64"><g stroke="var(--track)" stroke-width="3"><path d="M32 32L32 13M32 32L48.5 41.5M32 32L15.5 41.5"/></g><circle cx="32" cy="13" r="8" fill="var(--c1)"/><circle cx="48.5" cy="41.5" r="8" fill="var(--c2)"/><circle cx="15.5" cy="41.5" r="8" fill="var(--c1)"/><circle cx="32" cy="32" r="6" fill="var(--track)"/><circle cx="32" cy="32" r="2.6" fill="var(--c2)"/></svg>`,
  cradle: `<svg viewBox="0 0 64 64"><path d="M8 12h48" stroke="var(--track)" stroke-width="3" stroke-linecap="round"/>${[20, 26, 32, 38, 44].map((x) => `<path d="M${x} 12v30" stroke="var(--track)" stroke-width="1.2"/><circle cx="${x}" cy="44" r="3" fill="var(--c1)"/>`).join('')}</svg>`,
  toggles: `<svg viewBox="0 0 64 64">${[14, 32, 50].map((y, i) => `<rect x="14" y="${y - 6}" width="36" height="12" rx="6" fill="${i === 1 ? 'var(--c1)' : 'var(--track)'}"/><circle cx="${i === 1 ? 44 : 20}" cy="${y}" r="4.6" fill="#e9eaee"/>`).join('')}</svg>`,
  knob: `<svg viewBox="0 0 64 64">${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2 - Math.PI / 2; return `<circle cx="${(32 + Math.cos(a) * 27).toFixed(1)}" cy="${(32 + Math.sin(a) * 27).toFixed(1)}" r="2" fill="${i ? 'var(--track)' : 'var(--c1)'}"/>`; }).join('')}<circle cx="32" cy="32" r="19" fill="var(--c2)"/><rect x="30.5" y="16" width="3" height="9" rx="1.5" fill="#fff"/></svg>`,
  slider: `<svg viewBox="0 0 64 64"><rect x="6" y="29" width="52" height="6" rx="3" fill="var(--track)"/><rect x="6" y="29" width="24" height="6" rx="3" fill="var(--c2)"/><circle cx="30" cy="32" r="9" fill="var(--c1)"/></svg>`,
  gears: `<svg viewBox="0 0 64 64"><circle cx="28" cy="34" r="15" fill="none" stroke="var(--c1)" stroke-width="6" stroke-dasharray="4 3.2"/><circle cx="28" cy="34" r="10" fill="var(--c1)"/><circle cx="46" cy="16" r="8" fill="none" stroke="var(--c2)" stroke-width="5" stroke-dasharray="3 2.6"/><circle cx="46" cy="16" r="5" fill="var(--c2)"/></svg>`,
  joystick: `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="24" fill="var(--panel)"/><circle cx="37" cy="28" r="11" fill="var(--c1)"/></svg>`,
};

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
  const done = () => {
    if (!sheet.classList.contains('show')) sheet.hidden = true;
    if (!openName) $('#scrim').hidden = true;
  };
  if (instant) done(); else setTimeout(done, 250);
  lastFocus?.focus?.({ preventScroll: true });
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target.id === 'scrim') closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (openName) closeSheet();
    else if (editing) setEditing(false);
  }
});

// ---------- settings ----------

function applySettings() {
  applyTheme(state.settings);
  setVolume(state.settings.volume);
  setMuted(state.settings.muted);
  const swipe = state.settings.layout === 'swipe';
  $('#layoutBtn').setAttribute('aria-label', swipe ? 'Switch to board' : 'Switch to swipe mode');
  $('#layoutBtn').classList.toggle('is-board', !swipe);
  if (swipe && editing) editing = false;
  renderSettings();
  render();
}

function renderSettings() {
  const s = state.settings;
  $('#schemes').innerHTML = Object.entries(SCHEMES).map(([id, sc]) => {
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
  for (const b of document.querySelectorAll('#layoutSeg [data-layout]')) b.setAttribute('aria-checked', String(s.layout === b.dataset.layout));
  $('#layoutHint').textContent = s.layout === 'swipe'
    ? 'One fidget at a time. Swipe left or right along the top to switch.'
    : 'A scrollable 2 × 8 board of fidgets. Edit it to choose what goes where.';
  $('#boardTools').hidden = s.layout !== 'board';
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
$('#layoutSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-layout]');
  if (b) updateSettings({ layout: b.dataset.layout });
});
$('#editBoard').addEventListener('click', () => {
  closeSheet(true);
  setEditing(true);
  toast('Tap a fidget to change it');
});
$('#resetBoard').addEventListener('click', () => {
  updateSettings({ board: [...DEFAULT_BOARD] });
  toast('Board reset');
});
$('#volume').addEventListener('input', (e) => updateSettings({ volume: Number(e.target.value) / 100 }));
$('#volume').addEventListener('change', () => sound.pop());
$('#soundSwitch').addEventListener('click', () => {
  updateSettings({ muted: !state.settings.muted });
  if (!state.settings.muted) sound.click();
});
$('#hapticsSwitch').addEventListener('click', () => {
  updateSettings({ haptics: !state.settings.haptics });
  ctx.haptic(20);
});
if (!('vibrate' in navigator)) $('#hapticsRow').hidden = true;

$('#settingsBtn').addEventListener('click', () => openSheet('settings'));
$('#accountBtn').addEventListener('click', () => openSheet('account'));
$('#layoutBtn').addEventListener('click', () => {
  updateSettings({ layout: state.settings.layout === 'swipe' ? 'board' : 'swipe' });
  sound.click(1, 0.7);
  window.scrollTo(0, 0);
});

// ---------- account ----------

let authMode = 'login';

function statsList() {
  return `<dl class="stats">${Object.entries(STAT_LABELS).map(([k, label]) => `<div><dt>${label}</dt><dd data-stat-v="${k}">${(state.stats[k] || 0).toLocaleString()}</dd></div>`).join('')}</dl>`;
}

function renderAccount() {
  const body = $('#accountBody');
  if (state.user) {
    body.innerHTML = `
      <div class="profile">
        <span class="profile-avatar">${esc(state.user.username[0].toUpperCase())}</span>
        <div><b>${esc(state.user.username)}</b><span>Member since ${new Date(state.user.createdAt).toLocaleDateString()}</span></div>
      </div>
      <h3 class="group-label">Your stats</h3>
      ${statsList()}
      <p class="hint">Stats, colors and your board sync to your account automatically.</p>
      <button class="btn wide" data-act="logout">Sign out</button>
      <details class="more">
        <summary>Account options</summary>
        <form data-form="password" class="form">
          <label>Current password<input type="password" name="current" autocomplete="current-password" required></label>
          <label>New password<input type="password" name="next" autocomplete="new-password" minlength="8" required></label>
          <p class="form-error" role="alert"></p>
          <button class="btn wide">Change password</button>
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
      <p class="lead">Accounts are <b>optional</b>. Signing in syncs your stats, colors and board across devices.</p>
      <div class="segmented" role="tablist">
        <button role="tab" aria-selected="${isLogin}" data-auth="login">Sign in</button>
        <button role="tab" aria-selected="${!isLogin}" data-auth="register">Create account</button>
      </div>
      <form data-form="auth" class="form">
        <label>Username<input name="username" autocomplete="username" autocapitalize="off" spellcheck="false" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_.\\-]+"></label>
        <label>Password<input type="password" name="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" required ${isLogin ? '' : 'minlength="8"'}></label>
        <p class="form-error" role="alert"></p>
        <button class="btn primary wide">${isLogin ? 'Sign in' : 'Create account'}</button>
        ${isLogin ? '' : '<p class="hint">Your current stats and settings move into the new account.</p>'}
      </form>
      <h3 class="group-label">On this device</h3>
      ${statsList()}`;
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
  const initial = btn.querySelector('.fab-initial');
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

function updateStatsInSheet() {
  if ($('#accountSheet').hidden) return;
  $('#accountSheet').querySelectorAll('[data-stat-v]').forEach((el) => {
    el.textContent = (state.stats[el.dataset.statV] || 0).toLocaleString();
  });
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
  }, 2200);
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

// App shortcuts link to /#/<fidget>: open that fidget in swipe mode.
function handleHash() {
  const id = location.hash.replace(/^#\/?/, '');
  const i = FIDGETS.findIndex((f) => f.id === id);
  if (i < 0) return;
  swipeIndex = i;
  history.replaceState(null, '', location.pathname);
  if (state.settings.layout !== 'swipe') updateSettings({ layout: 'swipe' });
  else render(true);
}

subscribe((what) => {
  if (what === 'settings') applySettings();
  if (what === 'stats') updateStatsInSheet();
  if (what === 'account') {
    renderAvatar();
    if (openName === 'account') renderAccount();
  }
});
onSystemModeChange(() => applyTheme(state.settings));
window.addEventListener('hashchange', handleHash);

unlockOnGesture();
handleHash();
applySettings();
renderAvatar();
refreshAccount();
