import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  useMemo,
  forwardRef
} from 'react';
import { followUser, locate, refineLocation } from '../../services/locationService';
import maplibregl from 'maplibre-gl';
import { MapResume, isAwayFromFix } from './mapResume';
import 'maplibre-gl/dist/maplibre-gl.css';
import confetti from 'canvas-confetti';
import {
  Crosshair,
  Loader2,
  Box,
  Layers,
  Sparkles,
  Eye,
  Footprints,
  Play,
  Square,
  X,
  MapPin,
  ChevronRight,
  Route,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Gamepad2,
  TrendingUp,
  Radar,
  Building2,
  Flame,
  AlertTriangle
} from 'lucide-react';
import { usePulse } from '../../context/PulseContext';
import { Moment, RadiusKm } from '../../types/pulse';
import { buildPulseStyle, BUILDING_LAYER_IDS } from './pulseMapStyle';
import { applyLighting, installWindowImages } from './pulseMapLighting';
import { getLighting, lightingForMood, LightingMood } from '../../utils/sunLight';

type LightingMode = 'auto' | LightingMood;
const LIGHTING_MODE_KEY = 'pulse_lighting_mode';
const LIGHTING_MODES: { id: LightingMode; label: string }[] = [
  { id: 'auto', label: 'Auto' },
  { id: 'dawn', label: 'Dawn' },
  { id: 'day', label: 'Day' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'night', label: 'Night' }
];
import { findWalkingRoute } from '../../utils/walkingRouter';
import {
  getPositionAlongRoute,
  NavigationRoute,
  WaypointCue
} from '../../utils/wayfindingUtils';
import { escapeHtml } from '../../utils/htmlUtils';
import { createMomentFlyerElement } from './momentFlyer';
import { LAGOS_HOTSPOTS } from './lagosHotspots';
import { ANCHORS } from '../../theme/tokens';
import type { AvatarConfig } from '../avatar/avatarConfig';
import { accuracyCircle } from '../../utils/geoUtils';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
  /** How the position was found; an IP position is approximate (tens of kilometers) */
  source?: 'gps' | 'ip';
  place?: string;
}

/** `user`: the person asked for their position (recenter button); `auto`: the app looked on its own */
export type LocationReason = 'auto' | 'user';

export type MapLightPreset = 'night' | 'dusk' | 'dawn' | 'day';
export type CameraMode = 'fpv' | 'aerial' | 'overview';

export interface PulseMapProps {
  /** Whether 3D building extrusions are shown (defaults to true) */
  enable3dBuildings?: boolean;
  /** Fallback center coordinates as [longitude, latitude] if geolocation is unavailable (defaults to [3.4219, 6.4281]) */
  defaultCenter?: [number, number];
  /** Default zoom level (defaults to 18.2 for street-level first-person view) */
  defaultZoom?: number;
  /** Initial pitch / 3D tilt angle in degrees (0 - 85, default: 72 for First-Person View) */
  pitch?: number;
  /** Initial bearing / rotation angle in degrees (-180 - 180, default: 0) */
  bearing?: number;
  /** Initial camera mode: 'fpv' (first-person 72°) | 'aerial' (3D 58°) | 'overview' (2D 0°) (default: 'fpv') */
  initialCameraMode?: CameraMode;
  /** Automatically request user GPS geolocation and center the map on initial mount (default: true) */
  autoGeolocate?: boolean;
  /** Display a custom pulsing radar avatar marker at user's current GPS location (default: true) */
  showUserMarker?: boolean;
  /** Display native navigation controls (+/- zoom, compass pitch/bearing) (default: true) */
  showNavigationControl?: boolean;
  /** Position of navigation controls (default: 'top-right') */
  navigationControlPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Display native geolocate button control (default: true) */
  showGeolocateControl?: boolean;
  /** Display the interactive camera mode, hotspots and layers toolbar (defaults to true) */
  show3dControls?: boolean;
  /** Pulse live moments shown as street flyer cards on the map */
  moments?: Moment[];
  /** Callback fired when a live moment marker is clicked */
  onSelectMoment?: (moment: Moment) => void;
  /** Active destination for street-level wayfinding game cues */
  navigationDestination?: {
    latitude: number;
    longitude: number;
    title: string;
    category?: string;
  } | null;
  /** Callback fired when user exits navigation mode */
  onClearNavigation?: () => void;
  /** Opens the Pulse 3D explore / walk mode (shows a "Walk in 3D" button when provided) */
  onWalkIn3D?: () => void;
  /** Open on this spot (where the user stood in the other map) instead of the default centre */
  resumeFrom?: MapResume | null;
  /** Told the position of the user whenever it changes, so the other map can pick up from it */
  onPositionChange?: (position: MapResume) => void;
  /** The user's customized 3D avatar; shown in place of the orb once their location is known */
  avatarConfig?: AvatarConfig | null;
  /** Whether the map accepts interactive user gestures (pan, pinch, zoom, tilt) (default: true) */
  interactive?: boolean;
  /** Extra container CSS class names */
  className?: string;
  /** Extra container inline styles */
  style?: React.CSSProperties;
  /** Callback fired when the map instance finishes loading */
  onMapLoad?: (map: maplibregl.Map) => void;
  /** Callback fired when the user's GPS coordinates are resolved and centered */
  onLocationFound?: (coords: UserCoordinates, reason?: LocationReason) => void;
  /** Callback fired if geolocation request fails or permission is denied */
  onLocationError?: (error: GeolocationPositionError | Error) => void;
  /** Click event listener on map canvas */
  onMapClick?: (e: maplibregl.MapMouseEvent) => void;
  /** Overlay components or floating controls rendered over the map canvas */
  children?: React.ReactNode;
}

export interface PulseMapHandle {
  /** Returns the underlying MapLibre GL Map instance */
  getMap: () => maplibregl.Map | null;
  /** Smoothly fly camera to a target [lng, lat] coordinate */
  flyTo: (center: [number, number], zoom?: number) => void;
  /** Re-triggers geolocation and smoothly recenters camera on current user position */
  recenterOnUser: () => void;
  /** Returns currently resolved user GPS coordinates */
  getUserLocation: () => UserCoordinates | null;
  /** Toggle 3D buildings visibility */
  set3dBuildings: (enabled: boolean) => void;
  /** Toggle between 3D perspective and 2D top-down view */
  toggle3dView: () => void;
  /** Set camera mode: 'fpv' (72° pitch) | 'aerial' (58°) | 'overview' (0°) */
  setCameraMode: (mode: CameraMode) => void;
  /** Start street-level wayfinding navigation toward a target destination */
  startNavigation: (destination: { latitude: number; longitude: number; title: string; category?: string }) => void;
  /** Stop active navigation and clear cues */
  stopNavigation: () => void;
}

// Generates a GeoJSON polygon circle around a center point
function createGeoJSONCircle(center: [number, number], radiusInKm: number, points = 64) {
  const coords: [number, number][] = [];
  const distanceX = radiusInKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([center[0] + distanceX * Math.cos(theta), center[1] + distanceY * Math.sin(theta)]);
  }
  coords.push(coords[0]);
  return {
    type: 'Feature' as const,
    geometry: { type: 'Polygon' as const, coordinates: [coords] },
    properties: {}
  };
}

function heatmapFeatures(moments: Moment[]) {
  return {
    type: 'FeatureCollection' as const,
    features: moments.map((m) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [m.longitude, m.latitude] },
      properties: { score: m.engagementScore || 50 }
    }))
  };
}

