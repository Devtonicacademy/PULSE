import type { Map as MapLibreMap, ExpressionSpecification } from 'maplibre-gl';
import type { Lighting, LightingMood } from '../../utils/sunLight';
import { BUILDINGS_LAYER_ID, ROOFS_LAYER_ID } from './pulseMapStyle';

/**
 * Time-of-day lighting for the map: a palette that blends from night to day with the real sun
 * height at the user's location, a directional light that comes from where the sun actually is,
 * a sky and horizon fog, and building windows that are lit at night and plain glass by day.
 */

type Rgb = [number, number, number];

const hex = (value: string): Rgb => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16)
];
const toHex = ([r, g, b]: Rgb) =>
  '#' + [r, g, b].map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, '0')).join('');
const mix = (a: string, b: string, t: number): string => {
  const [ar, ag, ab] = hex(a);
  const [br, bg, bb] = hex(b);
  return toHex([ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t]);
};

interface Palette {
  land: string;
  landuse: string;
  park: string;
  water: string;
  waterLine: string;
  buildingFlat: string;
  roadMajor: string;
  roadPrimary: string;
  roadSecondary: string;
  roadMinor: string;
  roadService: string;
  path: string;
  label: string;
  labelDim: string;
  labelHalo: string;
  waterLabel: string;
  roof: string;
  sky: string;
  horizon: string;
  fog: string;
}

const NIGHT: Palette = {
  land: '#0a0e17', landuse: '#0d1320', park: '#0b1d1b', water: '#08213a', waterLine: '#0d3556', buildingFlat: '#101a2e',
  roadMajor: '#00f2fe', roadPrimary: '#22d3ee', roadSecondary: '#7c8cf8', roadMinor: '#4b5a8f', roadService: '#2b3452', path: '#3a4a6b',
  label: '#cbd5e1', labelDim: '#8b9ab5', labelHalo: '#05070d', waterLabel: '#4f7fb0', roof: '#1a2438',
  sky: '#070b16', horizon: '#14233f', fog: '#0a1122'
};

const DAY: Palette = {
  land: '#e6e1d8', landuse: '#dcd8cc', park: '#c6dcae', water: '#9ec4e3', waterLine: '#86b3d6', buildingFlat: '#d2ccc0',
  roadMajor: '#f3b94f', roadPrimary: '#fffaf0', roadSecondary: '#ffffff', roadMinor: '#fbf9f4', roadService: '#efeadf', path: '#c9c2b4',
  label: '#27303d', labelDim: '#566273', labelHalo: '#fbf9f4', waterLabel: '#3f6f9c', roof: '#bdb6a9',
  sky: '#7fb4e8', horizon: '#dbe9f5', fog: '#e9eef2'
};

/** Golden-hour tint blended in around sunrise and sunset */
const GOLDEN: Partial<Palette> = {
  land: '#cdbba8', landuse: '#c4b29f', park: '#a9b88a', water: '#7f9bb8', waterLine: '#6d89a8', buildingFlat: '#b6a28f',
  roadMajor: '#ffb85c', roadPrimary: '#ffe3bd', roadSecondary: '#ffe9cf', roadMinor: '#f5ddc2', roadService: '#e3cfb6',
  label: '#3a2d2a', labelHalo: '#f6e6d2', roof: '#a8917f',
  sky: '#f0a070', horizon: '#ffcf9c', fog: '#f1c9a6'
};

function paletteFor(lighting: Lighting): Palette {
  const base = {} as Palette;
  (Object.keys(DAY) as (keyof Palette)[]).forEach((key) => {
    let color = mix(NIGHT[key], DAY[key], lighting.daylight);
    const golden = GOLDEN[key];
    // Twilight leans toward the warm palette without losing the night-to-day progression
    if (golden) color = mix(color, golden, Math.min(0.75, lighting.warmth * 0.85) * (0.35 + 0.65 * lighting.daylight));
    base[key] = color;
  });
  return base;
}

// ---- Windows -------------------------------------------------------------------------------

type WindowSet = 'night' | 'dusk' | 'day';
type WindowKind = 'low' | 'mid' | 'tower';
const IMAGE_PATTERN = /^pulse-win-(night|dusk|day)-(low|mid|tower)$/;

const WALLS: Record<WindowSet, Record<WindowKind, string>> = {
  night: { low: '#18213a', mid: '#141c33', tower: '#101830' },
  dusk: { low: '#6d5f6a', mid: '#625a6e', tower: '#566075' },
  day: { low: '#d9d1c3', mid: '#cfc8bc', tower: '#c3ccd6' }
};
const GLASS: Record<WindowSet, string> = { night: '#0b1220', dusk: '#31405a', day: '#6f8ba6' };
const LIT = ['#ffd98a', '#ffcf70', '#ffe7b3', '#9fd3ff'];

