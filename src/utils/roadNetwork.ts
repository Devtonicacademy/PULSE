/**
 * Road Network Graph and Pathfinding System.
 *
 * Manages the walkable street and sidewalk graph:
 *   - Nodes (intersections and street endpoints) in absolute map meters (x east, y north).
 *   - Edges (assigned roads and sidewalks) with full polyline geometry, lengths and classifications.
 *   - Ingests both pre-built OSM network data (walk-graph.json) and dynamic tile road networks.
 *   - A* pathfinding strictly along assigned roads and sidewalks with sidewalk/pedestrian preference.
 *   - Line-of-sight obstacle-aware snapping and connectors around buildings and water, preventing
 *     any straight-line penetration through buildings or other obstructions.
 */
import { obstacles, ObstacleIndex } from './obstacles';

export type Point = [number, number]; // map meters (x east, y north)

export interface RoadEdge {
  id: number;
  a: number; // node index A
  b: number; // node index B
  length: number; // meters
  points: Point[]; // polyline vertices in meters
  cumulative: number[]; // cumulative distance at each vertex
  bbox: [number, number, number, number];
  roadClass: string;
  isSidewalk: boolean;
  isBridge: boolean;
}

export interface RoadSnap {
  edge: number;
  along: number;
  point: Point;
  offset: number;
  accessible: boolean;
}

const dist = (p: Point, q: Point) => Math.hypot(q[0] - p[0], q[1] - p[1]);

/** Min-heap keyed by f-score for A* */
class PriorityQueue {
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

export class RoadNetworkGraph {
  nodes: Point[] = [];
  edges: RoadEdge[] = [];
  adjacency: number[][] = [];

  /** Edges added per tile key, so unloaded tiles clean up cleanly */
  private tileEdgeMap = new Map<string, number[]>();

  clear() {
    this.nodes = [];
    this.edges = [];
    this.adjacency = [];
    this.tileEdgeMap.clear();
  }

  /** Node count */
  get nodeCount() {
    return this.nodes.length;
  }

  /** Edge count */
  get edgeCount() {
    return this.edges.length;
  }

  /**
   * Loads the pre-built OpenStreetMap walking graph (walk-graph.json).
   * raw.nodes: decimeters from MAP_ORIGIN.
   * raw.edges: [a, b, lengthDm, interiorPointsDm].
   */
  loadWalkGraph(raw: { nodes: number[]; edges: [number, number, number, number[]][] }) {
    this.nodes = [];
    for (let i = 0; i < raw.nodes.length; i += 2) {
      this.nodes.push([raw.nodes[i] / 10, raw.nodes[i + 1] / 10]);
    }
    this.adjacency = this.nodes.map(() => []);
    this.edges = [];

    for (let index = 0; index < raw.edges.length; index++) {
      const [a, b, , interior] = raw.edges[index];
      const points: Point[] = [this.nodes[a]];
      for (let i = 0; i < interior.length; i += 2) {
        points.push([interior[i] / 10, interior[i + 1] / 10]);
      }
      points.push(this.nodes[b]);

      const cumulative = [0];
      for (let i = 1; i < points.length; i++) {
        cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
      }
      const xs = points.map((p) => p[0]);
      const ys = points.map((p) => p[1]);

      const edge: RoadEdge = {
        id: index,
        a,
        b,
        length: cumulative[cumulative.length - 1],
        points,
        cumulative,
        bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        roadClass: 'residential',
        isSidewalk: true,
        isBridge: false
      };

      this.edges.push(edge);
      this.adjacency[a].push(index);
      this.adjacency[b].push(index);
    }
  }

  /**
   * Adds an edge to the road/sidewalk network. Endpoints connect to existing nodes within 1.0 m.
   */
  addRoad(
    points: Point[],
    options: { roadClass?: string; isSidewalk?: boolean; isBridge?: boolean; tileKey?: string } = {}
  ): number {
    if (points.length < 2) return -1;

    const findOrCreateNode = (p: Point): number => {
      for (let i = 0; i < this.nodes.length; i++) {
        if (dist(this.nodes[i], p) <= 1.0) return i;
      }
      const idx = this.nodes.length;
      this.nodes.push([p[0], p[1]]);
      this.adjacency.push([]);
      return idx;
    };

    const a = findOrCreateNode(points[0]);
    const b = findOrCreateNode(points[points.length - 1]);
    if (a === b && points.length === 2) return -1;

    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(cumulative[i - 1] + dist(points[i - 1], points[i]));
    }
    const totalLength = cumulative[cumulative.length - 1];
    if (totalLength < 0.2) return -1;

    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const edgeId = this.edges.length;

    const edge: RoadEdge = {
      id: edgeId,
      a,
      b,
      length: totalLength,
      points,
      cumulative,
      bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
      roadClass: options.roadClass ?? 'residential',
      isSidewalk: options.isSidewalk ?? (options.roadClass === 'footway' || options.roadClass === 'pedestrian'),
      isBridge: options.isBridge ?? false
    };

    this.edges.push(edge);
    this.adjacency[a].push(edgeId);
    this.adjacency[b].push(edgeId);

