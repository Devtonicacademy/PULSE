import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  ChevronRight,
  Crosshair,
  Eye,
  Footprints,
  Gamepad2,
  Layers,
  Loader2,
  MapPin,
  Moon,
  Play,
  Route,
  Sparkles,
  Square,
  Sun,
  Sunrise,
  Sunset,
  X
} from 'lucide-react';
import type { NavigationRoute } from '../../../utils/wayfindingUtils';
import type { CameraMode } from './CameraRig';
import type { LightPreset } from './PulseScene';

/**
 * On-map controls for Pulse 3D. Mirrors PulseMap's HUD markup so switching
 * engines doesn't change the controls people already know.
 */

export type WalkDirection = 'forward' | 'backward' | 'turn-left' | 'turn-right';

export interface HudHotspot {
  name: string;
  coords: [number, number];
  hasData: boolean;
}

interface MapHudProps {
  showControls: boolean;
  cameraMode: CameraMode;
  onCameraMode: (mode: CameraMode) => void;
  hotspots: HudHotspot[];
  onHotspot: (coords: [number, number]) => void;
  lightPreset: LightPreset;
  onLightPreset: (preset: LightPreset) => void;
  buildingsVisible: boolean;
  onToggleBuildings: () => void;
  onWalk: (direction: WalkDirection) => void;
  onRecenter: () => void;
  isLocating: boolean;
  cameraNotice: string | null;
  route: NavigationRoute | null;
  isSimulatingWalk: boolean;
  simulationProgress: number;
  onToggleWalkSimulation: () => void;
  onStopNavigation: () => void;
}

const LIGHT_PRESET_OPTIONS = [
  { id: 'night', label: 'Night', icon: Moon, color: 'text-cyan-400' },
  { id: 'dusk', label: 'Dusk', icon: Sunset, color: 'text-amber-400' },
  { id: 'dawn', label: 'Dawn', icon: Sunrise, color: 'text-rose-400' },
  { id: 'day', label: 'Day', icon: Sun, color: 'text-yellow-300' }
] as const;

const PAD_BUTTON =
  'w-8 h-8 rounded-lg bg-white/10 hover:bg-cyan-500/30 active:scale-95 text-slate-200 hover:text-cyan-300 flex items-center justify-center border border-white/10 transition-all shadow-sm';