export const PulseMap = forwardRef<PulseMapHandle, PulseMapProps>(
  (
    {
      enable3dBuildings: initialEnable3dBuildings = true,
      defaultCenter = [3.4219, 6.4281], // Victoria Island, Lagos
      defaultZoom = 18.2,
      pitch = 72,
      bearing = 0,
      initialCameraMode = 'fpv',
      autoGeolocate = true,
      showUserMarker = true,
      showNavigationControl = true,
      navigationControlPosition = 'top-right',
      showGeolocateControl = true,
      show3dControls = true,
      moments = [],
      onSelectMoment,
      navigationDestination: propNavDestination = null,
      onClearNavigation,
      onWalkIn3D,
      resumeFrom = null,
      onPositionChange,
      avatarConfig = null,
      interactive = true,
      className = '',
      style,
      onMapLoad,
      onLocationFound,
      onLocationError,
      onMapClick,
      children
    },
    ref
  ) => {
    // Callers often pass a fresh array literal each render; key off the numbers instead
    const [centerLng, centerLat] = defaultCenter;
    const stableCenter = useMemo<[number, number]>(() => [centerLng, centerLat], [centerLng, centerLat]);
    // Initial camera is read once at map creation so prop churn never rebuilds the map
    const resumeRef = useRef(resumeFrom);
    const initialViewRef = useRef({
      center: (resumeFrom ? [resumeFrom.longitude, resumeFrom.latitude] : stableCenter) as [number, number],
      zoom: defaultZoom,
      pitch,
      bearing: resumeFrom ? resumeFrom.heading : bearing
    });
    // True while the map holds a spot carried over from the other map: automatic GPS updates elsewhere are ignored
    const keepSpotRef = useRef(Boolean(resumeFrom));
    const onPositionChangeRef = useRef(onPositionChange);
    onPositionChangeRef.current = onPositionChange;
    const lastCenterRef = useRef<[number, number]>(stableCenter);

    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const userMarkerRef = useRef<maplibregl.Marker | null>(null);
    // Portrait of the user's 3D avatar, shown on the flat map's marker in place of the orb
    const avatarPortraitRef = useRef<string | null>(null);
    const applyAvatarPortrait = useCallback(() => {
      const orb = userMarkerRef.current?.getElement().querySelector<HTMLElement>('#pulse-avatar-orb');
      if (!orb) return;
      const portrait = avatarPortraitRef.current;
      if (portrait) {
        orb.style.cssText =
          'position: relative; z-index: 2; width: 40px; height: 40px; border-radius: 9999px; overflow: hidden; border: 2px solid #FFFFFF; box-shadow: 0 0 16px var(--signal); background: #0A0E17;';
        orb.innerHTML = `<img src="${portrait}" alt="" style="width: 100%; height: 100%; object-fit: cover;" />`;
      }
    }, []);
    useEffect(() => {
      let cancelled = false;
      avatarPortraitRef.current = null;
      if (!avatarConfig) return;
      // Three.js loads on demand: the flat map itself never needs it
      import('../avatar/avatarModel')
        .then((m) => m.renderAvatarPortrait(avatarConfig, 96))
        .then((url) => {
          if (cancelled) return;
          avatarPortraitRef.current = url;
          applyAvatarPortrait();
        })
        .catch((err) => console.warn('[PULSE] Avatar portrait failed:', err));
      return () => {
        cancelled = true;
      };
    }, [avatarConfig, applyAvatarPortrait]);
    const momentMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
    // Marker click handlers outlive renders; read the freshest copy of each moment from here
    const latestMomentsRef = useRef<Moment[]>(moments);
    latestMomentsRef.current = moments;
    const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
    const destinationBeaconRef = useRef<maplibregl.Marker | null>(null);

    // Performance and coordination refs
    const userCoordsRef = useRef<UserCoordinates>({
      latitude: resumeFrom ? resumeFrom.latitude : stableCenter[1],
      longitude: resumeFrom ? resumeFrom.longitude : stableCenter[0]
    });
    const userBearingRef = useRef<number>(resumeFrom ? resumeFrom.heading : bearing);
    /** Skips an automatic GPS update that would drag the user off the spot they are on */
    const ignoreAutoFix = (lng: number, lat: number) => {
      if (!keepSpotRef.current) return false;
      if (isAwayFromFix(userCoordsRef.current, lng, lat)) return true;
      keepSpotRef.current = false; // the live position agrees with the spot: follow it again
      return false;
    };
    const simAnimationRef = useRef<number | null>(null);
    const lastProgressUpdateRef = useRef<number>(0);
    const activeRouteRef = useRef<NavigationRoute | null>(null);
    const routeRequestRef = useRef(0);

    const [isLocating, setIsLocating] = useState<boolean>(false);
    const [userCoords, setUserCoords] = useState<UserCoordinates>({
      latitude: stableCenter[1],
      longitude: stableCenter[0]
    });
    const [userBearing, setUserBearing] = useState<number>(bearing);
    const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

    // 3D & Camera State
    const [is3dBuildingsEnabled, setIs3dBuildingsEnabled] = useState<boolean>(initialEnable3dBuildings);
    const [cameraMode, setCameraModeState] = useState<CameraMode>(initialCameraMode);
    const [cameraNotification, setCameraNotification] = useState<string | null>(null);
    const [showLayerMenu, setShowLayerMenu] = useState<boolean>(false);
    // Radar overlays start off so the map opens clean; the Layers menu turns them on
    const [radarLayers, setRadarLayers] = useState({ heatmap: false, radius: false, zones: false, business: false });
    const radarLayersRef = useRef(radarLayers);
    radarLayersRef.current = radarLayers;
    const zoneMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
    const businessMarkersRef = useRef<Map<string, maplibregl.Marker>>(new Map());
    const is3dBuildingsRef = useRef(initialEnable3dBuildings);
    // Lighting follows the sun at the user's location; Dawn / Day / Dusk / Night override it
    const [lightingMode, setLightingMode] = useState<LightingMode>(() => {
      try {
        const saved = localStorage.getItem(LIGHTING_MODE_KEY);
        return LIGHTING_MODES.some((m) => m.id === saved) ? (saved as LightingMode) : 'auto';
      } catch {
        return 'auto';
      }
    });
    const lightingModeRef = useRef<LightingMode>(lightingMode);
    lightingModeRef.current = lightingMode;
    const currentLocationRef = useRef({ longitude: 0, latitude: 0 });
    const radiusKmRef = useRef<RadiusKm>(5);
    const [showHotspotMenu, setShowHotspotMenu] = useState<boolean>(false);
    const [showWalkingControls, setShowWalkingControls] = useState<boolean>(true);
    const cameraNoticeTimeoutRef = useRef<number | null>(null);

    // Navigation & Wayfinding State
    const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
    const [isSimulatingWalk, setIsSimulatingWalk] = useState<boolean>(false);
    const [simulationProgress, setSimulationProgress] = useState<number>(0);

    const {
      currentLocation,
      radiusKm,
      setRadiusKm,
      simulateIncomingMomentAlert,
      activityZones,
      businessPosts,
      setSelectedMoment,
      setSelectedZone
    } = usePulse();
    currentLocationRef.current = currentLocation;
    radiusKmRef.current = radiusKm;

    /**
     * Toggles 3D buildings on/off
     */
    const toggle3dBuildings = useCallback((enabled: boolean) => {
      is3dBuildingsRef.current = enabled;
      setIs3dBuildingsEnabled(enabled);
      const map = mapRef.current;
      BUILDING_LAYER_IDS.forEach((id) => {
        if (map?.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none');
      });
    }, []);

    /**
     * Updates or creates the custom 3D avatar marker with heading cone
     */
    const updateUserMarker = useCallback(
      (lng: number, lat: number, heading = userBearingRef.current) => {
        if (!mapRef.current || !showUserMarker) return;

        userCoordsRef.current = { longitude: lng, latitude: lat };
        userBearingRef.current = heading;
        onPositionChangeRef.current?.({ longitude: lng, latitude: lat, heading });

        if (!userMarkerRef.current) {
          const markerContainer = document.createElement('div');
          markerContainer.className = 'pulse-user-avatar-marker-3d';
          markerContainer.style.position = 'relative';
          markerContainer.style.width = '52px';
          markerContainer.style.height = '52px';
          markerContainer.style.display = 'flex';
          markerContainer.style.alignItems = 'center';
          markerContainer.style.justifyContent = 'center';

          markerContainer.innerHTML = `
            <!-- Directional Flashlight / Heading Cone of Vision -->
            <div class="pulse-avatar-heading-cone" id="pulse-avatar-cone" style="position: absolute; width: 80px; height: 80px; top: 50%; left: 50%; pointer-events: none; transform: translate(-50%, -50%) rotate(${heading}deg); background: radial-gradient(circle at 50% 10%, rgba(var(--signal-rgb), 0.45) 0%, rgba(var(--signal-rgb), 0.12) 40%, transparent 75%); clip-path: polygon(50% 50%, 15% 0%, 85% 0%); filter: drop-shadow(0 0 12px var(--signal));"></div>
            
            <!-- Ground Pulse Shadow -->
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background: rgba(var(--signal-rgb), 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: absolute; width: 32px; height: 32px; border-radius: 9999px; background: rgba(var(--signal-rgb), 0.35); border: 1.5px solid var(--signal);"></div>
            
            <!-- Avatar Core Orb -->
            <div id="pulse-avatar-orb" style="position: relative; z-index: 2; width: 24px; height: 24px; border-radius: 9999px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border: 2.5px solid #FFFFFF; box-shadow: 0 0 16px var(--signal); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 900; color: white;">
              ⚡
            </div>
            
            <!-- Compass Direction Arrowhead -->
            <div id="pulse-avatar-arrow" style="position: absolute; top: 2px; z-index: 3; width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-bottom: 8px solid var(--signal); transform-origin: 50% 24px; transform: rotate(${heading}deg); filter: drop-shadow(0 0 6px var(--signal));"></div>
          `;

          userMarkerRef.current = new maplibregl.Marker({
            element: markerContainer,
            anchor: 'center'
          })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
          applyAvatarPortrait();
        } else {
          userMarkerRef.current.setLngLat([lng, lat]);

          const coneEl = document.getElementById('pulse-avatar-cone');
          if (coneEl) {
            coneEl.style.transform = `translate(-50%, -50%) rotate(${heading}deg)`;
          }
          const arrowEl = document.getElementById('pulse-avatar-arrow');
          if (arrowEl) {
            arrowEl.style.transform = `rotate(${heading}deg)`;
          }
        }
      },
      [showUserMarker]
    );

    /**
     * Applies camera modes with smooth, animated cinematic transitions:
     * - FPV: Street level at 72° pitch, zoom 18.2, locked to avatar heading
     * - 3D Aerial: Perspective bird's-eye at 58° pitch, zoom 16.2
     * - 2D Overview: Tactical map at 0° pitch, zoom 15.0, true North
     */
    const applyCameraMode = useCallback(
      (mode: CameraMode, targetCenter?: [number, number], targetBearing?: number) => {
        const map = mapRef.current;
        if (!map) return;

        setCameraModeState(mode);

        const currentCoords = targetCenter || [userCoordsRef.current.longitude, userCoordsRef.current.latitude];
        const heading = targetBearing !== undefined ? targetBearing : userBearingRef.current;

        let targetPitch = 0;
        let targetZoom = 15.0;
        let calculatedBearing = 0;
        let notice = '';

        if (mode === 'fpv') {
          targetPitch = 72; // Optimal street-level perspective with visible 3D architecture
          targetZoom = 18.2;
          calculatedBearing = heading;
          notice = '🎮 Street First-Person View (72° Perspective)';
        } else if (mode === 'aerial') {
          targetPitch = 58;
          targetZoom = 16.2;
          calculatedBearing = heading !== undefined && heading !== 0 ? heading : -20;
          notice = '🚁 3D Aerial View (58° Perspective)';
        } else {
          targetPitch = 0;
          targetZoom = 15.0;
          calculatedBearing = 0;
          notice = '🗺️ 2D Tactical Map (0° North)';
        }

        setCameraNotification(notice);
        if (cameraNoticeTimeoutRef.current) {
          clearTimeout(cameraNoticeTimeoutRef.current);
        }
        cameraNoticeTimeoutRef.current = window.setTimeout(() => {
          setCameraNotification(null);
        }, 2200);

        map.flyTo({
          center: currentCoords,
          pitch: targetPitch,
          zoom: targetZoom,
          bearing: calculatedBearing,
          curve: 1.4,
          speed: 1.1,
          essential: true
        });
      },
      []
    );

    /**
     * Clears all street-level wayfinding markers and route line
     */
    const clearWayfindingMarkers = useCallback(() => {
      waypointMarkersRef.current.forEach((m) => m.remove());
      waypointMarkersRef.current = [];

      if (destinationBeaconRef.current) {
        destinationBeaconRef.current.remove();
        destinationBeaconRef.current = null;
      }

      const map = mapRef.current;
      if (map) {
        if (map.getLayer('pulse-nav-route-line-glow')) map.removeLayer('pulse-nav-route-line-glow');
        if (map.getLayer('pulse-nav-route-line')) map.removeLayer('pulse-nav-route-line');
        if (map.getSource('pulse-nav-route-source')) map.removeSource('pulse-nav-route-source');
      }

      if (simAnimationRef.current) {
        cancelAnimationFrame(simAnimationRef.current);
        simAnimationRef.current = null;
      }
      setIsSimulatingWalk(false);
      setSimulationProgress(0);
      activeRouteRef.current = null;
    }, []);

    /**
     * Renders street-level wayfinding cues and holographic beacon along the route
     */
    const renderStreetWayfindingCues = useCallback(
      (route: NavigationRoute) => {
        const map = mapRef.current;
        if (!map) return;

        clearWayfindingMarkers();
        activeRouteRef.current = route;

        // 1. Add/Update High-Performance GPU WebGL Route Line
        try {
          const existingSource = map.getSource('pulse-nav-route-source') as maplibregl.GeoJSONSource | undefined;
          if (existingSource) {
            existingSource.setData(route.geojsonFeature);
          } else {
            map.addSource('pulse-nav-route-source', {
              type: 'geojson',
              data: route.geojsonFeature
            });

            // Glowing Outer Halo
            map.addLayer({
              id: 'pulse-nav-route-line-glow',
              type: 'line',
              source: 'pulse-nav-route-source',
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': ANCHORS.signal,
                'line-width': 10,
                'line-opacity': 0.55,
                'line-blur': 3
              }
            });

            // Bright Inner Laser Line
            map.addLayer({
              id: 'pulse-nav-route-line',
              type: 'line',
              source: 'pulse-nav-route-source',
              layout: {
                'line-join': 'round',
                'line-cap': 'round'
              },
              paint: {
                'line-color': '#FFFFFF',
                'line-width': 4,
                'line-opacity': 0.95
              }
            });
          }
        } catch (e) {
          console.warn('[PULSE Map] Error adding route line:', e);
        }

        // 2. Instantiate Lean Waypoint Cues (max 4-6 cues)
        route.waypoints.forEach((cue) => {
          if (cue.cueType === 'destination') {
            const beaconEl = document.createElement('div');
            beaconEl.className = 'pulse-destination-beacon';
            beaconEl.innerHTML = `
              <div style="background: linear-gradient(135deg, var(--accent), var(--accent2)); color: white; padding: 5px 12px; border-radius: 14px; font-weight: 800; font-size: 11px; border: 1.5px solid #FFFFFF; box-shadow: 0 0 20px rgba(var(--accent-rgb), 0.9); display: flex; align-items: center; gap: 5px; backdrop-filter: blur(10px);">
                <span style="font-size: 13px;">🎯</span>
                <span>${escapeHtml(route.destinationTitle)}</span>
              </div>
              <div style="width: 3.5px; height: 110px; background: linear-gradient(to top, rgba(var(--accent-rgb), 0.95), rgba(var(--signal-rgb), 0.7), transparent); margin: 2px auto 0;"></div>
              <div style="width: 40px; height: 16px; border-radius: 50%; border: 2px solid var(--accent); background: radial-gradient(circle, rgba(var(--accent-rgb), 0.45), transparent); margin: 0 auto;"></div>
            `;

            destinationBeaconRef.current = new maplibregl.Marker({
              element: beaconEl,
              anchor: 'bottom'
            })
              .setLngLat(cue.coordinates)
              .addTo(map);
            return;
          }

          // Floating Holographic Directional Chevron
          const cueEl = document.createElement('div');
          cueEl.className = 'pulse-waypoint-cue';
          cueEl.innerHTML = `
            <div style="transform: rotate(${cue.bearing}deg); filter: drop-shadow(0 0 10px var(--signal));">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style="stroke: var(--signal)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 13 12 18 17 13"></polyline>
                <polyline points="7 6 12 11 17 6"></polyline>
              </svg>
            </div>
            <div style="background: rgba(10, 14, 23, 0.9); color: var(--signal); border: 1px solid rgba(var(--signal-rgb), 0.6); border-radius: 9999px; padding: 2px 8px; font-size: 9px; font-weight: 800; margin-top: 2px; box-shadow: 0 2px 8px rgba(0,0,0,0.7); text-align: center; white-space: nowrap;">
              ${escapeHtml(cue.label)}
            </div>
          `;

          const marker = new maplibregl.Marker({
            element: cueEl,
            anchor: 'center'
          })
            .setLngLat(cue.coordinates)
            .addTo(map);

          waypointMarkersRef.current.push(marker);
        });
      },
      [clearWayfindingMarkers]
    );

    /**
     * Initiates wayfinding navigation to destination
     */
    const startNavigation = useCallback(
      (destination: { latitude: number; longitude: number; title: string; category?: string }) => {
        const startPoint: [number, number] = [userCoordsRef.current.longitude, userCoordsRef.current.latitude];
        const destPoint: [number, number] = [destination.longitude, destination.latitude];

        const request = ++routeRequestRef.current;

        void findWalkingRoute(startPoint, destPoint, destination.title, destination.category).then((route) => {
          // Ignore results for a destination that was replaced or cancelled meanwhile
          if (request !== routeRequestRef.current || !mapRef.current) return;
          setActiveRoute(route);
          renderStreetWayfindingCues(route);

          const initialBearing = route.waypoints[0]?.bearing || 0;
          setUserBearing(initialBearing);
          userBearingRef.current = initialBearing;
          applyCameraMode('fpv', startPoint, initialBearing);
        });
      },
      [applyCameraMode, renderStreetWayfindingCues]
    );

    /**
     * Stops active navigation
     */
    const stopNavigation = useCallback(() => {
      routeRequestRef.current++;
      clearWayfindingMarkers();
      setActiveRoute(null);
      onClearNavigation?.();
    }, [clearWayfindingMarkers, onClearNavigation]);

    /**
     * High-Performance 60fps Walk Simulation with decoupled state
     */
    const toggleWalkSimulation = useCallback(() => {
      const route = activeRouteRef.current || activeRoute;
      if (!route) return;

      if (isSimulatingWalk) {
        if (simAnimationRef.current) {
          cancelAnimationFrame(simAnimationRef.current);
          simAnimationRef.current = null;
        }
        setIsSimulatingWalk(false);
        return;
      }

      setIsSimulatingWalk(true);
      const startTime = performance.now();
      const durationMs = Math.max(8000, Math.min(45000, route.totalDistanceMeters * 35));

      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // Throttle React state update to avoid frame thrashing
        if (now - lastProgressUpdateRef.current > 180 || progress >= 1) {
          lastProgressUpdateRef.current = now;
          setSimulationProgress(progress);
        }

        const currentPos = getPositionAlongRoute(route, progress);
        userCoordsRef.current = {
          latitude: currentPos.coordinates[1],
          longitude: currentPos.coordinates[0]
        };
        userBearingRef.current = currentPos.bearing;

        // 1. Direct avatar update without re-rendering the map component
        updateUserMarker(currentPos.coordinates[0], currentPos.coordinates[1], currentPos.bearing);

        // 2. Direct GPU Camera tracking at 60fps (jumpTo eliminates animation queue latency)
        const map = mapRef.current;
        if (map) {
          map.jumpTo({
            center: currentPos.coordinates,
            bearing: currentPos.bearing,
            pitch: 72,
            zoom: 18.4
          });
        }

        if (progress < 1) {
          simAnimationRef.current = requestAnimationFrame(animateStep);
        } else {
          setIsSimulatingWalk(false);
          setUserCoords({
            latitude: currentPos.coordinates[1],
            longitude: currentPos.coordinates[0]
          });
          setUserBearing(currentPos.bearing);

          // Destination celebration
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: [ANCHORS.signal, ANCHORS.accent, ANCHORS.accent2, '#10B981']
          });
        }
      };

      simAnimationRef.current = requestAnimationFrame(animateStep);
    }, [activeRoute, isSimulatingWalk, updateUserMarker]);

    /**
     * Free-Roaming Street Walking (WASD / Joystick step)
     */
    const walkStep = useCallback(
      (direction: 'forward' | 'backward' | 'turn-left' | 'turn-right') => {
        const map = mapRef.current;
        if (!map) return;

        const currentLng = userCoordsRef.current.longitude;
        const currentLat = userCoordsRef.current.latitude;
        let currentBearing = userBearingRef.current;

        if (direction === 'turn-left') {
          currentBearing = (currentBearing - 15 + 360) % 360;
          userBearingRef.current = currentBearing;
          setUserBearing(currentBearing);
          updateUserMarker(currentLng, currentLat, currentBearing);
          map.jumpTo({ bearing: currentBearing });
          return;
        }

        if (direction === 'turn-right') {
          currentBearing = (currentBearing + 15) % 360;
          userBearingRef.current = currentBearing;
          setUserBearing(currentBearing);
          updateUserMarker(currentLng, currentLat, currentBearing);
          map.jumpTo({ bearing: currentBearing });
          return;
        }

        // Distance in meters to advance per step
        const stepMeters = direction === 'forward' ? 12 : -8;
        const bearingRad = (currentBearing * Math.PI) / 180;

        // Approx delta degrees
        const latDelta = (stepMeters * Math.cos(bearingRad)) / 111320;
        const lngDelta = (stepMeters * Math.sin(bearingRad)) / (111320 * Math.cos((currentLat * Math.PI) / 180));

        const nextLng = currentLng + lngDelta;
        const nextLat = currentLat + latDelta;

        userCoordsRef.current = { longitude: nextLng, latitude: nextLat };
        setUserCoords({ longitude: nextLng, latitude: nextLat });
        updateUserMarker(nextLng, nextLat, currentBearing);

        map.jumpTo({
          center: [nextLng, nextLat],
          bearing: currentBearing,
          pitch: 72,
          zoom: 18.2
        });
      },
      [updateUserMarker]
    );

    /**
     * Resilient 2-Phase Geolocation (No timeout errors)
     */
    const refineCancelRef = useRef<(() => void) | null>(null);
    /** Draws (or clears) the circle showing how accurate the position is */
    const drawAccuracy = useCallback((lng: number, lat: number, meters: number | null) => {
      const source = mapRef.current?.getSource('pulse-accuracy-source') as maplibregl.GeoJSONSource | undefined;
      source?.setData(
        (meters == null
          ? { type: 'FeatureCollection', features: [] }
          : accuracyCircle(lng, lat, Math.min(5000, Math.max(6, meters)))) as never
      );
    }, []);
    const drawAccuracyRef = useRef(drawAccuracy);
    drawAccuracyRef.current = drawAccuracy;
    const onLocationFoundRef = useRef(onLocationFound);
    onLocationFoundRef.current = onLocationFound;
    const locateAndCenterUserRef = useRef<((shouldFly?: boolean, explicit?: boolean) => void) | null>(null);
    const locateAndCenterUser = useCallback(
      (shouldFly = true, explicit = shouldFly) => {
        setIsLocating(true);

        const applyFix = (fix: Awaited<ReturnType<typeof locate>>['fix'] & object, fly: boolean, reason: LocationReason) => {
          const coords: UserCoordinates = {
            latitude: fix.latitude,
            longitude: fix.longitude,
            accuracy: fix.accuracy,
            heading: fix.heading,
            speed: fix.speed,
            source: fix.source,
            place: fix.place
          };
          if (fly) keepSpotRef.current = false;
          else if (ignoreAutoFix(coords.longitude, coords.latitude)) {
            onLocationFound?.(coords, reason);
            return;
          }
          const heading = coords.heading != null && !isNaN(coords.heading) ? coords.heading : userBearingRef.current;
          setUserCoords(coords);
          userCoordsRef.current = coords;
          setUserBearing(heading);
          userBearingRef.current = heading;

          if (mapRef.current) {
            updateUserMarker(coords.longitude, coords.latitude, heading);
            drawAccuracy(coords.longitude, coords.latitude, coords.source === 'ip' ? null : (coords.accuracy ?? null));
            if (fly) {
              applyCameraMode(cameraMode, [coords.longitude, coords.latitude], heading);
            }
          }
          onLocationFound?.(coords, reason);
        };

        // "Find me" always asks for a fresh position; the automatic look at startup may reuse a recent one
        locate({ fresh: explicit }).then(({ fix }) => {
          setIsLocating(false);
          if (fix) {
            applyFix(fix, shouldFly, explicit ? 'user' : 'auto');
            // A coarse fix is sharpened in the background
            refineCancelRef.current?.();
            refineCancelRef.current = refineLocation(fix, (better) => applyFix(better, false, 'auto'));
            return;
          }

          // Nothing located the user: settle on the default city hub without any error UI
          // (or stay on the spot carried over from the other map)
          if (keepSpotRef.current && !shouldFly) return;
          const fallback: UserCoordinates = { latitude: stableCenter[1], longitude: stableCenter[0] };
          setUserCoords(fallback);
          userCoordsRef.current = fallback;
          if (mapRef.current) {
            updateUserMarker(fallback.longitude, fallback.latitude, userBearingRef.current);
            if (shouldFly) {
              applyCameraMode(cameraMode, [fallback.longitude, fallback.latitude], userBearingRef.current);
            }
          }
          drawAccuracy(fallback.longitude, fallback.latitude, null);
          console.info('[PULSE] No location available; centered on the active city hub:', fallback);
        });
      },
      [applyCameraMode, cameraMode, drawAccuracy, stableCenter, onLocationFound, updateUserMarker]
    );

    locateAndCenterUserRef.current = locateAndCenterUser;

    /**
     * Expose imperative handle methods
     */
    useImperativeHandle(
      ref,
      () => ({
        getMap: () => mapRef.current,
        flyTo: (center, zoom = 18.2) => {
          mapRef.current?.flyTo({
            center,
            zoom,
            pitch: 72,
            curve: 1.4,
            essential: true
          });
        },
        recenterOnUser: () => locateAndCenterUser(true),
        getUserLocation: () => userCoordsRef.current,
        set3dBuildings: toggle3dBuildings,
        toggle3dView: () => {
          applyCameraMode(cameraMode === 'overview' ? 'fpv' : 'overview');
        },
        setCameraMode: (mode) => applyCameraMode(mode),
        startNavigation,
        stopNavigation
      }),
      [applyCameraMode, cameraMode, locateAndCenterUser, startNavigation, stopNavigation, toggle3dBuildings]
    );

    /**
     * Keyboard controls listener for WASD / Arrow keys free-walking
     */
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        // Only trigger if user is not typing in an input/textarea
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;

        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') {
          e.preventDefault();
          walkStep('forward');
        } else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') {
          e.preventDefault();
          walkStep('backward');
        } else if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') {
          e.preventDefault();
          walkStep('turn-left');
        } else if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') {
          e.preventDefault();
          walkStep('turn-right');
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [walkStep]);

    /**
     * Initialize the MapLibre GL instance
     */
    useEffect(() => {
      if (!mapContainerRef.current || mapRef.current) return;

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: buildPulseStyle(),
        maxPitch: 85,
        center: initialViewRef.current.center,
        zoom: initialViewRef.current.zoom,
        pitch: initialViewRef.current.pitch,
        bearing: initialViewRef.current.bearing,
        interactive: interactive,
        attributionControl: { compact: true }
      });

      mapRef.current = map;
      // Test hook for inspecting the map in dev builds
      if (import.meta.env.DEV) (window as unknown as { __pulseMap?: maplibregl.Map }).__pulseMap = map;

      // Navigation Controls
      if (showNavigationControl) {
        map.addControl(
          new maplibregl.NavigationControl({
            visualizePitch: true,
            showCompass: true,
            showZoom: true
          }),
          navigationControlPosition
        );
      }

      // Geolocate Control
      if (showGeolocateControl) {
        const geolocate = new maplibregl.GeolocateControl({
          positionOptions: { enableHighAccuracy: true, timeout: 20000 },
          trackUserLocation: true
        });
        map.addControl(geolocate, 'top-right');
      }

      if (onMapClick) {
        map.on('click', onMapClick);
      }

      installWindowImages(map);

      // Style load: add the Radar overlays (hidden until switched on) and apply building state
      map.on('style.load', () => {
        const on = radarLayersRef.current;
        const visibility = (flag: boolean) => (flag ? 'visible' : 'none') as 'visible' | 'none';
        const center: [number, number] = [currentLocationRef.current.longitude, currentLocationRef.current.latitude];
        const before = 'water-name'; // keep labels above the overlays

        map.addSource('pulse-radius-source', {
          type: 'geojson',
          data: createGeoJSONCircle(center, radiusKmRef.current) as never
        });
        map.addLayer({
          id: 'pulse-radius-fill',
          type: 'fill',
          source: 'pulse-radius-source',
          layout: { visibility: visibility(on.radius) },
          paint: { 'fill-color': ANCHORS.signal, 'fill-opacity': 0.06 }
        }, before);
        map.addLayer({
          id: 'pulse-radius-line',
          type: 'line',
          source: 'pulse-radius-source',
          layout: { visibility: visibility(on.radius) },
          paint: { 'line-color': ANCHORS.signal, 'line-width': 1.5, 'line-dasharray': [3, 2], 'line-opacity': 0.7 }
        }, before);

        map.addSource('pulse-accuracy-source', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } as never });
        map.addLayer({
          id: 'pulse-accuracy-fill',
          type: 'fill',
          source: 'pulse-accuracy-source',
          paint: { 'fill-color': ANCHORS.signal, 'fill-opacity': 0.12 }
        }, before);
        map.addLayer({
          id: 'pulse-accuracy-line',
          type: 'line',
          source: 'pulse-accuracy-source',
          paint: { 'line-color': ANCHORS.signal, 'line-width': 1.2, 'line-opacity': 0.6 }
        }, before);

        map.addSource('pulse-heat-source', {
          type: 'geojson',
          data: heatmapFeatures(latestMomentsRef.current) as never
        });
        map.addLayer({
          id: 'pulse-heat',
          type: 'heatmap',
          source: 'pulse-heat-source',
          maxzoom: 17,
          layout: { visibility: visibility(on.heatmap) },
          paint: {
            'heatmap-weight': ['interpolate', ['linear'], ['get', 'score'], 0, 0, 100, 1],
            'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 9, 1, 15, 3],
            // Blue = low, yellow = moderate, orange = active, red = hotspot
            'heatmap-color': [
              'interpolate', ['linear'], ['heatmap-density'],
              0, 'rgba(0, 0, 0, 0)',
              0.2, '#3B82F6',
              0.45, '#EAB308',
              0.7, '#F97316',
              0.95, '#EF4444'
            ],
            'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 9, 20, 14, 55, 17, 90],
            'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0.8, 17, 0]
          }
        }, before);

        BUILDING_LAYER_IDS.forEach((id) => {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visibility(is3dBuildingsRef.current));
        });

        applyLighting(map, currentLighting());
      });

      // Flyer cards shrink when zoomed out so a busy city doesn't pile them on top of each other
      const syncCompactCards = () => {
        map.getContainer().classList.toggle('pulse-map-compact-cards', map.getZoom() < 15);
      };
      map.on('zoom', syncCompactCards);
      syncCompactCards();
      map.on('error', (e) => console.warn('[PULSE Map]', e.error?.message ?? e));

      // Markers and controls only need the style; 'load' also waits on every tile and can
      // stall on slow networks, so become ready on whichever fires first.
      let isReady = false;
      const markReady = () => {
        if (isReady) return;
        isReady = true;
        setIsMapLoaded(true);
        onMapLoad?.(map);

        if (autoGeolocate) {
          if (resumeRef.current) updateUserMarker(resumeRef.current.longitude, resumeRef.current.latitude, resumeRef.current.heading);
          locateAndCenterUser(false);
        } else {
          const [lng, lat] = initialViewRef.current.center;
          updateUserMarker(lng, lat, initialViewRef.current.bearing);
        }
      };
      map.on('style.load', markReady);
      map.on('load', markReady);

      // Continuous position: a high-accuracy watch that ignores glitches, pauses while the tab is hidden,
      // falls back to the IP position when the browser stops answering, and announces a recovery
      let stopWatch: (() => void) | null = null;
      if (autoGeolocate) {
        stopWatch = followUser({
          onMove: (fix) => {
            if (ignoreAutoFix(fix.longitude, fix.latitude)) return;
            const coords: UserCoordinates = {
              latitude: fix.latitude,
              longitude: fix.longitude,
              accuracy: fix.accuracy,
              heading: fix.heading,
              speed: fix.speed,
              source: 'gps'
            };
            const heading = coords.heading != null && !isNaN(coords.heading) ? coords.heading : userBearingRef.current;
            userCoordsRef.current = coords;
            userBearingRef.current = heading;
            updateUserMarker(coords.longitude, coords.latitude, heading);
            drawAccuracyRef.current(coords.longitude, coords.latitude, coords.accuracy ?? null);
          },
          onAnnounce: (fix) => {
            const coords: UserCoordinates = {
              latitude: fix.latitude,
              longitude: fix.longitude,
              accuracy: fix.accuracy,
              heading: fix.heading,
              speed: fix.speed,
              source: fix.source,
              place: fix.place
            };
            if (ignoreAutoFix(coords.longitude, coords.latitude)) {
              onLocationFoundRef.current?.(coords, 'auto');
              return;
            }
            userCoordsRef.current = coords;
            updateUserMarker(coords.longitude, coords.latitude, userBearingRef.current);
            drawAccuracyRef.current(coords.longitude, coords.latitude, coords.source === 'ip' ? null : (coords.accuracy ?? null));
            onLocationFoundRef.current?.(coords, 'auto');
          }
        });
      }

      // Device Compass Orientation for Real-time Heading
      const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
        if (event.alpha != null && !isSimulatingWalk) {
          const compassHeading = (360 - event.alpha) % 360;
          userBearingRef.current = compassHeading;
          setUserBearing(compassHeading);

          const currentPos = userCoordsRef.current;
          if (currentPos) {
            updateUserMarker(currentPos.longitude, currentPos.latitude, compassHeading);
          }
        }
      };

      if (window.DeviceOrientationEvent) {
        window.addEventListener('deviceorientation', handleDeviceOrientation);
      }

      return () => {
        stopWatch?.();
        refineCancelRef.current?.();
        window.removeEventListener('deviceorientation', handleDeviceOrientation);
        clearWayfindingMarkers();
        // Markers die with the map; drop refs so a rebuilt map re-creates them
        momentMarkersRef.current.forEach((marker) => marker.remove());
        momentMarkersRef.current.clear();
        zoneMarkersRef.current.forEach((marker) => marker.remove());
        zoneMarkersRef.current.clear();
        businessMarkersRef.current.forEach((marker) => marker.remove());
        businessMarkersRef.current.clear();
        userMarkerRef.current = null;
        setIsMapLoaded(false);
        map.remove();
        mapRef.current = null;
      };
    }, [
      interactive,
      showNavigationControl,
      navigationControlPosition,
      showGeolocateControl
    ]);

    /**
     * Fly to a new center when the caller switches hubs (values change, not array identity)
     */
    useEffect(() => {
      const [prevLng, prevLat] = lastCenterRef.current;
      if (prevLng === stableCenter[0] && prevLat === stableCenter[1]) return;
      lastCenterRef.current = stableCenter;

      const map = mapRef.current;
      if (!map) return;
      setUserCoords({ latitude: stableCenter[1], longitude: stableCenter[0] });
      updateUserMarker(stableCenter[0], stableCenter[1], userBearingRef.current);
      map.flyTo({ center: stableCenter, curve: 1.4, duration: 1800, essential: true });
    }, [stableCenter, updateUserMarker]);

    /**
     * Respond to incoming navigation destination prop
     */
    useEffect(() => {
      if (propNavDestination) {
        startNavigation(propNavDestination);
      }
    }, [propNavDestination, startNavigation]);

    /**
     * Render Pulse Moments 3D Ground Billboard Markers
     */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;

      const currentMarkers = momentMarkersRef.current;
      const nextMomentIds = new Set(moments.map((m) => m.id));

      // Remove stale markers
      currentMarkers.forEach((marker, id) => {
        if (!nextMomentIds.has(id)) {
          marker.remove();
          currentMarkers.delete(id);
        }
      });

      // Add or update high-grade 3D street flyers
      moments.forEach((moment) => {
        if (currentMarkers.has(moment.id)) {
          const marker = currentMarkers.get(moment.id)!;
          marker.setLngLat([moment.longitude, moment.latitude]);
          return;
        }

        const el = createMomentFlyerElement(moment);

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          const latest = latestMomentsRef.current.find((m) => m.id === moment.id) ?? moment;
          onSelectMoment?.(latest);
          map.flyTo({
            center: [moment.longitude, moment.latitude],
            zoom: 18.2,
            pitch: 72,
            duration: 1200
          });
        });

        const newMarker = new maplibregl.Marker({
          element: el,
          anchor: 'bottom'
        })
          .setLngLat([moment.longitude, moment.latitude])
          .addTo(map);

        currentMarkers.set(moment.id, newMarker);
      });
    }, [moments, isMapLoaded, onSelectMoment]);

    /** The lighting for now at the user's location, or the manual override */
    function currentLighting() {
      const mode = lightingModeRef.current;
      if (mode !== 'auto') return lightingForMood(mode);
      const where = currentLocationRef.current;
      return getLighting(new Date(), where.latitude, where.longitude);
    }

    // Repaint when the mode or place changes, and every minute as the sun moves
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;
      try {
        localStorage.setItem(LIGHTING_MODE_KEY, lightingMode);
      } catch {
        // storage unavailable: the choice just won't persist
      }
      const repaint = () => applyLighting(map, currentLighting());
      repaint();
      const timer = window.setInterval(repaint, 60 * 1000);
      return () => window.clearInterval(timer);
    }, [lightingMode, currentLocation.latitude, currentLocation.longitude, isMapLoaded]);

    /**
     * Radar overlays: keep the radius circle and heatmap in step with the app state
     */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;
      const source = map.getSource('pulse-radius-source') as maplibregl.GeoJSONSource | undefined;
      source?.setData(
        createGeoJSONCircle([currentLocation.longitude, currentLocation.latitude], radiusKm) as never
      );
    }, [currentLocation, radiusKm, isMapLoaded]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;
      const source = map.getSource('pulse-heat-source') as maplibregl.GeoJSONSource | undefined;
      source?.setData(heatmapFeatures(moments) as never);
    }, [moments, isMapLoaded]);

    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;
      const setVisible = (id: string, visible: boolean) => {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
      };
      setVisible('pulse-heat', radarLayers.heatmap);
      setVisible('pulse-radius-fill', radarLayers.radius);
      setVisible('pulse-radius-line', radarLayers.radius);
    }, [radarLayers.heatmap, radarLayers.radius, isMapLoaded]);

    /**
     * Radar overlays: hotspot zone badges (DOM markers, only while the layer is on)
     */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;
      const markers = zoneMarkersRef.current;
      const wanted = radarLayers.zones ? new Set(activityZones.map((z) => z.id)) : new Set<string>();

      markers.forEach((marker, id) => {
        if (!wanted.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      });

      if (!radarLayers.zones) return;
      activityZones.forEach((zone) => {
        if (markers.has(zone.id)) return;
        const zoneEl = document.createElement('div');
        zoneEl.className = 'cursor-pointer select-none pointer-events-auto';
        const isHigh = zone.activityScore >= 80;
        const glowColor = isHigh ? 'rgba(239, 68, 68, 0.4)' : 'rgba(234, 179, 8, 0.3)';
        zoneEl.innerHTML = `
          <div class="px-2.5 py-1 rounded-full glass-panel border border-white/20 shadow-xl flex items-center gap-1.5 transition-transform hover:scale-110 active:scale-95" style="box-shadow: 0 0 16px ${glowColor};">
            <span class="w-2 h-2 rounded-full ${isHigh ? 'bg-accent-500 animate-ping' : 'bg-amber-400'}"></span>
            <span class="text-[11px] font-bold text-white tracking-tight">${escapeHtml(zone.zoneName)}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-black ${
              isHigh ? 'bg-accent-500/30 text-accent-300' : 'bg-amber-500/30 text-amber-300'
            }">⚡${zone.activityScore}</span>
          </div>
        `;
        zoneEl.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedZone(zone);
          setSelectedMoment(null);
        });
        markers.set(
          zone.id,
          new maplibregl.Marker({ element: zoneEl, anchor: 'bottom' })
            .setLngLat([zone.centerLng, zone.centerLat])
            .addTo(map)
        );
      });
    }, [activityZones, radarLayers.zones, isMapLoaded, setSelectedMoment, setSelectedZone]);

    /**
     * Radar overlays: business live pins (only while the layer is on)
     */
    useEffect(() => {
      const map = mapRef.current;
      if (!map || !isMapLoaded) return;
      const markers = businessMarkersRef.current;
      const wanted = radarLayers.business ? new Set(businessPosts.map((b) => b.id)) : new Set<string>();

      markers.forEach((marker, id) => {
        if (!wanted.has(id)) {
          marker.remove();
          markers.delete(id);
        }
      });

      if (!radarLayers.business) return;
      businessPosts.forEach((bpost) => {
        if (markers.has(bpost.id)) return;
        const bEl = document.createElement('div');
        bEl.className = 'cursor-pointer pointer-events-auto';
        bEl.innerHTML = `
          <div class="flex items-center gap-1 px-2 py-1 rounded-full transition-transform hover:scale-125 active:scale-95 bg-amber-500/90 border border-amber-300 text-slate-950 font-bold text-[10px] shadow-lg shadow-amber-500/30">
            <span>⚡</span>
            <span>${escapeHtml(bpost.livePinType)}</span>
          </div>
        `;
        bEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const syntheticMoment: Moment = {
            id: bpost.id,
            userId: bpost.businessId,
            userName: bpost.businessName,
            userAvatar: bpost.businessAvatar,
            userReputation: 99,
            title: bpost.title,
            description: bpost.offer,
            category: 'deals',
            latitude: bpost.latitude,
            longitude: bpost.longitude,
            createdAt: bpost.createdAt,
            expiresAt: bpost.expiresAt,
            engagementScore: 90,
            viewsCount: bpost.views,
            isArchived: false,
            approxAddress: 'Verified Local Business Partner',
            reactions: { helpful: 20, trending: 35, confirmed: 15, interested: 40, going: 18 },
            commentCount: 4,
            isBusiness: true,
            businessName: bpost.businessName
          };
          setSelectedMoment(syntheticMoment);
        });
        markers.set(
          bpost.id,
          new maplibregl.Marker({ element: bEl, anchor: 'center' })
            .setLngLat([bpost.longitude, bpost.latitude])
            .addTo(map)
        );
      });
    }, [businessPosts, radarLayers.business, isMapLoaded, setSelectedMoment]);

    return (
      <div
        className={`relative w-full h-full min-h-[350px] overflow-hidden rounded-2xl bg-[#0A0E17] ${className}`}
        style={style}
      >
        {/* Map canvas */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* =========================================================================
            GAMING HUD: STREET-LEVEL WAYFINDING NAVIGATION CUES OVERLAY
           ========================================================================= */}
        {activeRoute && (
          <div className="absolute top-16 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-30 animate-slide-up">
            <div className="glass-panel p-4 rounded-3xl border border-signal-500/40 bg-[#0A0E17]/95 shadow-2xl backdrop-blur-xl text-white space-y-3">
              {/* Header Title & Close Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-signal-400 animate-ping"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-signal-300 flex items-center gap-1">
                    <Route className="w-3 h-3 text-signal-400" />
                    <span>Street Wayfinding HUD</span>
                  </span>
                </div>
                <button
                  onClick={stopNavigation}
                  className="p-1.5 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                  title="Exit Navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Destination Card & Real-time Metrics */}
              <div className="flex items-center justify-between bg-slate-900/80 p-3 rounded-2xl border border-white/10">
                <div>
                  <h4 className="font-bold text-sm text-white truncate max-w-[200px]">
                    {activeRoute.destinationTitle}
                  </h4>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="text-signal-400 font-bold">{activeRoute.totalDistanceMeters}m remaining</span>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold">~{activeRoute.estimatedWalkingMinutes} min walk</span>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-2xl bg-signal-500/20 border border-signal-500/40 flex items-center justify-center text-signal-300 font-black text-sm">
                  🎯
                </div>
              </div>

              {/* Active Step Guidance Banner */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-signal-500/10 border border-signal-500/30 text-signal-200 text-xs font-semibold">
                <Footprints className="w-4 h-4 text-signal-400 shrink-0 animate-bounce" />
                <span className="truncate">
                  {isSimulatingWalk
                    ? `Walking in 3D: ${(simulationProgress * 100).toFixed(0)}% reached`
                    : 'Follow street route ahead to destination'}
                </span>
              </div>

              {/* Action Controls: Autopilot Walk Simulation & Stop */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={toggleWalkSimulation}
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
                      <span>Walk Route in 3D (60 FPS)</span>
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
                  onClick={stopNavigation}
                  className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors border border-white/5"
                >
                  End
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            CONSOLIDATED CAMERA, TELEPORT HOTSPOTS & ENVIRONMENT CONTROLS
           ========================================================================= */}
        {show3dControls && isMapLoaded && (
          <div className="absolute top-4 left-4 z-20 flex flex-wrap items-center gap-2 pointer-events-auto">
            {/* Unified Camera Mode Capsule */}
            <div className="flex items-center gap-1 p-1 rounded-2xl glass-hud border border-white/15 shadow-2xl backdrop-blur-2xl">
              {/* FPV Mode (72° street level) */}
              <button
                onClick={() => applyCameraMode('fpv')}
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

              {/* 3D Aerial (58° pitch) */}
              <button
                onClick={() => applyCameraMode('aerial')}
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

              {/* 2D Overview (0° pitch) */}
              <button
                onClick={() => applyCameraMode('overview')}
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

            {/* Lagos Hotspot Quick-Teleport Button */}
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
                <div className="absolute top-full left-0 mt-2 p-2 rounded-2xl glass-dropdown border border-white/15 shadow-2xl backdrop-blur-2xl flex flex-col gap-1 min-w-[210px] z-30 animate-fade-in bg-[#0A0E17]/95">
                  <div className="text-[10px] font-bold text-slate-400 px-2 py-1 uppercase tracking-wider">
                    Lagos 3D Hotspots
                  </div>
                  {LAGOS_HOTSPOTS.map((spot) => (
                    <button
                      key={spot.name}
                      onClick={() => {
                        setShowHotspotMenu(false);
                        userCoordsRef.current = { longitude: spot.coords[0], latitude: spot.coords[1] };
                        setUserCoords(userCoordsRef.current);
                        updateUserMarker(spot.coords[0], spot.coords[1], 0);
                        mapRef.current?.flyTo({
                          center: spot.coords,
                          zoom: 18.2,
                          pitch: 72,
                          bearing: 0,
                          curve: 1.4,
                          essential: true
                        });
                      }}
                      className="w-full text-left px-2.5 py-1.5 rounded-xl hover:bg-signal-500/15 text-slate-200 hover:text-signal-300 text-xs font-semibold flex items-center justify-between transition-colors"
                    >
                      <span>{spot.name}</span>
                      <ChevronRight className="w-3 h-3 text-signal-400/60" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Walk in 3D: opens the Pulse 3D explore mode */}
            {onWalkIn3D && (
              <button
                onClick={onWalkIn3D}
                title="Explore and walk the city in Pulse 3D"
                className="flex items-center gap-1.5 py-1.5 px-2.5 rounded-2xl glass-hud border border-signal-400/40 shadow-2xl backdrop-blur-2xl text-[11px] font-bold text-signal-200 hover:bg-signal-500/20 transition-all"
              >
                <Footprints className="w-3.5 h-3.5 text-signal-400" />
                <span>Walk in 3D</span>
              </button>
            )}

            {/* Layers: 3D buildings and the Radar overlays */}
            <div className="relative">
              <button
                onClick={() => setShowLayerMenu((prev) => !prev)}
                title="Map layers and Radar overlays"
                className={`flex items-center gap-1.5 py-1.5 px-2.5 rounded-2xl glass-hud border border-white/15 shadow-2xl backdrop-blur-2xl text-[11px] font-bold transition-all ${
                  showLayerMenu ? 'bg-white/20 text-white border-white/40' : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-amber-400" />
                <span>Layers</span>
              </button>

              {showLayerMenu && (
                <div className="absolute top-full left-0 mt-2 p-3 rounded-2xl glass-dropdown border border-white/15 shadow-2xl backdrop-blur-2xl flex flex-col gap-2 w-64 z-30 animate-fade-in bg-[#0A0E17]/95 text-xs">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-white/10">
                    Map
                  </div>

                  <button
                    onClick={() => toggle3dBuildings(!is3dBuildingsEnabled)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      is3dBuildingsEnabled
                        ? 'bg-signal-500/20 text-signal-300 border border-signal-500/30'
                        : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Building2 className="w-3.5 h-3.5 text-signal-400" />
                      <span>3D Buildings</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      is3dBuildingsEnabled ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'
                    }`}>
                      {is3dBuildingsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pt-1 pb-1 border-b border-white/10 flex items-center justify-between">
                    <span>Radar</span>
                    <Radar className="w-3 h-3 text-accent-400" />
                  </div>

                  <button
                    onClick={() => setRadarLayers((l) => ({ ...l, heatmap: !l.heatmap }))}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      radarLayers.heatmap
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                      <span>Density Heatmap</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      radarLayers.heatmap ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'
                    }`}>
                      {radarLayers.heatmap ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    onClick={() => setRadarLayers((l) => ({ ...l, radius: !l.radius }))}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      radarLayers.radius
                        ? 'bg-signal-500/20 text-signal-300 border border-signal-500/30'
                        : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Crosshair className="w-3.5 h-3.5 text-signal-400" />
                      <span>Radius Circle</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      radarLayers.radius ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'
                    }`}>
                      {radarLayers.radius ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    onClick={() => setRadarLayers((l) => ({ ...l, zones: !l.zones }))}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      radarLayers.zones
                        ? 'bg-accent-500/20 text-accent-300 border border-accent-500/30'
                        : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Flame className="w-3.5 h-3.5 text-accent-400" />
                      <span>Zone Badges</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      radarLayers.zones ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'
                    }`}>
                      {radarLayers.zones ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    onClick={() => setRadarLayers((l) => ({ ...l, business: !l.business }))}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-xs font-semibold transition-all ${
                      radarLayers.business
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-400 hover:bg-white/5'
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Business Offers</span>
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-black ${
                      radarLayers.business ? 'bg-white/15 text-white' : 'bg-white/10 text-slate-400'
                    }`}>
                      {radarLayers.business ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <div className="pt-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1 flex items-center justify-between">
                      <span>Lighting</span>
                      <span className="normal-case text-signal-300">{lightingMode === 'auto' ? 'follows the sun' : 'manual'}</span>
                    </div>
                    <div className="flex items-center gap-1" data-testid="lighting-modes">
                      {LIGHTING_MODES.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setLightingMode(m.id)}
                          className={`flex-1 py-1 rounded-lg text-[10px] font-bold transition-all ${
                            lightingMode === m.id
                              ? 'bg-signal-500/25 text-signal-200 border border-signal-400/40'
                              : 'text-slate-300 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider pb-1">
                      Search radius
                    </div>
                    <div className="flex items-center gap-1">
                      {([1, 2, 5, 10, 25] as RadiusKm[]).map((r) => (
                        <button
                          key={r}
                          onClick={() => setRadiusKm(r)}
                          className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                            radiusKm === r
                              ? 'bg-accent-500/25 text-accent-300 border border-accent-500/40'
                              : 'text-slate-300 bg-white/5 hover:bg-white/10'
                          }`}
                        >
                          {r}km
                        </button>
                      ))}
                    </div>
                  </div>

                  {radarLayers.heatmap && (
                    <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-1 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />Low activity</div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />Moderate</div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />Active</div>
                      <div className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-accent-500 shrink-0" />Hotspot</div>
                    </div>
                  )}

                  <div className="pt-2 border-t border-white/10">
                    <button
                      onClick={() => {
                        simulateIncomingMomentAlert();
                        setShowLayerMenu(false);
                      }}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-xl bg-accent-500/15 hover:bg-accent-500/25 text-accent-300 text-[11px] font-bold border border-accent-500/30 transition-all"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Simulate Local Alert</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Free-Roaming Walking Mode Controller HUD (Desktop & Mobile) */}
        {show3dControls && isMapLoaded && showWalkingControls && (
          <div className="absolute bottom-[calc(var(--area-sheet-h,0px)+1.5rem)] transition-[bottom] duration-300 left-4 z-20 pointer-events-auto">
            <div className="glass-panel p-2.5 rounded-2xl border border-white/15 bg-[#0A0E17]/85 backdrop-blur-xl shadow-2xl flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
                <Gamepad2 className="w-3 h-3 text-signal-400" />
                <span>Walk (WASD)</span>
              </div>

              {/* D-Pad Buttons */}
              <button
                onClick={() => walkStep('forward')}
                title="Walk Forward (W / Up Arrow)"
                className="w-8 h-8 rounded-lg bg-white/10 hover:bg-signal-500/30 active:scale-95 text-slate-200 hover:text-signal-300 flex items-center justify-center border border-white/10 transition-all shadow-sm"
              >
                <ArrowUp className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => walkStep('turn-left')}
                  title="Turn Left (A / Left Arrow)"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-signal-500/30 active:scale-95 text-slate-200 hover:text-signal-300 flex items-center justify-center border border-white/10 transition-all shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <button
                  onClick={() => walkStep('backward')}
                  title="Step Backward (S / Down Arrow)"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-signal-500/30 active:scale-95 text-slate-200 hover:text-signal-300 flex items-center justify-center border border-white/10 transition-all shadow-sm"
                >
                  <ArrowDown className="w-4 h-4" />
                </button>

                <button
                  onClick={() => walkStep('turn-right')}
                  title="Turn Right (D / Right Arrow)"
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-signal-500/30 active:scale-95 text-slate-200 hover:text-signal-300 flex items-center justify-center border border-white/10 transition-all shadow-sm"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cinematic Camera Transition Toast Notification */}
        {cameraNotification && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none cinematic-badge-enter">
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl glass-hud border border-signal-400/40 text-white shadow-2xl backdrop-blur-2xl bg-[#0A0E17]/90">
              <div className="w-2.5 h-2.5 rounded-full bg-signal-400 camera-lens-pulse" />
              <span className="text-xs font-bold tracking-wide">{cameraNotification}</span>
            </div>
          </div>
        )}

        {/* Quick GPS Recenter Button */}
        {(
          <div className="absolute bottom-[calc(var(--area-sheet-h,0px)+1.5rem)] transition-[bottom] duration-300 right-4 z-20 flex flex-col gap-2">
            <button
              onClick={() => locateAndCenterUser(true)}
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
        )}

        {/* Locating Toast / Status Badge */}
        {isLocating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-signal-500/40 text-signal-300 text-xs font-semibold shadow-xl backdrop-blur-md animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Connecting to 3D Radar...</span>
          </div>
        )}

        {/* Custom Overlays and Child Components */}
        {children}
      </div>
    );
  }
);

PulseMap.displayName = 'PulseMap';
