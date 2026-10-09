import React from 'react';
import { Footprints, Pause, Play, Route, Square, X } from 'lucide-react';
import type { NavigationRoute } from '../../utils/wayfindingUtils';

interface WayfindingHudProps {
  route: NavigationRoute;
  isSimulatingWalk: boolean;
  simulationProgress: number;
  onToggleWalkSimulation: () => void;
  onStop: () => void;
  /** Continue the route in Pulse 3D (flat map only) */
  onWalkIn3D?: () => void;
  /** Extra offset from the top, for maps that already have a bar there */
  topClassName?: string;
}

/**
 * Street wayfinding HUD shared by the flat map and Pulse 3D.
 * On phones it is a single slim, see-through row (destination, distance, play/pause, close) pinned
 * to the top so the map and the avatar stay visible; from `sm` up it is the full card.
 */
export const WayfindingHud: React.FC<WayfindingHudProps> = ({
  route,
  isSimulatingWalk,
  simulationProgress,
  onToggleWalkSimulation,
  onStop,
  onWalkIn3D,
  topClassName = 'top-2 sm:top-4'
}) => {
  const progress = Math.round(simulationProgress * 100);

  return (
    <div
      className={`absolute left-2 right-2 sm:left-6 sm:right-auto sm:max-w-md z-30 animate-slide-up pointer-events-none ${topClassName}`}
      style={{ marginTop: 'env(safe-area-inset-top, 0px)' }}
    >
      {/* Phones: one slim row */}
      <div className="sm:hidden pointer-events-auto relative overflow-hidden rounded-2xl border border-signal-500/30 bg-[#0A0E17]/60 backdrop-blur-md shadow-lg text-white">
        <div className="flex items-center gap-2 pl-3 pr-1.5 py-1.5">
          <Route className="w-4 h-4 text-signal-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold truncate leading-tight">{route.destinationTitle}</div>
            <div className="text-[10px] leading-tight text-slate-300 truncate">
              <span className="text-signal-300 font-bold">{route.totalDistanceMeters}m</span>
              <span> · ~{route.estimatedWalkingMinutes} min</span>
              {route.routeSource === 'estimate' && <span className="text-amber-300"> · approx.</span>}
            </div>
          </div>
          <button
            onClick={onToggleWalkSimulation}
            aria-label={isSimulatingWalk ? 'Pause 3D walk' : 'Walk route in 3D'}
            className={`w-9 h-9 rounded-xl flex items-center justify-center active:scale-95 transition-transform ${
              isSimulatingWalk ? 'bg-accent-500 text-white' : 'bg-signal-500 text-slate-950'
            }`}
          >
            {isSimulatingWalk ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
          </button>
          <button
            onClick={onStop}
            aria-label="End navigation"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-300 hover:text-white hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {isSimulatingWalk && (
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
              <span>Street Wayfinding HUD</span>
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
              <span className="text-signal-400 font-bold">{route.totalDistanceMeters}m remaining</span>
              <span>•</span>
              <span className="text-amber-300 font-semibold">~{route.estimatedWalkingMinutes} min walk</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-signal-500/20 border border-signal-500/40 flex items-center justify-center text-signal-300 font-black text-sm">
            🎯
          </div>
        </div>

        {route.routeSource === 'estimate' && (
          <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px]">
            Approximate route: this trip leaves the streets we have map data for.
          </div>
        )}

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-signal-500/10 border border-signal-500/30 text-signal-200 text-xs font-semibold">
          <Footprints className="w-4 h-4 text-signal-400 shrink-0 animate-bounce" />
          <span className="truncate">
            {isSimulatingWalk ? `Walking in 3D: ${progress}% reached` : 'Follow street route ahead to destination'}
          </span>
        </div>

        <div className="flex items-center gap-2 pt-1">
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
                <span>Pause 3D Walk</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Walk Route in 3D</span>
              </>
            )}
          </button>
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
            End
          </button>
        </div>
      </div>
    </div>
  );
};
