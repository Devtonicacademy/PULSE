/**
 * What OpenStreetMap tags mean for the 3D map. Pure functions (no I/O), shared by the tile
 * builder and its tests.
 *
 *   - areaKind:      which ground layer a land-cover / water polygon belongs to
 *   - buildingKind:  residential, commercial, civic... from `building` and from what is inside it
 *   - buildingStyle: wall / roof colour, roof shape and roof height from the colour, material and
 *                    roof:* tags
 *   - buildingHeights: height from `height`, `building:levels` and the roof tags
 */

// ---------------------------------------------------------------------------------------------
// Ground: water, sand, forest, grass
// ---------------------------------------------------------------------------------------------

/** Pitches on a hard surface are paved courts, not grass */
const HARD_SURFACES = new Set(['asphalt', 'concrete', 'paved', 'tartan', 'artificial_turf_hard', 'paving_stones', 'wood']);

const FOREST_LANDUSE = new Set(['forest']);
const FOREST_NATURAL = new Set(['wood', 'tree_cover']);
const GREEN_LANDUSE = new Set([
  'grass', 'meadow', 'village_green', 'recreation_ground', 'cemetery', 'farmland', 'orchard', 'vineyard',
  'allotments', 'flowerbed', 'greenfield', 'plant_nursery'
]);
const GREEN_NATURAL = new Set(['grassland', 'scrub', 'heath', 'wetland', 'fell', 'moor']);
const GREEN_LEISURE = new Set(['park', 'garden', 'pitch', 'golf_course', 'playground', 'dog_park', 'common', 'nature_reserve_park']);
const WATER_LANDUSE = new Set(['reservoir', 'basin']);

/**
 * The ground layer for a polygon, or null when it is not drawn as ground at all.
 * Only genuine vegetation counts as green: residential, commercial, industrial, construction,
 * military, retail... land is never painted as grass, however it is mapped.
 */
export function areaKind(tags) {
  const { natural, landuse, leisure, waterway } = tags;
  // Mangrove swamp is mapped as wetland but reads as forest: it is where Lagos streets run out
  if (natural === 'wetland' && tags.wetland === 'mangrove') return 'forest';
  if (natural === 'water' || natural === 'bay' || waterway === 'riverbank' || WATER_LANDUSE.has(landuse)) return 'water';
  if (leisure === 'swimming_pool') return 'water';
  if (natural === 'beach' || natural === 'sand') return 'sand';
  if (FOREST_LANDUSE.has(landuse) || FOREST_NATURAL.has(natural)) return 'forest';
  if (leisure === 'pitch' && HARD_SURFACES.has(tags.surface)) return null;
  if (leisure === 'pitch' && (tags.surface === 'sand' || tags.surface === 'clay')) return 'sand';
  if (GREEN_NATURAL.has(natural) || GREEN_LANDUSE.has(landuse) || GREEN_LEISURE.has(leisure)) return 'green';
  return null;
}

// ---------------------------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------------------------

const NAMED_COLOURS = {
  white: 0xf2f2ee, black: 0x2a2a2c, grey: 0x9a9a98, gray: 0x9a9a98, lightgrey: 0xc4c4c2, lightgray: 0xc4c4c2,
  darkgrey: 0x5e5e60, darkgray: 0x5e5e60, silver: 0xb8bcc2, red: 0xb5382c, darkred: 0x7a2a22, maroon: 0x7a2a2a,
  orange: 0xd9822b, yellow: 0xe0c24a, gold: 0xc9a43a, green: 0x4f8a4f, darkgreen: 0x2f5a35, olive: 0x7a7a3a,
  lime: 0x8fc53a, teal: 0x2f8a8a, cyan: 0x4fb8c8, aqua: 0x4fb8c8, blue: 0x3f6fb5, lightblue: 0x8fb4de,
  darkblue: 0x24407a, navy: 0x24407a, purple: 0x7a4a9a, violet: 0x7a4a9a, pink: 0xd98ca8, magenta: 0xb53f8a,
  brown: 0x7a5236, tan: 0xc4a47a, beige: 0xd8c8a4, cream: 0xe8dcb8, ivory: 0xece6d0, khaki: 0xb4a870,
  sand: 0xd4c090, salmon: 0xe0907a, coral: 0xe0705a, turquoise: 0x40b8b0, indigo: 0x3a3a8a, ochre: 0xb8862a,
  terracotta: 0xb4573a, brick: 0x9c4a3a, bronze: 0x8a6a3a, copper: 0xb0643a
};