/** A tileable wall texture: a grid of windows, some lit at night, with deterministic variation */
function createWindowImage(set: WindowSet, kind: WindowKind): ImageData {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = WALLS[set][kind];
  ctx.fillRect(0, 0, size, size);

  // Windows at roughly real size: low buildings 4x4 per tile, mid-rise 6x8, towers 8x16 narrow bands
  const cols = kind === 'low' ? 4 : kind === 'mid' ? 6 : 8;
  const rows = kind === 'low' ? 4 : kind === 'mid' ? 8 : 16;
  const cellW = size / cols;
  const cellH = size / rows;
  const padX = cellW * (kind === 'tower' ? 0.08 : 0.2);
  const padY = cellH * (kind === 'tower' ? 0.3 : 0.22);

  let seed = kind === 'low' ? 11 : kind === 'mid' ? 23 : 37;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lit = set === 'night' ? random() < 0.5 : set === 'dusk' ? random() < 0.25 : false;
      ctx.fillStyle = lit ? LIT[Math.floor(random() * LIT.length)] : GLASS[set];
      if (set === 'day' && random() < 0.35) ctx.fillStyle = mix(GLASS.day, '#ffffff', 0.25); // sky reflections
      ctx.fillRect(c * cellW + padX, r * cellH + padY, cellW - padX * 2, cellH - padY * 2);
    }
  }
  return ctx.getImageData(0, 0, size, size);
}

/** Generates window textures on demand (the style refers to them by name) */
export function installWindowImages(map: MapLibreMap): void {
  map.on('styleimagemissing', (event) => {
    const match = IMAGE_PATTERN.exec(event.id);
    if (!match || map.hasImage(event.id)) return;
    map.addImage(event.id, createWindowImage(match[1] as WindowSet, match[2] as WindowKind), { pixelRatio: 2 });
  });
}

/** Which texture set a mood uses: lit windows after dark, plain glass in daylight */
function windowSet(mood: LightingMood, daylight: number): WindowSet {
  if (daylight > 0.7) return 'day';
  if (mood === 'night' || daylight < 0.12) return 'night';
  return 'dusk';
}

const BUILDING_HEIGHT: ExpressionSpecification = ['coalesce', ['get', 'render_height'], 6];

export function windowPatternExpression(set: WindowSet): ExpressionSpecification {
  return [
    'case',
    ['>=', BUILDING_HEIGHT, 40], ['image', `pulse-win-${set}-tower`],
    ['>=', BUILDING_HEIGHT, 12], ['image', `pulse-win-${set}-mid`],
    ['image', `pulse-win-${set}-low`]
  ];
}

// ---- Apply ---------------------------------------------------------------------------------

const setPaint = (map: MapLibreMap, layer: string, property: string, value: unknown) => {
  if (map.getLayer(layer)) map.setPaintProperty(layer, property, value as never);
};

/** Repaints the map for a moment in the day (call on style load, then about once a minute) */
export function applyLighting(map: MapLibreMap, lighting: Lighting): void {
  const p = paletteFor(lighting);
  const night = 1 - lighting.daylight;

  setPaint(map, 'background', 'background-color', p.land);
  setPaint(map, 'landcover', 'fill-color', p.park);
  setPaint(map, 'landuse', 'fill-color', p.landuse);
  setPaint(map, 'park', 'fill-color', p.park);
  setPaint(map, 'water', 'fill-color', p.water);
  setPaint(map, 'waterway', 'line-color', p.waterLine);
  setPaint(map, 'building-flat', 'fill-color', p.buildingFlat);

  const roads: [string, string][] = [
    ['road-service', p.roadService],
    ['road-minor', p.roadMinor],
    ['road-secondary', p.roadSecondary],
    ['road-primary', p.roadPrimary],
    ['road-major', p.roadMajor]
  ];
  for (const [id, color] of roads) {
    setPaint(map, id, 'line-color', color);
    setPaint(map, `${id}-glow`, 'line-color', color);
    // The neon glow belongs to the night; by day roads are plain
    setPaint(map, `${id}-glow`, 'line-opacity', 0.22 * night * night);
  }
  setPaint(map, 'road-path', 'line-color', p.path);

  for (const id of ['road-label', 'place-small', 'place-large']) {
    setPaint(map, id, 'text-color', p.label);
    setPaint(map, id, 'text-halo-color', p.labelHalo);
  }
  setPaint(map, 'poi-label', 'text-color', p.labelDim);
  setPaint(map, 'poi-label', 'text-halo-color', p.labelHalo);
  setPaint(map, 'water-name', 'text-color', p.waterLabel);
  setPaint(map, 'water-name', 'text-halo-color', p.labelHalo);

  // Buildings: window textures for the time of day, a roof/fallback colour, and the real sun
  const set = windowSet(lighting.mood, lighting.daylight);
  setPaint(map, BUILDINGS_LAYER_ID, 'fill-extrusion-pattern', windowPatternExpression(set));
  setPaint(map, BUILDINGS_LAYER_ID, 'fill-extrusion-color', p.roof);
  setPaint(map, ROOFS_LAYER_ID, 'fill-extrusion-color', p.roof);

  // Directional light from the sun's real position (moonlight from a fixed high angle at night)
  const altitude = Math.max(18, Math.min(80, lighting.sun.altitude));
  const sunUp = lighting.daylight > 0.05;
  const lightColor = sunUp ? mix('#cfd9ff', mix('#fff6e8', '#ffb070', lighting.warmth), Math.max(0.2, lighting.daylight)) : '#6f86c9';
  map.setLight({
    anchor: 'map',
    position: [1.6, sunUp ? lighting.sun.azimuth : 215, 90 - (sunUp ? altitude : 35)],
    color: lightColor,
    intensity: 0.28 + 0.5 * lighting.daylight + 0.12 * lighting.warmth
  });

  map.setSky({
    'sky-color': p.sky,
    'horizon-color': p.horizon,
    'fog-color': p.fog,
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.7,
    'fog-ground-blend': 0.35
  });
}
