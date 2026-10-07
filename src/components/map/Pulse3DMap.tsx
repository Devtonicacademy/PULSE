import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { Loader2, MapPinOff } from 'lucide-react';
import type { MapboxMapProps } from './MapboxMap';
import { PulseScene, LightPreset } from './pulse3d/PulseScene';
import { CameraRig, CameraMode, MODE_FRAMING } from './pulse3d/CameraRig';
import { UserAvatar } from './pulse3d/UserAvatar';
import { MapHud, WalkDirection } from './pulse3d/MapHud';
import { MomentLayer } from './pulse3d/MomentLayer';
import { LAGOS_HOTSPOTS } from './lagosHotspots';
import { lngLatToMeters, metersToLngLat } from '../../utils/mapProjection';
import {
  generateStreetNavigationRoute,
  getPositionAlongRoute,
  NavigationRoute
} from '../../utils/wayfindingUtils';

/**
 * Pulse 3D: a self-hosted night-city map rendered with Three.js from
 * OpenStreetMap tiles (public/map-tiles, built by scripts/build-map-tiles.mjs).
 * Accepts the same props as MapboxMap so AppShell can swap engines freely;
 * Mapbox-only props (accessToken, mapStyle) are accepted and ignored.
 */
export type Pulse3DMapProps = MapboxMapProps;

const CAMERA_NOTICES: Record<CameraMode, string> = {
  fpv: '🎮 Street First-Person View (72° Perspective)',
  aerial: '🚁 3D Aerial View (58° Perspective)',
  overview: '🗺️ 2D Tactical Map (0° North)'
};

// Walking step sizes match MapboxMap
const STEP_FORWARD_METERS = 12;
const STEP_BACKWARD_METERS = -8;
const TURN_DEGREES = 15;
const FOCUS_UPDATE_METERS = 25;
const MOMENT_CARD_RANGE = 1500;

const normalizeHeading = (deg: number) => ((deg % 360) + 360) % 360;

function initialUser(lng: number, lat: number, heading: number) {
  const [x, y] = lngLatToMeters(lng, lat);
  return { x, y, heading: normalizeHeading(heading) };
}

