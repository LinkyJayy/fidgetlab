export const SCHEMES = {
  ocean: { name: 'Ocean', colors: ['#1d6cf2', '#06b6d4', '#38bdf8'] },
  forest: { name: 'Forest', colors: ['#84cc16', '#16a34a', '#6ee7b7'] },
  candy: { name: 'Candy', colors: ['#8b2cf5', '#ec4899', '#c084fc'] },
  sunset: { name: 'Sunset', colors: ['#f97316', '#facc15', '#fb923c'] },
  custom: { name: 'Custom', colors: null },
};

export function schemeColors(settings) {
  if (settings.scheme === 'custom') {
    const c = settings.custom;
    return [c.c1, c.c2, c.c3];
  }
  return (SCHEMES[settings.scheme] || SCHEMES.candy).colors;
}

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

// Black or white, whichever reads better on the given color.
export function onColor(hex) {
  return luminance(hex) > 0.4 ? '#14121a' : '#ffffff';
}

const media = window.matchMedia('(prefers-color-scheme: dark)');

export function resolvedMode(settings) {
  if (settings.mode === 'system') return media.matches ? 'dark' : 'light';
  return settings.mode;
}

export function applyTheme(settings) {
  const [c1, c2, c3] = schemeColors(settings);
  const root = document.documentElement;
  root.style.setProperty('--c1', c1);
  root.style.setProperty('--c2', c2);
  root.style.setProperty('--c3', c3);
  root.style.setProperty('--on-c1', onColor(c1));
  root.style.setProperty('--on-c2', onColor(c2));
  const mode = resolvedMode(settings);
  root.dataset.theme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = mode === 'dark' ? '#141318' : '#f5f4f8';
}

export function onSystemModeChange(fn) {
  media.addEventListener('change', fn);
}
