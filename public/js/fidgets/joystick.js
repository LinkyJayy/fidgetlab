// Mobile-game style virtual joystick driving a little orb around an arena.
// Collect the sparks for a chime.

const DIRS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export default {
  id: 'joystick',
  name: 'Joystick',
  blurb: 'Thumb-stick controls, just like a mobile game.',
  stat: 'sparks',
  mount(el, { sound, haptic, stat, colors }) {
    el.innerHTML = `
      <canvas class="arena" aria-label="Arena controlled by the joystick"></canvas>
      <div class="joy-row">
        <div class="joy-readout">
          <div><span>X</span><b data-x>0.00</b></div>
          <div><span>Y</span><b data-y>0.00</b></div>
          <div><span>Dir</span><b data-dir>—</b></div>
        </div>
        <div class="joy-base" tabindex="0" aria-label="Joystick. Use arrow keys to move.">
          <div class="joy-ring"></div>
          <div class="joy-knob"></div>
        </div>
        <div class="joy-readout">
          <div><span>Sparks</span><b data-sparks>0</b></div>
        </div>
      </div>`;

    const arena = el.querySelector('.arena');
    const g = arena.getContext('2d');
    const base = el.querySelector('.joy-base');
    const knob = el.querySelector('.joy-knob');
    const xEl = el.querySelector('[data-x]');
    const yEl = el.querySelector('[data-y]');
    const dirEl = el.querySelector('[data-dir]');
    const sparksEl = el.querySelector('[data-sparks]');

    let vec = { x: 0, y: 0 }; // -1..1 stick position
    let knobPos = { x: 0, y: 0, vx: 0, vy: 0 }; // spring-animated after release
    let drag = null;
    let atEdge = false;
    let lastDir = null;
    const keys = new Set();
    let size = { w: 0, h: 0 };
    const player = { x: 0.5, y: 0.5, vx: 0, vy: 0 };
    const trail = [];
    let spark = randomSpark();
    let sparks = 0;
    let bumpedAt = 0;
    let raf = 0;
    let last = performance.now();

    function randomSpark() {
      return { x: 0.1 + Math.random() * 0.8, y: 0.15 + Math.random() * 0.7, born: performance.now() };
    }

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      size = { w: arena.clientWidth, h: arena.clientHeight };
      arena.width = Math.round(size.w * dpr);
      arena.height = Math.round(size.h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function setStick(x, y) {
      const m = Math.hypot(x, y);
      if (m > 1) { x /= m; y /= m; }
      vec = { x, y };
      const mag = Math.min(1, m);
      if (mag > 0.97 && !atEdge) { atEdge = true; sound.tick(1.1, 0.7); haptic(6); }
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
      setStick((e.clientX - (r.left + rad)) / (rad * 0.62), (e.clientY - (r.top + rad)) / (rad * 0.62));
      knobPos = { x: vec.x, y: vec.y, vx: 0, vy: 0 };
    }

    function down(e) {
      if (e.button > 0 || drag) return;
      e.preventDefault();
      base.setPointerCapture(e.pointerId);
      drag = e.pointerId;
      base.classList.add('active');
      sound.thock(0.8);
      haptic(10);
      fromPointer(e);
    }
    function move(e) {
      if (e.pointerId === drag) fromPointer(e);
    }
    function up(e) {
      if (e.pointerId !== drag) return;
      drag = null;
      base.classList.remove('active');
      if (Math.hypot(vec.x, vec.y) > 0.4) sound.boing();
      setStick(0, 0);
    }

    function keyChange(e) {
      const map = { ArrowUp: 1, ArrowDown: 1, ArrowLeft: 1, ArrowRight: 1, w: 1, a: 1, s: 1, d: 1 };
      if (!map[e.key]) return;
      e.preventDefault();
      if (e.type === 'keydown') keys.add(e.key); else keys.delete(e.key);
      const x = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
      const y = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
      setStick(x, y);
    }

    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Knob follows the finger directly; otherwise it springs back to center.
      if (drag == null) {
        const k = 260;
        const c = 18;
        knobPos.vx += (-k * (knobPos.x - vec.x) - c * knobPos.vx) * dt;
        knobPos.vy += (-k * (knobPos.y - vec.y) - c * knobPos.vy) * dt;
        knobPos.x += knobPos.vx * dt;
        knobPos.y += knobPos.vy * dt;
      }
      knob.style.transform = `translate(calc(-50% + ${knobPos.x * 62}%), calc(-50% + ${knobPos.y * 62}%))`;
      knob.style.setProperty('--tilt-x', `${knobPos.y * -14}deg`);
      knob.style.setProperty('--tilt-y', `${knobPos.x * 14}deg`);

      // Player physics in arena units (0..1 of width).
      const { w, h } = size;
      if (w && h) {
        const accel = 3.2;
        player.vx += vec.x * accel * dt;
        player.vy += vec.y * accel * dt * (w / h);
        const drag = Math.exp(-4 * dt);
        player.vx *= drag;
        player.vy *= drag;
        player.x += player.vx * dt;
        player.y += player.vy * dt;
        const pr = 14 / w;
        const prY = 14 / h;
        let bumped = 0;
        if (player.x < pr) { player.x = pr; bumped = Math.abs(player.vx); player.vx *= -0.5; }
        if (player.x > 1 - pr) { player.x = 1 - pr; bumped = Math.abs(player.vx); player.vx *= -0.5; }
        if (player.y < prY) { player.y = prY; bumped = Math.max(bumped, Math.abs(player.vy)); player.vy *= -0.5; }
        if (player.y > 1 - prY) { player.y = 1 - prY; bumped = Math.max(bumped, Math.abs(player.vy)); player.vy *= -0.5; }
        if (bumped > 0.15 && now - bumpedAt > 120) {
          bumpedAt = now;
          sound.thock(Math.min(1, bumped));
          haptic(8);
        }
        trail.push({ x: player.x, y: player.y });
        if (trail.length > 18) trail.shift();

        if (Math.hypot((player.x - spark.x) * w, (player.y - spark.y) * h) < 26) {
          sound.chime();
          haptic(15);
          stat('sparks');
          sparks += 1;
          sparksEl.textContent = sparks;
          spark = randomSpark();
        }
        drawArena(now);
      }

      xEl.textContent = vec.x.toFixed(2);
      yEl.textContent = (-vec.y).toFixed(2);
      dirEl.textContent = lastDir || '—';
      raf = requestAnimationFrame(frame);
    }

    function drawArena(now) {
      const { w, h } = size;
      const [c1, c2, c3] = colors();
      const dark = document.documentElement.dataset.theme === 'dark';
      g.clearRect(0, 0, w, h);
      // grid
      g.strokeStyle = dark ? 'rgba(255,255,255,0.06)' : 'rgba(20,18,30,0.06)';
      g.lineWidth = 1;
      for (let x = 24; x < w; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 24; y < h; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      // spark
      const pulse = 1 + Math.sin((now - spark.born) / 180) * 0.15;
      const sx = spark.x * w;
      const sy = spark.y * h;
      g.save();
      g.translate(sx, sy);
      g.rotate(now / 600);
      g.fillStyle = c3;
      g.shadowColor = c3;
      g.shadowBlur = 16;
      g.beginPath();
      for (let i = 0; i < 8; i++) {
        const rr = (i % 2 ? 4 : 10) * pulse;
        const a = (i / 8) * Math.PI * 2;
        g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      g.closePath();
      g.fill();
      g.restore();
      // trail
      trail.forEach((p, i) => {
        g.globalAlpha = (i / trail.length) * 0.35;
        g.fillStyle = c2;
        g.beginPath();
        g.arc(p.x * w, p.y * h, 4 + (i / trail.length) * 8, 0, Math.PI * 2);
        g.fill();
      });
      g.globalAlpha = 1;
      // player
      const px = player.x * w;
      const py = player.y * h;
      const grad = g.createRadialGradient(px - 4, py - 5, 2, px, py, 15);
      grad.addColorStop(0, '#fff');
      grad.addColorStop(0.35, c2);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.shadowColor = c1;
      g.shadowBlur = 18;
      g.beginPath();
      g.arc(px, py, 14, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
    }

    const ro = new ResizeObserver(layout);
    ro.observe(arena);
    layout();
    base.addEventListener('pointerdown', down);
    base.addEventListener('pointermove', move);
    base.addEventListener('pointerup', up);
    base.addEventListener('pointercancel', up);
    base.addEventListener('keydown', keyChange);
    base.addEventListener('keyup', keyChange);
    base.addEventListener('blur', () => { keys.clear(); setStick(0, 0); });
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  },
};
