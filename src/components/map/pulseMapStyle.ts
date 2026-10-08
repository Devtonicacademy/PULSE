import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';
import { signal } from '../../theme/tokens';

/**
 * Pulse's dark glass / neon basemap, drawn from free OpenStreetMap vector tiles served by
 * OpenFreeMap (OpenMapTiles schema). No token or key is needed. To self-host later, point
 * OPENFREEMAP_TILEJSON at a PMTiles or tile server that uses the same schema.
 */
export const OPENFREEMAP_TILEJSON = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

export const BUILDINGS_LAYER_ID = 'pulse-buildings-3d';
/** A thin solid cap on every building so the window texture only shows on the walls, not the roof */
export const ROOFS_LAYER_ID = 'pulse-roofs-3d';
export const BUILDING_LAYER_IDS = [BUILDINGS_LAYER_ID, ROOFS_LAYER_ID];

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];
const FONT_ITALIC = ['Noto Sans Italic'];

const COLORS = {
  land: '#0a0e17',
  landuse: '#0d1320',
  park: '#0b1d1b',
  water: '#08213a',
  waterLine: '#0d3556',
  roadMajor: signal[400],
  roadPrimary: signal[500],
  roadSecondary: '#7c8cf8',
  roadMinor: '#4b5a8f',
  roadService: '#2b3452',
  path: '#3a4a6b',
  label: '#cbd5e1',
  labelDim: '#8b9ab5',
  halo: '#05070d'
};

const MAJOR = ['motorway', 'trunk'];
const PRIMARY = ['primary'];
const SECONDARY = ['secondary'];
const MINOR = ['tertiary', 'minor', 'residential', 'living_street', 'unclassified', 'road'];
const SERVICE = ['service', 'track'];

const roadFilter = (classes: string[]) => ['match', ['get', 'class'], classes, true, false];
const notTunnelOrBridge: unknown[] = ['!', ['in', ['get', 'brunnel'], ['literal', ['tunnel']]]];

/** Width curve for a road class: base width at z12, growing toward street level */
const width = (base: number): unknown => [
  'interpolate',
  ['exponential', 1.4],
  ['zoom'],
  8, base * 0.25,
  12, base,
  16, base * 3.2,
  19, base * 7
];

function roadLayers(
  id: string,
  classes: string[],
  color: string,
  base: number,
  minzoom: number,
  glow: boolean
): LayerSpecification[] {
  const filter = ['all', roadFilter(classes), notTunnelOrBridge] as never;
  const layers: LayerSpecification[] = [];
  if (glow) {
    layers.push({
      id: `${id}-glow`,
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom,
      filter,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': color,
        'line-width': width(base * 2.6) as never,
        'line-blur': 4,
        'line-opacity': 0.22
      }
    });
  }
  layers.push({
    id,
    type: 'line',
    source: 'openmaptiles',
    'source-layer': 'transportation',
    minzoom,
    filter,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': width(base) as never, 'line-opacity': 0.95 }
  });
  return layers;
}

