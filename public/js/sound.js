// All FidgetLab sounds are synthesized live with the Web Audio API, so there
// are no audio files to download and every pop sounds slightly different.

let ctx = null;
let master = null;
let noise = null;
let volume = 0.8;
let muted = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noise = makeNoise();
    applyVolume();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function makeNoise() {
  const len = ctx.sampleRate * 0.5;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function applyVolume() {
  if (master) master.gain.setTargetAtTime(muted ? 0 : volume * volume, ctx.currentTime, 0.01);
}

export function setVolume(v) { volume = v; applyVolume(); }
export function setMuted(m) { muted = m; applyVolume(); }

// Browsers only allow audio after a user gesture; unlock on the first one.
export function unlockOnGesture() {
  const unlock = () => {
    ensure();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
}

const rand = (a, b) => a + Math.random() * (b - a);

function ready() {
  if (muted || volume === 0) return null;
  return ensure();
}

function env(gainNode, t, peak, attack, decay) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t);
  g.exponentialRampToValueAtTime(peak, t + attack);
  g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone({ type = 'sine', f0, f1 = f0, glide = 0.05, peak = 0.5, attack = 0.002, decay = 0.08, at = 0, dest = master }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + glide);
  env(g, t, peak, attack, decay);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.02);
}

function burst({ freq = 2000, q = 1, type = 'bandpass', peak = 0.4, attack = 0.001, decay = 0.03, at = 0 }) {
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  env(g, t, peak, attack, decay);
  s.connect(f).connect(g).connect(master);
  s.start(t, Math.random() * 0.4);
  s.stop(t + attack + decay + 0.02);
}

export const sound = {
  // Bubble pops: a falling "bloop" plus a tiny air burst.
  pop() {
    if (!ready()) return;
    const p = rand(0.85, 1.2);
    tone({ f0: 900 * p, f1: 180 * p, glide: 0.06, peak: 0.55, decay: 0.09 });
    burst({ freq: 2400 * p, q: 0.8, peak: 0.25, decay: 0.025 });
  },
  // Pushing a bubble back out: softer and rising.
  unpop() {
    if (!ready()) return;
    const p = rand(0.9, 1.1);
    tone({ type: 'triangle', f0: 200 * p, f1: 520 * p, glide: 0.07, peak: 0.32, attack: 0.006, decay: 0.09 });
    burst({ freq: 900 * p, q: 1.2, peak: 0.12, decay: 0.04 });
  },
  // Crisp mechanical click; pitch > 1 is brighter.
  click(pitch = 1, strength = 1) {
    if (!ready()) return;
    burst({ freq: 3800 * pitch, q: 2.5, peak: 0.5 * strength, decay: 0.018 });
    tone({ type: 'square', f0: 1800 * pitch, f1: 900 * pitch, glide: 0.01, peak: 0.06 * strength, decay: 0.015 });
    tone({ f0: 160 * pitch, peak: 0.25 * strength, decay: 0.03 });
  },
  // Very light tick for fast repeating events.
  tick(pitch = 1, strength = 1) {
    if (!ready()) return;
    burst({ freq: 5200 * pitch, q: 4, peak: 0.28 * strength, decay: 0.01 });
  },
  // Steel ball collision: inharmonic partials with a short ring.
  clack(strength = 1) {
    if (!ready()) return;
    const s = Math.min(1, Math.max(0.08, strength));
    const p = rand(0.98, 1.02);
    burst({ freq: 6000, q: 1, peak: 0.35 * s, decay: 0.008 });
    tone({ f0: 2350 * p, peak: 0.35 * s, decay: 0.16 });
    tone({ f0: 3910 * p, peak: 0.18 * s, decay: 0.09 });
    tone({ f0: 6120 * p, peak: 0.1 * s, decay: 0.05 });
  },
  // Chunky toggle: thump + snap, higher when switching on.
  toggle(on) {
    if (!ready()) return;
    const p = on ? 1.25 : 0.85;
    tone({ f0: 140 * p, f1: 90 * p, glide: 0.04, peak: 0.45, decay: 0.06 });
    burst({ freq: 3000 * p, q: 2, peak: 0.45, decay: 0.02, at: 0.012 });
    tone({ type: 'triangle', f0: 1200 * p, peak: 0.08, decay: 0.03, at: 0.012 });
  },
  // Soft low "thock" for grabbing and bumping.
  thock(strength = 1) {
    if (!ready()) return;
    tone({ f0: 220, f1: 110, glide: 0.04, peak: 0.4 * strength, decay: 0.07 });
    burst({ freq: 1200, q: 1, peak: 0.15 * strength, decay: 0.02 });
  },
  // Little reward chime.
  chime() {
    if (!ready()) return;
    const p = rand(0.97, 1.03);
    tone({ type: 'triangle', f0: 880 * p, peak: 0.25, decay: 0.18 });
    tone({ type: 'triangle', f0: 1318.5 * p, peak: 0.22, decay: 0.25, at: 0.07 });
  },
  // Slider notch: a short pitched blip, higher as the value rises (0..1).
  notch(value = 0.5) {
    if (!ready()) return;
    const f = 500 + value * 900;
    tone({ type: 'triangle', f0: f, peak: 0.22, decay: 0.035 });
    burst({ freq: 4200, q: 3, peak: 0.18, decay: 0.008 });
  },
  // Gear tooth engaging: a dry ratchet tick with a little body.
  ratchet(strength = 1) {
    if (!ready()) return;
    burst({ freq: 2600, q: 5, peak: 0.32 * strength, decay: 0.012 });
    tone({ type: 'square', f0: 420, f1: 300, glide: 0.01, peak: 0.05 * strength, decay: 0.014 });
  },
  // Spring release.
  boing() {
    if (!ready()) return;
    tone({ type: 'triangle', f0: 180, f1: 360, glide: 0.08, peak: 0.25, attack: 0.004, decay: 0.12 });
  },
  // Continuous filtered-noise whir whose level and pitch follow speed (0..1).
  whir() {
    if (!ensure()) return { set() {}, stop() {} };
    const s = ctx.createBufferSource();
    s.buffer = noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.value = 300;
    const g = ctx.createGain();
    g.gain.value = 0;
    s.connect(f).connect(g).connect(master);
    s.start();
    let stopped = false;
    return {
      set(speed) {
        if (stopped) return;
        const t = ctx.currentTime;
        const x = Math.min(1, Math.max(0, speed));
        g.gain.setTargetAtTime(muted ? 0 : x * 0.22, t, 0.05);
        f.frequency.setTargetAtTime(250 + x * 1800, t, 0.05);
      },
      stop() {
        if (stopped) return;
        stopped = true;
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        s.stop(ctx.currentTime + 0.2);
      },
    };
  },
};
