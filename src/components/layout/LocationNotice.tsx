import React, { useEffect, useState } from 'react';
import { LocateFixed, MapPinOff, Smartphone, X } from 'lucide-react';
import {
  accuracyAdvice,
  currentPlatform,
  describeLocationProblem,
  formatAccuracy,
  useLocationStatus,
  watchLocationPermission
} from '../../services/locationService';

interface LocationNoticeProps {
  /** Ask for the location again (the app's own "use my location" action) */
  onRetry: () => void;
  isLocating: boolean;
}

/**
 * Tells the user when they were not located by the browser: why, what the app is showing instead
 * (an approximate spot from their network, or the city hub) and how to switch on precise location.
 * On phones it also says when the GPS fix is coarse (several kilometers usually means "precise
 * location" is off). Turning the permission on in the browser settings retries automatically.
 */
export const LocationNotice: React.FC<LocationNoticeProps> = ({ onRetry, isLocating }) => {
  const status = useLocationStatus();
  const [dismissed, setDismissed] = useState<string | null>(null);

  // The user fixed the permission in the address bar: locate again without being asked
  useEffect(() => {
    if (!status.problem) return;
    return watchLocationPermission((permission) => {
      if (permission === 'granted') onRetry();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.problem]);

  const advice =
    !status.problem && status.source === 'gps' && status.accuracy != null
      ? accuracyAdvice({ source: 'gps', accuracy: status.accuracy }, currentPlatform())
      : null;

  const showProblem = status.problem && (status.source === 'ip' || status.source === 'hub');
  if (!showProblem && !advice) return null;

  const key = showProblem ? `${status.source}:${status.problem}` : `advice:${advice!.key}`;
  if (dismissed === key) return null;

  const approximate = status.source === 'ip';
  const { title, hint } = showProblem
    ? describeLocationProblem(status.problem!, approximate)
    : { title: advice!.title, hint: advice!.hint };
  const Icon = showProblem ? (approximate ? LocateFixed : MapPinOff) : Smartphone;

  return (
    <div
      role="status"
      className="fixed inset-x-0 z-40 top-[4.25rem] lg:top-4 flex justify-center px-4 pointer-events-none"
      data-testid="location-notice"
    >
      <div className="pointer-events-auto w-full max-w-md flex items-start gap-3 p-3.5 rounded-2xl glass-panel border border-amber-400/40 shadow-2xl animate-fade-in">
        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white">{title}</div>
          <p className="text-[11px] text-slate-200 leading-relaxed mt-0.5">{hint}</p>
          {approximate && status.place && (
            <p className="text-[11px] text-amber-200 mt-1 font-medium">
              Approximate area: {status.place}
              {status.accuracy != null ? ` (${formatAccuracy(status.accuracy)})` : ''}
            </p>
          )}
          <button
            onClick={onRetry}
            disabled={isLocating}
            className="mt-2 px-3 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 text-[11px] font-bold transition-colors"
          >
            {isLocating ? 'Locating…' : 'Try again'}
          </button>
        </div>
        <button
          onClick={() => setDismissed(key)}
          aria-label="Dismiss"
          className="p-1 rounded-full text-slate-300 hover:text-white shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
