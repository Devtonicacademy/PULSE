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
function interpolateCoord(
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
 * Spaced every ~20 - 35 meters with corner turns and final destination beacon
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
      }
    };
  }

  // To simulate realistic urban street blocks (e.g. grid navigation like in Victoria Island or Manhattan):
  // We introduce an intermediate street corner intersection to avoid flying in a straight diagonal across buildings.
  const cornerIntersection: [number, number] = [
    destLng, // Turn at the target longitude
    startLat // Continuing straight along the starting latitude
  ];

  // Divide into 2 main street legs:
  // Leg 1: from start -> corner
  // Leg 2: from corner -> destination
  const leg1Dist = calculateDistanceMeters(startLat, startLng, cornerIntersection[1], cornerIntersection[0]);
  const leg2Dist = calculateDistanceMeters(cornerIntersection[1], cornerIntersection[0], destLat, destLng);
  const routeTotalDist = leg1Dist + leg2Dist;

  // Decide waypoint spacing (every ~25-35 meters)
  const waypointSpacing = Math.max(25, Math.min(35, routeTotalDist / 12));

  const allLineCoords: [number, number][] = [start];
  const waypoints: WaypointCue[] = [];
  let currentDistFromStart = 0;
  let cueIdx = 0;

  // 1. Generate Leg 1 waypoints
  const numStepsLeg1 = Math.max(1, Math.round(leg1Dist / waypointSpacing));
  const leg1Bearing = calculateBearing(startLat, startLng, cornerIntersection[1], cornerIntersection[0]);

  for (let i = 1; i <= numStepsLeg1; i++) {
    const t = i / numStepsLeg1;
    const pt = interpolateCoord(start, cornerIntersection, t);
    allLineCoords.push(pt);

    currentDistFromStart += leg1Dist / numStepsLeg1;
    const distToEnd = Math.max(0, routeTotalDist - currentDistFromStart);

    const isCorner = i === numStepsLeg1 && leg2Dist > 15;
    const leg2Bearing = calculateBearing(cornerIntersection[1], cornerIntersection[0], destLat, destLng);

    // Determine if turn is left or right
    let turnType: 'straight' | 'turn-left' | 'turn-right' = 'straight';
    if (isCorner) {
      const diff = (leg2Bearing - leg1Bearing + 360) % 360;
      turnType = diff > 0 && diff < 180 ? 'turn-right' : 'turn-left';
    }

    waypoints.push({
      id: `cue-${cueIdx++}`,
      index: waypoints.length,
      coordinates: pt,
      bearing: isCorner ? leg2Bearing : leg1Bearing,
      distanceFromStart: Math.round(currentDistFromStart),
      distanceToEnd: Math.round(distToEnd),
      cueType: isCorner ? turnType : 'straight',
      label: isCorner
        ? `${turnType === 'turn-left' ? 'Turn Left' : 'Turn Right'} in ${Math.round(currentDistFromStart)}m`
        : `${Math.round(distToEnd)}m`
    });
  }

  // 2. Generate Leg 2 waypoints
  if (leg2Dist > 10) {
    const numStepsLeg2 = Math.max(1, Math.round(leg2Dist / waypointSpacing));
    const leg2Bearing = calculateBearing(cornerIntersection[1], cornerIntersection[0], destLat, destLng);

    for (let i = 1; i <= numStepsLeg2; i++) {
      const t = i / numStepsLeg2;
      const pt = interpolateCoord(cornerIntersection, destination, t);
      allLineCoords.push(pt);

      currentDistFromStart += leg2Dist / numStepsLeg2;
      const distToEnd = Math.max(0, routeTotalDist - currentDistFromStart);
      const isFinal = i === numStepsLeg2;

      waypoints.push({
        id: `cue-${cueIdx++}`,
        index: waypoints.length,
        coordinates: pt,
        bearing: leg2Bearing,
        distanceFromStart: Math.round(currentDistFromStart),
        distanceToEnd: Math.round(distToEnd),
        cueType: isFinal ? 'destination' : 'straight',
        label: isFinal ? destinationTitle : `${Math.round(distToEnd)}m`
      });
    }
  } else {
    // If leg 2 is trivial, ensure final cue is marked as destination
    if (waypoints.length > 0) {
      waypoints[waypoints.length - 1].cueType = 'destination';
      waypoints[waypoints.length - 1].label = destinationTitle;
    }
  }

  // Calculate walking time: average walking speed = 1.35 m/s (~80 meters per minute)
  const walkingMinutes = Math.max(1, Math.ceil(routeTotalDist / 80));

  const geojsonFeature: GeoJSON.Feature<GeoJSON.LineString> = {
    type: 'Feature',
    properties: {
      title: destinationTitle,
      distance: routeTotalDist
    },
    geometry: {
      type: 'LineString',
      coordinates: allLineCoords
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
    geojsonFeature
  };
}

/**
 * Interpolates coordinate position along waypoints by progress (0.0 to 1.0)
 */
export function getPositionAlongRoute(
  waypoints: WaypointCue[],
  progress: number
): { coordinates: [number, number]; bearing: number; currentWaypointIndex: number } {
  if (!waypoints || waypoints.length === 0) {
    return { coordinates: [0, 0], bearing: 0, currentWaypointIndex: 0 };
  }

  const clampedProgress = Math.max(0, Math.min(1, progress));
  const totalWaypoints = waypoints.length;
  const floatIndex = clampedProgress * (totalWaypoints - 1);
  const baseIndex = Math.floor(floatIndex);
  const nextIndex = Math.min(totalWaypoints - 1, baseIndex + 1);
  const localRatio = floatIndex - baseIndex;

  const currentWp = waypoints[baseIndex];
  const nextWp = waypoints[nextIndex];

  const coords = interpolateCoord(currentWp.coordinates, nextWp.coordinates, localRatio);
  const bearing = currentWp.bearing;

  return {
    coordinates: coords,
    bearing,
    currentWaypointIndex: baseIndex
  };
}
