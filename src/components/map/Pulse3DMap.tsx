import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { Loader2, MapPinOff } from 'lucide-react';
import type { PulseMapProps, MapLightPreset } from './PulseMap';
import { PulseScene, LightPreset } from './pulse3d/PulseScene';
import { getLighting } from '../../utils/sunLight';
import { CameraRig, CameraMode, MODE_FRAMING } from './pulse3d/CameraRig';
import { UserAvatar } from './pulse3d/UserAvatar';
import { MapHud, WalkDirection } from './pulse3d/MapHud';
import { MomentLayer } from './pulse3d/MomentLayer';
import { RouteLayer } from './pulse3d/RouteLayer';
import {
  detectQuality,
  DOWNGRADE_BLOOM_BELOW_FPS,
  DOWNGRADE_PIXELS_BELOW_FPS,
  DOWNGRADE_SAMPLE_SECONDS
} from './pulse3d/quality';
import { LAGOS_HOTSPOTS } from './lagosHotspots';
import { lngLatToMeters, metersToLngLat, usesLagosData } from '../../utils/mapProjection';
import { getPositionAlongRoute, NavigationRoute } from '../../utils/wayfindingUtils';
import { findWalkingRoute } from '../../utils/walkingRouter';
import { ANCHORS } from '../../theme/tokens';
import { followUser, locate, refineLocation, LocationFix } from '../../services/locationService';

/**
 * Pulse 3D: a self-hosted night-city map rendered with Three.js from
 * OpenStreetMap tiles (public/map-tiles, built by scripts/build-map-tiles.mjs).
 * Accepts the same props as PulseMap so AppShell can swap between them freely.
 */
export type Pulse3DMapProps = PulseMapProps & {
  lightPreset?: MapLightPreset;
  enableDynamicLighting?: boolean;
};

const CAMERA_NOTICES: Record<CameraMode, string> = {
  fpv: '🎮 Street First-Person View (72° Perspective)',
  aerial: '🚁 3D Aerial View (58° Perspective)',
  overview: '🗺️ 2D Tactical Map (0° North)'
};

