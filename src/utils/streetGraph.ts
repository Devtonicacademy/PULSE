/**
 * The street network used for walking routes, built from the roads of the map tiles that are loaded.
 *
 * Roads arrive as separate polylines (one per OpenStreetMap way, cut at tile edges). Two polylines are
 * connected where a vertex of one lies within JOIN_METERS of a vertex of the other: they then share a
 * node. Every polyline is split at its shared nodes into edges, so the router can turn at any junction
 * and cross a tile edge without a seam. Two roads that merely cross (a bridge over a street) share no
 * vertex and stay unconnected.
 */

export type Point = [number, number]; // map meters (x east, y north)

export interface Edge {
  a: number;
  b: number;
  length: number;
  /** Full polyline a -> b, in meters */
  points: Point[];
  /** Cumulative distance at each polyline vertex */
  cumulative: number[];
  bbox: [number, number, number, number];
}

export interface Graph {
  nodes: Point[];
  edges: Edge[];
  /** node -> list of edge indices */
  adjacency: number[][];
}

/** Road ends and vertices closer than this are the same junction */
export const JOIN_METERS = 0.5;
/** Index into the tile road classes (server ROAD_CLASSES): motorways are not walkable */
const MOTORWAY_CLASS = 0;
/** Edges shorter than this are noise (a polyline that doubles back on a single node) */
const MIN_EDGE_METERS = 0.2;

/** Builds the graph from road polylines */
export function buildGraph(lines: Point[][]): Graph {
  const nodes: Point[] = [];
  const cells = new Map<string, number[]>();
  const cellOf = (v: number) => Math.floor(v / JOIN_METERS);

  /** The node within JOIN_METERS of p, or a new one */
  const nodeAt = (p: Point): number => {
    const cx = cellOf(p[0]);
    const cy = cellOf(p[1]);
    let best = -1;
    let bestDist = JOIN_METERS;
    for (let x = cx - 1; x <= cx + 1; x++) {
      for (let y = cy - 1; y <= cy + 1; y++) {
        for (const id of cells.get(`${x},${y}`) ?? []) {
          const d = Math.hypot(nodes[id][0] - p[0], nodes[id][1] - p[1]);
          if (d <= bestDist) {
            best = id;
            bestDist = d;
          }
        }
      }
    }
    if (best >= 0) return best;
    const id = nodes.length;
    nodes.push(p);
    const key = `${cx},${cy}`;
    const list = cells.get(key);
    if (list) list.push(id);
    else cells.set(key, [id]);
    return id;
  };

  // 1. Every vertex becomes a node (merged within JOIN_METERS); count how often each node is used
  const used = new Map<number, number>();
  const bump = (id: number, by: number) => used.set(id, (used.get(id) ?? 0) + by);
  const chains = lines
    .filter((line) => line.length >= 2)
    .map((line) => {
      const ids = line.map((p) => nodeAt(p));
      ids.forEach((id, i) => bump(id, i === 0 || i === ids.length - 1 ? 2 : 1));
      return ids;
    });

  // 2. Split every chain where it meets another (or ends) and keep the stretches as edges
  const edges: Edge[] = [];
  const adjacency: number[][] = nodes.map(() => []);
  for (const ids of chains) {
    let start = 0;
    for (let i = 1; i < ids.length; i++) {
      const isVertex = i === ids.length - 1 || (used.get(ids[i]) ?? 0) > 1;
      if (!isVertex) continue;
      const points: Point[] = ids.slice(start, i + 1).map((id) => nodes[id]);
      const cumulative = [0];
      for (let k = 1; k < points.length; k++) {
        cumulative.push(cumulative[k - 1] + Math.hypot(points[k][0] - points[k - 1][0], points[k][1] - points[k - 1][1]));
      }
      const length = cumulative[cumulative.length - 1];
      if (length >= MIN_EDGE_METERS) {
        const xs = points.map((p) => p[0]);
        const ys = points.map((p) => p[1]);
        const index = edges.length;
        edges.push({
          a: ids[start],
          b: ids[i],
          length,
          points,
          cumulative,
          bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
        });
        adjacency[ids[start]].push(index);
        if (ids[i] !== ids[start]) adjacency[ids[i]].push(index);
      }
      start = i;
    }
  }
  return { nodes, edges, adjacency };
}

/** How many separate pieces the network falls into, and the size (in edges) of the biggest */
export function connectedComponents(graph: Graph): { count: number; largestEdges: number } {
  const parent = graph.nodes.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  for (const edge of graph.edges) parent[find(edge.a)] = find(edge.b);
  const edgeCount = new Map<number, number>();
  for (const edge of graph.edges) edgeCount.set(find(edge.a), (edgeCount.get(find(edge.a)) ?? 0) + 1);
  return { count: edgeCount.size, largestEdges: Math.max(0, ...edgeCount.values()) };
}

/** A road as it is stored in a map tile: [class index, width dm, isBridge, flat decimeter points] */
export type TileRoadData = [number, number, number, number[]];

interface TileLines {
  lines: Point[][];
}

/** Keeps the roads of the loaded tiles and builds the graph from them when asked */
export class StreetGraphStore {
  private tiles = new Map<string, TileLines>();
  private version = 0;
  private builtVersion = -1;
  private built: Graph | null = null;

  setTile(tx: number, ty: number, origin: Point, roads: readonly TileRoadData[]) {
    const lines: Point[][] = [];
    for (const [classIndex, , , flat] of roads) {
      if (classIndex === MOTORWAY_CLASS) continue;
      const line: Point[] = [];
      for (let i = 0; i < flat.length; i += 2) line.push([origin[0] + flat[i] / 10, origin[1] + flat[i + 1] / 10]);
      if (line.length >= 2) lines.push(line);
    }
    this.tiles.set(`${tx}_${ty}`, { lines });
    this.version++;
  }

  removeTile(tx: number, ty: number) {
    if (this.tiles.delete(`${tx}_${ty}`)) this.version++;
  }

  clear() {
    this.tiles.clear();
    this.version++;
  }

  get tileCount() {
    return this.tiles.size;
  }

  /** The graph of every loaded tile, or null when there are no roads yet */
  graph(): Graph | null {
    if (this.builtVersion !== this.version) {
      const lines: Point[][] = [];
      for (const tile of this.tiles.values()) lines.push(...tile.lines);
      this.built = lines.length ? buildGraph(lines) : null;
      this.builtVersion = this.version;
    }
    return this.built;
  }
}

/** Shared with the 3D map's tile manager, which keeps it current as tiles stream in and out */
export const streetGraph = new StreetGraphStore();
