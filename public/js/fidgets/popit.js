// 3×3 pop-it. Tap or drag across bubbles: each bubble flips once per stroke,
// so popped bubbles come back when you go over them again.

const SIZE = 3;

export default {
  id: 'popit',
  name: 'Pop-it',
  blurb: 'Tap or drag to pop. Do it again to un-pop.',
  stat: 'pops',
  mount(el, { sound, haptic, stat }) {
    el.innerHTML = `
      <div class="popit-tray" role="group" aria-label="Pop-it, ${SIZE} by ${SIZE}">
        ${Array.from({ length: SIZE * SIZE }, (_, i) => `
          <button class="bubble" data-i="${i}" data-row="${Math.floor(i / SIZE)}" aria-pressed="false" aria-label="Bubble ${i + 1}"></button>
        `).join('')}
      </div>
      <p class="fidget-caption"><span data-count>0</span> popped</p>`;

    const tray = el.querySelector('.popit-tray');
    const bubbles = [...tray.querySelectorAll('.bubble')];
    const count = el.querySelector('[data-count]');
    const strokes = new Map(); // pointerId -> Set of bubbles already flipped

    function flip(b) {
      const popped = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(popped));
      b.classList.remove('bounce');
      void b.offsetWidth; // restart the animation
      b.classList.add('bounce');
      if (popped) {
        sound.pop();
        haptic(12);
        stat('pops');
      } else {
        sound.unpop();
        haptic(6);
      }
      count.textContent = bubbles.filter((x) => x.getAttribute('aria-pressed') === 'true').length;
    }

    function bubbleAt(x, y) {
      const hit = document.elementFromPoint(x, y);
      return hit && hit.classList.contains('bubble') && tray.contains(hit) ? hit : null;
    }

    function visit(e) {
      const seen = strokes.get(e.pointerId);
      if (!seen) return;
      const b = bubbleAt(e.clientX, e.clientY);
      if (b && !seen.has(b)) {
        seen.add(b);
        flip(b);
      }
    }

    function down(e) {
      if (e.button > 0) return;
      e.preventDefault();
      tray.setPointerCapture(e.pointerId);
      strokes.set(e.pointerId, new Set());
      visit(e);
    }
    function move(e) {
      // Coalesced events catch bubbles crossed during fast swipes.
      const list = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of list.length ? list : [e]) visit({ pointerId: e.pointerId, clientX: ev.clientX, clientY: ev.clientY });
    }
    function up(e) {
      strokes.delete(e.pointerId);
    }
    // Keyboard users toggle with Enter/Space via the native button click.
    function click(e) {
      if (e.detail === 0 && e.target.classList.contains('bubble')) flip(e.target);
    }

    tray.addEventListener('pointerdown', down);
    tray.addEventListener('pointermove', move);
    tray.addEventListener('pointerup', up);
    tray.addEventListener('pointercancel', up);
    tray.addEventListener('click', click);
    return () => {};
  },
};
