// Fidget spinner: grab and flick it around its center. Spin keeps going with
// low bearing friction; every arm passing the top makes a tick.

const ARMS = 3;
const TAU = Math.PI * 2;

export default {
  id: 'spinner',
  name: 'Fidget Spinner',
  stat: 'spins',
  mount(el, { sound, haptic, stat, animate }) {
    const lobes = Array.from({ length: ARMS }, (_, i) => {
      const a = (i / ARMS) * TAU - Math.PI / 2;
      return { x: 100 + Math.cos(a) * 62, y: 100 + Math.sin(a) * 62 };
    });
    el.innerHTML = `
      <div class="spinner" tabindex="0" role="img" aria-label="Fidget spinner. Drag to spin, or press Space.">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <g class="spinner-rotor">
            ${lobes.map((p) => `<line x1="100" y1="100" x2="${p.x}" y2="${p.y}" class="spinner-arm"/>`).join('')}
            ${lobes.map((p, i) => `
              <circle cx="${p.x}" cy="${p.y}" r="27" class="fill-${i % 2 ? 'c2' : 'c1'}"/>
              <circle cx="${p.x - 9}" cy="${p.y - 9}" r="8" class="shine"/>`).join('')}
            <circle cx="100" cy="100" r="20" class="spinner-hub"/>
            <circle cx="100" cy="100" r="9" class="fill-c2"/>
          </g>
        </svg>
      </div>`;

    const stage = el.querySelector('.spinner');
    const rotor = el.querySelector('.spinner-rotor');

    let angle = 0; // radians
    let omega = 0; // radians / second
    let drag = null;
    let lastSeg = 0;
    let lastTickTime = 0;
    let segAcc = 0;
    let whir = null;

    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    function center() {
      const r = stage.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    stage.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const c = center();
      drag = { id: e.pointerId, c, a: Math.atan2(e.clientY - c.y, e.clientX - c.x), samples: [{ t: performance.now(), a: angle }] };
      // Catching a fast spinner makes a soft thunk.
      if (Math.abs(omega) > 8) sound.thock(Math.min(1, Math.abs(omega) / 40));
      omega = 0;
      whir ||= sound.whir();
    });
    stage.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const a = Math.atan2(e.clientY - drag.c.y, e.clientX - drag.c.x);
      angle += wrap(a - drag.a);
      drag.a = a;
      const now = performance.now();
      drag.samples.push({ t: now, a: angle });
      while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift();
    });
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const s = drag.samples;
      const dt = (s.at(-1).t - s[0].t) / 1000;
      if (dt > 0.008 && performance.now() - s.at(-1).t < 80) {
        omega = Math.max(-90, Math.min(90, ((s.at(-1).a - s[0].a) / dt) * 1.15));
      }
      drag = null;
    };
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        omega += 25;
        whir ||= sound.whir();
        haptic(8);
      }
    });

    const stop = animate(el, (now, dt) => {
      if (!drag) {
        // Bearing friction: mostly proportional, plus a small constant part so it stops.
        const sign = Math.sign(omega);
        omega -= omega * 0.18 * dt + sign * 0.35 * dt;
        if (Math.sign(omega) !== sign) omega = 0;
        angle += omega * dt;
      }
      const s = drag?.samples;
      const speed = s && s.length > 1
        ? Math.abs((s.at(-1).a - s[0].a) / Math.max(0.016, (s.at(-1).t - s[0].t) / 1000))
        : Math.abs(omega);

      rotor.setAttribute('transform', `rotate(${(angle * 180) / Math.PI} 100 100)`);

      // A tick each time an arm passes 12 o'clock, rate-limited so very fast
      // spins blend into the whir instead of turning into a buzz.
      const seg = Math.floor(angle / (TAU / ARMS));
      if (seg !== lastSeg) {
        segAcc += Math.abs(seg - lastSeg);
        lastSeg = seg;
        if (now - lastTickTime > 45) {
          lastTickTime = now;
          sound.tick(0.8 + Math.min(0.6, speed / 60), Math.max(0.25, 1 - speed / 70));
        }
        while (segAcc >= ARMS) {
          segAcc -= ARMS;
          stat('spins');
        }
      }
      if (whir) whir.set(speed / 55);
      if (whir && !drag && omega === 0) { whir.stop(); whir = null; }
    });

    return () => {
      stop();
      whir?.stop();
    };
  },
};
