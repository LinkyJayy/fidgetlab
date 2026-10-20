// A long slider. Drag the thumb (or tap anywhere on the rail) and it clicks
// at every notch, rising in pitch as the value goes up.

const NOTCHES = 20;

export default {
  id: 'slider',
  name: 'Slider',
  stat: 'slides',
  mount(el, { sound, haptic, stat }) {
    el.innerHTML = `
      <div class="slider" tabindex="0" role="slider" aria-label="Slider" aria-valuemin="0" aria-valuemax="${NOTCHES}" aria-valuenow="${NOTCHES * 0.35}">
        <div class="slider-rail"><div class="slider-fill"></div></div>
        <div class="slider-thumb"></div>
      </div>`;

    const slider = el.querySelector('.slider');
    let value = 0.35; // 0..1
    let notch = Math.round(value * NOTCHES);
    let drag = null;

    function render() {
      slider.style.setProperty('--v', value.toFixed(4));
      slider.setAttribute('aria-valuenow', String(notch));
    }

    function setValue(v) {
      value = Math.max(0, Math.min(1, v));
      const n = Math.round(value * NOTCHES);
      if (n !== notch) {
        const steps = Math.abs(n - notch);
        notch = n;
        sound.notch(value);
        haptic(n === 0 || n === NOTCHES ? 14 : 4);
        stat('slides', steps);
      }
      render();
    }

    // The thumb center travels from half a thumb in from each end.
    function fromPointer(e) {
      const r = slider.getBoundingClientRect();
      const t = slider.querySelector('.slider-thumb').offsetWidth;
      return (e.clientX - r.left - t / 2) / (r.width - t);
    }

    slider.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      slider.setPointerCapture(e.pointerId);
      drag = e.pointerId;
      slider.classList.add('active');
      sound.thock(0.5);
      setValue(fromPointer(e));
    });
    slider.addEventListener('pointermove', (e) => {
      if (e.pointerId === drag) setValue(fromPointer(e));
    });
    const end = (e) => {
      if (e.pointerId !== drag) return;
      drag = null;
      slider.classList.remove('active');
    };
    slider.addEventListener('pointerup', end);
    slider.addEventListener('pointercancel', end);
    slider.addEventListener('keydown', (e) => {
      const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key];
      if (!d) return;
      e.preventDefault();
      setValue((notch + d) / NOTCHES);
    });
    render();
    return () => {};
  },
};
