/**
 * In-browser walking directions over the OpenStreetMap street network
 * (public/map-tiles/walk-graph.json, built by scripts/build-map-tiles.mjs).
 * No routing server: the graph is a few hundred KB and A* runs in milliseconds.
 */
import { lngLatToMeters, metersToLngLat, usesLagosData } from './mapProjection';
import { obstacles } from './obstacles';
import {
  generateStreetNavigationRoute,
  calculateBearing,
  NavigationRoute,
  WaypointCue
} from './wayfindingUtils';

type Point = [number, number]; // map meters (x east, y north)

interface Edge {
  a: number;
  b: number;
  length: number;
  /** Full polyline a -> b, in meters */
  points: Point[];
  /** Cumulative distance at each polyline vertex */
  cumulative: number[];
  bbox: [number, number, number, number];
}

interface Graph {
  nodes: Point[];
  edges: Edge[];
  /** node -> list of edge indices */
  adjacency: number[][];
}

interface Snap {
  edge: number;
  /** Distance along the edge from node a */
  along: number;
  point: Point;
  offset: number;
}

const GRAPH_URL = '/map-tiles/walk-graph.json';
/** Farther than this from any mapped street, we can't route (outside coverage) */
const MAX_SNAP_METERS = 250;
/** The leg from the street to the exact start or end point may be this long at most */
const MAX_CONNECTOR_METERS = 40;
const TURN_THRESHOLD_DEG = 35;
const MAX_TURN_CUES = 12;
const WALKING_METERS_PER_MINUTE = 80;

let graphPromise: Promise<Graph | null> | null = null;

const dist = (p: Point, q: Point) => Math.hypot(q[0] - p[0], q[1] - p[1]);

/**
 * Whether the short leg between a street point and the exact start/end can be walked: close enough
 * and not through a building or water. Otherwise the route stays on the street and ends there.
 */
const connectorOk = (street: Point, exact: Point) => dist(street, exact) <= MAX_CONNECTOR_METERS && !obstacles.segmentBlocked(street, exact);

function loadGraph(): Promise<Graph | null> {
  graphPromise ??= fetch(GRAPH_URL)
    .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((raw: { nodes: number[]; edges: [number, number, number, number[]][] }) => {
      const nodes: Point[] = [];
      for (let i = 0; i < raw.nodes.length; i += 2) nodes.push([raw.nodes[i] / 10, raw.nodes[i + 1] / 10]);
      const adjacency: number[][] = nodes.map(() => []);
      const edges: Edge[] = raw.edges.map(([a, b, , interior], index) => {
        const points: Point[] = [nodes[a]];
        for (let i = 0; i < interior.length; i += 2) points.push([interior[i] / 10, interior[i + 1] / 10]);
        points.push(nodes[b]);
        const cumulative = [0];
        for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        adjacency[a].push(index);
        adjacency[b].push(index);
        return {
          a,
          b,
          length: cumulative[cumulative.length - 1],
          points,
          cumulative,
          bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
        };
      });
      return { nodes, edges, adjacency };
    })
    .catch((err) => {
      console.warn('[PULSE Routing] Walk graph unavailable, using estimated routes:', err);
      return null;
    });
  return graphPromise;
}

/** Nearest point on the street network */
function snapToNetwork(graph: Graph, p: Point): Snap | null {
  let best: Snap | null = null;
  for (let e = 0; e < graph.edges.length; e++) {
    const edge = graph.edges[e];
    const [minX, minY, maxX, maxY] = edge.bbox;
    const limit = best ? best.offset : MAX_SNAP_METERS;
    if (p[0] < minX - limit || p[0] > maxX + limit || p[1] < minY - limit || p[1] > maxY + limit) continue;
    for (let i = 0; i < edge.points.length - 1; i++) {
      const [ax, ay] = edge.points[i];
      const [bx, by] = edge.points[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy || 1e-9;
      const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / lenSq));
      const point: Point = [ax + t * dx, ay + t * dy];
      const offset = dist(p, point);
      if (offset <= limit && (!best || offset < best.offset)) {
        best = { edge: e, along: edge.cumulative[i] + t * Math.sqrt(lenSq), point, offset };
      }
    }
  }
  return best;
}

/** Polyline along an edge between two distances (either direction) */
function sliceEdge(edge: Edge, from: number, to: number): Point[] {
  const forward = from <= to;
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const at = (d: number): Point => {
    let i = 1;
    while (i < edge.cumulative.length - 1 && edge.cumulative[i] < d) i++;
    const segStart = edge.cumulative[i - 1];
    const segLen = edge.cumulative[i] - segStart || 1e-9;
    const t = Math.max(0, Math.min(1, (d - segStart) / segLen));
    const [ax, ay] = edge.points[i - 1];
    const [bx, by] = edge.points[i];
    return [ax + t * (bx - ax), ay + t * (by - ay)];
  };
  const out: Point[] = [at(lo)];
  edge.cumulative.forEach((c, i) => {
    if (c > lo && c < hi) out.push(edge.points[i]);
  });
  out.push(at(hi));
  return forward ? out : out.reverse();
}

/** Min-heap keyed by f-score */
class Heap {
  private items: { node: number; f: number }[] = [];
  get size() {
    return this.items.length;
  }
  push(node: number, f: number) {
    const items = this.items;
    items.push({ node, f });
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }
  pop(): number {
    const items = this.items;
    const top = items[0];
    const last = items.pop()!;
    if (items.length) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < items.length && items[l].f < items[m].f) m = l;
        if (r < items.length && items[r].f < items[m].f) m = r;
        if (m === i) break;
        [items[m], items[i]] = [items[i], items[m]];
        i = m;
      }
    }
    return top.node;
  }
}

