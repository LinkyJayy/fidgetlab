// Three toggle switches stacked vertically. Tap to flip, or drag the thumb
// across and let go.

const COUNT = 3;

export default {
  id: 'toggles',
  name: 'Toggle Switches',
  stat: 'toggles',
  mount(el, { sound, haptic, stat }) {
    el.innerHTML = `
      <div class="toggles">
        ${Array.from({ length: COUNT }, (_, i) => `
          <button class="switch" role="switch" aria-checked="${i === 1}" aria-label="Switch ${i + 1}">
            <span class="switch-thumb"></span>
          </button>`).join('')}
      </div>`;

    function set(sw, on) {
      sw.style.removeProperty('--drag');
      if ((sw.getAttribute('aria-checked') === 'true') === on) return;
      sw.setAttribute('aria-checked', String(on));
      sound.toggle(on);
      haptic(on ? 18 : 10);
      stat('toggles');
    }

    for (const sw of el.querySelectorAll('.switch')) {
      let drag = null;
      sw.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        sw.setPointerCapture(e.pointerId);
        drag = { id: e.pointerId, x0: e.clientX, w: sw.getBoundingClientRect().width, moved: false, start: sw.getAttribute('aria-checked') === 'true' };
        sw.classList.add('pressed');
      });
      sw.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x0;
        if (Math.abs(dx) > 4) drag.moved = true;
        if (!drag.moved) return;
        // --drag runs 0 (off) .. 1 (on) while the thumb follows the finger.
        const p = Math.max(0, Math.min(1, (drag.start ? 1 : 0) + dx / (drag.w * 0.5)));
        sw.style.setProperty('--drag', p.toFixed(3));
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        sw.classList.remove('pressed');
        const d = drag;
        drag = null;
        if (e.type === 'pointercancel') sw.style.removeProperty('--drag');
        else if (!d.moved) set(sw, !d.start);
        else set(sw, parseFloat(sw.style.getPropertyValue('--drag') || (d.start ? 1 : 0)) > 0.5);
      };
      sw.addEventListener('pointerup', end);
      sw.addEventListener('pointercancel', end);
      // Keyboard (Enter/Space) produces a click with detail 0.
      sw.addEventListener('click', (e) => {
        if (e.detail === 0) set(sw, sw.getAttribute('aria-checked') !== 'true');
      });
    }
    return () => {};
  },
};
