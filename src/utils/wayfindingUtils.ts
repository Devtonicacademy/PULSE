export interface WaypointCue {
  id: string;
  index: number;
  coordinates: [number, number]; // [lng, lat]
  bearing: number; // 0 - 360 degrees
  distanceFromStart: number; // in meters
  distanceToEnd: number; // in meters
  cueType: 'straight' | 'turn-left' | 'turn-right' | 'destination';
  label: string;
}

export interface NavigationRoute {
  waypoints: WaypointCue[];
  totalDistanceMeters: number;
  estimatedWalkingMinutes: number;
  startCoordinates: [number, number];
  destinationCoordinates: [number, number];
  destinationTitle: string;
  destinationCategory?: string;
  geojsonFeature: GeoJSON.Feature<GeoJSON.LineString>;
  pathCoordinates: [number, number][]; // Full interpolated path for 60fps smooth simulation
  /** Routes follow the street network; there is no straight-line estimate */
  routeSource?: 'streets';
  /** How far the end of the route is from the destination, when the destination is off the streets (meters) */
  endsShortMeters?: number;
}

/**
 * Degrees to radians
 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Radians to degrees
 */
function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * Calculates Great Circle distance between two points in meters
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaPhi = toRad(lat2 - lat1);
  const deltaLambda = toRad(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Calculates bearing from point 1 to point 2 in degrees (0 - 360)
 */
export function calculateBearing(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const deltaLambda = toRad(lon2 - lon1);

  const y = Math.sin(deltaLambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(deltaLambda);

  const theta = Math.atan2(y, x);
  return (toDeg(theta) + 360) % 360;
}

/**
 * Interpolates intermediate point along a line segment at ratio t (0 <= t <= 1)
 */
export function interpolateCoord(
  start: [number, number],
  end: [number, number],
  t: number
): [number, number] {
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t
  ];
}

export function getPositionAlongRoute(
  route: NavigationRoute | [number, number][],
  progress: number
): { coordinates: [number, number]; bearing: number; currentWaypointIndex: number } {
  const coords: [number, number][] = Array.isArray(route)
    ? route
    : (route.pathCoordinates && route.pathCoordinates.length > 0 ? route.pathCoordinates : route.waypoints.map(w => w.coordinates));

  if (!coords || coords.length === 0) {
    return { coordinates: [0, 0], bearing: 0, currentWaypointIndex: 0 };
  }

  if (coords.length === 1) {
    return { coordinates: coords[0], bearing: 0, currentWaypointIndex: 0 };
  }

  // Progress is a share of the route's length, so the walk keeps a steady pace even
  // where path points are unevenly spaced (real street geometry)
  const cosLat = Math.cos(toRad(coords[0][1]));
  const segmentLengths = coords.slice(1).map((pt, i) =>
    Math.hypot((pt[0] - coords[i][0]) * cosLat, pt[1] - coords[i][1])
  );
  const totalLength = segmentLengths.reduce((sum, len) => sum + len, 0);
  let remaining = Math.max(0, Math.min(1, progress)) * totalLength;
  let baseIndex = 0;
  while (baseIndex < segmentLengths.length - 1 && remaining > segmentLengths[baseIndex]) {
    remaining -= segmentLengths[baseIndex];
    baseIndex++;
  }
  const nextIndex = baseIndex + 1;
  const localRatio = segmentLengths[baseIndex] > 0 ? Math.min(1, remaining / segmentLengths[baseIndex]) : 1;

  const currentPt = coords[baseIndex];
  const nextPt = coords[nextIndex];

  const currentCoords = interpolateCoord(currentPt, nextPt, localRatio);
  const bearing = calculateBearing(currentPt[1], currentPt[0], nextPt[1], nextPt[0]);

  return {
    coordinates: currentCoords,
    bearing,
    currentWaypointIndex: baseIndex
  };
}
