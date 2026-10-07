/**
 * Geospatial utility functions for PULSE
 */

// Haversine formula to compute great-circle distance in kilometers
export function calculateDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's mean radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Unrounded; format at display time (see formatDistance)
}

export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    const meters = Math.round(distanceKm * 1000);
    return `${meters}m away`;
  }
  return `${distanceKm.toFixed(1)} km away`;
}

export function isWithinRadius(
  userLat: number,
  userLng: number,
  itemLat: number,
  itemLng: number,
  radiusKm: number
): boolean {
  const dist = calculateDistanceKm(userLat, userLng, itemLat, itemLng);
  return dist <= radiusKm;
}

/**
 * Privacy blurring: adds a random coordinate jitter of roughly 100-250 meters.
 * Prevents pinpointing private homes while keeping it accurate for neighborhood discovery.
 */
export function applyPrivacyBlur(
  lat: number,
  lng: number,
  radiusMeters = 180
): { lat: number; lng: number } {
  // 1 degree latitude ~ 111,320 meters
  const latDeltaMax = radiusMeters / 111320;
  // 1 degree longitude ~ 111,320 * cos(lat) meters
  const lngDeltaMax =
    radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));

  const randomAngle = Math.random() * 2 * Math.PI;
  const randomDistanceRatio = Math.sqrt(Math.random()); // uniform distribution over circle

  const blurredLat = lat + Math.sin(randomAngle) * latDeltaMax * randomDistanceRatio;
  const blurredLng = lng + Math.cos(randomAngle) * lngDeltaMax * randomDistanceRatio;

  return {
    lat: Number(blurredLat.toFixed(5)),
    lng: Number(blurredLng.toFixed(5))
  };
}

/**
 * Approximate address lookup or reverse geocoding placeholder
 */
export function getApproximateAreaName(lat: number, lng: number): string {
  // Approximate based on standard Lagos coordinates or fallback
  if (lat > 6.42 && lat < 6.44 && lng > 3.40 && lng < 3.44) {
    return 'Victoria Island';
  } else if (lat >= 6.44 && lat <= 6.47 && lng >= 3.45 && lng <= 3.50) {
    return 'Lekki Phase 1';
  } else if (lat >= 6.50 && lat <= 6.53 && lng >= 3.36 && lng <= 3.40) {
    return 'Yaba';
  } else if (lat >= 6.44 && lat <= 6.46 && lng >= 3.38 && lng <= 3.41) {
    return 'Lagos Island';
  }
  return 'Local Area';
}
