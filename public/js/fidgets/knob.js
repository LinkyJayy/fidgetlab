// Rotary knob with detents. Twist it around (no end stops) and it clicks at
// every notch, with a ring of lights following the pointer.

const DETENTS = 24;
const STEP = (Math.PI * 2) / DETENTS;

export default {
  id: 'knob',
  name: 'Knob',
  blurb: 'Twist it. Click, click, click.',
  stat: 'clicks',
  mount(el, { sound, haptic, stat }) {
    const dots = Array.from({ length: DETENTS }, (_, i) => {
      const a = i * STEP - Math.PI / 2;
      return `<circle class="knob-dot" data-i="${i}" cx="${(100 + Math.cos(a) * 92).toFixed(2)}" cy="${(100 + Math.sin(a) * 92).toFixed(2)}" r="3.6"/>`;
    }).join('');
    const ridges = Array.from({ length: 36 }, (_, i) => {
      const a = (i / 36) * Math.PI * 2;
      const x1 = 100 + Math.cos(a) * 64;
      const y1 = 100 + Math.sin(a) * 64;
      const x2 = 100 + Math.cos(a) * 72;
      const y2 = 100 + Math.sin(a) * 72;
      return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}"/>`;
    }).join('');

    el.innerHTML = `
      <div class="knob-stage" tabindex="0" role="slider" aria-label="Knob" aria-valuemin="0" aria-valuemax="${DETENTS - 1}" aria-valuenow="0">
        <svg class="knob" viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <radialGradient id="knobFace" cx="0.4" cy="0.35" r="0.75">
              <stop offset="0" stop-color="var(--knob-hi)"/><stop offset="1" stop-color="var(--knob-lo)"/>
            </radialGradient>
            <linearGradient id="knobRim" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="var(--c1)"/><stop offset="1" stop-color="var(--c2)"/>
            </linearGradient>
          </defs>
          <g>${dots}</g>
          <circle cx="100" cy="104" r="74" fill="#000" opacity="0.18"/>
          <circle cx="100" cy="100" r="74" fill="url(#knobRim)"/>
          <g class="knob-rotor">
            <g class="knob-ridges">${ridges}</g>
            <circle cx="100" cy="100" r="60" fill="url(#knobFace)"/>
            <rect x="96" y="46" width="8" height="26" rx="4" class="knob-pointer"/>
          </g>
          <circle cx="100" cy="100" r="60" fill="none" stroke="#fff" stroke-opacity="0.25"/>
        </svg>
      </div>
      <div class="readouts">
        <div><b data-pos>0</b><span>notch</span></div>
        <div><b data-clicks>0</b><span>clicks</span></div>
      </div>`;

    const stage = el.querySelector('.knob-stage');
    const rotor = el.querySelector('.knob-rotor');
    const dotEls = [...el.querySelectorAll('.knob-dot')];
    const posEl = el.querySelector('[data-pos]');
    const clicksEl = el.querySelector('[data-clicks]');

    let angle = 0; // continuous, radians
    let notch = 0; // integer detent index (unbounded)
    let clicks = 0;
    let drag = null;
    let raf = 0;
    const glow = new Array(DETENTS).fill(0);

    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const mod = (n, m) => ((n % m) + m) % m;

    function center() {
      const r = stage.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    function setAngle(a) {
      angle = a;
      const n = Math.round(angle / STEP);
      if (n !== notch) {
        const dir = Math.sign(n - notch);
        const steps = Math.abs(n - notch);
        for (let s = 0; s < steps; s++) {
          notch += dir;
          glow[mod(notch, DETENTS)] = 1;
        }
        clicks += steps;
        sound.click(dir > 0 ? 1.05 : 0.92, Math.min(1, 0.7 + steps * 0.1));
        haptic(5);
        stat('clicks', steps);
        clicksEl.textContent = clicks;
        posEl.textContent = mod(notch, DETENTS);
        stage.setAttribute('aria-valuenow', String(mod(notch, DETENTS)));
      }
    }

    function down(e) {
      if (e.button > 0) return;
      e.preventDefault();
      stage.setPointerCapture(e.pointerId);
      const c = center();
      drag = { id: e.pointerId, c, a: Math.atan2(e.clientY - c.y, e.clientX - c.x) };
      stage.classList.add('active');
    }
    function move(e) {
      if (!drag || e.pointerId !== drag.id) return;
      const a = Math.atan2(e.clientY - drag.c.y, e.clientX - drag.c.x);
      // Ignore jitter right at the center where angles are meaningless.
      if (Math.hypot(e.clientX - drag.c.x, e.clientY - drag.c.y) < 8) return;
      setAngle(angle + wrap(a - drag.a));
      drag.a = a;
    }
    function up(e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag = null;
      stage.classList.remove('active');
    }
    function wheel(e) {
      e.preventDefault();
      setAngle(notch * STEP + Math.sign(e.deltaY || e.deltaX) * STEP);
    }
    function key(e) {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      setAngle(notch * STEP + d * STEP);
    }

    function frame() {
      // Snap toward the nearest notch when not held, for a detent feel.
      if (!drag) angle += (notch * STEP - angle) * 0.35;
      rotor.setAttribute('transform', `rotate(${(angle * 180) / Math.PI} 100 100)`);
      const cur = mod(notch, DETENTS);
      for (let i = 0; i < DETENTS; i++) {
        if (i !== cur) glow[i] *= 0.92;
        else glow[i] = 1;
        dotEls[i].style.opacity = String(0.18 + glow[i] * 0.82);
        dotEls[i].classList.toggle('on', i === cur);
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    stage.addEventListener('pointerdown', down);
    stage.addEventListener('pointermove', move);
    stage.addEventListener('pointerup', up);
    stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', wheel, { passive: false });
    stage.addEventListener('keydown', key);
    return () => cancelAnimationFrame(raf);
  },
};
