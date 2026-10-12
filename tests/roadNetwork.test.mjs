// Tests for the Road Network Graph and Pathfinding System:
// Verifies routes strictly follow assigned roads and sidewalks, and prevent straight-line traversal through buildings or obstructions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tsResolve.mjs', import.meta.url);

const { ObstacleIndex } = await import('../src/utils/obstacles.ts');
const { RoadNetworkGraph } = await import('../src/utils/roadNetwork.ts');
const { findWalkingRoute } = await import('../src/utils/walkingRouter.ts');
const { setMapOrigin, VI_ORIGIN } = await import('../src/utils/mapProjection.ts');

setMapOrigin(VI_ORIGIN, 'vi');

const box = (x0, y0, x1, y1) => [x0 * 10, y0 * 10, x1 * 10, y0 * 10, x1 * 10, y1 * 10, x0 * 10, y1 * 10];

test('findClearPath returns direct line when unobstructed', () => {
  const obstacles = new ObstacleIndex(500);
  obstacles.setTile(0, 0, [0, 0], { buildings: [], water: [], bridges: [] });

  const path = obstacles.findClearPath([10, 10], [50, 50]);
  assert.ok(path);
  assert.equal(path.length, 2);
  assert.deepEqual(path[0], [10, 10]);
  assert.deepEqual(path[1], [50, 50]);
});

test('findClearPath navigates around a building footprint without straight-line penetration', () => {
  const obstacles = new ObstacleIndex(500);
  // Building blocking direct path from [10, 30] to [50, 30]
  obstacles.setTile(0, 0, [0, 0], {
    buildings: [[box(20, 20, 40, 40)]],
    water: [],
    bridges: []
  });

  assert.equal(obstacles.segmentBlocked([10, 30], [50, 30]), true, 'direct segment is blocked');

  const path = obstacles.findClearPath([10, 30], [50, 30]);
  assert.ok(path, 'found clear detour path');
  assert.ok(path.length >= 3, 'path has detour waypoints');
  assert.deepEqual(path[0], [10, 30]);
  assert.deepEqual(path[path.length - 1], [50, 30]);

  // Verify that EVERY segment in the resulting path is completely collision-free
  for (let i = 0; i < path.length - 1; i++) {
    const blocked = obstacles.segmentBlocked(path[i], path[i + 1]);
    assert.equal(blocked, false, `segment ${i} -> ${i + 1} must not be blocked`);
  }

  // Verify no waypoint is inside the building
  for (const pt of path) {
    assert.equal(obstacles.blocked(pt), false, `waypoint [${pt[0]}, ${pt[1]}] must not be inside obstacle`);
  }
});

test('RoadNetworkGraph adds roads and marks footways as sidewalks', () => {
  const graph = new RoadNetworkGraph();
  const r1 = graph.addRoad([[0, 0], [100, 0]], { roadClass: 'primary' });
  const r2 = graph.addRoad([[100, 0], [100, 100]], { roadClass: 'footway' });

  assert.equal(graph.nodeCount, 3);
  assert.equal(graph.edgeCount, 2);
  assert.equal(graph.edges[r1].isSidewalk, false);
  assert.equal(graph.edges[r2].isSidewalk, true);
});

test('snapToNetwork prioritizes accessible roads over obstructed roads', () => {
  const obstacles = new ObstacleIndex(500);
  // Building between point [50, 25] and street edge at y=20
  obstacles.setTile(0, 0, [0, 0], {
    buildings: [[box(20, 15, 80, 22)]],
    water: [],
    bridges: []
  });

  const graph = new RoadNetworkGraph();
  // Edge 1 at y=10 (blocked from [50, 25] by building at y=15..22)
  graph.addRoad([[0, 10], [100, 10]], { roadClass: 'residential' });
  // Edge 2 at y=40 (clear line of sight from [50, 25])
  graph.addRoad([[0, 40], [100, 40]], { roadClass: 'footway' });

  // Direct snap without obstacle check would pick Edge 1 (distance 15m vs 15m)
  // With checkObstacles=true, must select the accessible edge (Edge 2 at y=40)
  const snap = graph.snapToNetwork([50, 25], { checkObstacles: true, obstacles });
  assert.ok(snap);
  assert.equal(snap.edge, 1, 'snaps to accessible sidewalk at y=40');
  assert.equal(snap.accessible, true);
});

