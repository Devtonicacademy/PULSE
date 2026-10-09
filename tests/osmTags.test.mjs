// What OpenStreetMap tags mean for the 3D map: ground classes, paint, roofs, heights, building kinds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  areaKind,
  buildingHeights,
  buildingKind,
  buildingStyle,
  parseColour,
  parseMeters,
  roofShapeIndex,
  ROOF_SHAPES,
  BUILDING_KINDS
} from '../server/osm/osmTags.js';
import { overpassQuery } from '../server/osm/overpass.js';

// ---- ground ----------------------------------------------------------------------------------------

test('woods and forests are recognised, whichever way they are mapped', () => {
  assert.equal(areaKind({ natural: 'wood' }), 'forest');
  assert.equal(areaKind({ landuse: 'forest' }), 'forest');
  assert.equal(areaKind({ natural: 'wood', leaf_type: 'broadleaved' }), 'forest');
});

test('parks, gardens, grass and other open green land are grass planes', () => {
  for (const tags of [
    { leisure: 'park' }, { leisure: 'garden' }, { leisure: 'golf_course' }, { leisure: 'playground' }, { leisure: 'common' },
    { landuse: 'grass' }, { landuse: 'meadow' }, { landuse: 'village_green' }, { landuse: 'recreation_ground' },
    { landuse: 'cemetery' }, { landuse: 'farmland' }, { landuse: 'orchard' }, { landuse: 'allotments' },
    { natural: 'scrub' }, { natural: 'grassland' }, { natural: 'heath' }, { natural: 'wetland' }
  ]) {
    assert.equal(areaKind(tags), 'green', JSON.stringify(tags));
  }
});

test('built-up and bare land is never painted green, however it is tagged', () => {
  for (const tags of [
    { landuse: 'residential' }, { landuse: 'commercial' }, { landuse: 'industrial' }, { landuse: 'retail' },
    { landuse: 'construction' }, { landuse: 'military' }, { landuse: 'brownfield' }, { landuse: 'railway' }, { landuse: 'quarry' },
    { leisure: 'stadium' }, { leisure: 'marina' }, { leisure: 'sports_centre' }, { leisure: 'track' },
    {}
  ]) {
    assert.equal(areaKind(tags), null, JSON.stringify(tags));
  }
});

test('paved pitches are courts, clay pitches are bare ground, everything else grass', () => {
  assert.equal(areaKind({ leisure: 'pitch', surface: 'asphalt' }), null);
  assert.equal(areaKind({ leisure: 'pitch', surface: 'concrete' }), null);
  assert.equal(areaKind({ leisure: 'pitch', surface: 'clay' }), 'sand');
  assert.equal(areaKind({ leisure: 'pitch', surface: 'grass' }), 'green');
  assert.equal(areaKind({ leisure: 'pitch' }), 'green');
});

test('water includes reservoirs, basins, bays and swimming pools', () => {
  for (const tags of [{ natural: 'water' }, { natural: 'bay' }, { waterway: 'riverbank' }, { landuse: 'reservoir' }, { landuse: 'basin' }, { leisure: 'swimming_pool' }]) {
    assert.equal(areaKind(tags), 'water', JSON.stringify(tags));
  }
  assert.equal(areaKind({ natural: 'beach' }), 'sand');
  assert.equal(areaKind({ natural: 'sand' }), 'sand');
});

test('the Overpass query asks for every class the parser can draw (and nothing it would misdraw)', () => {
  const q = overpassQuery([6.4, 3.3, 6.5, 3.5]);
  for (const word of ['wood', 'scrub', 'grassland', 'heath', 'forest', 'farmland', 'orchard', 'meadow', 'reservoir', 'swimming_pool', 'dog_park']) {
    assert.match(q, new RegExp(word), word);
  }
  assert.doesNotMatch(q, /residential|industrial|commercial/, 'built-up land is not downloaded as ground');
  assert.doesNotMatch(q, /stadium/);
  // The areas a relation can be (large woods are usually multipolygons)
  assert.match(q, /relation\["natural"~"[^"]*wood/);
});

// ---- colours ---------------------------------------------------------------------------------------

test('colours: hex in three or six digits, with or without #, and CSS names', () => {
  assert.equal(parseColour('#a0522d'), 0xa0522d);
  assert.equal(parseColour('A0522D'), 0xa0522d);
  assert.equal(parseColour('#fc0'), 0xffcc00);
  assert.equal(parseColour('Light Blue'), parseColour('lightblue'));
  assert.ok(parseColour('brick') > 0);
  assert.equal(parseColour('not a colour'), 0);
  assert.equal(parseColour(undefined), 0);
  assert.notEqual(parseColour('#000000'), 0, 'black must not read as "not mapped"');
});

test('building paint: building:colour first, then the facade colour, then the material', () => {
  assert.equal(buildingStyle({ 'building:colour': '#336699' }).wall, 0x336699);
  assert.equal(buildingStyle({ 'building:facade:colour': 'red' }).wall, parseColour('red'));
  assert.equal(buildingStyle({ 'building:material': 'brick' }).wall, 0x9c5a44);
  assert.equal(buildingStyle({ 'building:colour': '#336699', 'building:material': 'brick' }).wall, 0x336699, 'an explicit colour wins');
  assert.equal(buildingStyle({ 'building:material': 'glass;concrete' }).wall, 0x6a8fb0, 'the first of several materials');
  assert.equal(buildingStyle({ building: 'yes' }).wall, 0);
});

