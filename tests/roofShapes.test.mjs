// Pitched roofs on footprints, and the finished meshes for buildings that OpenStreetMap describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);
const roofs = await import('../src/components/map/pulse3d/roofShapes.ts');
const { buildTileGeometry } = await import('../src/components/map/pulse3d/tileMeshes.ts');
const { createPulseMaterials } = await import('../src/components/map/pulse3d/materials.ts');
const { buildingStyle } = await import('../server/osm/osmTags.js');
const { buildRoof, orientedBox, convexity, defaultRoofHeight } = roofs;

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const lShape = [
  { x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 20 }, { x: 0, y: 20 }
];
const regularPolygon = (n, r) => Array.from({ length: n }, (_, i) => ({ x: Math.cos((i / n) * Math.PI * 2) * r, y: Math.sin((i / n) * Math.PI * 2) * r }));

const ys = (arr) => arr.filter((_, i) => i % 3 === 1);
const triangles = (arr) => arr.length / 9;

// ---- the footprint box -----------------------------------------------------------------------------

test('the oriented box finds the long axis of a rotated rectangle', () => {
  const angle = Math.PI / 6;
  const ring = rect(-10, -4, 10, 4).map(({ x, y }) => ({ x: x * Math.cos(angle) - y * Math.sin(angle), y: x * Math.sin(angle) + y * Math.cos(angle) }));
  const box = orientedBox(ring);
  assert.ok(Math.abs(box.halfLength - 10) < 1e-6 && Math.abs(box.halfWidth - 4) < 1e-6);
  assert.ok(Math.abs(Math.abs(box.ux) - Math.cos(angle)) < 1e-6);
  assert.ok(Math.abs(box.fill - 1) < 1e-6);
});

test('an L-shaped footprint fills little of its box, and is not convex', () => {
  assert.ok(orientedBox(lShape).fill < 0.75);
  assert.ok(convexity(lShape) < 0.9);
  assert.ok(convexity(rect(0, 0, 10, 10)) > 0.99);
});

// ---- the roofs -------------------------------------------------------------------------------------

test('a gabled roof: two slopes and two gable ends, ridge at the full rise', () => {
  const roof = buildRoof(rect(0, 0, 20, 10), 'gabled', 6, 3);
  assert.equal(triangles(roof.roof), 4);
  assert.equal(triangles(roof.gables), 2);
  assert.equal(Math.max(...ys(roof.roof)), 9);
  assert.equal(Math.min(...ys(roof.roof)), 6);
  // The ridge runs along the long side: the two ridge ends are 20 m apart
  const ridge = [];
  for (let i = 0; i < roof.roof.length; i += 3) if (roof.roof[i + 1] === 9) ridge.push([roof.roof[i], roof.roof[i + 2]]);
  const xsRidge = ridge.map((p) => p[0]);
  assert.equal(Math.max(...xsRidge) - Math.min(...xsRidge), 20);
});

test('a hipped roof has four slopes and no gable ends; a square one is a pyramid', () => {
  const hipped = buildRoof(rect(0, 0, 20, 10), 'hipped', 6, 3);
  assert.equal(triangles(hipped.roof), 6);
  assert.equal(triangles(hipped.gables), 0);
  assert.equal(Math.max(...ys(hipped.roof)), 9);
  const square = buildRoof(rect(0, 0, 10, 10), 'hipped', 6, 3);
  assert.equal(triangles(square.roof), 4);
});

test('a pyramidal roof fans out from the centre, one triangle per edge', () => {
  const roof = buildRoof(regularPolygon(6, 8), 'pyramidal', 10, 4);
  assert.equal(triangles(roof.roof), 6);
  const tops = ys(roof.roof).filter((y) => y === 14);
  assert.equal(tops.length, 6, 'every triangle meets at the apex');
});

test('a skillion roof climbs to one side and closes the high side with a wall', () => {
  const roof = buildRoof(rect(0, 0, 20, 10), 'skillion', 5, 2);
  assert.equal(triangles(roof.roof), 2);
  assert.equal(triangles(roof.gables), 4);
  assert.equal(Math.max(...ys(roof.roof)), 7);
});