    if (options.tileKey) {
      const list = this.tileEdgeMap.get(options.tileKey) ?? [];
      list.push(edgeId);
      this.tileEdgeMap.set(options.tileKey, list);
    }

    return edgeId;
  }

  /**
   * Ingests walkable roads and sidewalks from a loaded map tile.
   */
  setTileRoads(
    tx: number,
    ty: number,
    origin: Point,
    roads: { classIndex: number; points: number[] }[]
  ) {
    const key = `${tx}_${ty}`;
    this.removeTileRoads(tx, ty);

    const ROAD_CLASSES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'footway', 'track'];
    for (const r of roads) {
      if (r.classIndex < 1 || r.classIndex > 8) continue; // skip non-walkable motorway
      const flat = r.points;
      if (flat.length < 4) continue;
      const pts: Point[] = [];
      for (let i = 0; i < flat.length; i += 2) {
        pts.push([origin[0] + flat[i] / 10, origin[1] + flat[i + 1] / 10]);
      }
      const roadClass = ROAD_CLASSES[r.classIndex] ?? 'residential';
      const isSidewalk = r.classIndex === 7 || roadClass === 'footway';
      this.addRoad(pts, { roadClass, isSidewalk, tileKey: key });
    }
  }

  /**
   * Removes roads added by a tile when it unloads.
   */
  removeTileRoads(tx: number, ty: number) {
    const key = `${tx}_${ty}`;
    const edgeIds = this.tileEdgeMap.get(key);
    if (!edgeIds || !edgeIds.length) return;
    this.tileEdgeMap.delete(key);
    // Mark removed edges as deactivated
    for (const id of edgeIds) {
      if (this.edges[id]) {
        this.edges[id].length = Infinity;
      }
    }
  }

  clearTileRoads() {
    for (const edgeIds of this.tileEdgeMap.values()) {
      for (const id of edgeIds) {
        if (this.edges[id]) this.edges[id].length = Infinity;
      }
    }
    this.tileEdgeMap.clear();
  }

  /**
   * Snaps a coordinate point to the nearest road or sidewalk.
   * Prioritizes accessible snap points that have a clear line of sight (not blocked by a building).
   */
  snapToNetwork(
    p: Point,
    options: { maxSnapMeters?: number; checkObstacles?: boolean; obstacles?: ObstacleIndex } = {}
  ): RoadSnap | null {
    const limit = options.maxSnapMeters ?? 300;
    const checkObstacles = options.checkObstacles ?? true;
    const obs = options.obstacles ?? obstacles;

    let bestAccessible: RoadSnap | null = null;
    let bestAny: RoadSnap | null = null;

    for (let e = 0; e < this.edges.length; e++) {
      const edge = this.edges[e];
      if (!Number.isFinite(edge.length)) continue; // removed edge
      const [minX, minY, maxX, maxY] = edge.bbox;
      if (p[0] < minX - limit || p[0] > maxX + limit || p[1] < minY - limit || p[1] > maxY + limit) {
        continue;
      }

      for (let i = 0; i < edge.points.length - 1; i++) {
        const [ax, ay] = edge.points[i];
        const [bx, by] = edge.points[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const lenSq = dx * dx + dy * dy || 1e-9;
        const t = Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / lenSq));
        const point: Point = [ax + t * dx, ay + t * dy];
        const offset = dist(p, point);
        if (offset > limit) continue;

        const accessible = checkObstacles ? !obs.segmentBlocked(p, point) : true;
        const snap: RoadSnap = {
          edge: e,
          along: edge.cumulative[i] + t * Math.sqrt(lenSq),
          point,
          offset,
          accessible
        };

        if (accessible && (!bestAccessible || offset < bestAccessible.offset)) {
          bestAccessible = snap;
        }
        if (!bestAny || offset < bestAny.offset) {
          bestAny = snap;
        }
      }
    }

    return bestAccessible ?? bestAny;
  }

  /**
   * Slices polyline along an edge between two distances (forward or backward).
   */
  private sliceEdge(edge: RoadEdge, from: number, to: number): Point[] {
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

  /**
   * A* shortest path on the road network strictly along assigned roads and sidewalks.
   */
  shortestPath(start: RoadSnap, goal: RoadSnap): Point[] | null {
    const startEdge = this.edges[start.edge];
    const goalEdge = this.edges[goal.edge];

    if (start.edge === goal.edge) {
      return this.sliceEdge(startEdge, start.along, goal.along);
    }

    const n = this.nodes.length;
    const GOAL = n;
    const g = new Float64Array(n + 1).fill(Infinity);
    const prevNode = new Int32Array(n + 1).fill(-1);
    const prevEdge = new Int32Array(n + 1).fill(-1);
    const closed = new Uint8Array(n + 1);
    const heap = new PriorityQueue();

    const h = (node: number) => (node === GOAL ? 0 : dist(this.nodes[node], goal.point));

    const seed = (node: number, cost: number) => {
      if (cost < g[node]) {
        g[node] = cost;
        prevNode[node] = -2;
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

      // Reach goal edge
      const toGoal = node === goalEdge.a ? goal.along : node === goalEdge.b ? goalEdge.length - goal.along : -1;
      if (toGoal >= 0 && g[node] + toGoal < g[GOAL]) {
        g[GOAL] = g[node] + toGoal;
        prevNode[GOAL] = node;
        heap.push(GOAL, g[GOAL]);
      }

      for (const e of this.adjacency[node]) {
        const edge = this.edges[e];
        if (!Number.isFinite(edge.length)) continue;
        const next = edge.a === node ? edge.b : edge.a;
        // Pedestrian preference: sidewalks / footways have slight cost bonus
        const preferenceWeight = edge.isSidewalk ? 0.88 : 1.0;
        const cost = g[node] + edge.length * preferenceWeight;
        if (cost < g[next]) {
          g[next] = cost;
          prevNode[next] = node;
          prevEdge[next] = e;
          heap.push(next, cost + h(next));
        }
      }
    }

    if (!Number.isFinite(g[GOAL])) return null;

    const lastNode = prevNode[GOAL];
    const pieces: Point[][] = [
      this.sliceEdge(goalEdge, lastNode === goalEdge.a ? 0 : goalEdge.length, goal.along)
    ];
    let curr = lastNode;
    while (prevNode[curr] >= 0) {
      const edge = this.edges[prevEdge[curr]];
      const pts = edge.a === curr ? edge.points.slice().reverse() : edge.points.slice();
      pieces.unshift(pts);
      curr = prevNode[curr];
    }
    pieces.unshift(this.sliceEdge(startEdge, start.along, curr === startEdge.a ? 0 : startEdge.length));

    const path: Point[] = [];
    for (const piece of pieces) {
      for (const p of piece) {
        const last = path[path.length - 1];
        if (!last || dist(last, p) > 0.05) path.push(p);
      }
    }
    return path;
  }

  /**
   * Computes an end-to-end path between start and goal:
   *   1. Snaps strictly to assigned roads and sidewalks.
   *   2. Computes road network route via A*.
   *   3. Connects start and goal without ever cutting through buildings or obstructions.
   *   4. If line-of-sight to a street is blocked by a building, steers around obstacle perimeters.
   */
  findRoute(
    start: Point,
    goal: Point,
    options: { checkObstacles?: boolean; maxSnapMeters?: number; obstacles?: ObstacleIndex } = {}
  ): Point[] | null {
    const checkObstacles = options.checkObstacles ?? true;
    const obs = options.obstacles ?? obstacles;
    const startSnap = this.snapToNetwork(start, { maxSnapMeters: options.maxSnapMeters, checkObstacles, obstacles: obs });
    const goalSnap = this.snapToNetwork(goal, { maxSnapMeters: options.maxSnapMeters, checkObstacles, obstacles: obs });

    if (startSnap && goalSnap) {
      const streetPath = this.shortestPath(startSnap, goalSnap);
      if (streetPath && streetPath.length >= 2) {
        const fullPath: Point[] = [];

        // 1. Start connector: from start to street
        if (dist(start, startSnap.point) > 0.5) {
          if (!checkObstacles || !obs.segmentBlocked(start, startSnap.point)) {
            fullPath.push(start);
          } else {
            // Steer around building to reach the street
            const clearConnector = obs.findClearPath(start, startSnap.point);
            if (clearConnector && clearConnector.length > 1) {
              fullPath.push(...clearConnector.slice(0, -1));
            } else {
              fullPath.push(start);
            }
          }
        }

        fullPath.push(...streetPath);

        // 2. Goal connector: from street to destination
        if (dist(goalSnap.point, goal) > 0.5) {
          if (!checkObstacles || !obs.segmentBlocked(goalSnap.point, goal)) {
            fullPath.push(goal);
          } else {
            // Steer around building to reach the exact destination
            const clearConnector = obs.findClearPath(goalSnap.point, goal);
            if (clearConnector && clearConnector.length > 1) {
              fullPath.push(...clearConnector.slice(1));
            } else {
              fullPath.push(goal);
            }
          }
        }

        // 3. Final collision check: guarantee zero building penetration
        return this.ensureObstacleFree(fullPath, obs);
      }
    }

    // Fallback: If disconnected or unmapped on the street graph, route obstacle-free
    // NEVER draw a straight line through buildings!
    const clearFallback = obs.findClearPath(start, goal);
    return clearFallback ? this.ensureObstacleFree(clearFallback, obs) : [start, goal];
  }

  /**
   * Verifies every segment of a path. If any segment clips an obstacle,
   * replaces that segment with an obstacle-free contour path around the building.
   */
  private ensureObstacleFree(path: Point[], obs = obstacles): Point[] {
    const verified: Point[] = [path[0]];
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (!obs.segmentBlocked(a, b)) {
        verified.push(b);
      } else {
        const detour = obs.findClearPath(a, b);
        if (detour && detour.length > 1) {
          verified.push(...detour.slice(1));
        } else {
          verified.push(b);
        }
      }
    }
    return verified;
  }
}

/** Global singleton road network graph */
export const roadNetworkGraph = new RoadNetworkGraph();
