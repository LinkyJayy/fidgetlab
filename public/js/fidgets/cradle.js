// Newton's cradle. Each ball is a pendulum; touching balls exchange velocity
// (equal-mass elastic collision), which carries the impulse down the row.

const N = 5;
const G_OVER_L = 26; // sets the swing period (~1.2 s)
const DAMPING = 0.06; // air drag per second
const RESTITUTION = 0.992;
const MAX_ANGLE = 1.0;

export default {
  id: 'cradle',
  name: "Newton's Cradle",
  stat: 'clacks',
  mount(el, { sound, haptic, stat, colors, animate }) {
    el.innerHTML = `<canvas class="cradle" aria-label="Newton's cradle. Drag a ball sideways and let go."></canvas>`;

    const canvas = el.querySelector('canvas');
    const g = canvas.getContext('2d');
    const theta = new Array(N).fill(0);
    const omega = new Array(N).fill(0);
    let held = new Set();
    let drag = null;
    let geo = null;
    let lastClack = 0;
    let impact = 0;

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (!w || !h) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = Math.min(w, h) * 0.06;
      const top = h * 0.2;
      const L = h * 0.58;
      const base = Array.from({ length: N }, (_, i) => w / 2 + (i - (N - 1) / 2) * 2 * r);
      geo = { w, h, r, top, L, base };
    }

    const xOf = (i) => geo.base[i] + geo.L * Math.sin(theta[i]);
    const yOf = (i) => geo.top + geo.L * Math.cos(theta[i]);
    function setX(i, x) {
      const lim = Math.sin(MAX_ANGLE);
      theta[i] = Math.asin(Math.max(-lim, Math.min(lim, (x - geo.base[i]) / geo.L)));
    }

    // Push neighbours outward from ball k so nothing overlaps; returns the moved group.
    function pushFrom(k) {
      const pushed = new Set([k]);
      const d = 2 * geo.r;
      for (let j = k - 1; j >= 0 && xOf(j) > xOf(j + 1) - d + 1e-6; j--) { setX(j, xOf(j + 1) - d); pushed.add(j); }
      for (let j = k + 1; j < N && xOf(j) < xOf(j - 1) + d - 1e-6; j++) { setX(j, xOf(j - 1) + d); pushed.add(j); }
      return pushed;
    }

    function step(dt) {
      for (let i = 0; i < N; i++) {
        if (held.has(i)) { omega[i] = 0; continue; }
        omega[i] += -G_OVER_L * Math.sin(theta[i]) * dt;
        omega[i] *= 1 - DAMPING * dt;
        theta[i] += omega[i] * dt;
        if (Math.abs(theta[i]) > MAX_ANGLE) { theta[i] = Math.sign(theta[i]) * MAX_ANGLE; omega[i] = 0; }
      }
      const d = 2 * geo.r;
      // Alternating passes let one impulse travel the whole row in a single step.
      for (let pass = 0; pass < N; pass++) {
        for (let n = 0; n < N - 1; n++) {
          const i = pass % 2 === 0 ? n : N - 2 - n;
          const j = i + 1;
          const gap = xOf(j) - xOf(i);
          if (gap > d + 0.25) continue;
          const vi = omega[i];
          const vj = omega[j];
          const hi = held.has(i);
          const hj = held.has(j);
          if (vi > vj && !(hi && hj)) {
            if (hi) omega[j] = vi + (vi - vj) * RESTITUTION;
            else if (hj) omega[i] = vj - (vi - vj) * RESTITUTION;
            else {
              omega[i] = vj + ((vi - vj) * (1 - RESTITUTION)) / 2;
              omega[j] = vi - ((vi - vj) * (1 - RESTITUTION)) / 2;
            }
            impact = Math.max(impact, (vi - vj) * geo.L);
          }
          if (gap < d) {
            const fix = d - gap;
            if (hi) setX(j, xOf(j) + fix);
            else if (hj) setX(i, xOf(i) - fix);
            else { setX(i, xOf(i) - fix / 2); setX(j, xOf(j) + fix / 2); }
          }
        }
      }
    }

    function draw() {
      const { w, h, r, top, base } = geo;
      const css = getComputedStyle(el);
      const track = css.getPropertyValue('--track').trim() || '#3a3d4a';
      const [c1, c2] = colors();
      g.clearRect(0, 0, w, h);
      // bar
      const x0 = base[0] - r * 2.4;
      const x1 = base[N - 1] + r * 2.4;
      g.strokeStyle = track;
      g.lineCap = 'round';
      g.lineWidth = Math.max(4, r * 0.32);
      g.beginPath();
      g.moveTo(x0, top);
      g.lineTo(x1, top);
      g.stroke();
      // strings
      g.lineWidth = Math.max(1.2, r * 0.1);
      for (let i = 0; i < N; i++) {
        g.beginPath();
        g.moveTo(base[i], top);
        g.lineTo(xOf(i), yOf(i));
        g.stroke();
      }
      // balls
      for (let i = 0; i < N; i++) {
        const x = xOf(i);
        const y = yOf(i);
        const rg = g.createRadialGradient(x, y - r * 0.15, r * 0.05, x, y, r);
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.3, c2);
        rg.addColorStop(0.8, c1);
        rg.addColorStop(1, track);
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
      }
    }

    function local(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    canvas.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || drag || !geo) return;
      const p = local(e);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const dd = Math.hypot(p.x - xOf(i), p.y - yOf(i));
        if (dd < bestD) { bestD = dd; best = i; }
      }
      // Generous hit area: small balls are hard to grab on a phone.
      if (bestD > Math.max(geo.r * 2.2, 26)) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, i: best };
      held = new Set([best]);
      sound.tick(0.7, 0.6);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = local(e);
      const i = drag.i;
      const a = Math.atan2(p.x - geo.base[i], Math.max(10, p.y - geo.top));
      theta[i] = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
      held = pushFrom(i);
    });
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      held = new Set();
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    // Keyboard: Space swings the first ball.
    canvas.tabIndex = 0;
    canvas.addEventListener('keydown', (e) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      theta.fill(0);
      omega.fill(0);
      theta[0] = -0.75;
    });

    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    layout();
    const stop = animate(el, (now, dt) => {
      if (!geo) return;
      impact = 0;
      for (let s = 0; s < 8; s++) step(dt / 8);
      // One clack per burst of collisions, loudness by impact speed.
      if (impact > geo.L * 0.06 && now - lastClack > 50) {
        lastClack = now;
        const strength = Math.min(1, impact / (geo.L * 2.2));
        sound.clack(strength);
        if (strength > 0.25) haptic(8);
        stat('clacks');
      }
      draw();
    });
    return () => {
      stop();
      ro.disconnect();
    };
  },
};