/**
 * A* from a point on one edge to a point on another. Returns the street path in
 * meters, or null when the two points aren't connected on the network.
 */
function shortestPath(graph: Graph, start: Snap, goal: Snap): Point[] | null {
  const startEdge = graph.edges[start.edge];
  const goalEdge = graph.edges[goal.edge];

  // Both on the same street segment: walk straight along it
  const direct = start.edge === goal.edge ? Math.abs(goal.along - start.along) : Infinity;

  const n = graph.nodes.length;
  const GOAL = n; // virtual node
  const g = new Float64Array(n + 1).fill(Infinity);
  const prevNode = new Int32Array(n + 1).fill(-1);
  const prevEdge = new Int32Array(n + 1).fill(-1);
  const closed = new Uint8Array(n + 1);
  const heap = new Heap();
  const h = (node: number) => (node === GOAL ? 0 : dist(graph.nodes[node], goal.point));

  const seed = (node: number, cost: number) => {
    if (cost < g[node]) {
      g[node] = cost;
      prevNode[node] = -2; // reached directly from the start point
      heap.push(node, cost + h(node));
    }
  };
  seed(startEdge.a, start.along);
  seed(startEdge.b, startEdge.length - start.along);

  while (heap.size) {
    const node = heap.pop();
    if (closed[node]) continue;
    closed[node] = 1;
    if (node === GOAL) break;
    if (g[node] >= direct) break;

    // Step onto the goal edge
    const toGoal = node === goalEdge.a ? goal.along : node === goalEdge.b ? goalEdge.length - goal.along : -1;
    if (toGoal >= 0 && g[node] + toGoal < g[GOAL]) {
      g[GOAL] = g[node] + toGoal;
      prevNode[GOAL] = node;
      heap.push(GOAL, g[GOAL]);
    }

    for (const e of graph.adjacency[node]) {
      const edge = graph.edges[e];
      const next = edge.a === node ? edge.b : edge.a;
      const cost = g[node] + edge.length;
      if (cost < g[next]) {
        g[next] = cost;
        prevNode[next] = node;
        prevEdge[next] = e;
        heap.push(next, cost + h(next));
      }
    }
  }

  if (direct <= g[GOAL]) return sliceEdge(startEdge, start.along, goal.along);
  if (!Number.isFinite(g[GOAL])) return null;

  // Walk back from the goal, collecting street geometry
  const lastNode = prevNode[GOAL];
  const pieces: Point[][] = [
    sliceEdge(goalEdge, lastNode === goalEdge.a ? 0 : goalEdge.length, goal.along)
  ];
  let node = lastNode;
  while (prevNode[node] >= 0) {
    const edge = graph.edges[prevEdge[node]];
    const pts = edge.a === node ? edge.points.slice().reverse() : edge.points.slice();
    pieces.unshift(pts); // runs prevNode[node] -> node
    node = prevNode[node];
  }
  pieces.unshift(sliceEdge(startEdge, start.along, node === startEdge.a ? 0 : startEdge.length));

  const path: Point[] = [];
  for (const piece of pieces) {
    for (const p of piece) {
      const last = path[path.length - 1];
      if (!last || dist(last, p) > 0.05) path.push(p);
    }
  }
  return path;
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

function buildRoute(path: Point[], start: [number, number], destination: [number, number], title: string, category: string): NavigationRoute {
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
    turns.push({ sharpness: Math.abs(delta), cue: {
      id: `cue-turn-${k}`,
      index: 0,
      coordinates: toLngLat(path[i1]),
      bearing: after,
      distanceFromStart: Math.round(fromStart),
      distanceToEnd: Math.round(total - fromStart),
      cueType,
      label: `${cueType === 'turn-left' ? 'Turn Left' : 'Turn Right'} in ${Math.round(fromStart)}m`
    } });
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
 * Walking route along real streets. Falls back to the estimated route when either end
 * is outside the mapped areas, the two ends aren't connected, or the graph can't load.
 */
export async function findWalkingRoute(
  start: [number, number], // [lng, lat]
  destination: [number, number],
  destinationTitle = 'Destination',
  destinationCategory = 'events'
): Promise<NavigationRoute> {
  const fallback = () => generateStreetNavigationRoute(start, destination, destinationTitle, destinationCategory);
  // The street graph is Lagos-only; elsewhere the estimated route is the honest answer
  const graph = usesLagosData() ? await loadGraph() : null;
  if (!graph) return fallback();

  const startPoint = lngLatToMeters(start[0], start[1]);
  const destPoint = lngLatToMeters(destination[0], destination[1]);
  const startSnap = snapToNetwork(graph, startPoint);
  const goalSnap = snapToNetwork(graph, destPoint);
  if (!startSnap || !goalSnap) return fallback();

  const street = shortestPath(graph, startSnap, goalSnap);
  if (!street || street.length < 2) return fallback();

  // Walk from the exact start to the street, and from the street to the exact spot
  // (only when that leg is short and clear: the route itself never leaves the streets otherwise)
  const path: Point[] = [];
  if (startSnap.offset > 2 && connectorOk(startSnap.point, startPoint)) path.push(startPoint);
  path.push(...street);
  if (goalSnap.offset > 2 && connectorOk(goalSnap.point, destPoint)) path.push(destPoint);
  return buildRoute(path, start, destination, destinationTitle, destinationCategory);
}
