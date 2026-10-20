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
  Sun,
  Sunrise,
  Sunset
} from 'lucide-react';
import type { NavigationRoute } from '../../../utils/wayfindingUtils';
import { WayfindingHud, type GuidanceMode } from '../WayfindingHud';
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
  /** How the route is being followed ('guide' or 'auto'), with the guidance for it */
  navMode?: GuidanceMode;
  instruction?: string | null;
  remainingMeters?: number | null;
  arrived?: boolean;
  onSwitchMode?: () => void;
}

const LIGHT_PRESET_OPTIONS = [
  { id: 'night', label: 'Night', icon: Moon, color: 'text-slate-200' },
  { id: 'dusk', label: 'Dusk', icon: Sunset, color: 'text-slate-300' },
  { id: 'dawn', label: 'Dawn', icon: Sunrise, color: 'text-slate-300' },
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
  onStopNavigation,
  navMode,
  instruction,
  remainingMeters,
  arrived,
  onSwitchMode
}) => {
  const [showHotspotMenu, setShowHotspotMenu] = useState(false);
  const [showEnvironmentMenu, setShowEnvironmentMenu] = useState(false);

  return (
    <>
      {/* Street wayfinding HUD: a slim see-through row on phones */}
      {route && (
        <WayfindingHud
          route={route}
          mode={navMode}
          isSimulatingWalk={isSimulatingWalk}
          simulationProgress={simulationProgress}
          instruction={instruction}
          remainingMeters={remainingMeters}
          arrived={arrived}
          onToggleWalkSimulation={onToggleWalkSimulation}
          onSwitchMode={onSwitchMode}
          onStop={onStopNavigation}
        />
      )}

      {/* Camera, hotspot and atmosphere controls */}
      {showControls && !route && (
        <div className="absolute top-2 left-2 right-2 sm:top-4 sm:left-4 sm:right-auto z-20 flex flex-wrap items-center gap-1.5 sm:gap-2 pointer-events-none [&>*]:pointer-events-auto">
          <div className="flex items-center gap-1 p-1 rounded-lg glass-hud border border-white/10 shadow-2xl backdrop-blur-2xl">
            <button
              onClick={() => onCameraMode('fpv')}
              title="First-Person Street Level View (72° tilt, locked to avatar)"
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 [@media(pointer:coarse)]:py-2.5 rounded-md text-xs font-medium transition-all ease-apple ${
                cameraMode === 'fpv'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Eye className={`w-3.5 h-3.5 ${cameraMode === 'fpv' ? 'text-white' : 'text-slate-300'}`} />
              <span>FPV<span className="hidden sm:inline"> 72°</span></span>
            </button>
            <button
              onClick={() => onCameraMode('aerial')}
              title="3D Aerial Perspective (58° pitch)"
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 [@media(pointer:coarse)]:py-2.5 rounded-md text-xs font-medium transition-all ease-apple ${
                cameraMode === 'aerial'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Box className={`w-3.5 h-3.5 ${cameraMode === 'aerial' ? 'text-slate-200' : 'text-slate-200'}`} />
              <span><span className="hidden sm:inline">3D </span>Aerial</span>
            </button>
            <button
              onClick={() => onCameraMode('overview')}
              title="2D Tactical Overview (0° pitch)"
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 [@media(pointer:coarse)]:py-2.5 rounded-md text-xs font-medium transition-all ease-apple ${
                cameraMode === 'overview'
                  ? 'bg-white/15 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>2D<span className="hidden sm:inline"> Map</span></span>
            </button>
          </div>

          <div className="sm:relative">
            <button
              onClick={() => setShowHotspotMenu((prev) => !prev)}
              title="Teleport to Iconic Lagos 3D Hotspots"
              className={`flex items-center gap-1.5 py-1.5 [@media(pointer:coarse)]:py-2.5 px-2.5 rounded-lg glass-hud border border-white/10 shadow-2xl backdrop-blur-2xl text-xs font-medium transition-all ease-apple ${
                showHotspotMenu ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <MapPin className="w-3.5 h-3.5 text-slate-200" />
              <span className="hidden sm:inline">Hotspots</span>
            </button>

            {showHotspotMenu && (
              <div className="absolute top-full left-0 max-sm:right-0 mt-2 p-2 rounded-lg glass-dropdown border border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col gap-1 sm:min-w-[230px] max-h-[60dvh] overflow-y-auto z-30 animate-fade-in bg-[#0F1524]/95">
                <div className="text-xs font-medium text-slate-400 px-2 py-1">
                  Lagos 3D Hotspots
                </div>
                {hotspots.map((spot) => (
                  <button
                    key={spot.name}
                    onClick={() => {
                      setShowHotspotMenu(false);
                      onHotspot(spot.coords);
                    }}
                    className="w-full text-left px-2.5 py-1.5 rounded-md hover:bg-white/10 text-slate-200 hover:text-white text-xs font-medium flex items-center justify-between gap-2 transition-colors"
                  >
                    <span>{spot.name}</span>
                    {spot.hasData ? (
                      <ChevronRight className="w-3 h-3 text-slate-200/60 shrink-0" />
                    ) : (
                      <span className="text-[11px] px-1.5 py-0.5 rounded-md bg-white/10 text-slate-400 shrink-0">no 3D data</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="sm:relative">
            <button
              onClick={() => setShowEnvironmentMenu((prev) => !prev)}
              title="Atmosphere, Lighting & 3D Settings"
              className={`flex items-center gap-1 p-2 rounded-lg glass-hud border border-white/10 shadow-2xl backdrop-blur-2xl transition-all ease-apple ${
                showEnvironmentMenu ? 'bg-white/15 text-white' : 'text-slate-300 hover:text-white hover:bg-white/10'
              }`}
            >
              <Sun className="w-4 h-4 text-slate-300" />
            </button>

            {showEnvironmentMenu && (
              <div className="absolute top-full left-0 max-sm:right-0 mt-2 p-2.5 rounded-lg glass-dropdown border border-white/10 shadow-2xl backdrop-blur-2xl flex flex-col gap-2 sm:min-w-[200px] max-h-[60dvh] overflow-y-auto z-30 animate-fade-in bg-[#0F1524]/95">
                <div className="text-xs font-medium text-slate-400 px-1 flex items-center justify-between">
                  <span>Atmosphere Lighting</span>
                  <span className="text-slate-200 capitalize">{lightPreset}</span>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {LIGHT_PRESET_OPTIONS.map((preset) => {
                    const Icon = preset.icon;
                    return (
                      <button
                        key={preset.id}
                        onClick={() => onLightPreset(preset.id)}
                        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all ease-apple ${
                          lightPreset === preset.id
                            ? 'bg-white/15 text-white'
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
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ease-apple ${
                      buildingsVisible ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-200" />
                      <span>3D Buildings</span>
                    </span>
                    <span
                      className={`text-[11px] px-1.5 py-0.5 rounded-md font-semibold ${
                        buildingsVisible ? 'bg-white/10 text-slate-200' : 'bg-white/10 text-slate-400'
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
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg glass-hud border border-white/10 text-white shadow-2xl backdrop-blur-2xl bg-[#0F1524]/90">
            <div className="w-2.5 h-2.5 rounded-full bg-signal-400 " />
            <span className="text-xs font-medium tracking-wide">{cameraNotice}</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-[calc(var(--area-sheet-h,0px)+1.5rem)] transition-[bottom] duration-300 right-4 z-20 flex flex-col gap-2">
        <button
          onClick={onRecenter}
          disabled={isLocating}
          title="Recenter on My Location"
          className="p-3 rounded-lg glass-hud hover:bg-white/10 text-slate-200 active:scale-95 transition-all ease-apple flex items-center justify-center group disabled:opacity-50"
        >
          {isLocating ? (
            <Loader2 className="w-5 h-5 animate-spin text-slate-200" />
          ) : (
            <Crosshair className="w-5 h-5 group-hover:rotate-45 transition-transform" />
          )}
        </button>
      </div>

      {isLocating && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-hud text-slate-200 text-xs font-medium">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Locating you…</span>
        </div>
      )}
    </>
  );
};
