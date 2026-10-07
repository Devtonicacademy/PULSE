/**
 * Picks rendering settings for the device, so phones and low-end laptops stay smooth.
 * Pulse3DMap also downgrades at runtime if the measured frame rate stays low.
 */

export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  /** Cap on devicePixelRatio (the biggest single cost on high-DPI phones) */
  maxPixelRatio: number;
  bloom: boolean;
  /** Upper bound on tiles kept loaded */
  maxTiles: number;
  /** Upper bound on the tile loading radius, meters */
  maxLoadRadius: number;
}

const PRESETS: Record<QualityTier, QualitySettings> = {
  low: { tier: 'low', maxPixelRatio: 1, bloom: false, maxTiles: 24, maxLoadRadius: 1200 },
  medium: { tier: 'medium', maxPixelRatio: 1.5, bloom: true, maxTiles: 36, maxLoadRadius: 1500 },
  high: { tier: 'high', maxPixelRatio: 2, bloom: true, maxTiles: 64, maxLoadRadius: 2000 }
};

export function detectQuality(): QualitySettings {
  const cores = navigator.hardwareConcurrency || 4;
  // Chromium only; undefined elsewhere
  const memoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const touchFirst = window.matchMedia?.('(pointer: coarse)').matches ?? false;

  if (cores <= 4 || (memoryGB !== undefined && memoryGB <= 4)) return PRESETS.low;
  if (touchFirst) return PRESETS.medium;
  return PRESETS.high;
}

/** Runtime downgrade thresholds (frames per second, sustained over a few seconds) */
export const DOWNGRADE_BLOOM_BELOW_FPS = 40;
export const DOWNGRADE_PIXELS_BELOW_FPS = 30;
export const DOWNGRADE_SAMPLE_SECONDS = 3;
