import React, { useState } from 'react';
import {
  Box,
  ChevronRight,
  Crosshair,
  Eye,
  Layers,
  Loader2,
  MapPin,
  Moon,
  Sparkles,
  Sun,
  Sunrise,
  Sunset
} from 'lucide-react';
import type { NavigationRoute } from '../../../utils/wayfindingUtils';
import { WayfindingHud } from '../WayfindingHud';
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
  { id: 'night', label: 'Night', icon: Moon, color: 'text-signal-400' },
  { id: 'dusk', label: 'Dusk', icon: Sunset, color: 'text-amber-400' },
  { id: 'dawn', label: 'Dawn', icon: Sunrise, color: 'text-accent-400' },
  { id: 'day', label: 'Day', icon: Sun, color: 'text-yellow-300' }
] as const;

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
      {/* Street wayfinding HUD: a slim see-through row on phones */}
      {route && (
        <WayfindingHud
          route={route}
          isSimulatingWalk={isSimulatingWalk}
          simulationProgress={simulationProgress}
          onToggleWalkSimulation={onToggleWalkSimulation}
          onStop={onStopNavigation}
        />
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
                  ? 'bg-gradient-to-r from-accent-500 to-accent2-500 text-white shadow-lg shadow-accent-500/30 ring-1 ring-white/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Eye className={`w-3.5 h-3.5 ${cameraMode === 'fpv' ? 'text-white' : 'text-accent-400'}`} />
              <span>FPV 72°</span>
            </button>
            <button
              onClick={() => onCameraMode('aerial')}
              title="3D Aerial Perspective (58° pitch)"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                cameraMode === 'aerial'
                  ? 'bg-signal-500/30 text-signal-200 border border-signal-400/50 shadow-lg shadow-signal-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Box className={`w-3.5 h-3.5 ${cameraMode === 'aerial' ? 'text-signal-200' : 'text-signal-400'}`} />
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
                showHotspotMenu ? 'bg-signal-500/20 text-signal-300 border-signal-400/40' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-signal-400" />
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
                    className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-signal-500/15 text-slate-200 hover:text-signal-300 text-xs font-semibold flex items-center justify-between gap-2 transition-colors"
                  >
                    <span>{spot.name}</span>
                    {spot.hasData ? (
                      <ChevronRight className="w-3 h-3 text-signal-400/60 shrink-0" />
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
                  <span className="text-signal-400 capitalize">{lightPreset}</span>
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
                      buildingsVisible ? 'bg-signal-500/20 text-signal-300 border border-signal-500/30' : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-signal-400" />
                      <span>3D Buildings</span>
                    </span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                        buildingsVisible ? 'bg-signal-400/20 text-signal-300' : 'bg-white/10 text-slate-400'
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

      {cameraNotice && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none cinematic-badge-enter">
          <div className="flex items-center gap-2 px-4 py-2 rounded-2xl glass-hud border border-signal-400/40 text-white shadow-2xl backdrop-blur-2xl bg-[#0A0E17]/90">
            <div className="w-2.5 h-2.5 rounded-full bg-signal-400 camera-lens-pulse" />
            <span className="text-xs font-bold tracking-wide">{cameraNotice}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-[calc(var(--area-sheet-h,0px)+1.5rem)] transition-[bottom] duration-300 right-4 z-20 flex flex-col gap-2">
        <button
          onClick={onRecenter}
          disabled={isLocating}
          title="Recenter on My Location"
          className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-signal-400 border border-white/15 shadow-xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center group disabled:opacity-50"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin text-signal-400" />
          ) : (
            <Crosshair className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          )}
        </button>
      </div>

      {isLocating && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-signal-500/40 text-signal-300 text-xs font-semibold shadow-xl backdrop-blur-md animate-pulse">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Locating you…</span>
        </div>
      )}
    </>
  );
};
