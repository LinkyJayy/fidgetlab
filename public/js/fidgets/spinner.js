// Fidget spinner: grab and flick it around its center. Spin keeps going with
// low bearing friction; every arm passing the top makes a tick.

const ARMS = 3;
const TAU = Math.PI * 2;

export default {
  id: 'spinner',
  name: 'Fidget Spinner',
  blurb: 'Flick it and watch it go.',
  stat: 'spins',
  mount(el, { sound, haptic, stat }) {
    const lobes = Array.from({ length: ARMS }, (_, i) => {
      const a = (i / ARMS) * TAU - Math.PI / 2;
      return { x: 100 + Math.cos(a) * 64, y: 100 + Math.sin(a) * 64 };
    });
    el.innerHTML = `
      <div class="spinner-stage">
        <svg class="spinner" viewBox="0 0 200 200" role="img" aria-label="Fidget spinner">
          <defs>
            <linearGradient id="spBody" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="var(--c1)"/><stop offset="1" stop-color="var(--c2)"/>
            </linearGradient>
            <radialGradient id="spMetal" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stop-color="#ffffff"/><stop offset="0.45" stop-color="#c9ccd6"/><stop offset="1" stop-color="#6b6f7c"/>
            </radialGradient>
            <radialGradient id="spCap" cx="0.35" cy="0.3" r="0.8">
              <stop offset="0" stop-color="#ffffff" stop-opacity="0.9"/><stop offset="0.35" stop-color="var(--c3)"/><stop offset="1" stop-color="var(--c1)"/>
            </radialGradient>
          </defs>
          <g class="spinner-rotor">
            <g fill="url(#spBody)">
              <circle cx="100" cy="100" r="44"/>
              ${lobes.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="34"/>`).join('')}
            </g>
            ${lobes.map((p) => `
              <circle cx="${p.x}" cy="${p.y}" r="22" fill="#000" opacity="0.18"/>
              <circle cx="${p.x}" cy="${p.y}" r="19" fill="url(#spMetal)"/>
              <circle cx="${p.x}" cy="${p.y}" r="8" fill="#000" opacity="0.12"/>`).join('')}
            <circle cx="100" cy="100" r="26" fill="#000" opacity="0.18"/>
            <circle cx="100" cy="100" r="23" fill="url(#spCap)"/>
            <path d="M88 92a14 14 0 0 1 12-7" stroke="#fff" stroke-opacity="0.7" stroke-width="3" fill="none" stroke-linecap="round"/>
          </g>
        </svg>
      </div>
      <div class="readouts">
        <div><b data-rpm>0</b><span>RPM</span></div>
        <div><b data-turns>0</b><span>spins</span></div>
      </div>`;

    const stage = el.querySelector('.spinner-stage');
    const rotor = el.querySelector('.spinner-rotor');
    const rpmEl = el.querySelector('[data-rpm]');
    const turnsEl = el.querySelector('[data-turns]');

    let angle = 0; // radians
    let omega = 0; // radians / second
    let drag = null;
    let lastTick = 0; // which arm segment we were in
    let lastTickTime = 0;
    let turnAcc = 0;
    let turns = 0;
    let whir = null;
    let raf = 0;
    let last = performance.now();

    function center() {
      const r = stage.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }
    const pointerAngle = (e, c) => Math.atan2(e.clientY - c.y, e.clientX - c.x);
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    function down(e) {
      if (e.button > 0) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const c = center();
      drag = { id: e.pointerId, c, a: pointerAngle(e, c), samples: [{ t: performance.now(), a: angle }] };
      // Catching a fast spinner makes a soft thunk.
      if (Math.abs(omega) > 8) sound.thock(Math.min(1, Math.abs(omega) / 40));
      omega = 0;
      if (!whir) whir = sound.whir();
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const a = pointerAngle(e, drag.c);
      angle += wrap(a - drag.a);
      drag.a = a;
      const now = performance.now();
      drag.samples.push({ t: now, a: angle });
      while (drag.samples.length > 2 && now - drag.samples[0].t > 90) drag.samples.shift();
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const s = drag.samples;
      const first = s[0];
      const lastS = s[s.length - 1];
      const dt = (lastS.t - first.t) / 1000;
      if (dt > 0.008 && performance.now() - lastS.t < 80) {
        omega = Math.max(-90, Math.min(90, ((lastS.a - first.a) / dt) * 1.15));
      }
      drag = null;
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!drag) {
        // Bearing friction: mostly proportional, with a small constant part so it stops.
        const sign = Math.sign(omega);
        omega -= omega * 0.18 * dt + sign * 0.35 * dt;
        if (Math.sign(omega) !== sign) omega = 0;
        angle += omega * dt;
      }
      const speed = drag && drag.samples.length > 1
        ? Math.abs((drag.samples.at(-1).a - drag.samples[0].a) / Math.max(0.016, (drag.samples.at(-1).t - drag.samples[0].t) / 1000))
        : Math.abs(omega);

      rotor.setAttribute('transform', `rotate(${(angle * 180) / Math.PI} 100 100)`);

      // A tick each time an arm passes 12 o'clock, rate-limited so very fast
      // spins blend into the whir instead of turning into a buzz.
      const seg = Math.floor(angle / (TAU / ARMS));
      if (seg !== lastTick) {
        const steps = Math.abs(seg - lastTick);
        lastTick = seg;
        turnAcc += steps;
        if (now - lastTickTime > 45) {
          lastTickTime = now;
          sound.tick(0.8 + Math.min(0.6, speed / 60), Math.max(0.25, 1 - speed / 70));
        }
        while (turnAcc >= ARMS) {
          turnAcc -= ARMS;
          turns += 1;
          stat('spins');
        }
      }
      if (whir) whir.set(speed / 55);
      if (whir && !drag && omega === 0) { whir.stop(); whir = null; }

      rpmEl.textContent = Math.round((speed / TAU) * 60);
      turnsEl.textContent = turns;
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    // Keyboard: Space/Enter gives it a push.
    stage.tabIndex = 0;
    stage.setAttribute('aria-label', 'Spinner. Press Space to spin.');
    function key(e) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        omega += 25;
        if (!whir) whir = sound.whir();
        haptic(8);
      }
    }

    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(raf);
      if (whir) whir.stop();
    };
  },
};
