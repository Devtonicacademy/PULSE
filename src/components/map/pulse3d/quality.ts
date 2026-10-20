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
  /** How edges are smoothed: multisampled targets, a cheap post pass, or nothing */
  antialias: 'msaa' | 'smaa' | 'none';
  msaaSamples: number;
  /** Upper bound on tiles kept loaded */
  maxTiles: number;
  /** Upper bound on the tile loading radius, meters */
  maxLoadRadius: number;
}

const PRESETS: Record<QualityTier, QualitySettings> = {
  low: { tier: 'low', maxPixelRatio: 1.25, bloom: false, antialias: 'smaa', msaaSamples: 0, maxTiles: 24, maxLoadRadius: 1200 },
  medium: { tier: 'medium', maxPixelRatio: 1.5, bloom: true, antialias: 'msaa', msaaSamples: 2, maxTiles: 36, maxLoadRadius: 1500 },
  high: { tier: 'high', maxPixelRatio: 2, bloom: true, antialias: 'msaa', msaaSamples: 4, maxTiles: 64, maxLoadRadius: 2000 }
};

/** Resolution steps tried, in order, when the frame rate stays low (never below 1) */
export function pixelRatioLadder(maxPixelRatio: number): number[] {
  const start = Math.max(1, Math.min(window.devicePixelRatio || 1, maxPixelRatio));
  return [start, ...[1.5, 1.25, 1].filter((r) => r < start - 1e-6)];
}

export function detectQuality(): QualitySettings {
  const params = new URLSearchParams(window.location.search);
  // ?quality=low|medium|high forces a tier and ?aa=none|smaa|msaa the edge smoothing, to compare them side by side
  const base = pickTier(params.get('quality'));
  const aa = params.get('aa');
  if (aa === 'none' || aa === 'smaa' || aa === 'msaa') {
    return { ...base, antialias: aa, msaaSamples: aa === 'msaa' ? base.msaaSamples || 4 : 0 };
  }
  return base;
}

function pickTier(forced: string | null): QualitySettings {
  if (forced === 'low' || forced === 'medium' || forced === 'high') return PRESETS[forced];
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