// Walking step sizes match PulseMap
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
  lightPreset: requestedLightPreset,
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
  avatarConfig = null,
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
  const routeLayerRef = useRef<RouteLayer | null>(null);
  const routeRequestRef = useRef(0);
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
  // Lighting follows the sun at the user's location until they pick a preset by hand
  const sunMood = () => getLighting(new Date(), centerLat, centerLng).mood as LightPreset;
  const initialLightPreset: LightPreset = requestedLightPreset ?? sunMood();
  const [lightPreset, setLightPresetState] = useState<LightPreset>(initialLightPreset);
  const manualLightRef = useRef(requestedLightPreset !== undefined);
  const setLightPreset = (preset: LightPreset) => {
    manualLightRef.current = true;
    setLightPresetState(preset);
  };
  useEffect(() => {
    const update = () => {
      if (!manualLightRef.current) setLightPresetState(sunMood());
    };
    update();
    const timer = window.setInterval(update, 60 * 1000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerLat, centerLng]);
  const [buildingsVisible, setBuildingsVisible] = useState(enable3dBuildings);
  const [isLocating, setIsLocating] = useState(false);
  // True once the first GPS attempt has resolved (a fix, or the active hub as the fallback)
  const [locationResolved, setLocationResolved] = useState(false);
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

  /** Mirrors PulseMap.applyCameraMode: frame the user (or a target) in the given mode */
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

  /** Free-roam walking: WASD / arrows / on-screen pad (same steps as PulseMap) */
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

  const onLocationFoundRef = useRef(onLocationFound);
  onLocationFoundRef.current = onLocationFound;
  const refineCancelRef = useRef<(() => void) | null>(null);

  /** Puts the avatar on a fix (and optionally flies the camera there), then tells the app */
  const applyFix = useCallback(
    (fix: LocationFix, fly: boolean, reason: 'auto' | 'user') => {
      if (!sceneRef.current) return; // the map was rebuilt or closed while the lookup ran
      setLocationResolved(true);
      const { latitude, longitude, heading } = fix;
      const [x, y] = lngLatToMeters(longitude, latitude);
      moveUser(x, y, heading ?? user.current.heading);
      avatarRef.current?.setAccuracy(fix.source === 'gps' ? fix.accuracy : null);
      if (fly) applyCameraMode(cameraModeRef.current, { x, y });
      onLocationFoundRef.current?.(
        { latitude, longitude, accuracy: fix.accuracy, heading: fix.heading, speed: fix.speed, source: fix.source, place: fix.place },
        reason
      );
    },
    [applyCameraMode, moveUser]
  );

  /**
   * Finds the user. `explicit` is "find me now" (the locate button): always a fresh position, and
   * the camera flies there. The automatic look at startup may reuse a recent position.
   */
  const locateUser = useCallback(
    (shouldFly: boolean, explicit = shouldFly) => {
      const fallback = () => {
        setLocationResolved(true);
        const [x, y] = lngLatToMeters(...lastCenterRef.current);
        moveUser(x, y);
        avatarRef.current?.setAccuracy(null);
        if (shouldFly) applyCameraMode(cameraModeRef.current, { x, y });
      };
      setIsLocating(true);
      locate({ fresh: explicit }).then(({ fix, problem }) => {
        setIsLocating(false);
        if (!sceneRef.current) return;
        if (!fix) {
          console.info('[PULSE 3D] No location available; staying on the active hub:', problem);
          onLocationError?.(new Error(`Location unavailable (${problem ?? 'unknown'})`));
          fallback();
          return;
        }
        applyFix(fix, shouldFly, explicit ? 'user' : 'auto');
        // A coarse fix is sharpened in the background
        refineCancelRef.current?.();
        refineCancelRef.current = refineLocation(fix, (better) => applyFix(better, false, 'auto'));
      });
    },
    [applyCameraMode, applyFix, moveUser, onLocationError]
  );
  const applyFixRef = useRef(applyFix);
  applyFixRef.current = applyFix;
  const locateUserRef = useRef(locateUser);
  locateUserRef.current = locateUser;

  const startNavigation = useCallback(
    async (destination: { latitude: number; longitude: number; title: string; category?: string }) => {
      const request = ++routeRequestRef.current;
      const start = metersToLngLat(user.current.x, user.current.y);
      const route = await findWalkingRoute(
        start,
        [destination.longitude, destination.latitude],
        destination.title,
        destination.category
      );
      // Ignore results for a destination that was replaced or cancelled meanwhile
      if (request !== routeRequestRef.current || !sceneRef.current) return;

      activeRouteRef.current = route;
      setActiveRoute(route);
      routeLayerRef.current?.setRoute(route);

      const initialHeading = route.waypoints[0]?.bearing ?? user.current.heading;
      moveUser(user.current.x, user.current.y, initialHeading);
      applyCameraMode('fpv', undefined, initialHeading);
    },
    [applyCameraMode, moveUser]
  );

  const stopWalkSimulation = useCallback(() => {
    if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
    simAnimationRef.current = null;
    setIsSimulatingWalk(false);
  }, []);

  const stopNavigation = useCallback(() => {
    routeRequestRef.current++;
    stopWalkSimulation();
    routeLayerRef.current?.setRoute(null);
    activeRouteRef.current = null;
    setActiveRoute(null);
    setSimulationProgress(0);
    onClearNavigation?.();
  }, [onClearNavigation, stopWalkSimulation]);

  /** Autopilot along the route at street level (same timing as PulseMap) */
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
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: [ANCHORS.signal, ANCHORS.accent, ANCHORS.accent2, '#10B981'] });
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

    const quality = detectQuality();
    const pulseScene = new PulseScene(container, {
      maxPixelRatio: quality.maxPixelRatio,
      bloom: quality.bloom,
      maxTiles: quality.maxTiles,
      maxLoadRadius: quality.maxLoadRadius
    });
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
    pulseScene.scene.add(avatar.group, avatar.accuracyGroup);
    avatarRef.current = avatar;

    // Clicking a card selects the latest copy and flies to it at street level (like PulseMap)
    const momentLayer = new MomentLayer((moment) => {
      onSelectMomentRef.current?.(moment);
      const [mx, my] = lngLatToMeters(moment.longitude, moment.latitude);
      void rig.flyTo({ x: mx, y: my, ...MODE_FRAMING.fpv }, 1200);
    });
    pulseScene.scene.add(momentLayer.group);
    momentLayerRef.current = momentLayer;

    const routeLayer = new RouteLayer();
    pulseScene.scene.add(routeLayer.group);
    routeLayerRef.current = routeLayer;

    let lastFocus = { x: Infinity, y: Infinity, distance: 0 };

    // Adaptive quality: if the real frame rate stays low, drop bloom, then pixel density.
    // Only sampled while visible (hidden tabs throttle to ~1 fps and would mislead us).
    let slowSeconds = 0;
    let lastSampledAt = 0;
    let pixelsDowngraded = quality.maxPixelRatio <= 1;
    const adaptQuality = (elapsed: number) => {
      if (elapsed - lastSampledAt < 1 || document.visibilityState !== 'visible') return;
      lastSampledAt = elapsed;
      const fps = pulseScene.stats.fps;
      const bloomOn = pulseScene.bloomEnabled;
      const threshold = bloomOn ? DOWNGRADE_BLOOM_BELOW_FPS : DOWNGRADE_PIXELS_BELOW_FPS;
      if (!fps || (!bloomOn && pixelsDowngraded)) return;
      slowSeconds = fps < threshold ? slowSeconds + 1 : 0;
      if (slowSeconds < DOWNGRADE_SAMPLE_SECONDS) return;
      slowSeconds = 0;
      if (bloomOn) {
        pulseScene.setBloomEnabled(false);
        console.info(`[PULSE 3D] ${fps} fps: glow turned off to keep the map smooth`);
      } else {
        pulseScene.setPixelRatio(1);
        pixelsDowngraded = true;
        console.info(`[PULSE 3D] ${fps} fps: rendering at lower resolution`);
      }
    };
    let frame = 0;
    let lastHasData = true;
    const stopFrame = pulseScene.onFrame((_dt, elapsed) => {
      rig.update();
      avatar.update(elapsed, rig.pose.distance);
      routeLayer.update(elapsed, rig.pose.distance);
      adaptQuality(elapsed);
      // Street level: cards within 1.5 km (no horizon clutter); zoomed out: the whole radius
      momentLayer.updateVisibility(pulseScene.camera, Math.max(MOMENT_CARD_RANGE, rig.pose.distance * 2.6));
      const { x: fx, y: fy, distance, heading: viewHeading } = rig.pose;
      pulseScene.setViewDistance(distance);
      if (Math.hypot(fx - lastFocus.x, fy - lastFocus.y) > FOCUS_UPDATE_METERS || Math.abs(distance - lastFocus.distance) > lastFocus.distance * 0.1) {
        lastFocus = { x: fx, y: fy, distance };
        pulseScene.tiles.setFocus(fx, fy, distance * 1.1, viewHeading);
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
          LAGOS_HOTSPOTS.map(({ coords }) => usesLagosData() && pulseScene.tiles.hasDataAt(...lngLatToMeters(coords[0], coords[1])))
        );
        setStatus('ready');
      })
      .catch((err) => {
        console.warn('[PULSE 3D] Map data unavailable:', err);
        setStatus('error');
      });
    pulseScene.start();

    // Live position: a high-accuracy watch that moves the avatar (the camera stays where the user put it).
    // It ignores glitches, pauses while the tab is hidden, falls back to the IP position when the browser
    // stops answering, and announces a recovery so the app drops its "approximate" state.
    let stopWatch: (() => void) | null = null;
    if (autoGeolocate) {
      locateUserRef.current(false, false);
      stopWatch = followUser({
        onMove: (fix) => {
          if (simAnimationRef.current) return;
          const [wx, wy] = lngLatToMeters(fix.longitude, fix.latitude);
          moveUser(wx, wy, fix.heading ?? user.current.heading);
          avatar.setAccuracy(fix.accuracy);
        },
        onAnnounce: (fix) => applyFixRef.current(fix, false, 'auto')
      });
    }

    // Compass heading on phones
    const handleOrientation = (event: DeviceOrientationEvent) => {
      if (event.alpha == null || simAnimationRef.current) return;
      moveUser(user.current.x, user.current.y, 360 - event.alpha);
    };
    window.addEventListener('deviceorientation', handleOrientation);

    if (import.meta.env.DEV) {
      Object.assign(container, {
        __pulse3d: { scene: pulseScene, rig, avatar, momentLayer, user, walkStep, applyCameraMode, teleportTo, quality }
      });
    }

    return () => {
      stopWatch?.();
      refineCancelRef.current?.();
      window.removeEventListener('deviceorientation', handleOrientation);
      if (simAnimationRef.current) cancelAnimationFrame(simAnimationRef.current);
      if (noticeTimeoutRef.current) window.clearTimeout(noticeTimeoutRef.current);
      stopFrame();
      routeLayer.dispose();
      rig.dispose();
      momentLayer.dispose();
      avatar.dispose();
      pulseScene.dispose();
      sceneRef.current = null;
      rigRef.current = null;
      avatarRef.current = null;
      momentLayerRef.current = null;
      routeLayerRef.current = null;
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

  // Onboarded users get their 3D avatar instead of the orb, once their location is known
  useEffect(() => {
    void avatarRef.current?.setCharacter(locationResolved ? avatarConfig : null);
  }, [avatarConfig, locationResolved]);

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
    if (navigationDestination && status === 'ready') void startNavigation(navigationDestination);
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
      {/* isolate: label z-indexes (depth sorting) must not compete with the HUD above */}
      <div ref={containerRef} className="absolute inset-0 isolate" data-testid="pulse3d-container" />

      {status === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl glass-hud text-xs text-signal-300">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading city…
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
          <div className="max-w-xs text-center px-4 py-3 rounded-2xl glass-panel text-xs text-slate-300">
            3D map data could not be loaded. Go back to the map with the "Back to map" button.
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
