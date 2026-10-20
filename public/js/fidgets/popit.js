// 3×4 pop-it. Tap or drag across bubbles: each bubble flips once per stroke,
// so popped bubbles come back when you go over them again.

const COLS = 3;
const ROWS = 4;

export default {
  id: 'popit',
  name: 'Pop-it',
  stat: 'pops',
  mount(el, { sound, haptic, stat }) {
    el.innerHTML = `
      <div class="popit" role="group" aria-label="Pop-it, ${COLS} by ${ROWS}">
        ${Array.from({ length: COLS * ROWS }, (_, i) => `
          <button class="bubble tone-${(Math.floor(i / COLS) + (i % COLS)) % 2}" aria-pressed="false" aria-label="Bubble ${i + 1}"></button>
        `).join('')}
      </div>`;

    const tray = el.querySelector('.popit');
    const strokes = new Map(); // pointerId -> Set of bubbles already flipped this stroke

    function flip(b) {
      const popped = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(popped));
      if (popped) {
        sound.pop();
        haptic(12);
        stat('pops');
      } else {
        sound.unpop();
        haptic(6);
      }
    }

    function visit(id, x, y) {
      const seen = strokes.get(id);
      if (!seen) return;
      const hit = document.elementFromPoint(x, y);
      const b = hit && hit.classList.contains('bubble') && tray.contains(hit) ? hit : null;
      if (b && !seen.has(b)) {
        seen.add(b);
        flip(b);
      }
    }

    tray.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      tray.setPointerCapture(e.pointerId);
      strokes.set(e.pointerId, new Set());
      visit(e.pointerId, e.clientX, e.clientY);
    });
    tray.addEventListener('pointermove', (e) => {
      // Coalesced events catch bubbles crossed during fast swipes.
      const list = e.getCoalescedEvents?.() || [];
      for (const ev of list.length ? list : [e]) visit(e.pointerId, ev.clientX, ev.clientY);
    });
    const end = (e) => strokes.delete(e.pointerId);
    tray.addEventListener('pointerup', end);
    tray.addEventListener('pointercancel', end);
    // Keyboard users toggle with Enter/Space via the native button click.
    tray.addEventListener('click', (e) => {
      if (e.detail === 0 && e.target.classList.contains('bubble')) flip(e.target);
    });
    return () => {};
  },
};
