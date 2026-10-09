/**
 * Buildings that start above the ground (OSM min_height / building:min_level) are meant to sit on a
 * lower part of the same building. When that lower part is missing from the data (a canopy on
 * pillars, a tower whose podium was never mapped) the upper part hangs in the air. This finds the
 * ones with nothing under them so they can be built down to the ground.
 *
 * A building is "held up" when a sample point of its footprint lies inside another building that
 * starts at the ground and reaches at least half way up to it.
 */

/** [height m, minHeight m, kind, outer ring as flat decimeters, ...holes] */
export type SupportBuilding = readonly [number, number, number, readonly number[], ...(readonly number[])[]];

/** Even-odd point-in-polygon on a flat [x, y, x, y, ...] ring */
export function pointInRing(x: number, y: number, flat: readonly number[]): boolean {
  let inside = false;
  for (let i = 0, j = flat.length - 2; i < flat.length; j = i, i += 2) {
    const xi = flat[i];
    const yi = flat[i + 1];
    const xj = flat[j];
    const yj = flat[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The centre of the footprint plus a point nudged towards each corner (a concave centre can fall outside) */
function samplePoints(flat: readonly number[]): [number, number][] {
  const n = flat.length / 2;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < flat.length; i += 2) {
    cx += flat[i];
    cy += flat[i + 1];
  }
  cx /= n;
  cy /= n;
  const points: [number, number][] = [[cx, cy]];
  const step = Math.max(1, Math.floor(n / 4));
  for (let i = 0; i < n; i += step) points.push([cx + (flat[i * 2] - cx) * 0.5, cy + (flat[i * 2 + 1] - cy) * 0.5]);
  return points;
}

/**
 * The height each building should start at: its own minHeight when something holds it up, otherwise 0
 * (built down to the ground).
 */
export function groundedMinHeights(buildings: readonly SupportBuilding[]): number[] {
  // Parts that start at the ground are the supports (raised parts resting on them are checked in order)
  const grounded = buildings.map((b) => !(b[1] > 0));
  const result = buildings.map((b) => (b[1] > 0 ? b[1] : 0));

  // A raised part can rest on another raised part that is itself supported: settle until nothing changes
  let changed = true;
  const supported = new Array<boolean>(buildings.length).fill(false);
  while (changed) {
    changed = false;
    buildings.forEach((b, index) => {
      if (grounded[index] || supported[index]) return;
      const min = b[1];
      const points = samplePoints(b[3]);
      const held = buildings.some((other, o) => {
        if (o === index || !(grounded[o] || supported[o])) return false;
        if (other[0] < min * 0.5) return false;
        return points.some(([x, y]) => pointInRing(x, y, other[3]));
      });
      if (held) {
        supported[index] = true;
        changed = true;
      }
    });
  }
  buildings.forEach((b, index) => {
    if (b[1] > 0 && !supported[index]) result[index] = 0;
  });
  return result;
}
