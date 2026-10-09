/**
 * Draw order of the map's layers.
 *
 * The flat ground layers (the "no data" grid, land, water, sand, grass, roads) sit a centimetre or
 * two apart. A depth buffer cannot tell layers that close apart at street-level distances (the
 * resolution is 3 cm at 500 m and 12 cm at 1 km), so they flickered where they overlap, most
 * visibly on grass. They no longer compete on depth at all: they are painted in this fixed order
 * without writing depth, so a later layer always lies over an earlier one.
 *
 * Everything with real volume (buildings, trees, lamps) is drawn first and does write depth; the
 * flat layers are depth-tested against it, so a wall still hides the grass behind it. That is also
 * the cheap order for the GPU: hidden ground pixels are rejected early.
 */
export const LAYER_RENDER_ORDER = {
  /** Buildings, trees and lamp posts: they write depth */
  solid: -2,
  /** The faint neon grid under the whole world */
  groundGrid: -1,
  land: 0,
  water: 1,
  sand: 2,
  green: 3,
  forest: 3.5,
  roads: 4
} as const;

/** The flat layers in the order they are painted, bottom to top */
export const GROUND_LAYER_ORDER = ['groundGrid', 'land', 'water', 'sand', 'green', 'forest', 'roads'] as const;