/** "#a0522d", "a0522d", "#abc" or a colour name -> 0xRRGGBB, or 0 when it is not a usable colour */
export function parseColour(value) {
  if (typeof value !== 'string') return 0;
  const text = value.trim().toLowerCase().replace(/[\s_-]+/g, '');
  const hex = /^#?([0-9a-f]{6})$/.exec(text) ?? /^#([0-9a-f]{3})$/.exec(text);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    const n = parseInt(digits, 16);
    return n === 0 ? 0x010101 : n; // 0 is "not set", so pure black is nudged
  }
  return NAMED_COLOURS[text] ?? 0;
}

const WALL_MATERIALS = {
  brick: 0x9c5a44, concrete: 0x8d8d88, cement_block: 0x8f8f8a, sandcrete: 0x9a9890, glass: 0x6a8fb0,
  metal: 0x8e98a3, steel: 0x8e98a3, aluminium: 0xa8b0b8, stone: 0xa39d8f, wood: 0x8a6a4a, timber_framing: 0x9a7a55,
  plaster: 0xd8d0c0, render: 0xd8d0c0, stucco: 0xd8d0c0, mud: 0x8a6a4a, adobe: 0xb08a5a, laterite: 0xa4573b,
  tin: 0x9aa4ad, corrugated_iron: 0x9aa4ad, panel: 0xb8bcc2, marble: 0xe0ddd5
};
const ROOF_MATERIALS = {
  roof_tiles: 0xa5543b, tiles: 0xa5543b, clay_tiles: 0xa5543b, concrete: 0x8d8d88, metal: 0x9aa4ad, metal_sheet: 0x9aa4ad,
  tin: 0x9aa4ad, corrugated_iron: 0x9aa4ad, zinc: 0x9aa4ad, copper: 0x4f8f7b, slate: 0x4a525c, tar_paper: 0x4a4a4e,
  asbestos: 0x8a8a86, thatch: 0xb59b5e, glass: 0x6a8fb0, grass: 0x4f7a3f, stone: 0xa39d8f, wood: 0x8a6a4a, gravel: 0x8f8a82
};

const firstMaterial = (value) => String(value ?? '').split(/[;,]/)[0].trim().toLowerCase().replace(/[\s-]+/g, '_');

// ---------------------------------------------------------------------------------------------
// Roofs
// ---------------------------------------------------------------------------------------------

/** Index into this list is what the tiles store (0 = flat / not mapped) */
export const ROOF_SHAPES = ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion', 'dome'];
const ROOF_SHAPE_ALIASES = {
  flat: 'flat', gabled: 'gabled', gambrel: 'gabled', saltbox: 'gabled', 'round': 'dome',
  hipped: 'hipped', 'half-hipped': 'hipped', 'half_hipped': 'hipped', mansard: 'hipped', 'hip': 'hipped',
  pyramidal: 'pyramidal', 'pyramid': 'pyramidal', cone: 'pyramidal', skillion: 'skillion', 'lean_to': 'skillion',
  dome: 'dome', onion: 'dome', 'pitched': 'gabled', 'gable': 'gabled'
};