export const Pulse3DMap: React.FC<Pulse3DMapProps> = ({
  defaultCenter = [3.4219, 6.4281],
  bearing = 0,
  initialCameraMode = 'fpv',
  lightPreset: initialLightPreset = 'night',
  enable3dBuildings = true,
  autoGeolocate = true,
  showUserMarker = true,
  show3dControls = true,
  moments = [],
  onSelectMoment,
  navigationDestination = null,
  onClearNavigation,
  onLocationFound,
  onLocationError,
  className = '',
  style,
  children
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PulseScene | null>(null);
  const rigRef = useRef<CameraRig | null>(null);
  const avatarRef = useRef<UserAvatar | null>(null);
  const momentLayerRef = useRef<MomentLayer | null>(null);
  const onSelectMomentRef = useRef(onSelectMoment);
  onSelectMomentRef.current = onSelectMoment;
  const routeLineRef = useRef<THREE.Line | null>(null);
  const simAnimationRef = useRef<number | null>(null);
  const lastProgressUpdateRef = useRef(0);
  const noticeTimeoutRef = useRef<number | null>(null);

  const [centerLng, centerLat] = defaultCenter;
  const lastCenterRef = useRef<[number, number]>([centerLng, centerLat]);

  // User position in map meters + heading, kept in a ref so per-frame updates skip React
  const user = useRef(initialUser(centerLng, centerLat, bearing));
  const cameraModeRef = useRef<CameraMode>(initialCameraMode);
  const activeRouteRef = useRef<NavigationRoute | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [hasData, setHasData] = useState(true);
  const [cameraMode, setCameraMode] = useState<CameraMode>(initialCameraMode);
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const [lightPreset, setLightPreset] = useState<LightPreset>(initialLightPreset);
  const [buildingsVisible, setBuildingsVisible] = useState(enable3dBuildings);
  const [isLocating, setIsLocating] = useState(false);
  const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
  const [isSimulatingWalk, setIsSimulatingWalk] = useState(false);
  const [simulationProgress, setSimulationProgress] = useState(0);
  const [hotspotCoverage, setHotspotCoverage] = useState<boolean[]>(LAGOS_HOTSPOTS.map(() => true));

  const showNotice = useCallback((text: string) => {
    setCameraNotice(text);
    if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
    noticeTimeoutRef.current = window.setTimeout(() => setCameraNotice(null), 2200);
  }, []);

  const moveUser = useCallback((x: number, y: number, heading = user.current.heading) => {
    user.current = { x, y, heading: normalizeHeading(heading) };
    avatarRef.current?.setPosition(x, y);
    avatarRef.current?.setHeading(user.current.heading);
  }, []);

  /** Mirrors MapboxMap.applyCameraMode: frame the user (or a target) in the given mode */
  const applyCameraMode = useCallback(
    (mode: CameraMode, target?: { x: number; y: number }, targetHeading?: number) => {
      const rig = rigRef.current;
      if (!rig) return;
      cameraModeRef.current = mode;
      setCameraMode(mode);
      showNotice(CAMERA_NOTICES[mode]);

      const heading = targetHeading ?? user.current.heading;
      const framedHeading = mode === 'overview' ? 0 : mode === 'aerial' && !heading ? -20 : heading;
      void rig.flyTo(
        {
          x: target?.x ?? user.current.x,
          y: target?.y ?? user.current.y,
          heading: framedHeading,
          ...MODE_FRAMING[mode]
        },
        1400
      );
    },
    [showNotice]
  );

  /** Free-roam walking: WASD / arrows / on-screen pad (same steps as MapboxMap) */
  const walkStep = useCallback(
    (direction: WalkDirection) => {
      const rig = rigRef.current;
      if (!rig) return;
      const { x, y, heading } = user.current;

      if (direction === 'turn-left' || direction === 'turn-right') {
        const next = normalizeHeading(heading + (direction === 'turn-left' ? -TURN_DEGREES : TURN_DEGREES));
        moveUser(x, y, next);
        rig.jumpTo({ heading: next });
        return;
      }

      const step = direction === 'forward' ? STEP_FORWARD_METERS : STEP_BACKWARD_METERS;
      const rad = THREE.MathUtils.degToRad(heading);
      const nx = x + Math.sin(rad) * step;
      const ny = y + Math.cos(rad) * step;
      moveUser(nx, ny, heading);
      // Walking puts you back in street view, following the avatar
      cameraModeRef.current = 'fpv';
      setCameraMode('fpv');
      rig.jumpTo({ x: nx, y: ny, heading, ...MODE_FRAMING.fpv });
    },
    [moveUser]
  );

  /** One-shot GPS fix; falls back to the active hub without bothering the user */
  const locateUser = useCallback(
    (shouldFly: boolean) => {
      const fallback = () => {
        const [x, y] = lngLatToMeters(...lastCenterRef.current);
        moveUser(x, y);
        if (shouldFly) applyCameraMode(cameraModeRef.current, { x, y });
      };
      if (!navigator.geolocation) {
        fallback();
        return;
      }
      setIsLocating(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsLocating(false);
          const { latitude, longitude, heading } = position.coords;
          const [x, y] = lngLatToMeters(longitude, latitude);
          moveUser(x, y, heading != null && !Number.isNaN(heading) ? heading : user.current.heading);
          if (shouldFly) applyCameraMode(cameraModeRef.current, { x, y });
          onLocationFound?.({
            latitude,
            longitude,
            accuracy: position.coords.accuracy,
            heading: position.coords.heading,
            speed: position.coords.speed
          });
        },
        (err) => {
          setIsLocating(false);
          console.info('[PULSE 3D] GPS unavailable; staying on the active hub:', err.message);
          onLocationError?.(err);
          fallback();
        },
        { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
      );
    },
    [applyCameraMode, moveUser, onLocationFound, onLocationError]
  );

  const clearRouteLine = useCallback(() => {
    const line = routeLineRef.current;
    if (!line) return;
    line.geometry.dispose();
    (line.material as THREE.Material).dispose();
    line.removeFromParent();
    routeLineRef.current = null;
  }, []);

  const startNavigation = useCallback(
    (destination: { latitude: number; longitude: number; title: string; category?: string }) => {
      const scene = sceneRef.current;
      if (!scene) return;
      const start = metersToLngLat(user.current.x, user.current.y);
      const route = generateStreetNavigationRoute(
        start,
        [destination.longitude, destination.latitude],
        destination.title,
        destination.category
      );
      activeRouteRef.current = route;
      setActiveRoute(route);

      clearRouteLine();
      const points = route.pathCoordinates.map(([lng, lat]) => {
        const [x, y] = lngLatToMeters(lng, lat);
        return new THREE.Vector3(x, 1.5, -y);
      });
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x00f2fe })
      );
      line.name = 'route';
      scene.scene.add(line);
      routeLineRef.current = line;

      const initialHeading = route.waypoints[0]?.bearing ?? user.current.heading;
      moveUser(user.current.x, user.current.y, initialHeading);
      applyCameraMode('fpv', undefined, initialHeading);
    },
    [applyCameraMode, clearRouteLine, moveUser]
  );

  const stopWalkSimulation = useCallback(() => {
    if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
    simAnimationRef.current = null;
    setIsSimulatingWalk(false);
  }, []);

  const stopNavigation = useCallback(() => {
    stopWalkSimulation();
    clearRouteLine();
    activeRouteRef.current = null;
    setActiveRoute(null);
    setSimulationProgress(0);
    onClearNavigation?.();
  }, [clearRouteLine, onClearNavigation, stopWalkSimulation]);

  /** Autopilot along the route at street level (same timing as MapboxMap) */
  const toggleWalkSimulation = useCallback(() => {
    const route = activeRouteRef.current;
    const rig = rigRef.current;
    if (!route || !rig) return;
    if (simAnimationRef.current) {
      stopWalkSimulation();
      return;
    }

    setIsSimulatingWalk(true);
    const startTime = performance.now();
    const durationMs = Math.max(8000, Math.min(45000, route.totalDistanceMeters * 35));
    cameraModeRef.current = 'fpv';
    setCameraMode('fpv');

    const animateStep = (now: number) => {
      const progress = Math.min(1, (now - startTime) / durationMs);
      if (now - lastProgressUpdateRef.current > 180 || progress >= 1) {
        lastProgressUpdateRef.current = now;
        setSimulationProgress(progress);
      }
      const { coordinates, bearing: heading } = getPositionAlongRoute(route, progress);
      const [x, y] = lngLatToMeters(coordinates[0], coordinates[1]);
      moveUser(x, y, heading);
      rig.jumpTo({ x, y, heading, ...MODE_FRAMING.fpv });

      if (progress < 1) {
        simAnimationRef.current = requestAnimationFrame(animateStep);
      } else {
        simAnimationRef.current = null;
        setIsSimulatingWalk(false);
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#00F2FE', '#FF4757', '#FFA502', '#10B981'] });
      }
    };
    simAnimationRef.current = requestAnimationFrame(animateStep);
  }, [moveUser, stopWalkSimulation]);

  const teleportTo = useCallback(
    ([lng, lat]: [number, number]) => {
      const [x, y] = lngLatToMeters(lng, lat);
      moveUser(x, y, 0);
      cameraModeRef.current = 'fpv';
      setCameraMode('fpv');
      void rigRef.current?.flyTo({ x, y, heading: 0, ...MODE_FRAMING.fpv }, 2200);
    },
    [moveUser]
  );

  // Build the scene once; everything after this mutates it in place
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const pulseScene = new PulseScene(container);
    sceneRef.current = pulseScene;
    pulseScene.setLightPreset(initialLightPreset);
    pulseScene.setBuildingsVisible(enable3dBuildings);

    const { x, y, heading } = user.current;
    const rig = new CameraRig(pulseScene.camera, pulseScene.renderer.domElement, {
      x,
      y,
      heading: initialCameraMode === 'overview' ? 0 : heading,
      ...MODE_FRAMING[initialCameraMode]
    });
    rigRef.current = rig;

    const avatar = new UserAvatar();
    avatar.group.visible = showUserMarker;
    avatar.setPosition(x, y);
    avatar.setHeading(heading);
    pulseScene.scene.add(avatar.group);
    avatarRef.current = avatar;

    // Clicking a card selects the latest copy and flies to it at street level (like MapboxMap)
    const momentLayer = new MomentLayer((moment) => {
      onSelectMomentRef.current?.(moment);
      const [mx, my] = lngLatToMeters(moment.longitude, moment.latitude);
      void rig.flyTo({ x: mx, y: my, ...MODE_FRAMING.fpv }, 1200);
    });
    pulseScene.scene.add(momentLayer.group);
    momentLayerRef.current = momentLayer;

    let lastFocus = { x: Infinity, y: Infinity, distance: 0 };
    let frame = 0;
    let lastHasData = true;
    const stopFrame = pulseScene.onFrame((_dt, elapsed) => {
      rig.update();
      avatar.update(elapsed, rig.pose.distance);
      // Street level: cards within 1.5 km (no horizon clutter); zoomed out: the whole radius
      momentLayer.updateVisibility(pulseScene.camera, Math.max(MOMENT_CARD_RANGE, rig.pose.distance * 2.6));
      const { x: fx, y: fy, distance } = rig.pose;
      pulseScene.setViewDistance(distance);
      if (Math.hypot(fx - lastFocus.x, fy - lastFocus.y) > FOCUS_UPDATE_METERS || Math.abs(distance - lastFocus.distance) > lastFocus.distance * 0.1) {
        lastFocus = { x: fx, y: fy, distance };
        pulseScene.tiles.setFocus(fx, fy, distance * 1.1);
      }
      if (++frame % 30 === 0 && pulseScene.tiles.index) {
        const covered = pulseScene.tiles.hasDataAt(fx, fy);
        if (covered !== lastHasData) {
          lastHasData = covered;
          setHasData(covered);
        }
      }
    });

    pulseScene.tiles
      .init()
      .then(() => {
        setHasData(pulseScene.tiles.hasDataAt(x, y));
        setHotspotCoverage(
          LAGOS_HOTSPOTS.map(({ coords }) => pulseScene.tiles.hasDataAt(...lngLatToMeters(coords[0], coords[1])))
        );
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('[PULSE 3D] Map data unavailable:', err);
        setStatus('error');
      });
    pulseScene.start();

    // Live GPS: moves the avatar only (the camera stays where the user put it)
    let watchId: number | null = null;
    if (autoGeolocate) {
      locateUser(false);
      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            if (simAnimationRef.current) return;
            const [wx, wy] = lngLatToMeters(pos.coords.longitude, pos.coords.latitude);
            const h = pos.coords.heading;
            moveUser(wx, wy, h != null && !Number.isNaN(h) ? h : user.current.heading);
          },
          (err) => console.info('[PULSE 3D] GPS watch note:', err.message),
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 10000 }
        );
      }
    }

    // Compass heading on phones
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null || simAnimationRef.current) return;
      moveUser(user.current.x, user.current.y, 360 - event.alpha);
    };
    window.addEventListener('deviceorientation', handleOrientation);

    if (import.meta.env.DEV) {
      Object.assign(container, {
        __pulse3d: { scene: pulseScene, rig, avatar, momentLayer, user, walkStep, applyCameraMode, teleportTo }
      });
    }

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
      window.removeEventListener('deviceorientation', handleOrientation);
      if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      stopFrame();
      clearRouteLine();
      rig.dispose();
      momentLayer.dispose();
      avatar.dispose();
      pulseScene.dispose();
      sceneRef.current = null;
      rigRef.current = null;
      avatarRef.current = null;
      momentLayerRef.current = null;
    };
    // The scene is built once; props that change later are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hub switch: move the user and fly there without rebuilding the scene
  useEffect(() => {
    const [prevLng, prevLat] = lastCenterRef.current;
    if (prevLng === centerLng && prevLat === centerLat) return;
    lastCenterRef.current = [centerLng, centerLat];
    const [x, y] = lngLatToMeters(centerLng, centerLat);
    moveUser(x, y);
    applyCameraMode(cameraModeRef.current, { x, y });
  }, [centerLng, centerLat, applyCameraMode, moveUser]);

  useEffect(() => {
    momentLayerRef.current?.sync(moments);
  }, [moments]);

  useEffect(() => {
    sceneRef.current?.setLightPreset(lightPreset);
  }, [lightPreset]);

  useEffect(() => {
    sceneRef.current?.setBuildingsVisible(buildingsVisible);
  }, [buildingsVisible]);

  useEffect(() => {
    if (navigationDestination && status === 'ready') startNavigation(navigationDestination);
    // Re-run only when a new destination arrives
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigationDestination, status]);

  // WASD / arrow keys, ignored while typing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      const direction: WalkDirection | null =
        e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp'
          ? 'forward'
          : e.key === 's' || e.key === 'S' || e.key === 'ArrowDown'
          ? 'backward'
          : e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft'
          ? 'turn-left'
          : e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight'
          ? 'turn-right'
          : null;
      if (!direction) return;
      e.preventDefault();
      walkStep(direction);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [walkStep]);

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
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-10 pointer-events-none">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-hud text-[11px] text-slate-300 whitespace-nowrap">
            <MapPinOff className="w-3.5 h-3.5 text-amber-400" /> No 3D data for this area yet
          </div>
        </div>
      )}

      {status !== 'error' && (
        <MapHud
          showControls={show3dControls && status === 'ready'}
          cameraMode={cameraMode}
          onCameraMode={(mode) => applyCameraMode(mode)}
          hotspots={LAGOS_HOTSPOTS.map((spot, i) => ({ ...spot, hasData: hotspotCoverage[i] }))}
          onHotspot={teleportTo}
          lightPreset={lightPreset}
          onLightPreset={setLightPreset}
          buildingsVisible={buildingsVisible}
          onToggleBuildings={() => setBuildingsVisible((v) => !v)}
          onWalk={walkStep}
          onRecenter={() => locateUser(true)}
          isLocating={isLocating}
          cameraNotice={cameraNotice}
          route={activeRoute}
          isSimulatingWalk={isSimulatingWalk}
          simulationProgress={simulationProgress}
          onToggleWalkSimulation={toggleWalkSimulation}
          onStopNavigation={stopNavigation}
        />
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
