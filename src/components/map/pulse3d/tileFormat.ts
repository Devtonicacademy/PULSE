/**
 * Shapes of the files written by scripts/build-map-tiles.mjs into public/map-tiles/.
 * Ring/point arrays are flat [x0, y0, x1, y1, ...] in decimeters relative to the tile
 * origin (x east, y north); the origin itself is in meters from MAP_ORIGIN.
 */

export type FlatPoints = number[];

/** [height m, minHeight m, kindIndex, outerRing, ...holeRings] */
export type TileBuilding = [number, number, number, FlatPoints, ...FlatPoints[]];

/** [classIndex, width dm, isBridge (0|1), points] */
export type TileRoad = [number, number, 0 | 1, FlatPoints];

/** [kindIndex (wall, fence, hedge), height dm, points] */
export type TileBarrier = [number, number, FlatPoints];

/** [name, roadClassIndex, points] a named stretch of street */
export type TileStreetName = [string, number, FlatPoints];

/** [name, placeKindIndex, x dm, y dm, building height dm] */
export type TilePlace = [string, number, number, number, number];

/** Index = place kind in the tile builder (building, food, shop, health, education, worship, lodging, leisure, transport, finance, civic) */
export const PLACE_KIND_NAMES = ['building', 'food', 'shop', 'health', 'education', 'worship', 'lodging', 'leisure', 'transport', 'finance', 'civic'] as const;

/** [outerRing, ...holeRings] */
export type TileSurface = [FlatPoints, ...FlatPoints[]];

export interface MapTile {
  v: number;
  tx: number;
  ty: number;
  origin: [number, number];
  buildings: TileBuilding[];
  roads: TileRoad[];
  /** Fences, compound walls and hedges (absent in tiles built before barriers were read) */
  barriers?: TileBarrier[];
  /** Street names for map labels (absent when none are mapped) */
  streetNames?: TileStreetName[];
  /** Named shops, amenities and landmark buildings (absent when none are mapped) */
  places?: TilePlace[];
  water: TileSurface[];
  /** Parks, gardens, grass, farmland: clean grass-coloured ground */
  green: TileSurface[];
  /** Woods and forests: darker ground with trees (absent in tiles built before forests were read) */
  forest?: TileSurface[];
  /**
   * Colours and roof of the buildings that OpenStreetMap describes (absent when none do), by index into
   * `buildings`: [wall rgb, roof rgb, roof shape index, roof height dm, height includes the roof]
   * (rgb 0 = not mapped; shape 0 = flat / not mapped)
   */
  bmeta?: Record<string, number[]>;
  sand: TileSurface[];
  /** 1 = all land, 0 = all water, else land rings */
  land: 0 | 1 | FlatPoints[];
}

export interface MapTileArea {
  id: string;
  label: string;
  /** [minX, minY, maxX, maxY] meters */
  bounds: [number, number, number, number];
  center: [number, number];
}

export interface MapTileIndex {
  v: number;
  attribution: string;
  tileSize: number;
  buildingKinds: string[];
  roadClasses: string[];
  areas: MapTileArea[];
  /** tile key "tx_ty" -> file size in bytes */
  tiles: Record<string, number>;
}

export interface WalkGraph {
  v: number;
  /** flat [x, y] in decimeters from MAP_ORIGIN */
  nodes: number[];
  /** [nodeA, nodeB, length dm, interior points (flat dm, absolute)] */
  edges: [number, number, number, FlatPoints][];
}

/** Roof shapes by the index tiles store (0 = flat / not mapped) */
export const ROOF_SHAPE_NAMES = ['flat', 'gabled', 'hipped', 'pyramidal', 'skillion', 'dome'] as const;

export const MAP_TILES_BASE_URL = '/map-tiles/';
