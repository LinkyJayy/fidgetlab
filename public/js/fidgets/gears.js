// Three meshing gears. The big gear drives the two small ones; grab any of
// them and the whole train turns, with a ratchet tick per tooth.

const TAU = Math.PI * 2;
const M = 6.2; // gear module: pitch radius = M * teeth / 2

// Big driver in the middle, two small gears on the diagonal.
const DRIVER = { n: 16, x: 0, y: 0 };
const DRIVEN = [
  { n: 10, phi: -Math.PI / 4 },
  { n: 10, phi: (3 * Math.PI) / 4 },
];

function gearPath(n) {
  const rp = (M * n) / 2;
  const ra = rp + M;
  const rd = rp - 1.25 * M;
  const step = TAU / n;
  const pt = (r, a) => `${(Math.cos(a) * r).toFixed(2)},${(Math.sin(a) * r).toFixed(2)}`;
  const pts = [];
  for (let k = 0; k < n; k++) {
    const a = k * step; // tooth centered on a
    pts.push(pt(rd, a - step * 0.5), pt(rd, a - step * 0.3), pt(ra, a - step * 0.13), pt(ra, a + step * 0.13), pt(rd, a + step * 0.3));
  }
  return `M${pts.join('L')}Z`;
}

export default {
  id: 'gears',
  name: 'Gears',
  stat: 'gears',
  mount(el, { sound, haptic, stat, animate }) {
    const gears = [{ ...DRIVER, ratio: 1, offset: 0, cls: 'fill-c1' }];
    for (const [i, g] of DRIVEN.entries()) {
      const d = (M * (DRIVER.n + g.n)) / 2;
      // Turn the driven gear so a gap faces the driver's tooth at the contact point.
      const offset = g.phi + Math.PI + Math.PI / g.n + (DRIVER.n / g.n) * g.phi;
      gears.push({ n: g.n, x: Math.cos(g.phi) * d, y: Math.sin(g.phi) * d, ratio: -DRIVER.n / g.n, offset, cls: i ? 'fill-c3' : 'fill-c2' });
    }

    el.innerHTML = `
      <div class="gears" tabindex="0" role="img" aria-label="Three gears. Drag any gear to turn them, or press Space.">
        <svg viewBox="-104 -104 208 208" aria-hidden="true">
          ${gears.map((g) => `
            <g transform="translate(${g.x.toFixed(2)} ${g.y.toFixed(2)})">
              <g class="gear-rot">
                <path d="${gearPath(g.n)}" class="${g.cls}"/>
                <circle r="${(M * g.n) / 2 - M * 2.6}" class="gear-face"/>
                <circle r="${M * 1.1}" class="gear-hole"/>
                <circle cx="${(((M * g.n) / 2 - 1.25 * M) * 0.62).toFixed(2)}" r="${M * 0.55}" class="gear-hole"/>
              </g>
            </g>`).join('')}
        </svg>
      </div>`;

    const root = el.querySelector('.gears');
    const svg = el.querySelector('svg');
    const rots = [...el.querySelectorAll('.gear-rot')];

    let theta = 0; // driver angle
    let omega = 0;
    let drag = null;
    let lastTooth = 0;
    let lastTick = 0;
    let toothAcc = 0;
    let whir = null;

    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function local(e) {
      const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
      return { x: p.x, y: p.y };
    }

    root.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      const p = local(e);
      // Grab the gear under the finger, or the nearest one.
      let best = gears[0];
      let bestD = Infinity;
      for (const g of gears) {
        const d = Math.hypot(p.x - g.x, p.y - g.y) - (M * g.n) / 2;
        if (d < bestD) { bestD = d; best = g; }
      }
      e.preventDefault();
      root.setPointerCapture(e.pointerId);
      if (Math.abs(omega) > 6) sound.thock(Math.min(1, Math.abs(omega) / 30));
      omega = 0;
      drag = { id: e.pointerId, g: best, a: Math.atan2(p.y - best.y, p.x - best.x), samples: [{ t: performance.now(), th: theta }] };
      whir ||= sound.whir();
    });
    root.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const p = local(e);
      const g = drag.g;
      const a = Math.atan2(p.y - g.y, p.x - g.x);
      theta += wrap(a - drag.a) / g.ratio; // convert that gear's turn to driver turn
      drag.a = a;
      const now = performance.now();
      drag.samples.push({ t: now, th: theta });
      while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift();
    });
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const s = drag.samples;
      const dt = (s.at(-1).t - s[0].t) / 1000;
      if (dt > 0.008 && performance.now() - s.at(-1).t < 80) {
        omega = Math.max(-40, Math.min(40, (s.at(-1).th - s[0].th) / dt));
      }
      drag = null;
    };
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        omega += 8;
        whir ||= sound.whir();
        haptic(8);
      }
    });

    const stop = animate(el, (now, dt) => {
      if (!drag) {
        // Gears have more friction than a spinner bearing.
        const sign = Math.sign(omega);
        omega -= omega * 0.9 * dt + sign * 0.6 * dt;
        if (Math.sign(omega) !== sign) omega = 0;
        theta += omega * dt;
      }
      gears.forEach((g, i) => {
        rots[i].setAttribute('transform', `rotate(${((theta * g.ratio + g.offset) * 180) / Math.PI})`);
      });

      const s = drag?.samples;
      const speed = s && s.length > 1
        ? Math.abs((s.at(-1).th - s[0].th) / Math.max(0.016, (s.at(-1).t - s[0].t) / 1000))
        : Math.abs(omega);
      const tooth = Math.floor(theta / (TAU / DRIVER.n));
      if (tooth !== lastTooth) {
        toothAcc += Math.abs(tooth - lastTooth);
        lastTooth = tooth;
        if (now - lastTick > 35) {
          lastTick = now;
          sound.ratchet(Math.max(0.35, 1 - speed / 40));
          if (speed < 6) haptic(3);
        }
        while (toothAcc >= DRIVER.n) {
          toothAcc -= DRIVER.n;
          stat('gears');
        }
      }
      if (whir) whir.set(speed / 45);
      if (whir && !drag && omega === 0) { whir.stop(); whir = null; }
    });

    return () => {
      stop();
      whir?.stop();
    };
  },
};