test('a dome covers a round footprint and asks for a flat deck under it', () => {
  const roof = buildRoof(regularPolygon(16, 6), 'dome', 12, 5);
  assert.equal(roof.needsFlatDeck, true);
  assert.ok(Math.max(...ys(roof.roof)) <= 17.0001 && Math.max(...ys(roof.roof)) > 16.9);
  assert.ok(triangles(roof.roof) > 40);
});

test('roof faces point up, gable ends point sideways and away from the building', () => {
  const roof = buildRoof(rect(0, 0, 20, 10), 'gabled', 6, 3);
  for (let i = 1; i < roof.roofNormals.length; i += 3) assert.ok(roof.roofNormals[i] > 0.3, 'slopes face up');
  for (let i = 0; i < roof.gableNormals.length; i += 3) {
    assert.ok(Math.abs(roof.gableNormals[i + 1]) < 1e-6, 'gable ends are vertical');
  }
  // Centre of the gable end at the +x end of the box must point to +x
  const idx = roof.gables.findIndex((v, i) => i % 3 === 0 && v === 20);
  assert.ok(idx >= 0);
  assert.ok(roof.gableNormals[idx] > 0.9);
});

test('footprints that do not suit a shape get no roof, so the building keeps its flat one', () => {
  assert.equal(buildRoof(lShape, 'gabled', 6, 3), null, 'an L is not a rectangle');
  assert.equal(buildRoof(lShape, 'hipped', 6, 3), null);
  assert.equal(buildRoof(lShape, 'pyramidal', 6, 3), null, 'a concave footprint cannot fan from one point');
  assert.equal(buildRoof(rect(0, 0, 20, 10), 'gabled', 6, 0), null, 'no rise, no roof');
});

test('default roof heights: a pitch of about 30 degrees, never absurd', () => {
  const box = { halfLength: 12, halfWidth: 5 };
  assert.ok(Math.abs(defaultRoofHeight('gabled', box) - 2.9) < 0.01);
  assert.equal(defaultRoofHeight('gabled', { halfLength: 80, halfWidth: 60 }), 5);
  assert.equal(defaultRoofHeight('gabled', { halfLength: 2, halfWidth: 0.5 }), 1);
});

// ---- the finished mesh -----------------------------------------------------------------------------

const emptyTile = (over = {}) => ({ v: 2, tx: 0, ty: 0, origin: [0, 0], buildings: [], roads: [], water: [], green: [], sand: [], land: 1, ...over });
const square = (cx, cy, hx, hy) => [(cx - hx) * 10, (cy - hy) * 10, (cx + hx) * 10, (cy - hy) * 10, (cx + hx) * 10, (cy + hy) * 10, (cx - hx) * 10, (cy + hy) * 10];
const layerOf = (g, name) => g.layers.find((l) => l.name === name);
const attr = (layer, key) => layer.attributes[key].array;

test('a tagged gabled roof appears in the mesh; the same building without tags stays flat', () => {
  const footprint = square(100, 100, 10, 6);
  const flat = buildTileGeometry(emptyTile({ buildings: [[7, 0, 1, footprint]] }), 500);
  const tagged = buildTileGeometry(
    emptyTile({ buildings: [[7, 0, 1, footprint]], bmeta: { 0: [0, 0, 1, 30, 1] } }),
    500
  );
  const topFlat = Math.max(...[...attr(layerOf(flat, 'buildings'), 'position')].filter((_, i) => i % 3 === 1));
  const topTagged = Math.max(...[...attr(layerOf(tagged, 'buildings'), 'position')].filter((_, i) => i % 3 === 1));
  assert.ok(topFlat >= 7 && topFlat < 8, `flat building tops out at its height plus a parapet, got ${topFlat}`);
  assert.ok(Math.abs(topTagged - 7) < 1e-3, 'height tag is the top of the roof: ridge at 7 m');
  // Eaves are 3 m lower: walls stop at 4 m
  const heights = new Set([...attr(layerOf(tagged, 'buildings'), 'position')].filter((_, i) => i % 3 === 1).map((v) => Math.round(v * 10) / 10));
  assert.ok(heights.has(4) && heights.has(7));
});

