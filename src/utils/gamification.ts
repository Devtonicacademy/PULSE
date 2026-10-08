import type { UserProfile } from '../types/pulse';

/** Server-side counts of what a user has done (see fetchUserActivityCounts) */
export interface ActivityCounts {
  moments: number;
  reactions: number;
  comments: number;
}

/**
 * Points, reputation and the moment count are derived from the user's real activity, never
 * stored on the profile document, so there is nothing for a client to edit. The awards match the
 * old local ones: 15 points per moment, 5 per comment, 2 per reaction.
 */
export function deriveProfileStats(
  counts: ActivityCounts,
  isAnonymous: boolean | undefined
): Pick<UserProfile, 'points' | 'reputation' | 'createdMomentsCount'> {
  const basePoints = isAnonymous ? 50 : 150;
  const baseReputation = isAnonymous ? 60 : 75;
  return {
    points: basePoints + counts.moments * 15 + counts.comments * 5 + counts.reactions * 2,
    reputation: Math.min(100, baseReputation + counts.moments * 2 + counts.comments),
    createdMomentsCount: counts.moments
  };
}
