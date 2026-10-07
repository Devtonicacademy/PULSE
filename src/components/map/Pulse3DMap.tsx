import React, { useEffect, useRef, useState } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Loader2, MapPinOff } from 'lucide-react';
import type { MapboxMapProps } from './MapboxMap';
import { PulseScene } from './pulse3d/PulseScene';
import { lngLatToMeters } from '../../utils/mapProjection';

/**
 * Pulse 3D: a self-hosted night-city map rendered with Three.js from
 * OpenStreetMap tiles (public/map-tiles, built by scripts/build-map-tiles.mjs).
 * Accepts the same props as MapboxMap so AppShell can swap engines freely;
 * Mapbox-only props (accessToken, mapStyle) are accepted and ignored.
 */
export type Pulse3DMapProps = MapboxMapProps;

const AERIAL_DISTANCE = 520;
const AERIAL_PITCH_DEG = 58;

export const Pulse3DMap: React.FC<Pulse3DMapProps> = ({
  defaultCenter = [3.4219, 6.4281],
  className = '',
  style,
  children
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PulseScene | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasData, setHasData] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pulseScene = new PulseScene(container);
    sceneRef.current = pulseScene;

    const [x, y] = lngLatToMeters(defaultCenter[0], defaultCenter[1]);
    const pitch = (AERIAL_PITCH_DEG * Math.PI) / 180;
    pulseScene.camera.position.set(x, AERIAL_DISTANCE * Math.sin(pitch), -y + AERIAL_DISTANCE * Math.cos(pitch));

    const controls = new OrbitControls(pulseScene.camera, pulseScene.renderer.domElement);
    controls.target.set(x, 0, -y);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.47;
    controls.minDistance = 30;
    controls.maxDistance = 2500;
    controls.update();

    const stopFrame = pulseScene.onFrame(() => {
      controls.update();
      pulseScene.tiles.setFocus(controls.target.x, -controls.target.z);
    });

    pulseScene.tiles
      .init()
      .then(() => {
        setHasData(pulseScene.tiles.hasDataAt(x, y));
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('[PULSE 3D] Map data unavailable:', err);
        setStatus('error');
      });
    pulseScene.start();

    if (import.meta.env.DEV) {
      Object.assign(container, { __pulseScene: pulseScene, __pulseControls: controls });
    }

    return () => {
      stopFrame();
      controls.dispose();
      pulseScene.dispose();
      sceneRef.current = null;
    };
    // The scene is built once; camera/hub changes are handled without rebuilding (Phase 3)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`relative w-full h-full min-h-[350px] overflow-hidden rounded-2xl bg-[#05070d] ${className}`}
      style={style}
    >
      <div ref={containerRef} className="absolute inset-0" data-testid="pulse3d-container" />

      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-hud text-xs text-cyan-300">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading city…
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="max-w-xs text-center px-4 py-3 rounded-2xl glass-panel text-xs text-slate-300">
            3D map data could not be loaded. Switch to Mapbox 3D or Radar from the map engine toggle.
          </div>
        </div>
      )}

      {status === 'ready' && !hasData && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-hud text-[11px] text-slate-300">
            <MapPinOff className="w-3.5 h-3.5 text-amber-400" /> No 3D data for this area yet
          </div>
        </div>
      )}

      <div className="absolute bottom-1 right-2 z-10 text-[10px] text-slate-500 pointer-events-auto">
        ©{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="hover:text-slate-300 underline-offset-2 hover:underline"
        >
          OpenStreetMap
        </a>{' '}
        contributors
      </div>

      {children}
    </div>
  );
};

export default Pulse3DMap;
