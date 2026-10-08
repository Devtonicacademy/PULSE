// The accent rule: every brand color in PULSE comes from this file.
// Tailwind (tailwind.config.js) and all map / 3D code import the same values, so changing an
// anchor here recolors the whole app. Plain JS so the Tailwind config can import it too.

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgbToHex = (rgb) => '#' + rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((c, i) => c + (b[i] - c) * t);

/** Builds a 50-950 scale around an anchor color sitting at `anchorStep` */
function scale(anchorHex, anchorStep) {
  const anchor = hexToRgb(anchorHex);
  const anchorIndex = STEPS.indexOf(anchorStep);
  const out = {};
  STEPS.forEach((step, i) => {
    if (i === anchorIndex) out[step] = anchorHex;
    else if (i < anchorIndex) out[step] = rgbToHex(mix(anchor, [255, 255, 255], (anchorIndex - i) / (anchorIndex + 0.6)));
    else out[step] = rgbToHex(mix(anchor, [0, 0, 0], (i - anchorIndex) / (STEPS.length - anchorIndex + 0.4)));
  });
  return out;
}

/** Anchors: the three accents. `accent` is the brand coral, `accent2` its warm partner, `signal` the live/map cyan */
export const ANCHORS = {
  accent: '#FF4757',
  accent2: '#FFA502',
  signal: '#00F2FE'
};

export const accent = scale(ANCHORS.accent, 500);
export const accent2 = scale(ANCHORS.accent2, 500);
export const signal = scale(ANCHORS.signal, 400);

/** "r, g, b" for building rgba() strings in JS and CSS-in-JS */
export const rgb = (hex) => hexToRgb(hex).join(', ');
export const rgba = (hex, alpha) => `rgba(${rgb(hex)}, ${alpha})`;

/** Category accents for markers and badges (one place for 2D map, 3D scene and the feed) */
export const CATEGORY_HEX = {
  events: '#8B5CF6',
  alerts: ANCHORS.accent,
  food_drinks: ANCHORS.accent2,
  lost_found: '#3B82F6',
  recommendations: '#10B981',
  activities: '#14B8A6',
  deals: '#FF6B81',
  community: '#6366F1'
};
