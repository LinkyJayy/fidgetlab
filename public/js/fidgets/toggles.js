// Three big toggle switches stacked vertically. Tap to flip, or drag the
// thumb across and let go.

const SWITCHES = [
  { label: 'Alpha', note: 'Lab lights' },
  { label: 'Beta', note: 'Bubbler' },
  { label: 'Gamma', note: 'Turbo mode' },
];

export default {
  id: 'toggles',
  name: 'Toggle Switches',
  blurb: 'Three chunky switches. Flip them.',
  stat: 'toggles',
  mount(el, { sound, haptic, stat }) {
    el.innerHTML = `
      <div class="toggle-stack">
        ${SWITCHES.map((s, i) => `
          <div class="toggle-row">
            <div class="toggle-text"><b>${s.label}</b><span>${s.note}</span></div>
            <button class="big-switch" role="switch" aria-checked="false" aria-label="${s.label}" data-i="${i}">
              <span class="big-switch-track"><span class="lbl on">ON</span><span class="lbl off">OFF</span></span>
              <span class="big-switch-thumb"></span>
            </button>
          </div>`).join('')}
      </div>
      <p class="fidget-caption"><span data-on>0</span> of ${SWITCHES.length} on</p>`;

    const switches = [...el.querySelectorAll('.big-switch')];
    const onEl = el.querySelector('[data-on]');

    function set(sw, on) {
      if ((sw.getAttribute('aria-checked') === 'true') === on) {
        sw.style.removeProperty('--drag');
        return;
      }
      sw.setAttribute('aria-checked', String(on));
      sw.style.removeProperty('--drag');
      sound.toggle(on);
      haptic(on ? 18 : 10);
      stat('toggles');
      onEl.textContent = switches.filter((s) => s.getAttribute('aria-checked') === 'true').length;
    }

    for (const sw of switches) {
      let drag = null;
      sw.addEventListener('pointerdown', (e) => {
        if (e.button > 0) return;
        e.preventDefault();
        sw.setPointerCapture(e.pointerId);
        const r = sw.getBoundingClientRect();
        drag = { id: e.pointerId, x0: e.clientX, w: r.width, moved: false, start: sw.getAttribute('aria-checked') === 'true' };
        sw.classList.add('pressed');
      });
      sw.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        const dx = e.clientX - drag.x0;
        if (Math.abs(dx) > 4) drag.moved = true;
        if (!drag.moved) return;
        // --drag is 0 (off) .. 1 (on) while the thumb follows the finger.
        const travel = drag.w * 0.45;
        const p = Math.max(0, Math.min(1, (drag.start ? 1 : 0) + dx / travel));
        sw.style.setProperty('--drag', p.toFixed(3));
      });
      const end = (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        sw.classList.remove('pressed');
        const d = drag;
        drag = null;
        if (e.type === 'pointercancel') { sw.style.removeProperty('--drag'); return; }
        if (!d.moved) set(sw, !d.start);
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