export function buildPulseStyle(): StyleSpecification {
  const layers: LayerSpecification[] = [
    { id: 'background', type: 'background', paint: { 'background-color': COLORS.land } },
    {
      id: 'landcover',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landcover',
      filter: ['match', ['get', 'class'], ['grass', 'wood', 'farmland'], true, false],
      paint: { 'fill-color': COLORS.park, 'fill-opacity': 0.7 }
    },
    {
      id: 'landuse',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'landuse',
      filter: ['match', ['get', 'class'], ['residential', 'commercial', 'industrial', 'retail', 'cemetery', 'school', 'hospital'], true, false],
      paint: { 'fill-color': COLORS.landuse, 'fill-opacity': 0.9 }
    },
    {
      id: 'park',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'park',
      paint: { 'fill-color': COLORS.park, 'fill-opacity': 0.9 }
    },
    {
      id: 'water',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'water',
      paint: { 'fill-color': COLORS.water }
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'waterway',
      paint: { 'line-color': COLORS.waterLine, 'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.5, 16, 3] }
    },
    {
      id: 'building-flat',
      type: 'fill',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      maxzoom: 15,
      paint: { 'fill-color': '#101a2e', 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, 0.9] }
    },
    ...roadLayers('road-service', SERVICE, COLORS.roadService, 0.5, 14, false),
    ...roadLayers('road-minor', MINOR, COLORS.roadMinor, 0.9, 12, false),
    {
      id: 'road-path',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'transportation',
      minzoom: 15,
      filter: roadFilter(['path', 'pedestrian', 'footway', 'cycleway', 'steps']) as never,
      paint: {
        'line-color': COLORS.path,
        'line-width': ['interpolate', ['linear'], ['zoom'], 15, 0.6, 19, 2],
        'line-dasharray': [2, 2]
      }
    },
    ...roadLayers('road-secondary', SECONDARY, COLORS.roadSecondary, 1.3, 9, true),
    ...roadLayers('road-primary', PRIMARY, COLORS.roadPrimary, 1.7, 7, true),
    ...roadLayers('road-major', MAJOR, COLORS.roadMajor, 2.1, 5, true),
    {
      id: BUILDINGS_LAYER_ID,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': [
          'interpolate',
          ['linear'],
          ['coalesce', ['get', 'render_height'], 6],
          0, '#101a2e',
          20, '#152340',
          60, '#1d3263',
          140, '#2a4a8f',
          260, '#00b8d4'
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.8, ['coalesce', ['get', 'render_height'], 6]
        ],
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.8, ['coalesce', ['get', 'render_min_height'], 0]
        ],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': true
      }
    },
    {
      id: ROOFS_LAYER_ID,
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 14,
      filter: ['!=', ['get', 'hide_3d'], true],
      paint: {
        'fill-extrusion-color': '#1a2438',
        'fill-extrusion-base': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.8, ['coalesce', ['get', 'render_height'], 6]
        ],
        'fill-extrusion-height': [
          'interpolate', ['linear'], ['zoom'],
          14, 0,
          14.8, ['+', ['coalesce', ['get', 'render_height'], 6], 0.8]
        ],
        'fill-extrusion-opacity': 1,
        'fill-extrusion-vertical-gradient': false
      }
    },
    {
      id: 'water-name',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'water_name',
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': FONT_ITALIC,
        'text-size': 12,
        'text-letter-spacing': 0.15
      },
      paint: { 'text-color': '#4f7fb0', 'text-halo-color': COLORS.halo, 'text-halo-width': 1.2 }
    },
    {
      id: 'road-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 13, 10, 18, 14],
        'text-max-angle': 30
      },
      paint: { 'text-color': COLORS.label, 'text-halo-color': COLORS.halo, 'text-halo-width': 1.6 }
    },
    {
      id: 'poi-label',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'poi',
      minzoom: 16,
      filter: ['<=', ['get', 'rank'], 20],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': FONT_REGULAR,
        'text-size': 11,
        'text-anchor': 'top',
        'text-offset': [0, 0.4],
        'text-max-width': 7
      },
      paint: { 'text-color': COLORS.labelDim, 'text-halo-color': COLORS.halo, 'text-halo-width': 1.4 }
    },
    {
      id: 'place-small',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      minzoom: 11,
      filter: ['match', ['get', 'class'], ['suburb', 'neighbourhood', 'quarter', 'hamlet', 'village'], true, false],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 16, 15],
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.08,
        'text-max-width': 8
      },
      paint: { 'text-color': '#e2e8f0', 'text-halo-color': COLORS.halo, 'text-halo-width': 1.8 }
    },
    {
      id: 'place-large',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      maxzoom: 14,
      filter: ['match', ['get', 'class'], ['city', 'town', 'state', 'country'], true, false],
      layout: {
        'text-field': ['coalesce', ['get', 'name_en'], ['get', 'name']],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 12, 20],
        'text-max-width': 8
      },
      paint: { 'text-color': '#f1f5f9', 'text-halo-color': COLORS.halo, 'text-halo-width': 2 }
    }
  ];

  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      openmaptiles: { type: 'vector', url: OPENFREEMAP_TILEJSON }
    },
    layers
  };
}
