// Rotary knob with detents. Twist it around (no end stops) and it clicks at
// every notch; the dot under the pointer lights up.

const DETENTS = 16;
const STEP = (Math.PI * 2) / DETENTS;

export default {
  id: 'knob',
  name: 'Knob',
  stat: 'clicks',
  mount(el, { sound, haptic, stat, animate, uid }) {
    const id = uid();
    const dots = Array.from({ length: DETENTS }, (_, i) => {
      const a = i * STEP - Math.PI / 2;
      return `<circle class="knob-dot" cx="${(100 + Math.cos(a) * 90).toFixed(2)}" cy="${(100 + Math.sin(a) * 90).toFixed(2)}" r="5"/>`;
    }).join('');

    el.innerHTML = `
      <div class="knob" tabindex="0" role="slider" aria-label="Knob" aria-valuemin="0" aria-valuemax="${DETENTS - 1}" aria-valuenow="0">
        <svg viewBox="0 0 200 200" aria-hidden="true">
          <defs>
            <radialGradient id="kf${id}" cx="0.36" cy="0.32" r="0.78">
              <stop offset="0" stop-color="var(--c1)"/>
              <stop offset="0.45" stop-color="var(--c2)" stop-opacity="0.75"/>
              <stop offset="1" stop-color="var(--track)"/>
            </radialGradient>
          </defs>
          <g>${dots}</g>
          <circle cx="100" cy="100" r="68" fill="url(#kf${id})"/>
          <g class="knob-rotor">
            <rect x="96.5" y="40" width="7" height="24" rx="3.5" class="knob-pointer"/>
          </g>
        </svg>
      </div>`;

    const knob = el.querySelector('.knob');
    const rotor = el.querySelector('.knob-rotor');
    const dotEls = [...el.querySelectorAll('.knob-dot')];
    let angle = 0; // continuous, radians
    let notch = 0; // detent index, unbounded
    let drag = null;
    const mod = (n, m) => ((n % m) + m) % m;
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

    function setAngle(a) {
      angle = a;
      const n = Math.round(angle / STEP);
      if (n === notch) return;
      const steps = Math.abs(n - notch);
      sound.click(n > notch ? 1.05 : 0.92, Math.min(1, 0.7 + steps * 0.1));
      haptic(5);
      stat('clicks', steps);
      notch = n;
      knob.setAttribute('aria-valuenow', String(mod(notch, DETENTS)));
    }

    function center() {
      const r = knob.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    knob.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      const c = center();
      drag = { id: e.pointerId, c, a: Math.atan2(e.clientY - c.y, e.clientX - c.x) };
    });
    knob.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      // Angles right at the center are meaningless jitter.
      if (Math.hypot(e.clientX - drag.c.x, e.clientY - drag.c.y) < 8) return;
      const a = Math.atan2(e.clientY - drag.c.y, e.clientX - drag.c.x);
      setAngle(angle + wrap(a - drag.a));
      drag.a = a;
    });
    const up = (e) => {
      if (drag && e.pointerId === drag.id) drag = null;
    };
    knob.addEventListener('pointerup', up);
    knob.addEventListener('pointercancel', up);
    knob.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      setAngle((notch + d) * STEP);
    });

    let shown = -1;
    const stop = animate(el, () => {
      // Snap toward the nearest notch when released, for a detent feel.
      if (!drag) angle += (notch * STEP - angle) * 0.35;
      rotor.setAttribute('transform', `rotate(${(angle * 180) / Math.PI} 100 100)`);
      const cur = mod(notch, DETENTS);
      if (cur !== shown) {
        dotEls[shown]?.classList.remove('on');
        dotEls[cur].classList.add('on');
        shown = cur;
      }
    });
    return stop;
  },
};
