import { Moment, RadiusKm } from '../types/pulse';

export interface AISummaryResult {
  headline: string;
  bullets: string[];
  vibeTag: string;
  timestamp: string;
}

/**
 * Generates an AI Local Summary of what is happening right now in the selected radius
 */
export function generateLocalAISummary(
  moments: Moment[],
  radiusKm: RadiusKm,
  zoneName: string
): AISummaryResult {
  if (moments.length === 0) {
    return {
      headline: `Quiet neighborhood within ${radiusKm}km`,
      bullets: [
        'No urgent alerts reported in this radius right now.',
        'Be the first to create a live Moment and earn +10 reputation points!',
        'Local businesses are getting ready for evening rush.'
      ],
      vibeTag: 'Peaceful',
      timestamp: 'Just now'
    };
  }

  // Sort moments by engagement
  const sorted = [...moments].sort((a, b) => b.engagementScore - a.engagementScore);

  const bullets: string[] = [];

  // 1. High priority alerts
  const alertMoment = sorted.find((m) => m.category === 'alerts');
  if (alertMoment) {
    bullets.push(`⚠️ ${alertMoment.title} (${alertMoment.approxAddress})`);
  }

  // 2. Trending food & drinks
  const foodMoment = sorted.find((m) => m.category === 'food_drinks');
  if (foodMoment) {
    bullets.push(`🍔 ${foodMoment.title}`);
  }

  // 3. Top event or activity
  const eventMoment = sorted.find(
    (m) => (m.category === 'events' || m.category === 'activities') && m.id !== alertMoment?.id
  );
  if (eventMoment) {
    bullets.push(`🎉 ${eventMoment.title}`);
  }

  // 4. Flash deal or community
  const dealOrComm = sorted.find(
    (m) =>
      (m.category === 'deals' || m.category === 'community') &&
      !bullets.some((b) => b.includes(m.title))
  );
  if (dealOrComm) {
    bullets.push(`🛍️ ${dealOrComm.title}`);
  }

  // If still fewer than 3, fill in with any top remaining
  for (const m of sorted) {
    if (bullets.length >= 4) break;
    if (!bullets.some((b) => b.includes(m.title))) {
      bullets.push(`📍 ${m.title}`);
    }
  }

  // Determine local vibe
  let vibeTag = 'Dynamic';
  if (alertMoment && sorted.indexOf(alertMoment) < 2) {
    vibeTag = 'High Alert';
  } else if (sorted.some((m) => m.engagementScore > 90)) {
    vibeTag = 'Trending High';
  } else {
    vibeTag = 'Active';
  }

  return {
    headline: `Trending within ${radiusKm}km of ${zoneName}:`,
    bullets,
    vibeTag,
    timestamp: 'Updated in real-time'
  };
}
