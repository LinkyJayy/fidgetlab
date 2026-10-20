// Newton's cradle. Each ball is a pendulum; touching balls exchange velocity
// (equal-mass elastic collision), which carries the impulse down the row.

const N = 5;
const G_OVER_L = 26; // sets the swing period (~1.2 s)
const DAMPING = 0.06; // air drag per second
const RESTITUTION = 0.992;
const MAX_ANGLE = 1.05;

export default {
  id: 'cradle',
  name: "Newton's Cradle",
  blurb: 'Pull a ball (or a few) out and let go.',
  stat: 'clacks',
  mount(el, { sound, haptic, stat, colors }) {
    el.innerHTML = `
      <div class="cradle-stage">
        <canvas class="cradle" aria-label="Newton's cradle. Drag a ball sideways and release it."></canvas>
      </div>
      <div class="cradle-actions">
        <button class="btn ghost" data-launch="1">Swing 1</button>
        <button class="btn ghost" data-launch="2">Swing 2</button>
        <button class="btn ghost" data-launch="3">Swing 3</button>
      </div>`;

    const canvas = el.querySelector('canvas');
    const g = canvas.getContext('2d');
    const theta = new Array(N).fill(0);
    const omega = new Array(N).fill(0);
    let held = new Set();
    let drag = null;
    let geo = null;
    let raf = 0;
    let last = performance.now();
    let lastClack = 0;
    let impact = 0;

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const r = Math.min(w * 0.062, h * 0.085);
      const top = h * 0.12;
      const L = h * 0.6;
      const cx = w / 2;
      const base = Array.from({ length: N }, (_, i) => cx + (i - (N - 1) / 2) * 2 * r);
      geo = { w, h, r, top, L, base, cx };
    }

    const xOf = (i) => geo.base[i] + geo.L * Math.sin(theta[i]);
    const yOf = (i) => geo.top + geo.L * Math.cos(theta[i]);
    function setX(i, x) {
      const s = Math.max(-Math.sin(MAX_ANGLE), Math.min(Math.sin(MAX_ANGLE), (x - geo.base[i]) / geo.L));
      theta[i] = Math.asin(s);
    }

    // Keep balls from overlapping by pushing neighbours outward from ball k.
    function pushFrom(k) {
      const pushed = new Set([k]);
      const d = 2 * geo.r;
      for (let j = k - 1; j >= 0; j--) {
        if (xOf(j) > xOf(j + 1) - d + 1e-6) { setX(j, xOf(j + 1) - d); pushed.add(j); } else break;
      }
      for (let j = k + 1; j < N; j++) {
        if (xOf(j) < xOf(j - 1) + d - 1e-6) { setX(j, xOf(j - 1) + d); pushed.add(j); } else break;
      }
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
      // A few alternating passes let one impulse travel the whole row in one step.
      for (let pass = 0; pass < N; pass++) {
        const fwd = pass % 2 === 0;
        for (let n = 0; n < N - 1; n++) {
          const i = fwd ? n : N - 2 - n;
          const j = i + 1;
          const gap = xOf(j) - xOf(i);
          if (gap > d + 0.25) continue;
          const vi = omega[i];
          const vj = omega[j];
          if (vi > vj) {
            const rel = (vi - vj) * geo.L;
            const hi = held.has(i);
            const hj = held.has(j);
            if (hi && hj) continue;
            if (hi) omega[j] = vi + (vi - vj) * RESTITUTION;
            else if (hj) omega[i] = vj - (vi - vj) * RESTITUTION;
            else {
              omega[i] = vj + (vi - vj) * (1 - RESTITUTION) / 2;
              omega[j] = vi - (vi - vj) * (1 - RESTITUTION) / 2;
            }
            impact = Math.max(impact, rel);
          }
          // Positional fix so balls never sink into each other.
          if (gap < d) {
            const fix = d - gap;
            if (held.has(i)) setX(j, xOf(j) + fix);
            else if (held.has(j)) setX(i, xOf(i) - fix);
            else { setX(i, xOf(i) - fix / 2); setX(j, xOf(j) + fix / 2); }
          }
        }
      }
    }

    function draw() {
      const { w, h, r, top, base } = geo;
      const dark = document.documentElement.dataset.theme === 'dark';
      g.clearRect(0, 0, w, h);
      // Frame bar
      const barX0 = base[0] - r * 2.2;
      const barX1 = base[N - 1] + r * 2.2;
      const grad = g.createLinearGradient(0, top - 10, 0, top + 6);
      grad.addColorStop(0, colors()[0]);
      grad.addColorStop(1, colors()[1]);
      g.fillStyle = grad;
      roundRect(barX0, top - 9, barX1 - barX0, 12, 6);
      g.fill();
      // Floor shadows
      for (let i = 0; i < N; i++) {
        const x = xOf(i);
        const lift = (yOf(i) - (top + geo.L));
        g.fillStyle = dark ? 'rgba(0,0,0,0.45)' : 'rgba(30,20,60,0.14)';
        g.beginPath();
        g.ellipse(x, top + geo.L + r * 1.55, r * (0.95 + lift / (h * 0.8)), r * 0.22, 0, 0, Math.PI * 2);
        g.fill();
      }
      // Strings (a V for a bit of depth)
      g.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(20,18,30,0.4)';
      g.lineWidth = 1.2;
      for (let i = 0; i < N; i++) {
        const x = xOf(i);
        const y = yOf(i) - r * 0.85;
        g.beginPath();
        g.moveTo(base[i] - r * 0.55, top);
        g.lineTo(x, y);
        g.lineTo(base[i] + r * 0.55, top);
        g.stroke();
      }
      // Balls
      for (let i = 0; i < N; i++) {
        const x = xOf(i);
        const y = yOf(i);
        const rg = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r * 1.05);
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.28, dark ? '#d9dbe3' : '#eceef3');
        rg.addColorStop(0.7, '#8d919e');
        rg.addColorStop(0.92, colors()[0]);
        rg.addColorStop(1, '#3a3d48');
        g.fillStyle = rg;
        g.beginPath();
        g.arc(x, y, r, 0, Math.PI * 2);
        g.fill();
        if (drag && drag.i === i) {
          g.strokeStyle = colors()[1];
          g.lineWidth = 2;
          g.stroke();
        }
        g.fillStyle = '#ffffff';
        g.globalAlpha = 0.85;
        g.beginPath();
        g.ellipse(x - r * 0.38, y - r * 0.42, r * 0.18, r * 0.11, -0.6, 0, Math.PI * 2);
        g.fill();
        g.globalAlpha = 1;
      }
    }

    function roundRect(x, y, w, h, rr) {
      g.beginPath();
      g.moveTo(x + rr, y);
      g.arcTo(x + w, y, x + w, y + h, rr);
      g.arcTo(x + w, y + h, x, y + h, rr);
      g.arcTo(x, y + h, x, y, rr);
      g.arcTo(x, y, x + w, y, rr);
      g.closePath();
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sub = 8;
      impact = 0;
      for (let s = 0; s < sub; s++) step(dt / sub);
      // One clack per burst of collisions, loudness by impact speed.
      if (impact > 12 && now - lastClack > 50) {
        lastClack = now;
        const strength = Math.min(1, impact / (geo.L * 2.2));
        sound.clack(strength);
        if (strength > 0.25) haptic(8);
        stat('clacks');
      }
      draw();
      raf = requestAnimationFrame(frame);
    }

    function local(e) {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    function down(e) {
      if (e.button > 0 || drag) return;
      const p = local(e);
      let best = -1;
      let bestD = Infinity;
      for (let i = 0; i < N; i++) {
        const dd = Math.hypot(p.x - xOf(i), p.y - yOf(i));
        if (dd < bestD) { bestD = dd; best = i; }
      }
      if (bestD > geo.r * 1.8) return;
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drag = { id: e.pointerId, i: best };
      held = new Set([best]);
      sound.tick(0.7, 0.6);
      move(e);
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const p = local(e);
      const i = drag.i;
      let a = Math.atan2(p.x - geo.base[i], Math.max(10, p.y - geo.top));
      a = Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, a));
      theta[i] = a;
      omega[i] = 0;
      held = pushFrom(i);
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      held = new Set();
    }

    function launch(count) {
      for (let i = 0; i < N; i++) { theta[i] = 0; omega[i] = 0; }
      for (let i = 0; i < count; i++) theta[i] = -0.75;
      held = new Set();
    }
    el.querySelector('.cradle-actions').addEventListener('click', (e) => {
      const b = e.target.closest('[data-launch]');
      if (b) launch(Number(b.dataset.launch));
    });

    const ro = new ResizeObserver(layout);
    ro.observe(canvas);
    layout();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  },
};
