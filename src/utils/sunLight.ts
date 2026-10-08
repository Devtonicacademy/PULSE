/**
 * Where the sun is for a place and moment, and the lighting "mood" that goes with it. Pure maths
 * (NOAA's simplified solar position), so the map can light itself for the user's location and
 * local time without a time zone database or any network call.
 */

export interface SunPosition {
  /** Degrees above the horizon (negative = below it) */
  altitude: number;
  /** Degrees clockwise from north */
  azimuth: number;
}

export type LightingMood = 'night' | 'dawn' | 'day' | 'dusk';

export interface Lighting {
  sun: SunPosition;
  mood: LightingMood;
  /** 0 (deep night) to 1 (full daylight), smooth through twilight */
  daylight: number;
  /** 0 to 1: how warm / golden the light is (peaks around sunrise and sunset) */
  warmth: number;
}

const RAD = Math.PI / 180;

export function getSunPosition(date: Date, latitude: number, longitude: number): SunPosition {
  const dayMs = 86400000;
  const julian = date.getTime() / dayMs + 2440587.5;
  const d = julian - 2451545.0;

  const meanAnomaly = (357.5291 + 0.98560028 * d) * RAD;
  const center = (1.9148 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly) + 0.0003 * Math.sin(3 * meanAnomaly)) * RAD;
  const eclipticLongitude = meanAnomaly + center + 102.9372 * RAD + Math.PI;

  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(23.4397 * RAD));
  const rightAscension = Math.atan2(Math.sin(eclipticLongitude) * Math.cos(23.4397 * RAD), Math.cos(eclipticLongitude));

  const siderealTime = (280.16 + 360.9856235 * d) * RAD + longitude * RAD;
  const hourAngle = siderealTime - rightAscension;
  const lat = latitude * RAD;

  const altitude = Math.asin(Math.sin(lat) * Math.sin(declination) + Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle));
  // Azimuth measured from north, clockwise
  const azimuth = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(lat) - Math.tan(declination) * Math.cos(lat)
  );

  return { altitude: altitude / RAD, azimuth: (azimuth / RAD + 180 + 360) % 360 };
}

const smoothstep = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** A fixed lighting for a mood, for the manual Day / Dusk / Night override */
export function lightingForMood(mood: LightingMood): Lighting {
  switch (mood) {
    case 'day':
      return { sun: { altitude: 58, azimuth: 150 }, mood, daylight: 1, warmth: 0 };
    case 'dawn':
      return { sun: { altitude: 3, azimuth: 95 }, mood, daylight: 0.4, warmth: 1 };
    case 'dusk':
      return { sun: { altitude: 3, azimuth: 265 }, mood, daylight: 0.4, warmth: 1 };
    default:
      return { sun: { altitude: -40, azimuth: 0 }, mood: 'night', daylight: 0, warmth: 0 };
  }
}

/** Lighting for a place at a moment: daylight and warmth follow the sun's height; dawn vs dusk follows the clock */
export function getLighting(date: Date, latitude: number, longitude: number): Lighting {
  const sun = getSunPosition(date, latitude, longitude);
  // Full dark by 8 degrees below the horizon (nautical twilight), full day by 14 degrees above it
  const daylight = smoothstep(-8, 14, sun.altitude);
  // Golden light when the sun is low, strongest near the horizon
  const warmth = Math.max(0, 1 - Math.abs(sun.altitude - 2) / 12);

  // The sun is in the east before local solar noon (azimuth < 180) and in the west after
  const morning = sun.azimuth < 180;
  let mood: LightingMood;
  if (sun.altitude < -6) mood = 'night';
  else if (sun.altitude < 8) mood = morning ? 'dawn' : 'dusk';
  else mood = 'day';

  return { sun, mood, daylight, warmth };
}