export function roofShapeIndex(tags) {
  const raw = String(tags['roof:shape'] ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  const shape = ROOF_SHAPE_ALIASES[raw];
  return shape ? ROOF_SHAPES.indexOf(shape) : 0;
}

// ---------------------------------------------------------------------------------------------
// Heights
// ---------------------------------------------------------------------------------------------

/** "12", "12.5 m", "40'", "12,5" -> meters (null when missing or not positive) */
export function parseMeters(value) {
  if (value == null) return null;
  const match = /^\s*([\d.]+)\s*(m|ft|'|)?/i.exec(String(value).replace(',', '.'));
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /ft|'/i.test(match[2] ?? '') ? n * 0.3048 : n;
}

export const LEVEL_HEIGHT = 3;
/** One mapped roof level is a pitched attic: about 1.5 m of extra height */
const ROOF_LEVEL_HEIGHT = 1.5;

/**
 * Colours and roof of a building from its tags. `wall` / `roof` are 0xRRGGBB or 0 (not mapped);
 * `shape` indexes ROOF_SHAPES; `roofHeight` is meters (0 = not mapped).
 */
export function buildingStyle(tags) {
  const wall =
    parseColour(tags['building:colour']) ||
    parseColour(tags['building:facade:colour']) ||
    parseColour(tags.colour) ||
    WALL_MATERIALS[firstMaterial(tags['building:material'] ?? tags['building:facade:material'] ?? tags.material)] ||
    0;
  const roof =
    parseColour(tags['roof:colour']) ||
    ROOF_MATERIALS[firstMaterial(tags['roof:material'])] ||
    0;
  const shape = roofShapeIndex(tags);
  const roofLevels = parseFloat(tags['roof:levels']);
  const roofHeight = parseMeters(tags['roof:height']) ?? (roofLevels > 0 ? roofLevels * ROOF_LEVEL_HEIGHT : 0);
  return { wall, roof, shape, roofHeight };
}

// ---------------------------------------------------------------------------------------------
// Kind and default height
// ---------------------------------------------------------------------------------------------

export const BUILDING_KINDS = ['other', 'residential', 'commercial', 'industrial', 'civic', 'religious'];

const KIND_BY_TYPE = {
  house: 'residential', detached: 'residential', semidetached_house: 'residential', terrace: 'residential',
  residential: 'residential', apartments: 'residential', dormitory: 'residential', bungalow: 'residential',
  cabin: 'residential', farm: 'residential', static_caravan: 'residential',
  commercial: 'commercial', office: 'commercial', retail: 'commercial', hotel: 'commercial', supermarket: 'commercial',
  kiosk: 'commercial', bank: 'commercial',
  industrial: 'industrial', warehouse: 'industrial', factory: 'industrial', hangar: 'industrial', barn: 'industrial',
  service: 'industrial', manufacture: 'industrial',
  school: 'civic', university: 'civic', college: 'civic', kindergarten: 'civic', hospital: 'civic', government: 'civic',
  public: 'civic', civic: 'civic', stadium: 'civic', train_station: 'civic', transportation: 'civic', fire_station: 'civic',
  church: 'religious', mosque: 'religious', cathedral: 'religious', chapel: 'religious', temple: 'religious',
  synagogue: 'religious', shrine: 'religious'
};

const CIVIC_AMENITIES = new Set([
  'school', 'university', 'college', 'kindergarten', 'hospital', 'clinic', 'doctors', 'townhall', 'police', 'fire_station',
  'library', 'courthouse', 'community_centre', 'social_facility', 'post_office', 'public_building', 'bus_station', 'ferry_terminal'
]);
const COMMERCIAL_AMENITIES = new Set([
  'restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'bank', 'marketplace', 'fuel', 'pharmacy', 'cinema', 'nightclub',
  'bureau_de_change', 'atm', 'car_wash', 'car_rental', 'events_venue', 'conference_centre'
]);

/** Residential / commercial / civic... from the building type first, then from what the place is */
export function buildingKind(tags) {
  const type = tags.building && tags.building !== 'yes' ? tags.building : tags['building:part'] && tags['building:part'] !== 'yes' ? tags['building:part'] : 'yes';
  if (KIND_BY_TYPE[type]) return KIND_BY_TYPE[type];
  if (tags.amenity === 'place_of_worship' || tags.religion) return 'religious';
  if (CIVIC_AMENITIES.has(tags.amenity) || tags.healthcare || tags.office === 'government') return 'civic';
  if (COMMERCIAL_AMENITIES.has(tags.amenity) || tags.shop || tags.office || tags.tourism === 'hotel' || tags.tourism === 'guest_house') {
    return 'commercial';
  }
  if (tags.industrial || tags.man_made === 'works') return 'industrial';
  return 'other';
}

const DEFAULT_HEIGHT_BY_TYPE = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 7, bungalow: 5, cabin: 4, residential: 9, apartments: 15, dormitory: 12,
  commercial: 12, office: 18, retail: 6, hotel: 24, supermarket: 7, bank: 12, kiosk: 3,
  industrial: 9, warehouse: 9, factory: 10, hangar: 12, barn: 7, service: 4,
  school: 9, kindergarten: 5, university: 12, college: 12, hospital: 12, government: 12, public: 10, civic: 10, stadium: 16,
  church: 12, mosque: 12, cathedral: 18, chapel: 8, temple: 10, synagogue: 10,
  garage: 3, garages: 3, shed: 3, hut: 3, roof: 4, carport: 3, container: 3, construction: 6, greenhouse: 4, parking: 9, static_caravan: 3
};
const DEFAULT_HEIGHT_BY_AMENITY = {
  place_of_worship: 12, hospital: 15, clinic: 8, school: 9, university: 14, college: 12, marketplace: 5, fuel: 5,
  restaurant: 6, cafe: 5, bank: 12, townhall: 14, library: 10, police: 9, fire_station: 9, cinema: 12
};

function defaultHeight(tags, type, footprintArea) {
  if (DEFAULT_HEIGHT_BY_TYPE[type]) return DEFAULT_HEIGHT_BY_TYPE[type];
  if (DEFAULT_HEIGHT_BY_AMENITY[tags.amenity]) return DEFAULT_HEIGHT_BY_AMENITY[tags.amenity];
  if (tags.shop) return footprintArea < 150 ? 4 : 6;
  if (tags.tourism === 'hotel') return 20;
  // Untyped buildings ("yes"): bigger footprints are usually taller in Lagos' commercial districts
  if (footprintArea < 100) return 4;
  if (footprintArea < 400) return 7;
  if (footprintArea < 1500) return 10;
  return 14;
}

/**
 * Heights in meters. `height` is the top of the building including its roof; `building:levels` counts
 * storeys without the roof, so the roof (roof:height, or roof:levels) is added on top of them.
 * `topIncludesRoof` tells the renderer which of the two it is looking at: when it is true the walls
 * stop `roofHeight` below `height`, otherwise the roof sits on top of `height`.
 */
export function buildingHeights(tags, footprintArea) {
  const type = tags.building && tags.building !== 'yes' ? tags.building : tags['building:part'] ?? 'yes';
  const minHeight =
    parseMeters(tags.min_height) ??
    (tags['building:min_level'] ? parseFloat(tags['building:min_level']) * LEVEL_HEIGHT : 0);
  const height = parseMeters(tags.height ?? tags['building:height']);
  if (height) return { height, minHeight, source: 'height', type, topIncludesRoof: true };
  const levels = parseFloat(tags['building:levels']);
  if (Number.isFinite(levels) && levels > 0) {
    const roofLevels = parseFloat(tags['roof:levels']);
    const roofAdd = parseMeters(tags['roof:height']) ?? (roofLevels > 0 ? roofLevels * ROOF_LEVEL_HEIGHT : 0);
    return { height: levels * LEVEL_HEIGHT + roofAdd, minHeight, source: 'levels', type, topIncludesRoof: false };
  }
  return { height: defaultHeight(tags, type, footprintArea), minHeight, source: 'default', type, topIncludesRoof: false };
}
