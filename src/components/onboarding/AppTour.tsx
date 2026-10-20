import React, { useEffect, useState } from 'react';
import { Coach } from '../ui/Coach';

const SEEN_KEY = 'pulse_tour_seen';
const EVENT = 'pulse:start-tour';

/** Opens the guided tour of the main controls (after setup, or from Settings) */
export function startTour() {
  window.dispatchEvent(new Event(EVENT));
}

export function markTourSeen() {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    /* private mode */
  }
}

const STEPS = [
  { target: 'nav-map', title: 'Map', text: 'Walk the city in 3D and see moments where they happen.' },
  { target: 'nav-discover', title: 'Discover', text: 'Browse and filter everything live around you.' },
  { target: 'nav-create', title: 'Post a moment', text: 'Tap here to share what is happening. It expires on its own.' },
  { target: 'nav-alerts', title: 'Alerts', text: 'Urgent things near you show up here first.' },
  { target: 'nav-profile', title: 'Profile', text: 'Your rank, badges and settings live here.' }
] as const;

const btn = 'rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors';

export const AppTour: React.FC = () => {
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    const start = () => setStep(0);
    window.addEventListener(EVENT, start);
    return () => window.removeEventListener(EVENT, start);
  }, []);

  useEffect(() => {
    if (step === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'ArrowRight') setStep((s) => (s === null ? s : Math.min(s + 1, STEPS.length - 1)));
      if (e.key === 'ArrowLeft') setStep((s) => (s === null ? s : Math.max(s - 1, 0)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const finish = () => {
    markTourSeen();
    setStep(null);
  };

  if (step === null) return null;
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <Coach target={s.target} title={s.title} text={s.text} progress={`${step + 1} of ${STEPS.length}`} spotlight placement="auto">
      <button type="button" onClick={finish} className={`${btn} text-slate-400 hover:text-white`}>
        Skip tour
      </button>
      <div className="flex items-center gap-1.5">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className={`${btn} border border-white/10 text-slate-200 hover:bg-white/10`}>
            Back
          </button>
        )}
        <button
          type="button"
          onClick={last ? finish : () => setStep(step + 1)}
          className={`${btn} bg-accent-500 text-white hover:bg-accent-600`}
        >
          {last ? 'Done' : 'Next'}
        </button>
      </div>
    </Coach>
  );
};

export default AppTour;
