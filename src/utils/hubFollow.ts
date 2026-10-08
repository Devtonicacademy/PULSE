import { calculateDistanceKm } from './geoUtils';

/** A fix closer than this to the active hub is not worth moving the hub (and rebuilding the feed query) */
export const HUB_MOVE_THRESHOLD_KM = 0.15;

export interface HubDecision {
  /** Move the active hub (feed centre, nearby-moments query, hub label) to the fix */
  move: boolean;
  /** The user asked for their position: forget any hub they picked by hand */
  unpin: boolean;
}

/**
 * Whether the active hub should follow a located position.
 *   auto (the app looked on its own): follow, unless the user picked a hub on purpose
 *   user (the person pressed "find me"): always follow, and the hand-picked hub is released
 * Either way a fix next to the hub changes nothing. An approximate (IP) position found on its own never
 * replaces a real GPS position the app already has: lookups can finish out of order.
 */
export function planHubMove(
  hub: { latitude: number; longitude: number },
  fix: { latitude: number; longitude: number; source?: 'gps' | 'ip' },
  pinned: boolean,
  reason: 'auto' | 'user',
  haveGps = false
): HubDecision {
  const unpin = reason === 'user';
  const stillPinned = pinned && !unpin;
  const far = calculateDistanceKm(hub.latitude, hub.longitude, fix.latitude, fix.longitude) > HUB_MOVE_THRESHOLD_KM;
  const staleGuess = reason === 'auto' && fix.source === 'ip' && haveGps;
  return { move: far && !stillPinned && !staleGuess, unpin };
}
