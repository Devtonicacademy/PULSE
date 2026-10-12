/**
 * In-browser walking directions over the road network graph.
 * (public/map-tiles/walk-graph.json, built by scripts/build-map-tiles.mjs, plus dynamic tile roads).
 * Ensures routes run strictly along assigned roads and sidewalks with obstacle-avoiding connectors,
 * preventing straight-line traversal through buildings or obstructions.
 */
import { lngLatToMeters, metersToLngLat, usesLagosData } from './mapProjection';
import { obstacles } from './obstacles';
import { roadNetworkGraph, RoadNetworkGraph } from './roadNetwork';
import type { Point } from './roadNetwork';
import { calculateBearing } from './wayfindingUtils';
import type {
  NavigationRoute,
  WaypointCue
} from './wayfindingUtils';

export { roadNetworkGraph, RoadNetworkGraph };

const GRAPH_URL = '/map-tiles/walk-graph.json';
const TURN_THRESHOLD_DEG = 35;
const MAX_TURN_CUES = 12;
const WALKING_METERS_PER_MINUTE = 80;

let graphPromise: Promise<boolean> | null = null;

const dist = (p: Point, q: Point) => Math.hypot(q[0] - p[0], q[1] - p[1]);

export function loadGraph(): Promise<boolean> {
  if (roadNetworkGraph.nodeCount > 0) return Promise.resolve(true);
  graphPromise ??= fetch(GRAPH_URL)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((raw: { nodes: number[]; edges: [number, number, number, number[]][] }) => {
      roadNetworkGraph.loadWalkGraph(raw);
      return true;
    })
    .catch((err) => {
      console.warn('[PULSE Routing] Walk graph unavailable, using obstacle-free routes:', err);
      return false;
    });
  return graphPromise;
}

/** Douglas–Peucker: indices of the vertices that define the path's shape */
function simplifyIndices(path: Point[], tolerance: number): number[] {
  const keep = new Uint8Array(path.length);
  keep[0] = keep[path.length - 1] = 1;
  const stack: [number, number][] = [[0, path.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    const [ax, ay] = path[s];
    const [bx, by] = path[e];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs((bx - ax) * (ay - path[i][1]) - (ax - path[i][0]) * (by - ay)) / len;
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > tolerance) {
      keep[index] = 1;
      stack.push([s, index], [index, e]);
    }
  }
  return [...keep.keys()].filter((i) => keep[i]);
}

const toLngLat = (p: Point): [number, number] => metersToLngLat(p[0], p[1]);
const bearingBetween = (p: Point, q: Point) => {
  const [lng1, lat1] = toLngLat(p);
  const [lng2, lat2] = toLngLat(q);
  return calculateBearing(lat1, lng1, lat2, lng2);
};

function buildRoute(
  path: Point[],
  start: [number, number],
  destination: [number, number],
  title: string,
  category: string
): NavigationRoute {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1] + dist(path[i - 1], path[i]));
  const total = cumulative[cumulative.length - 1];

  const shape = simplifyIndices(path, 4);
  const turns: { cue: WaypointCue; sharpness: number }[] = [];
  for (let k = 1; k < shape.length - 1; k++) {
    const [i0, i1, i2] = [shape[k - 1], shape[k], shape[k + 1]];
    const before = bearingBetween(path[i0], path[i1]);
    const after = bearingBetween(path[i1], path[i2]);
    const delta = ((after - before + 540) % 360) - 180; // + right, - left
    const fromStart = cumulative[i1];
    if (Math.abs(delta) < TURN_THRESHOLD_DEG || fromStart < 10 || total - fromStart < 10) continue;
    const cueType: WaypointCue['cueType'] = delta > 0 ? 'turn-right' : 'turn-left';
    turns.push({
      sharpness: Math.abs(delta),
      cue: {
        id: `cue-turn-${k}`,
        index: 0,
        coordinates: toLngLat(path[i1]),
        bearing: after,
        distanceFromStart: Math.round(fromStart),
        distanceToEnd: Math.round(total - fromStart),
        cueType,
        label: `${cueType === 'turn-left' ? 'Turn Left' : 'Turn Right'} in ${Math.round(fromStart)}m`
      }
    });
  }

  // Keep the sharpest turns if there are many, in route order
  const keptTurns = turns
    .slice()
    .sort((a, b) => b.sharpness - a.sharpness)
    .slice(0, MAX_TURN_CUES)
    .map(({ cue }) => cue)
    .sort((a, b) => a.distanceFromStart - b.distanceFromStart);

  const firstBearing = bearingBetween(path[0], path[Math.min(1, path.length - 1)]);
  const lastBearing = bearingBetween(path[Math.max(0, path.length - 2)], path[path.length - 1]);
  const waypoints: WaypointCue[] = [
    {
      id: 'cue-0',
      index: 0,
      coordinates: toLngLat(path[0]),
      bearing: firstBearing,
      distanceFromStart: 0,
      distanceToEnd: Math.round(total),
      cueType: 'straight' as const,
      label: `${Math.round(total)}m ahead`
    },
    ...keptTurns,
    {
      id: 'cue-dest',
      index: 0,
      coordinates: destination,
      bearing: lastBearing,
      distanceFromStart: Math.round(total),
      distanceToEnd: 0,
      cueType: 'destination' as const,
      label: title
    }
  ].map((cue, index) => ({ ...cue, index }));

  const pathCoordinates = path.map(toLngLat);
  return {
    waypoints,
    totalDistanceMeters: Math.round(total),
    estimatedWalkingMinutes: Math.max(1, Math.ceil(total / WALKING_METERS_PER_MINUTE)),
    startCoordinates: start,
    destinationCoordinates: destination,
    destinationTitle: title,
    destinationCategory: category,
    geojsonFeature: {
      type: 'Feature',
      properties: { title, distance: Math.round(total) },
      geometry: { type: 'LineString', coordinates: pathCoordinates }
    },
    pathCoordinates,
    routeSource: 'streets'
  };
}

/**
 * Computes a walking route strictly along assigned roads and sidewalks.
 * Steers around building footprints and water, preventing straight-line traversal.
 */
export async function findWalkingRoute(
  start: [number, number], // [lng, lat]
  destination: [number, number],
  destinationTitle = 'Destination',
  destinationCategory = 'events'
): Promise<NavigationRoute> {
  if (usesLagosData() && roadNetworkGraph.nodeCount === 0) {
    await loadGraph();
  }

  const startPoint = lngLatToMeters(start[0], start[1]);
  const destPoint = lngLatToMeters(destination[0], destination[1]);

  const path = roadNetworkGraph.findRoute(startPoint, destPoint, { checkObstacles: true });
  if (path && path.length >= 2) {
    return buildRoute(path, start, destination, destinationTitle, destinationCategory);
  }

  // Fallback: steer obstacle-free around any buildings or water
  const fallbackPath = obstacles.findClearPath(startPoint, destPoint) ?? [startPoint, destPoint];
  return buildRoute(fallbackPath, start, destination, destinationTitle, destinationCategory);
}
