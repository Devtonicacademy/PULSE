import type { MomentCategory, RadiusKm } from '../types/pulse';

/** Answers from the sign-in survey (kept on the device, keyed by user id) */
export interface SurveyAnswers {
  interests: MomentCategory[];
  getAround: 'walk' | 'transit' | 'drive' | 'mixed';
  hours: ('morning' | 'afternoon' | 'evening' | 'late')[];
  radiusKm: RadiusKm;
  alerts: boolean;
}

export const DEFAULT_SURVEY: SurveyAnswers = {
  interests: [],
  getAround: 'mixed',
  hours: ['evening'],
  radiusKm: 5,
  alerts: true
};

const INTERESTS: MomentCategory[] = [
  'events', 'alerts', 'food_drinks', 'lost_found', 'recommendations', 'activities', 'deals', 'community'
];
const AROUND = new Set(['walk', 'transit', 'drive', 'mixed']);
const HOURS = new Set(['morning', 'afternoon', 'evening', 'late']);
const RADII = new Set([1, 2, 5, 10, 25]);

export function sanitizeSurvey(value: unknown): SurveyAnswers {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const list = (key: string, allowed: Iterable<string>) => {
    const ok = new Set(allowed);
    return Array.isArray(v[key]) ? (v[key] as unknown[]).filter((x): x is string => typeof x === 'string' && ok.has(x)) : [];
  };
  return {
    interests: list('interests', INTERESTS) as MomentCategory[],
    getAround: AROUND.has(v.getAround as string) ? (v.getAround as SurveyAnswers['getAround']) : DEFAULT_SURVEY.getAround,
    hours: list('hours', HOURS) as SurveyAnswers['hours'],
    radiusKm: RADII.has(v.radiusKm as number) ? (v.radiusKm as RadiusKm) : DEFAULT_SURVEY.radiusKm,
    alerts: typeof v.alerts === 'boolean' ? v.alerts : DEFAULT_SURVEY.alerts
  };
}

const key = (userId: string) => `pulse.survey.${userId}`;

export function loadSurvey(userId: string): SurveyAnswers | null {
  try {
    const raw = localStorage.getItem(key(userId));
    return raw ? sanitizeSurvey(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function storeSurvey(userId: string, answers: SurveyAnswers) {
  try {
    localStorage.setItem(key(userId), JSON.stringify(answers));
  } catch {
    // Storage unavailable: the survey simply asks again next session
  }
}
