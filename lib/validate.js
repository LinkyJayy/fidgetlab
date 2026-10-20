'use strict';

// Shared shape of what an account stores. Anything not listed here is dropped.

const SCHEMES = ['ocean', 'forest', 'candy', 'sunset', 'custom'];
const MODES = ['system', 'light', 'dark'];
const STAT_KEYS = ['pops', 'spins', 'clacks', 'sparks', 'clicks', 'toggles'];
const HEX = /^#[0-9a-f]{6}$/i;
const USERNAME = /^[a-zA-Z0-9_.-]{3,24}$/;
const MAX_STAT = 1e12;

const DEFAULT_SETTINGS = Object.freeze({
  scheme: 'candy',
  custom: { c1: '#8000ff', c2: '#ff3d9a', c3: '#ffb86b' },
  mode: 'system',
  volume: 0.8,
  muted: false,
  haptics: true,
});

function cleanSettings(input, base = DEFAULT_SETTINGS) {
  const src = input && typeof input === 'object' ? input : {};
  const out = {
    scheme: SCHEMES.includes(src.scheme) ? src.scheme : base.scheme,
    custom: { ...base.custom },
    mode: MODES.includes(src.mode) ? src.mode : base.mode,
    volume: Number.isFinite(src.volume) ? Math.min(1, Math.max(0, src.volume)) : base.volume,
    muted: typeof src.muted === 'boolean' ? src.muted : base.muted,
    haptics: typeof src.haptics === 'boolean' ? src.haptics : base.haptics,
  };
  if (src.custom && typeof src.custom === 'object') {
    for (const k of ['c1', 'c2', 'c3']) {
      if (typeof src.custom[k] === 'string' && HEX.test(src.custom[k])) out.custom[k] = src.custom[k].toLowerCase();
    }
  }
  return out;
}

function emptyStats() {
  return Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
}

// Turns arbitrary input into non-negative whole numbers for known stat keys.
function cleanCounts(input, perKeyMax = MAX_STAT) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const k of STAT_KEYS) {
    const v = Math.floor(Number(input[k]));
    if (Number.isFinite(v) && v > 0) out[k] = Math.min(v, perKeyMax);
  }
  return out;
}

function addStats(stats, deltas) {
  const out = { ...emptyStats(), ...stats };
  for (const [k, v] of Object.entries(deltas)) out[k] = Math.min(MAX_STAT, out[k] + v);
  return out;
}

module.exports = {
  DEFAULT_SETTINGS,
  STAT_KEYS,
  USERNAME,
  cleanSettings,
  cleanCounts,
  emptyStats,
  addStats,
};
