import React from 'react';
import { CheckCircle2, Footprints, Navigation, Pause, Play, Route, Square, X } from 'lucide-react';
import type { NavigationRoute } from '../../utils/wayfindingUtils';

export type GuidanceMode = 'guide' | 'auto';

interface WayfindingHudProps {
  route: NavigationRoute;
  /**
   * 'guide': the walker walks (real GPS) and the HUD gives turn-by-turn directions.
   * 'auto': the avatar walks the route by itself (play / pause).
   * Left out (the flat map): the original single-mode HUD with a play button.
   */
  mode?: GuidanceMode;
  isSimulatingWalk: boolean;
  simulationProgress: number;
  /** "Turn left in 40 m", or null before the first cue is known */
  instruction?: string | null;
  /** Meters still to walk (the route length until the walker starts moving) */
  remainingMeters?: number | null;
  arrived?: boolean;
  onToggleWalkSimulation: () => void;
  /** Change between guiding and auto-walking without losing the route (3D only) */
  onSwitchMode?: () => void;
  onStop: () => void;
  /** Continue the route in Pulse 3D (flat map only) */
  onWalkIn3D?: () => void;
  /** Extra offset from the top, for maps that already have a bar there */
  topClassName?: string;
}

/** A pin that is further than this from where the route ends is worth a note */
const OFF_STREET_NOTE_METERS = 30;

/**
 * Street wayfinding HUD shared by the flat map and Pulse 3D.
 * On phones it is a single slim, see-through row (what to do next, distance, controls) pinned to the top
 * so the map and the avatar stay visible; from `sm` up it is the full card.
 */