test('a roof on top of the storeys: levels-based height plus the roof', () => {
  const footprint = square(100, 100, 10, 6);
  const g = buildTileGeometry(emptyTile({ buildings: [[6, 0, 1, footprint]], bmeta: { 0: [0, 0, 1, 25, 0] } }), 500);
  const ys2 = [...attr(layerOf(g, 'buildings'), 'position')].filter((_, i) => i % 3 === 1);
  assert.ok(Math.abs(Math.max(...ys2) - 8.5) < 1e-3, 'walls 6 m, roof 2.5 m on top');
});

test('real wall and roof colours are used instead of the kind palette', () => {
  const footprint = square(100, 100, 10, 6);
  const red = 0xcc3322;
  const plain = buildTileGeometry(emptyTile({ buildings: [[9, 0, 1, footprint]] }), 500);
  const painted = buildTileGeometry(emptyTile({ buildings: [[9, 0, 1, footprint]], bmeta: { 0: [red, 0x335577, 0, 0, 0] } }), 500);
  const colours = (g) => attr(layerOf(g, 'buildings'), 'color');
  assert.notDeepEqual([...colours(plain).slice(0, 3)], [...colours(painted).slice(0, 3)]);
  // The painted wall is red-dominant
  const [r, gr, b] = colours(painted);
  assert.ok(r > gr && r > b);
});

test('a roof shape the footprint cannot carry falls back to a flat roof, not a broken one', () => {
  const lFootprint = [0, 0, 200, 0, 200, 80, 80, 80, 80, 200, 0, 200];
  const g = buildTileGeometry(emptyTile({ buildings: [[7, 0, 1, lFootprint]], bmeta: { 0: [0, 0, 1, 30, 1] } }), 500);
  const tops = [...attr(layerOf(g, 'buildings'), 'position')].filter((_, i) => i % 3 === 1);
  assert.ok(Math.max(...tops) < 8, 'flat roof with a parapet, no ridge');
});

test('forests become their own ground layer, drawn above grass and below roads, with trees on them', () => {
  const g = buildTileGeometry(
    emptyTile({ forest: [[[0, 0, 3000, 0, 3000, 3000, 0, 3000]]], green: [[[3500, 3500, 4500, 3500, 4500, 4500, 3500, 4500]]] }),
    500
  );
  const forest = layerOf(g, 'forest');
  const green = layerOf(g, 'green');
  assert.ok(forest && green);
  assert.ok(forest.renderOrder > green.renderOrder);
  assert.ok(layerOf(g, 'trees'), 'a wood has trees');
});

test('grass stays a clean plane: no trees on parks and pitches', () => {
  const g = buildTileGeometry(emptyTile({ green: [[[0, 0, 3000, 0, 3000, 3000, 0, 3000]]] }), 500);
  assert.ok(layerOf(g, 'green'));
  assert.equal(layerOf(g, 'trees'), undefined);
});

test('a huge forest thins its trees to stay inside the tile budget', () => {
  const g = buildTileGeometry(emptyTile({ forest: [[[0, 0, 4900, 0, 4900, 4900, 0, 4900]]] }), 500);
  const trunkAndCanopyVertices = attr(layerOf(g, 'trees'), 'position').length / 3;
  // ~420 trees x (trunk + canopy) is well under a million vertices; unbounded 7 m spacing would be 5000 trees
  assert.ok(trunkAndCanopyVertices < 420 * 120, `got ${trunkAndCanopyVertices}`);
});

test('forest ground has its own, darker material', () => {
  const m = createPulseMaterials();
  assert.notEqual(m.forest.color.getHex(), m.green.color.getHex());
  assert.equal(m.forest.depthWrite, false);
  assert.ok(m.forest.color.g < m.green.color.g);
});

test('style tags read on the server drive exactly what the renderer draws', () => {
  const style = buildingStyle({ 'building:colour': '#cc3322', 'roof:shape': 'gabled', 'roof:height': '2.5' });
  assert.deepEqual([style.wall, style.shape, style.roofHeight], [0xcc3322, 1, 2.5]);
});
