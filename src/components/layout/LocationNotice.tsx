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
  // On phones the hint is two lines until tapped, so the notice does not cover the map
  const [expanded, setExpanded] = useState(false);

  // The user fixed the permission in the address bar: locate again without being asked
  useEffect(() => {
    if (!status.problem) return;
    return watchLocationPermission((permission) => {
      if (permission === 'granted') onRetry();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.problem]);

  // Below desktop width the notice sits over the map, so it steps aside after a few seconds
  const noticeKey = status.problem ? `${status.source}:${status.problem}` : 'advice';
  useEffect(() => {
    if (!window.matchMedia?.('(max-width: 1023px)').matches) return;
    const timer = window.setTimeout(() => setDismissed(status.problem ? `${status.source}:${status.problem}` : null), 7000);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticeKey]);

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
      className="fixed inset-x-0 lg:left-64 xl:left-72 z-40 top-[3.75rem] [@media(max-height:500px)]:top-[2.75rem] lg:top-16 flex justify-center px-2 sm:px-4 pointer-events-none"
      data-testid="location-notice"
    >
      <div className="pointer-events-auto w-full max-w-md flex items-start gap-2 lg:gap-3 p-2.5 lg:p-3.5 rounded-lg glass-panel border border-white/10 bg-slate-900/80 lg:bg-transparent shadow-xl lg:shadow-2xl animate-fade-in">
        <div className="hidden lg:block p-2 rounded-md bg-amber-500/20 text-slate-300 border border-white/10 shrink-0">
          <Icon className="w-4 h-4" />
        </div>
        <Icon className="lg:hidden w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-white">{title}</div>
          <p
            onClick={() => setExpanded((open) => !open)}
            className={`text-xs text-slate-200 leading-snug lg:leading-relaxed mt-0.5 lg:line-clamp-none ${
              expanded ? '' : 'line-clamp-1'
            }`}
          >
            {hint}
          </p>
          {approximate && status.place && (
            <p className="text-xs text-amber-200 mt-1 font-medium">
              Approximate area: {status.place}
              {status.accuracy != null ? ` (${formatAccuracy(status.accuracy)})` : ''}
            </p>
          )}
          <button
            onClick={onRetry}
            disabled={isLocating}
            className="hidden lg:block mt-2 px-3 py-1.5 rounded-md bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 text-xs font-medium transition-colors"
          >
            {isLocating ? 'Locating…' : 'Try again'}
          </button>
        </div>
        {/* Phones: the retry button sits on the same row so the notice stays two lines tall */}
        <button
          onClick={onRetry}
          disabled={isLocating}
          className="lg:hidden self-center px-3 py-2 rounded-md bg-amber-400 active:bg-amber-300 disabled:opacity-60 text-slate-950 text-xs font-medium shrink-0"
        >
          {isLocating ? '…' : 'Retry'}
        </button>
        <button
          onClick={() => setDismissed(key)}
          aria-label="Dismiss"
          className="p-1 [@media(pointer:coarse)]:p-2 rounded-full text-slate-300 hover:text-white shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