export const WayfindingHud: React.FC<WayfindingHudProps> = ({
  route,
  mode,
  isSimulatingWalk,
  simulationProgress,
  instruction = null,
  remainingMeters = null,
  arrived = false,
  onToggleWalkSimulation,
  onSwitchMode,
  onStop,
  onWalkIn3D,
  topClassName = 'top-2 sm:top-4'
}) => {
  const progress = Math.round(simulationProgress * 100);
  const left = Math.max(0, Math.round(remainingMeters ?? route.totalDistanceMeters));
  const minutes = Math.max(1, Math.ceil(left / 80));
  const showPlay = !arrived && (mode === undefined || mode === 'auto');
  const paused = mode === 'auto' && !isSimulatingWalk && progress > 0;
  const switchLabel = mode === 'guide' ? 'Switch to Walk it for me' : 'Switch to Guide me';
  const headline = arrived ? 'You have arrived' : (instruction ?? route.destinationTitle);
  const offStreet = (route.endsShortMeters ?? 0) > OFF_STREET_NOTE_METERS ? (route.endsShortMeters ?? 0) : 0;

  const desktopLine = arrived
    ? 'You have arrived'
    : (instruction ??
      (isSimulatingWalk ? `Walking in 3D: ${progress}% reached` : paused ? 'Walk paused' : 'Follow the street route to the destination'));

  return (
    <div
      className={`absolute left-2 right-2 sm:left-6 sm:right-auto sm:max-w-md z-30 animate-slide-up pointer-events-none ${topClassName}`}
      style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Phones: one slim row */}
      <div className="sm:hidden pointer-events-auto relative overflow-hidden rounded-2xl border border-signal-500/30 bg-[#0A0E17]/60 backdrop-blur-md shadow-lg text-white">
        <div className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5">
          {arrived ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Route className="w-4 h-4 text-signal-400 shrink-0" />}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate leading-tight">{headline}</div>
            <div className="text-[10px] leading-tight text-slate-300 truncate">
              {arrived ? (
                <span>{route.destinationTitle}</span>
              ) : (
                <>
                  <span className="text-signal-300 font-bold">{left}m</span>
                  <span> · ~{minutes} min</span>
                  {instruction && <span> · {route.destinationTitle}</span>}
                </>
              )}
            </div>
          </div>
          {onSwitchMode && !arrived && (
            <button
              onClick={onSwitchMode}
              aria-label={switchLabel}
              title={switchLabel}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-signal-200 bg-white/10 active:scale-95"
            >
              {mode === 'guide' ? <Footprints className="w-4 h-4" /> : <Navigation className="w-4 h-4" />}
            </button>
          )}
          {showPlay && (
            <button
              onClick={onToggleWalkSimulation}
              aria-label={isSimulatingWalk ? 'Pause walk' : paused ? 'Resume walk' : 'Walk route in 3D'}
              className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${
                isSimulatingWalk ? 'bg-accent-500 text-white' : 'bg-signal-500 text-slate-950'
              }`}
            >
              {isSimulatingWalk ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>
          )}
          <button
            onClick={onStop}
            aria-label={arrived ? 'Done' : 'End navigation'}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {(isSimulatingWalk || paused) && (
          <div className="h-0.5 bg-white/10">
            <div className="h-full bg-signal-400 transition-[width] duration-300" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* Tablets and desktops: the full card */}
      <div className="hidden sm:block pointer-events-auto p-4 rounded-3xl border border-signal-500/40 bg-[#0A0E17]/90 shadow-2xl backdrop-blur-xl text-white space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-signal-400 animate-ping"></span>
            <span className="text-[10px] font-black uppercase tracking-wider text-signal-300 flex items-center gap-1">
              <Route className="w-3 h-3 text-signal-400" />
              <span>Street Wayfinding HUD{mode === 'guide' ? ' · Guide' : mode === 'auto' ? ' · Auto-walk' : ''}</span>
            </span>
          </div>
          <button
            onClick={onStop}
            className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Exit Navigation"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-2xl border border-white/10">
          <div>
            <h4 className="font-bold text-sm text-white truncate max-w-[200px]">{route.destinationTitle}</h4>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
              <span className="text-signal-400 font-bold">{left}m remaining</span>
              <span>•</span>
              <span className="text-amber-300 font-semibold">~{minutes} min walk</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-signal-500/20 border border-signal-500/40 flex items-center justify-center text-signal-300 font-black text-sm">
            {arrived ? '✅' : '🎯'}
          </div>
        </div>

        {offStreet > 0 && (
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px]">
            The route ends on the nearest street, about {offStreet}m from the pin.
          </div>
        )}

        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
            arrived ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-signal-500/10 border-signal-500/30 text-signal-200'
          }`}
        >
          {arrived ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <Footprints className="w-4 h-4 text-signal-400 shrink-0 animate-bounce" />}
          <span className="truncate">{desktopLine}</span>
        </div>

        <div className="flex items-center gap-2 pt-1">
          {showPlay && (
            <button
              onClick={onToggleWalkSimulation}
              className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                isSimulatingWalk
                  ? 'bg-accent-500 hover:bg-accent-600 text-white shadow-accent-500/30'
                  : 'bg-gradient-to-r from-signal-500 to-blue-600 hover:from-signal-400 hover:to-blue-500 text-slate-950 font-black shadow-signal-500/30'
              }`}
            >
              {isSimulatingWalk ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  <span>Pause Walk</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{paused ? 'Resume Walk' : 'Walk Route in 3D'}</span>
                </>
              )}
            </button>
          )}
          {onSwitchMode && !arrived && (
            <button
              onClick={onSwitchMode}
              title={switchLabel}
              className="flex-1 py-2.5 px-3 rounded-xl bg-signal-500/15 hover:bg-signal-500/25 text-signal-200 text-xs font-bold transition-colors border border-signal-400/30 flex items-center justify-center gap-1.5"
            >
              {mode === 'guide' ? <Footprints className="w-3.5 h-3.5" /> : <Navigation className="w-3.5 h-3.5" />}
              <span>{mode === 'guide' ? 'Walk it for me' : 'Guide me'}</span>
            </button>
          )}
          {onWalkIn3D && (
            <button
              onClick={onWalkIn3D}
              title="Continue this route in Pulse 3D"
              className="py-2.5 px-3 rounded-xl bg-signal-500/15 hover:bg-signal-500/25 text-signal-200 text-xs font-bold transition-colors border border-signal-400/30"
            >
              3D
            </button>
          )}
          <button
            onClick={onStop}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors border border-white/5"
          >
            {arrived ? 'Done' : 'End'}
          </button>
        </div>
      </div>
    </div>
  );
};