export const MapHud: React.FC<MapHudProps> = ({
  showControls,
  cameraMode,
  onCameraMode,
  hotspots,
  onHotspot,
  lightPreset,
  onLightPreset,
  buildingsVisible,
  onToggleBuildings,
  onWalk,
  onRecenter,
  isLocating,
  cameraNotice,
  route,
  isSimulatingWalk,
  simulationProgress,
  onToggleWalkSimulation,
  onStopNavigation
}) => {
  const [showHotspotMenu, setShowHotspotMenu] = useState(false);
  const [showEnvironmentMenu, setShowEnvironmentMenu] = useState(false);

  return (
    <>
      {/* Street wayfinding HUD */}
      {route && (
        <div className="absolute top-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-30 animate-slide-up">
          <div className="glass-panel p-4 rounded-3xl border border-cyan-500/40 bg-[#0A0E17]/95 shadow-2xl backdrop-blur-xl text-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1">
                  <Route className="w-3 h-3 text-cyan-400" />
                  <span>Street Wayfinding HUD</span>
                </span>
              </div>
              <button
                onClick={onStopNavigation}
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
                  <span className="text-cyan-400 font-bold">{route.totalDistanceMeters}m remaining</span>
                  <span>•</span>
                  <span className="text-amber-300 font-semibold">~{route.estimatedWalkingMinutes} min walk</span>
                </div>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-black text-sm">
                🎯
              </div>
            </div>

            {route.routeSource === 'estimate' && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px]">
                Approximate route: this trip leaves the streets we have map data for.
              </div>
            )}

            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs font-semibold">
              <Footprints className="w-4 h-4 text-cyan-400 shrink-0 animate-bounce" />
              <span className="truncate">
                {isSimulatingWalk
                  ? `Walking in 3D: ${(simulationProgress * 100).toFixed(0)}% reached`
                  : 'Follow street route ahead to destination'}
              </span>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={onToggleWalkSimulation}
                className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                  isSimulatingWalk
                    ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-cyan-500/30'
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
              <button
                onClick={onStopNavigation}
                className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors border border-white/5"
              >
                End
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Camera, hotspot and atmosphere controls */}
      {showControls && !route && (
        <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
          <div className="flex items-center gap-1 p-1 rounded-2xl glass-hud border border-white/15 shadow-2xl backdrop-blur-2xl">
            <button
              onClick={() => onCameraMode('fpv')}
              title="First-Person Street Level View (72° tilt, locked to avatar)"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                cameraMode === 'fpv'
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/30 ring-1 ring-white/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Eye className={`w-3.5 h-3.5 ${cameraMode === 'fpv' ? 'text-white' : 'text-rose-400'}`} />
              <span>FPV 72°</span>
            </button>
            <button
              onClick={() => onCameraMode('aerial')}
              title="3D Aerial Perspective (58° pitch)"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                cameraMode === 'aerial'
                  ? 'bg-cyan-500/30 text-cyan-200 border border-cyan-400/50 shadow-lg shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Box className={`w-3.5 h-3.5 ${cameraMode === 'aerial' ? 'text-cyan-200' : 'text-cyan-400'}`} />
              <span>3D Aerial</span>
            </button>
            <button
              onClick={() => onCameraMode('overview')}
              title="2D Tactical Overview (0° pitch)"
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                cameraMode === 'overview'
                  ? 'bg-white/20 text-white border border-white/30 shadow-md'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>2D Map</span>
            </button>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowHotspotMenu((prev) => !prev)}
              title="Teleport to Iconic Lagos 3D Hotspots"
              className={`flex items-center gap-1.5 py-1.5 px-2.5 rounded-2xl glass-hud border border-white/15 shadow-2xl backdrop-blur-2xl text-[11px] font-bold transition-all ${
                showHotspotMenu ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-cyan-400" />
              <span>Hotspots</span>
            </button>

            {showHotspotMenu && (
              <div className="absolute top-full left-0 mt-2 p-2 rounded-2xl glass-dropdown border border-white/15 shadow-2xl backdrop-blur-2xl flex flex-col gap-1 min-w-[230px] z-30 animate-fade-in bg-[#0A0E17]/95">
                <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                  Lagos 3D Hotspots
                </div>
                {hotspots.map((spot) => (
                  <button
                    key={spot.name}
                    onClick={() => {
                      setShowHotspotMenu(false);
                      onHotspot(spot.coords);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-cyan-500/15 text-slate-200 hover:text-cyan-300 text-xs font-semibold flex items-center justify-between gap-2 transition-colors"
                  >
                    <span>{spot.name}</span>
                    {spot.hasData ? (
                      <ChevronRight className="w-3 h-3 text-cyan-400/60 shrink-0" />
                    ) : (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-white/10 text-slate-400 shrink-0">no 3D data</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowEnvironmentMenu((prev) => !prev)}
              title="Atmosphere, Lighting & 3D Settings"
              className={`flex items-center gap-1 p-2 rounded-2xl glass-hud border border-white/15 shadow-2xl backdrop-blur-2xl transition-all ${
                showEnvironmentMenu ? 'bg-white/20 text-white border-white/40' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-400" />
            </button>

            {showEnvironmentMenu && (
              <div className="absolute top-full left-0 mt-2 p-2.5 rounded-2xl glass-dropdown border border-white/15 shadow-2xl backdrop-blur-2xl flex flex-col gap-2 min-w-[200px] z-30 animate-fade-in bg-[#0A0E17]/95">
                <div className="text-[10px] font-bold text-slate-400 px-1 uppercase tracking-wider flex items-center justify-between">
                  <span>Atmosphere Lighting</span>
                  <span className="text-cyan-400 capitalize">{lightPreset}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {LIGHT_PRESET_OPTIONS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => onLightPreset(preset.id)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                          lightPreset === preset.id
                            ? 'bg-white/15 text-white border border-white/30 shadow-sm'
                            : 'text-slate-300 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${preset.color}`} />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="border-t border-white/10 pt-2">
                  <button
                    onClick={onToggleBuildings}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                      buildingsVisible ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-cyan-400" />
                      <span>3D Buildings</span>
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                        buildingsVisible ? 'bg-cyan-400/20 text-cyan-300' : 'bg-white/10 text-slate-400'
                      }`}
                    >
                      {buildingsVisible ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* WASD walking pad */}
      {showControls && (
        <div className="absolute bottom-6 left-4 z-20 pointer-events-auto">
          <div className="glass-panel p-2.5 rounded-2xl border border-white/15 bg-[#0A0E17]/85 backdrop-blur-xl shadow-2xl flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
              <Gamepad2 className="w-3 h-3 text-cyan-400" />
              <span>Walk (WASD)</span>
            </div>
            <button onClick={() => onWalk('forward')} title="Walk Forward (W / Up Arrow)" className={PAD_BUTTON}>
              <ArrowUp className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1.5">
              <button onClick={() => onWalk('turn-left')} title="Turn Left (A / Left Arrow)" className={PAD_BUTTON}>
                <ArrowLeft className="w-4 h-4" />
              </button>
              <button onClick={() => onWalk('backward')} title="Step Backward (S / Down Arrow)" className={PAD_BUTTON}>
                <ArrowDown className="w-4 h-4" />
              </button>
              <button onClick={() => onWalk('turn-right')} title="Turn Right (D / Right Arrow)" className={PAD_BUTTON}>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {cameraNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none cinematic-badge-enter">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl glass-hud border border-cyan-400/40 text-white shadow-2xl backdrop-blur-2xl bg-[#0A0E17]/90">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 camera-lens-pulse" />
            <span className="text-xs font-bold tracking-wide">{cameraNotice}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2">
        <button
          onClick={onRecenter}
          disabled={isLocating}
          title="Recenter on My Location"
          className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-white/15 shadow-xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center group disabled:opacity-50"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
          ) : (
            <Crosshair className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          )}
        </button>
      </div>

      {isLocating && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/40 text-cyan-300 text-xs font-semibold shadow-xl backdrop-blur-md animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Locating you…</span>
        </div>
      )}
    </>
  );
};