test('findRoute computes path strictly along assigned roads and sidewalks', () => {
  const graph = new RoadNetworkGraph();
  // Grid of streets:
  // (0,0) -> (100,0) -> (100,100) -> (0,100) -> (0,0)
  graph.addRoad([[0, 0], [100, 0]], { roadClass: 'residential' });
  graph.addRoad([[100, 0], [100, 100]], { roadClass: 'footway', isSidewalk: true });
  graph.addRoad([[100, 100], [0, 100]], { roadClass: 'residential' });
  graph.addRoad([[0, 100], [0, 0]], { roadClass: 'footway', isSidewalk: true });

  const route = graph.findRoute([0, 10], [90, 100]);
  assert.ok(route, 'computed route along street network');
  assert.ok(route.length >= 3);

  // All vertices must lie on the streets/sidewalks
  for (const pt of route) {
    const onBottom = Math.abs(pt[1] - 0) < 1 && pt[0] >= -1 && pt[0] <= 101;
    const onRight = Math.abs(pt[0] - 100) < 1 && pt[1] >= -1 && pt[1] <= 101;
    const onTop = Math.abs(pt[1] - 100) < 1 && pt[0] >= -1 && pt[0] <= 101;
    const onLeft = Math.abs(pt[0] - 0) < 1 && pt[1] >= -1 && pt[1] <= 101;
    assert.ok(onBottom || onRight || onTop || onLeft, `vertex [${pt[0]}, ${pt[1]}] is on a street`);
  }
});

test('findRoute prevents straight-line cutting through buildings between street and entrance', () => {
  const obstacles = new ObstacleIndex(500);
  // Building between destination [50, 30] and street at y=0
  obstacles.setTile(0, 0, [0, 0], {
    buildings: [[box(20, 10, 80, 25)]],
    water: [],
    bridges: []
  });

  const graph = new RoadNetworkGraph();
  graph.addRoad([[0, 0], [100, 0]], { roadClass: 'residential' });
  graph.addRoad([[100, 0], [100, 50]], { roadClass: 'footway' });

  // Routing from street start [0, 0] to venue behind building [50, 30]
  const route = graph.findRoute([0, 0], [50, 30], { checkObstacles: true, obstacles });
  assert.ok(route);

  // Verify that NO segment in the route traverses through the building footprint
  for (let i = 0; i < route.length - 1; i++) {
    assert.equal(
      obstacles.segmentBlocked(route[i], route[i + 1]),
      false,
      `segment ${route[i]} -> ${route[i + 1]} must not cut through building`
    );
  }
});

test('tile roads ingest dynamically and unload cleanly', () => {
  const graph = new RoadNetworkGraph();
  assert.equal(graph.edgeCount, 0);

  graph.setTileRoads(0, 0, [0, 0], [
    { classIndex: 5, points: [0, 0, 1000, 0] }, // residential road: [0,0] to [100,0]
    { classIndex: 7, points: [1000, 0, 1000, 1000] } // footway / sidewalk: [100,0] to [100,100]
  ]);

  assert.equal(graph.edgeCount, 2);
  assert.equal(graph.edges[0].roadClass, 'residential');
  assert.equal(graph.edges[1].isSidewalk, true);

  graph.removeTileRoads(0, 0);
  // Edges from that tile are deactivated
  assert.equal(Number.isFinite(graph.edges[0].length), false);
  assert.equal(Number.isFinite(graph.edges[1].length), false);
});
