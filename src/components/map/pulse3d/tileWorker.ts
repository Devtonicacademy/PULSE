/// <reference lib="webworker" />
import { MapTile } from './tileFormat';
import { buildTileGeometry, tileGeometryBuffers, TileGeometry } from './tileMeshes';
import { loadTileText } from './tileCache';

/**
 * Tile streaming worker: downloads a tile, parses the JSON and does all the geometry work
 * (triangulation, walls, trees, lamps) off the main thread. The finished typed arrays are
 * transferred back, so the render loop only has to wrap them in meshes.
 */
export interface TileRequest {
  id: number;
  key: string;
  tileSize: number;
  /** Where to download the tile from (a pre-built file or the server's on-demand route) */
  url: string;
}

export type TileResponse =
  | { id: number; key: string; geometry: TileGeometry }
  | { id: number; key: string; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = async (event: MessageEvent<TileRequest>) => {
  const { id, key, tileSize, url } = event.data;
  try {
    // Cache first (see tileCache.ts), network when the cache has nothing usable
    const tile = JSON.parse(await loadTileText(url)) as MapTile;
    const geometry = buildTileGeometry(tile, tileSize);
    const response: TileResponse = { id, key, geometry };
    scope.postMessage(response, tileGeometryBuffers(geometry));
  } catch (err) {
    const response: TileResponse = { id, key, error: err instanceof Error ? err.message : String(err) };
    scope.postMessage(response);
  }
};
