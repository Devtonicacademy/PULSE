import React from 'react';
import { Footprints, Loader2, MapPinOff, Navigation, X } from 'lucide-react';

export type RouteStatus = 'finding' | 'none' | 'ready';

interface RouteChooserSheetProps {
  status: RouteStatus;
  destinationTitle: string;
  distanceMeters?: number;
  minutes?: number;
  /** The route stops on the nearest street, this far from the pin (meters), when the pin is off the streets */
  endsShortMeters?: number;
  onGuide: () => void;
  onAuto: () => void;
  onCancel: () => void;
}

const OFF_STREET_NOTE_METERS = 30;

/**
 * Bottom sheet shown once the route is worked out: how far and how long, and how to take it. Both
 * choices are off while the route is being found and when there is no street route to the place.
 */
export const RouteChooserSheet: React.FC<RouteChooserSheetProps> = ({
  status,
  destinationTitle,
  distanceMeters,
  minutes,
  endsShortMeters = 0,
  onGuide,
  onAuto,
  onCancel
}) => {
  const ready = status === 'ready';
  return (
    <div
      className="absolute inset-x-2 bottom-2 sm:left-4 sm:right-auto sm:w-[26rem] z-50 animate-slide-up"
      role="dialog"
      aria-label="Choose how to get there"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      data-testid="route-chooser"
    >
      <div className="rounded-3xl border border-signal-500/40 bg-[#0A0E17]/95 shadow-2xl backdrop-blur-xl p-4 text-white space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-signal-300">Getting there</div>
            <h3 className="text-sm font-bold truncate">{destinationTitle}</h3>
            {status === 'finding' && (
              <p className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
                <Loader2 className="w-3 h-3 animate-spin" /> Finding a street route…
              </p>
            )}
            {status === 'none' && (
              <p className="text-xs font-semibold text-amber-300 flex items-center gap-1.5 mt-0.5" role="status">
                <MapPinOff className="w-3.5 h-3.5" /> No street route here
              </p>
            )}
            {ready && (
              <p className="text-[11px] text-slate-300 mt-0.5">
                <span className="text-signal-300 font-bold">{distanceMeters}m</span>
                <span> · ~{minutes} min walk</span>
              </p>
            )}
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {ready && endsShortMeters > OFF_STREET_NOTE_METERS && (
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px]">
            The route ends on the nearest street, about {endsShortMeters}m from the pin.
          </div>
        )}
        {status === 'none' && (
          <p className="text-[11px] text-slate-400">
            There are no mapped streets joining where you are to that place. Try a spot closer to a road.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onGuide}
            disabled={!ready}
            className="py-3 px-3 rounded-2xl bg-gradient-to-r from-signal-500 to-blue-600 text-slate-950 text-xs font-black flex flex-col items-center gap-1 shadow-lg shadow-signal-500/20 disabled:opacity-40 disabled:shadow-none active:scale-[0.98] transition-transform"
          >
            <Navigation className="w-4 h-4" />
            <span>Guide me</span>
            <span className="text-[10px] font-semibold opacity-80">You walk, with directions</span>
          </button>
          <button
            onClick={onAuto}
            disabled={!ready}
            className="py-3 px-3 rounded-2xl bg-white/10 border border-white/15 text-white text-xs font-black flex flex-col items-center gap-1 disabled:opacity-40 active:scale-[0.98] transition-transform"
          >
            <Footprints className="w-4 h-4 text-signal-300" />
            <span>Walk it for me</span>
            <span className="text-[10px] font-semibold text-slate-300">The avatar walks it</span>
          </button>
        </div>
      </div>
    </div>
  );
};
