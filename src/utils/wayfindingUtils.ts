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
  /** 'streets' = routed over the OSM street network; 'estimate' = straight-line approximation */
  routeSource?: 'streets' | 'estimate';
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

/**
 * Generates an urban street route with game-like wayfinding cues
 * Capped to a lean number of visual waypoints to ensure zero DOM overhead and 60fps performance
 */
export function generateStreetNavigationRoute(
  start: [number, number], // [lng, lat]
  destination: [number, number], // [lng, lat]
  destinationTitle = 'Destination',
  destinationCategory = 'events'
): NavigationRoute {
  const [startLng, startLat] = start;
  const [destLng, destLat] = destination;

  const totalDirectDist = calculateDistanceMeters(startLat, startLng, destLat, destLng);

  // If start and destination are basically identical, return minimal single cue
  if (totalDirectDist < 5) {
    const singleCue: WaypointCue = {
      id: 'cue-dest',
      index: 0,
      coordinates: destination,
      bearing: 0,
      distanceFromStart: 0,
      distanceToEnd: 0,
      cueType: 'destination',
      label: destinationTitle
    };

    return {
      waypoints: [singleCue],
      totalDistanceMeters: 0,
      estimatedWalkingMinutes: 0,
      startCoordinates: start,
      destinationCoordinates: destination,
      destinationTitle,
      destinationCategory,
      geojsonFeature: {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: [start, destination]
        }
      },
      pathCoordinates: [start, destination],
      routeSource: 'estimate'
    };
  }

  // To simulate realistic urban street blocks (e.g. grid navigation):
  const cornerIntersection: [number, number] = [destLng, startLat];

  const leg1Dist = calculateDistanceMeters(startLat, startLng, cornerIntersection[1], cornerIntersection[0]);
  const leg2Dist = calculateDistanceMeters(cornerIntersection[1], cornerIntersection[0], destLat, destLng);
  const routeTotalDist = leg1Dist + leg2Dist;

  // Build full high-resolution polyline for GPU line rendering and smooth camera interpolation (50-100 segments)
  const pathCoordinates: [number, number][] = [start];
  const leg1Samples = Math.max(10, Math.min(50, Math.round(leg1Dist / 20)));
  for (let i = 1; i <= leg1Samples; i++) {
    pathCoordinates.push(interpolateCoord(start, cornerIntersection, i / leg1Samples));
  }
  const leg2Samples = Math.max(10, Math.min(50, Math.round(leg2Dist / 20)));
  for (let i = 1; i <= leg2Samples; i++) {
    pathCoordinates.push(interpolateCoord(cornerIntersection, destination, i / leg2Samples));
  }

  // Generate selective visual cues: maximum 6-10 cues across the entire route to eliminate DOM clutter
  const waypoints: WaypointCue[] = [];
  const leg1Bearing = calculateBearing(startLat, startLng, cornerIntersection[1], cornerIntersection[0]);
  const leg2Bearing = calculateBearing(cornerIntersection[1], cornerIntersection[0], destLat, destLng);

  // Initial guidance cue
  waypoints.push({
    id: 'cue-0',
    index: 0,
    coordinates: interpolateCoord(start, cornerIntersection, Math.min(0.2, 50 / Math.max(50, leg1Dist))),
    bearing: leg1Bearing,
    distanceFromStart: Math.min(50, Math.round(leg1Dist * 0.2)),
    distanceToEnd: Math.round(routeTotalDist),
    cueType: 'straight',
    label: `${Math.round(routeTotalDist)}m ahead`
  });

  // Intermediate Leg 1 cue if leg is long
  if (leg1Dist > 200) {
    waypoints.push({
      id: 'cue-mid1',
      index: waypoints.length,
      coordinates: interpolateCoord(start, cornerIntersection, 0.5),
      bearing: leg1Bearing,
      distanceFromStart: Math.round(leg1Dist * 0.5),
      distanceToEnd: Math.round(routeTotalDist - leg1Dist * 0.5),
      cueType: 'straight',
      label: `${Math.round(routeTotalDist - leg1Dist * 0.5)}m to turn`
    });
  }

  // Corner turn cue
  if (leg2Dist > 20) {
    const diff = (leg2Bearing - leg1Bearing + 360) % 360;
    const turnType: 'turn-left' | 'turn-right' = diff > 0 && diff < 180 ? 'turn-right' : 'turn-left';

    waypoints.push({
      id: 'cue-corner',
      index: waypoints.length,
      coordinates: cornerIntersection,
      bearing: leg2Bearing,
      distanceFromStart: Math.round(leg1Dist),
      distanceToEnd: Math.round(leg2Dist),
      cueType: turnType,
      label: `${turnType === 'turn-left' ? 'Turn Left' : 'Turn Right'} in ${Math.round(leg1Dist)}m`
    });

    // Intermediate Leg 2 cue if leg is long
    if (leg2Dist > 250) {
      waypoints.push({
        id: 'cue-mid2',
        index: waypoints.length,
        coordinates: interpolateCoord(cornerIntersection, destination, 0.5),
        bearing: leg2Bearing,
        distanceFromStart: Math.round(leg1Dist + leg2Dist * 0.5),
        distanceToEnd: Math.round(leg2Dist * 0.5),
        cueType: 'straight',
        label: `${Math.round(leg2Dist * 0.5)}m to arrival`
      });
    }
  }

  // Final destination beacon cue
  waypoints.push({
    id: 'cue-dest',
    index: waypoints.length,
    coordinates: destination,
    bearing: leg2Bearing,
    distanceFromStart: Math.round(routeTotalDist),
    distanceToEnd: 0,
    cueType: 'destination',
    label: destinationTitle
  });

  const walkingMinutes = Math.max(1, Math.ceil(routeTotalDist / 80));

  const geojsonFeature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {
      title: destinationTitle,
      distance: routeTotalDist
    },
    geometry: {
      type: 'LineString',
      coordinates: pathCoordinates
    }
  };

  return {
    waypoints,
    totalDistanceMeters: Math.round(routeTotalDist),
    estimatedWalkingMinutes: walkingMinutes,
    startCoordinates: start,
    destinationCoordinates: destination,
    destinationTitle,
    destinationCategory,
    geojsonFeature,
    pathCoordinates,
    routeSource: 'estimate'
  };
}

/**
 * High-performance coordinate interpolation along pathCoordinates by progress (0.0 to 1.0)
 */
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