test('roof paint: roof:colour, else the roof material', () => {
  assert.equal(buildingStyle({ 'roof:colour': '#aa3322' }).roof, 0xaa3322);
  assert.equal(buildingStyle({ 'roof:material': 'roof_tiles' }).roof, 0xa5543b);
  assert.equal(buildingStyle({ 'roof:material': 'metal' }).roof, 0x9aa4ad);
  assert.equal(buildingStyle({}).roof, 0);
});

test('roof shapes map to the shapes the renderer can build', () => {
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'gabled' })], 'gabled');
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'hipped' })], 'hipped');
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'half-hipped' })], 'hipped');
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'pyramidal' })], 'pyramidal');
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'skillion' })], 'skillion');
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'dome' })], 'dome');
  assert.equal(ROOF_SHAPES[roofShapeIndex({ 'roof:shape': 'onion' })], 'dome');
  assert.equal(roofShapeIndex({ 'roof:shape': 'flat' }), 0);
  assert.equal(roofShapeIndex({ 'roof:shape': 'something-new' }), 0, 'unknown shapes stay flat rather than guessing');
  assert.equal(roofShapeIndex({}), 0);
});

test('roof height: roof:height, else roof:levels', () => {
  assert.equal(buildingStyle({ 'roof:height': '3.5' }).roofHeight, 3.5);
  assert.equal(buildingStyle({ 'roof:levels': '2' }).roofHeight, 3);
  assert.equal(buildingStyle({}).roofHeight, 0);
});

// ---- heights ---------------------------------------------------------------------------------------

test('meters: plain numbers, units, feet and decimal commas', () => {
  assert.equal(parseMeters('12'), 12);
  assert.equal(parseMeters('12.5 m'), 12.5);
  assert.equal(parseMeters('12,5'), 12.5);
  assert.ok(Math.abs(parseMeters("40'") - 12.192) < 1e-6);
  assert.equal(parseMeters('0'), null);
  assert.equal(parseMeters('tall'), null);
});

test('height: an explicit height is the top including the roof', () => {
  const h = buildingHeights({ building: 'yes', height: '20', 'roof:height': '4' }, 300);
  assert.deepEqual([h.height, h.source, h.topIncludesRoof], [20, 'height', true]);
  assert.equal(buildingHeights({ building: 'yes', 'building:height': '15' }, 300).height, 15);
});

test('height: building:levels count the storeys, and the roof goes on top of them', () => {
  const plain = buildingHeights({ building: 'yes', 'building:levels': '4' }, 300);
  assert.deepEqual([plain.height, plain.source, plain.topIncludesRoof], [12, 'levels', false]);
  assert.equal(buildingHeights({ building: 'yes', 'building:levels': '4', 'roof:height': '3' }, 300).height, 15);
  assert.equal(buildingHeights({ building: 'yes', 'building:levels': '2', 'roof:levels': '1' }, 300).height, 7.5);
});

test('height: min_height / building:min_level lift a building part off the ground', () => {
  assert.equal(buildingHeights({ 'building:part': 'yes', height: '30', min_height: '12' }, 300).minHeight, 12);
  assert.equal(buildingHeights({ 'building:part': 'yes', 'building:levels': '10', 'building:min_level': '4' }, 300).minHeight, 12);
});

test('height: with no height data the building type, the amenity or the footprint decide', () => {
  assert.equal(buildingHeights({ building: 'hotel' }, 500).source, 'default');
  assert.equal(buildingHeights({ building: 'hotel' }, 500).height, 24);
  assert.equal(buildingHeights({ building: 'yes', amenity: 'place_of_worship' }, 500).height, 12);
  assert.equal(buildingHeights({ building: 'yes', amenity: 'fuel' }, 500).height, 5);
  assert.equal(buildingHeights({ building: 'yes' }, 50).height, 4);
  assert.equal(buildingHeights({ building: 'yes' }, 3000).height, 14);
  assert.equal(buildingHeights({ building: 'construction' }, 300).height, 6);
});

// ---- kind ------------------------------------------------------------------------------------------

test('building kind: from the building type, and from what is inside a plain "yes" building', () => {
  const kind = (tags) => buildingKind(tags);
  assert.equal(kind({ building: 'apartments' }), 'residential');
  assert.equal(kind({ building: 'mosque' }), 'religious');
  assert.equal(kind({ building: 'warehouse' }), 'industrial');
  assert.equal(kind({ building: 'yes', amenity: 'place_of_worship', religion: 'christian' }), 'religious');
  assert.equal(kind({ building: 'yes', amenity: 'hospital' }), 'civic');
  assert.equal(kind({ building: 'yes', amenity: 'school' }), 'civic');
  assert.equal(kind({ building: 'yes', shop: 'supermarket' }), 'commercial');
  assert.equal(kind({ building: 'yes', amenity: 'restaurant' }), 'commercial');
  assert.equal(kind({ building: 'yes', office: 'company' }), 'commercial');
  assert.equal(kind({ building: 'yes', tourism: 'hotel' }), 'commercial');
  assert.equal(kind({ building: 'yes' }), 'other');
  assert.ok(BUILDING_KINDS.includes(kind({ building: 'church' })));
});
