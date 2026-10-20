// Mobile-game style thumb-stick. Push it around, it clicks at the edge and
// on each direction change, then springs back to center.

const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export default {
  id: 'joystick',
  name: 'Joystick',
  stat: 'sparks',
  mount(el, { sound, haptic, stat, animate }) {
    el.innerHTML = `
      <div class="joystick" tabindex="0" aria-label="Joystick. Use arrow keys to move it.">
        <div class="joy-knob"></div>
      </div>`;

    const base = el.querySelector('.joystick');
    const knob = el.querySelector('.joy-knob');
    const TRAVEL = 0.62; // how far the knob may leave center, as a fraction of base radius
    let vec = { x: 0, y: 0 }; // target stick position, -1..1
    let pos = { x: 0, y: 0, vx: 0, vy: 0 }; // shown knob position
    let drag = null;
    let atEdge = false;
    let lastDir = null;
    const keys = new Set();

    function setStick(x, y) {
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      vec = { x, y };
      const mag = Math.min(1, m);
      if (mag > 0.97 && !atEdge) {
        atEdge = true;
        sound.tick(1.1, 0.7);
        haptic(6);
        stat('sparks');
      }
      if (mag < 0.9) atEdge = false;
      const dir = mag > 0.35 ? DIRS[(Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8] : null;
      if (dir !== lastDir) {
        if (dir) sound.tick(0.9, 0.45);
        lastDir = dir;
      }
    }

    function fromPointer(e) {
      const r = base.getBoundingClientRect();
      const rad = r.width / 2;
      setStick((e.clientX - (r.left + rad)) / (rad * TRAVEL), (e.clientY - (r.top + rad)) / (rad * TRAVEL));
      pos = { x: vec.x, y: vec.y, vx: 0, vy: 0 };
    }

    base.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || drag != null) return;
      e.preventDefault();
      base.setPointerCapture(e.pointerId);
      drag = e.pointerId;
      base.classList.add('active');
      sound.thock(0.8);
      haptic(10);
      fromPointer(e);
    });
    base.addEventListener('pointermove', (e) => {
      if (e.pointerId === drag) fromPointer(e);
    });
    const up = (e) => {
      if (e.pointerId !== drag) return;
      drag = null;
      base.classList.remove('active');
      if (Math.hypot(vec.x, vec.y) > 0.4) sound.boing();
      setStick(0, 0);
    };
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);

    const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    function keyChange(e) {
      if (!KEYS.includes(e.key)) return;
      e.preventDefault();
      if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key);
      setStick(keys.has('ArrowRight') - keys.has('ArrowLeft'), keys.has('ArrowDown') - keys.has('ArrowUp'));
    }
    base.addEventListener('keydown', keyChange);
    base.addEventListener('keyup', keyChange);
    base.addEventListener('blur', () => { keys.clear(); setStick(0, 0); });

    return animate(el, (now, dt) => {
      // The knob follows the finger directly; otherwise it springs back.
      if (drag == null) {
        pos.vx += (-260 * (pos.x - vec.x) - 18 * pos.vx) * dt;
        pos.vy += (-260 * (pos.y - vec.y) - 18 * pos.vy) * dt;
        pos.x += pos.vx * dt;
        pos.y += pos.vy * dt;
      }
      // Percentages of the knob's own size: knob is 46% of base, so 62% of the base radius ≈ 67% of knob width.
      const k = (TRAVEL * 50) / 46;
      knob.style.transform = `translate(calc(-50% + ${(pos.x * k * 100).toFixed(2)}%), calc(-50% + ${(pos.y * k * 100).toFixed(2)}%))`;
    });
  },
};
