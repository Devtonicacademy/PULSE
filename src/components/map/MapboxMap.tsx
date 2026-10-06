import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef
} from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import confetti from 'canvas-confetti';
import {
  Navigation,
  Crosshair,
  AlertCircle,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Moon,
  Sun,
  Sunset,
  Sunrise,
  Box,
  Layers,
  Sparkles,
  Compass,
  Eye,
  Footprints,
  Play,
  Square,
  CheckCircle2,
  X,
  MapPin,
  ChevronRight,
  Route
} from 'lucide-react';
import { Moment, MomentCategory } from '../../types/pulse';
import {
  generateStreetNavigationRoute,
  getPositionAlongRoute,
  NavigationRoute,
  WaypointCue
} from '../../utils/wayfindingUtils';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
  heading?: number | null;
  speed?: number | null;
}

export type MapboxLightPreset = 'night' | 'dusk' | 'dawn' | 'day';
export type CameraMode = 'fpv' | 'aerial' | 'overview';

export interface MapboxMapProps {
  /** Optional Mapbox access token. Defaults to VITE_MAPBOX_TOKEN env variable or verified default */
  accessToken?: string;
  /** Mapbox style URL (defaults to Mapbox Standard: 'mapbox://styles/mapbox/standard') */
  mapStyle?: string;
  /** Mapbox Standard light preset: 'night' | 'dusk' | 'dawn' | 'day' (defaults to 'night') */
  lightPreset?: MapboxLightPreset;
  /** Whether 3D buildings and objects are enabled (defaults to true) */
  enable3dBuildings?: boolean;
  /** Enable dynamic lighting and shadow effects (defaults to true) */
  enableDynamicLighting?: boolean;
  /** Fallback center coordinates as [longitude, latitude] if geolocation is unavailable (defaults to [3.4219, 6.4281]) */
  defaultCenter?: [number, number];
  /** Default zoom level (defaults to 18.2 for street-level first-person view) */
  defaultZoom?: number;
  /** Initial pitch / 3D tilt angle in degrees (0 - 85, default: 85 for First-Person View) */
  pitch?: number;
  /** Initial bearing / rotation angle in degrees (-180 - 180, default: 0) */
  bearing?: number;
  /** Initial camera mode: 'fpv' (first-person 85°) | 'aerial' (3D 58°) | 'overview' (2D 0°) (default: 'fpv') */
  initialCameraMode?: CameraMode;
  /** Automatically request user GPS geolocation and center the map on initial mount (default: true) */
  autoGeolocate?: boolean;
  /** Display a custom pulsing radar avatar marker at user's current GPS location (default: true) */
  showUserMarker?: boolean;
  /** Display native Mapbox navigation controls (+/- zoom, compass pitch/bearing) (default: true) */
  showNavigationControl?: boolean;
  /** Position of navigation controls (default: 'top-right') */
  navigationControlPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Display native Mapbox geolocate button control (default: true) */
  showGeolocateControl?: boolean;
  /** Display native fullscreen toggle control (default: false) */
  showFullscreenControl?: boolean;
  /** Display the interactive 3D, camera mode and lighting controls toolbar (defaults to true) */
  show3dControls?: boolean;
  /** Optional array of Pulse live moments to display as 3D pins on the map */
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
  /** Whether the map accepts interactive user gestures (pan, pinch, zoom, tilt) (default: true) */
  interactive?: boolean;
  /** Extra container CSS class names */
  className?: string;
  /** Extra container inline styles */
  style?: React.CSSProperties;
  /** Callback fired when the Mapbox GL map instance finishes loading */
  onMapLoad?: (map: mapboxgl.Map) => void;
  /** Callback fired when the user's GPS coordinates are resolved and centered */
  onLocationFound?: (coords: UserCoordinates) => void;
  /** Callback fired if geolocation request fails or permission is denied */
  onLocationError?: (error: GeolocationPositionError | Error) => void;
  /** Click event listener on map canvas */
  onMapClick?: (e: mapboxgl.MapMouseEvent) => void;
  /** Overlay components or floating controls rendered over the map canvas */
  children?: React.ReactNode;
}

export interface MapboxMapHandle {
  /** Returns the underlying Mapbox GL Map instance */
  getMap: () => mapboxgl.Map | null;
  /** Smoothly fly camera to a target [lng, lat] coordinate */
  flyTo: (center: [number, number], zoom?: number) => void;
  /** Re-triggers geolocation and smoothly recenters camera on current user position */
  recenterOnUser: () => void;
  /** Returns currently resolved user GPS coordinates */
  getUserLocation: () => UserCoordinates | null;
  /** Set Mapbox Standard dynamic light preset */
  setLightPreset: (preset: MapboxLightPreset) => void;
  /** Toggle 3D buildings visibility */
  set3dBuildings: (enabled: boolean) => void;
  /** Toggle between 3D perspective and 2D top-down view */
  toggle3dView: () => void;
  /** Set camera mode: 'fpv' (85° pitch) | 'aerial' (58°) | 'overview' (0°) */
  setCameraMode: (mode: CameraMode) => void;
  /** Start street-level wayfinding navigation toward a target destination */
  startNavigation: (destination: { latitude: number; longitude: number; title: string; category?: string }) => void;
  /** Stop active navigation and clear cues */
  stopNavigation: () => void;
}

const CATEGORY_ICONS: Record<MomentCategory, string> = {
  events: '🎉',
  alerts: '🚨',
  food_drinks: '🍔',
  lost_found: '🔍',
  recommendations: '💡',
  activities: '🏃',
  deals: '🛍️',
  community: '💬'
};

export const MapboxMap = forwardRef<MapboxMapHandle, MapboxMapProps>(
  (
    {
      accessToken,
      mapStyle = 'mapbox://styles/mapbox/standard',
      lightPreset: initialLightPreset = 'night',
      enable3dBuildings: initialEnable3dBuildings = true,
      enableDynamicLighting = true,
      defaultCenter = [3.4219, 6.4281], // Lagos Victoria Island coordinates fallback
      defaultZoom = 18.2, // Street-level First-Person View default
      pitch = 85, // 85° pitch for first-person street perspective
      bearing = 0,
      initialCameraMode = 'fpv',
      autoGeolocate = true,
      showUserMarker = true,
      showNavigationControl = true,
      navigationControlPosition = 'top-right',
      showGeolocateControl = true,
      showFullscreenControl = false,
      show3dControls = true,
      moments = [],
      onSelectMoment,
      navigationDestination: propNavDestination = null,
      onClearNavigation,
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
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<mapboxgl.Map | null>(null);
    const userMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const momentMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
    const waypointMarkersRef = useRef<mapboxgl.Marker[]>([]);
    const destinationBeaconRef = useRef<mapboxgl.Marker | null>(null);

    const [isLocating, setIsLocating] = useState<boolean>(false);
    const [userCoords, setUserCoords] = useState<UserCoordinates | null>(null);
    const [userBearing, setUserBearing] = useState<number>(bearing);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

    // 3D & Camera State
    const [currentLightPreset, setCurrentLightPreset] = useState<MapboxLightPreset>(initialLightPreset);
    const [is3dBuildingsEnabled, setIs3dBuildingsEnabled] = useState<boolean>(initialEnable3dBuildings);
    const [cameraMode, setCameraModeState] = useState<CameraMode>(initialCameraMode);
    const [isContinuousTracking, setIsContinuousTracking] = useState<boolean>(true);
    const [isCameraTransitioning, setIsCameraTransitioning] = useState<boolean>(false);
    const [cameraNotification, setCameraNotification] = useState<string | null>(null);
    const [showEnvironmentMenu, setShowEnvironmentMenu] = useState<boolean>(false);
    const cameraNoticeTimeoutRef = useRef<number | null>(null);

    // Navigation & Wayfinding State
    const [activeRoute, setActiveRoute] = useState<NavigationRoute | null>(null);
    const [isSimulatingWalk, setIsSimulatingWalk] = useState<boolean>(false);
    const [simulationProgress, setSimulationProgress] = useState<number>(0);
    const simAnimationRef = useRef<number | null>(null);

    // Resolve token: explicit prop, then Vite env variable
    const token = accessToken || import.meta.env.VITE_MAPBOX_TOKEN || '';
    const hasToken = Boolean(
      token &&
      token.trim().length > 0 &&
      !token.includes('your_mapbox_access_token')
    );

    /**
     * Applies Mapbox Standard dynamic light preset and shadow parameters
     */
    const applyDynamicLighting = useCallback(
      (preset: MapboxLightPreset) => {
        const map = mapRef.current;
        if (!map) return;

        // 1. Mapbox Standard basemap light preset
        try {
          (map as any).setConfigProperty('basemap', 'lightPreset', preset);
        } catch (err) {
          // Fallback if classic style is used
        }

        // 2. Configure Mapbox GL dynamic directional & ambient lights when supported
        if (enableDynamicLighting && typeof (map as any).setLights === 'function') {
          try {
            const lightConfigs: Record<
              MapboxLightPreset,
              { sunDir: [number, number]; sunColor: string; sunIntensity: number; ambColor: string; ambIntensity: number }
            > = {
              night: {
                sunDir: [220, 16],
                sunColor: '#00F2FE',
                sunIntensity: 0.4,
                ambColor: '#0C1322',
                ambIntensity: 0.5
              },
              dusk: {
                sunDir: [255, 18],
                sunColor: '#FFA502',
                sunIntensity: 0.7,
                ambColor: '#1A1226',
                ambIntensity: 0.55
              },
              dawn: {
                sunDir: [70, 24],
                sunColor: '#FF6B6B',
                sunIntensity: 0.75,
                ambColor: '#1E1A2C',
                ambIntensity: 0.55
              },
              day: {
                sunDir: [180, 52],
                sunColor: '#FFFFFF',
                sunIntensity: 0.9,
                ambColor: '#243044',
                ambIntensity: 0.6
              }
            };

            const cfg = lightConfigs[preset];
            (map as any).setLights([
              {
                id: 'directional_sun',
                type: 'directional',
                properties: {
                  direction: cfg.sunDir,
                  color: cfg.sunColor,
                  intensity: cfg.sunIntensity,
                  cast_shadows: true,
                  shadow_intensity: 0.65
                }
              },
              {
                id: 'ambient_fill',
                type: 'ambient',
                properties: {
                  color: cfg.ambColor,
                  intensity: cfg.ambIntensity
                }
              }
            ]);
          } catch (e) {
            // Ignore custom light restrictions
          }
        }

        // 3. Update custom 3D building fill-extrusion color if fallback layer exists
        if (map.getLayer('pulse-3d-buildings')) {
          const buildingColors: Record<MapboxLightPreset, string[]> = {
            night: ['0', '#0B111E', '30', '#111B30', '80', '#182745', '160', '#00F2FE'],
            dusk: ['0', '#150E20', '30', '#241432', '80', '#3B1F48', '160', '#FFA502'],
            dawn: ['0', '#161324', '30', '#251D36', '80', '#3E2A47', '160', '#FF4757'],
            day: ['0', '#1C2536', '30', '#2E3A4F', '80', '#42516B', '160', '#60A5FA']
          };

          try {
            map.setPaintProperty(
              'pulse-3d-buildings',
              'fill-extrusion-color',
              ['interpolate', ['linear'], ['get', 'height'], ...buildingColors[preset]]
            );
          } catch (e) {
            // Ignore
          }
        }
      },
      [enableDynamicLighting]
    );

    /**
     * Toggles 3D buildings on/off
     */
    const toggle3dBuildings = useCallback((enabled: boolean) => {
      const map = mapRef.current;
      if (!map) return;

      setIs3dBuildingsEnabled(enabled);

      try {
        (map as any).setConfigProperty('basemap', 'show3dObjects', enabled);
      } catch (e) {
        // Fallback
      }

      if (map.getLayer('pulse-3d-buildings')) {
        map.setLayoutProperty('pulse-3d-buildings', 'visibility', enabled ? 'visible' : 'none');
      }
    }, []);

    /**
     * Applies camera modes with smooth, animated cinematic transitions:
     * - FPV: Street level at 85° pitch, zoom 18.4, locked to avatar heading
     * - 3D Aerial: Perspective bird's-eye at 58° pitch, zoom 16.2
     * - 2D Overview: Tactical map at 0° pitch, zoom 15.0, true North
     */
    const applyCameraMode = useCallback(
      (mode: CameraMode, targetCenter?: [number, number], targetBearing?: number) => {
        const map = mapRef.current;
        if (!map) return;

        setCameraModeState(mode);
        setIsCameraTransitioning(true);

        const currentCoords = targetCenter || (userCoords ? [userCoords.longitude, userCoords.latitude] : defaultCenter);
        const heading = targetBearing !== undefined ? targetBearing : userBearing;

        let targetPitch = 0;
        let targetZoom = 15.0;
        let calculatedBearing = 0;
        let notice = '';

        if (mode === 'fpv') {
          // First-Person View: Street level at 85° pitch, high zoom, camera aligned with avatar heading
          targetPitch = 85;
          targetZoom = 18.4;
          calculatedBearing = heading;
          notice = '🎮 First-Person View (85° • Street Level)';
          setIsContinuousTracking(true);
        } else if (mode === 'aerial') {
          // 3D Perspective Aerial: 58° pitch, overview zoom
          targetPitch = 58;
          targetZoom = 16.2;
          calculatedBearing = heading !== undefined && heading !== 0 ? heading : -20;
          notice = '🚁 3D Aerial Perspective (58° • Sky View)';
        } else {
          // 2D Tactical Overview: 0° pitch, top-down north-up
          targetPitch = 0;
          targetZoom = 15.0;
          calculatedBearing = 0;
          notice = '🗺️ 2D Tactical Overview (0° • True North)';
        }

        // Show cinematic HUD toast notification
        setCameraNotification(notice);
        if (cameraNoticeTimeoutRef.current) {
          clearTimeout(cameraNoticeTimeoutRef.current);
        }
        cameraNoticeTimeoutRef.current = window.setTimeout(() => {
          setCameraNotification(null);
        }, 2400);

        // Fluid, cinematic flyTo transition with custom arc curvature and smooth cubic bezier easing
        map.flyTo({
          center: currentCoords,
          pitch: targetPitch,
          zoom: targetZoom,
          bearing: calculatedBearing,
          curve: 1.42,
          speed: 0.9,
          screenSpeed: 0.9,
          maxDuration: 2200,
          essential: true,
          easing: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
        });

        const onMoveEnd = () => {
          setIsCameraTransitioning(false);
          map.off('moveend', onMoveEnd);
        };
        map.once('moveend', onMoveEnd);
      },
      [defaultCenter, userBearing, userCoords]
    );

    /**
     * Updates or creates the custom 3D avatar marker with heading cone
     */
    const updateUserMarker = useCallback(
      (lng: number, lat: number, heading = userBearing) => {
        if (!mapRef.current || !showUserMarker) return;

        if (!userMarkerRef.current) {
          const markerContainer = document.createElement('div');
          markerContainer.className = 'pulse-user-avatar-marker-3d';
          markerContainer.style.position = 'relative';
          markerContainer.style.width = '48px';
          markerContainer.style.height = '48px';
          markerContainer.style.display = 'flex';
          markerContainer.style.alignItems = 'center';
          markerContainer.style.justifyContent = 'center';

          markerContainer.innerHTML = `
            <!-- Directional Flashlight / Heading Cone of Vision -->
            <div class="pulse-avatar-heading-cone" id="pulse-avatar-cone" style="transform: translate(-50%, -50%) rotate(${heading}deg);"></div>
            
            <!-- Ground Pulse Shadow -->
            <div style="position: absolute; width: 44px; height: 44px; border-radius: 9999px; background: rgba(0, 242, 254, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position: absolute; width: 30px; height: 30px; border-radius: 9999px; background: rgba(0, 242, 254, 0.35); border: 1.5px solid #00F2FE;"></div>
            
            <!-- Avatar Core Orb -->
            <div style="position: relative; z-index: 2; width: 22px; height: 22px; border-radius: 9999px; background: linear-gradient(135deg, #FF4757, #FFA502); border: 2.5px solid #FFFFFF; box-shadow: 0 0 14px #00F2FE; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; color: white;">
              ⚡
            </div>
            
            <!-- Compass Direction Arrowhead -->
            <div id="pulse-avatar-arrow" style="position: absolute; top: 1px; z-index: 3; width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-bottom: 7px solid #00F2FE; transform-origin: 50% 23px; transform: rotate(${heading}deg); filter: drop-shadow(0 0 4px #00F2FE);"></div>
          `;

          userMarkerRef.current = new mapboxgl.Marker({
            element: markerContainer,
            anchor: 'center'
          })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        } else {
          userMarkerRef.current.setLngLat([lng, lat]);

          // Update rotation on heading elements
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
      [showUserMarker, userBearing]
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
    }, []);

    /**
     * Renders street-level wayfinding cues and holographic beacon along the route
     */
    const renderStreetWayfindingCues = useCallback(
      (route: NavigationRoute) => {
        const map = mapRef.current;
        if (!map) return;

        clearWayfindingMarkers();

        // 1. Add Neon Glowing Route Line to Map
        try {
          if (!map.getSource('pulse-nav-route-source')) {
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
                'line-color': '#00F2FE',
                'line-width': 10,
                'line-opacity': 0.45,
                'line-blur': 4
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
          console.warn('[PULSE Mapbox] Error adding route line:', e);
        }

        // 2. Instantiate Street-Level 3D Waypoint Markers (Game Cues)
        route.waypoints.forEach((cue) => {
          if (cue.cueType === 'destination') {
            // Render Holographic Towering Destination Beacon
            const beaconEl = document.createElement('div');
            beaconEl.className = 'pulse-destination-beacon';
            beaconEl.innerHTML = `
              <div style="background: linear-gradient(135deg, #FF4757, #FFA502); color: white; padding: 5px 12px; border-radius: 14px; font-weight: 800; font-size: 11px; border: 1.5px solid #FFFFFF; box-shadow: 0 0 20px rgba(255, 71, 87, 0.9); display: flex; align-items: center; gap: 5px; backdrop-filter: blur(10px);">
                <span style="font-size: 13px;">🎯</span>
                <span>${route.destinationTitle}</span>
              </div>
              <div class="beacon-beam" style="width: 3.5px; height: 130px; background: linear-gradient(to top, rgba(255, 71, 87, 0.95), rgba(0, 242, 254, 0.7), transparent); margin-top: 2px;"></div>
              <div class="beacon-wave" style="width: 44px; height: 18px; border-radius: 50%; border: 2px solid #FF4757; background: radial-gradient(circle, rgba(255, 71, 87, 0.45), transparent);"></div>
            `;

            destinationBeaconRef.current = new mapboxgl.Marker({
              element: beaconEl,
              anchor: 'bottom'
            })
              .setLngLat(cue.coordinates)
              .addTo(map);
            return;
          }

          // Render Holographic Floating Chevron Cues (>>>)
          const cueEl = document.createElement('div');
          cueEl.className = 'pulse-waypoint-cue';
          cueEl.innerHTML = `
            <div class="chevron-container" style="transform: rotate(${cue.bearing}deg); filter: drop-shadow(0 0 10px #00F2FE);">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#00F2FE" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="7 13 12 18 17 13"></polyline>
                <polyline points="7 6 12 11 17 6"></polyline>
              </svg>
            </div>
            <div style="background: rgba(10, 14, 23, 0.88); color: #00F2FE; border: 1px solid rgba(0, 242, 254, 0.6); border-radius: 9999px; padding: 1.5px 7px; font-size: 9px; font-weight: 800; backdrop-filter: blur(8px); margin-top: 2px; box-shadow: 0 2px 8px rgba(0,0,0,0.7);">
              ${cue.label}
            </div>
            <div style="width: 22px; height: 8px; border-radius: 50%; border: 1.5px solid rgba(0, 242, 254, 0.8); background: radial-gradient(circle, rgba(0,242,254,0.4) 0%, transparent 70%); margin-top: 3px; box-shadow: 0 0 8px rgba(0,242,254,0.7);"></div>
          `;

          const marker = new mapboxgl.Marker({
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
        const startPoint: [number, number] = userCoords
          ? [userCoords.longitude, userCoords.latitude]
          : defaultCenter;

        const destPoint: [number, number] = [destination.longitude, destination.latitude];

        const route = generateStreetNavigationRoute(
          startPoint,
          destPoint,
          destination.title,
          destination.category
        );

        setActiveRoute(route);
        renderStreetWayfindingCues(route);

        // Switch to First-Person View (85° pitch) along the initial route bearing
        const initialBearing = route.waypoints[0]?.bearing || 0;
        setUserBearing(initialBearing);
        applyCameraMode('fpv', startPoint, initialBearing);
      },
      [applyCameraMode, defaultCenter, renderStreetWayfindingCues, userCoords]
    );

    /**
     * Stops active navigation
     */
    const stopNavigation = useCallback(() => {
      clearWayfindingMarkers();
      setActiveRoute(null);
      onClearNavigation?.();
    }, [clearWayfindingMarkers, onClearNavigation]);

    /**
     * Simulates walking along the route in First-Person View with continuous camera tracking
     */
    const toggleWalkSimulation = useCallback(() => {
      if (!activeRoute) return;

      if (isSimulatingWalk) {
        // Pause simulation
        if (simAnimationRef.current) {
          cancelAnimationFrame(simAnimationRef.current);
          simAnimationRef.current = null;
        }
        setIsSimulatingWalk(false);
        return;
      }

      setIsSimulatingWalk(true);
      const startTime = performance.now();
      const durationMs = Math.max(12000, activeRoute.totalDistanceMeters * 55); // smooth walking pace

      const animateStep = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);
        setSimulationProgress(progress);

        const currentPos = getPositionAlongRoute(activeRoute.waypoints, progress);
        setUserCoords({
          latitude: currentPos.coordinates[1],
          longitude: currentPos.coordinates[0]
        });
        setUserBearing(currentPos.bearing);

        // Update avatar position
        updateUserMarker(currentPos.coordinates[0], currentPos.coordinates[1], currentPos.bearing);

        // First-Person Camera smoothly tracks center and bearing at 85° pitch
        const map = mapRef.current;
        if (map) {
          map.easeTo({
            center: currentPos.coordinates,
            bearing: currentPos.bearing,
            pitch: 85,
            zoom: 18.5,
            duration: 100,
            essential: true,
            easing: (t) => t
          });
        }

        if (progress < 1) {
          simAnimationRef.current = requestAnimationFrame(animateStep);
        } else {
          setIsSimulatingWalk(false);
          // Destination Reached Celebratory Confetti!
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#00F2FE', '#FF4757', '#FFA502', '#10B981']
          });
        }
      };

      simAnimationRef.current = requestAnimationFrame(animateStep);
    }, [activeRoute, isSimulatingWalk, updateUserMarker]);

    /**
     * Request browser GPS position and start continuous tracking
     */
    const locateAndCenterUser = useCallback(
      (shouldFly = true) => {
        if (!navigator.geolocation) {
          const err = new Error('Geolocation is not supported by your browser.');
          setLocationError(err.message);
          onLocationError?.(err);
          return;
        }

        setIsLocating(true);
        setLocationError(null);

        navigator.geolocation.getCurrentPosition(
          (position) => {
            const coords: UserCoordinates = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracy: position.coords.accuracy,
              heading: position.coords.heading,
              speed: position.coords.speed
            };

            const heading = coords.heading != null && !isNaN(coords.heading) ? coords.heading : userBearing;
            setUserCoords(coords);
            setUserBearing(heading);
            setIsLocating(false);

            if (mapRef.current) {
              updateUserMarker(coords.longitude, coords.latitude, heading);

              if (shouldFly) {
                applyCameraMode(cameraMode, [coords.longitude, coords.latitude], heading);
              }
            }

            onLocationFound?.(coords);
          },
          (err) => {
            setIsLocating(false);
            setLocationError(err.message);
            onLocationError?.(err);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
          }
        );
      },
      [applyCameraMode, cameraMode, onLocationError, onLocationFound, updateUserMarker, userBearing]
    );

    /**
     * Expose imperative handle methods
     */
    useImperativeHandle(
      ref,
      () => ({
        getMap: () => mapRef.current,
        flyTo: (center: [number, number], zoom = defaultZoom) => {
          if (mapRef.current) {
            mapRef.current.flyTo({
              center,
              zoom,
              pitch: cameraMode === 'fpv' ? 85 : cameraMode === 'aerial' ? 58 : 0,
              bearing: userBearing,
              essential: true,
              duration: 1400
            });
          }
        },
        recenterOnUser: () => locateAndCenterUser(true),
        getUserLocation: () => userCoords,
        setLightPreset: (preset: MapboxLightPreset) => {
          setCurrentLightPreset(preset);
          applyDynamicLighting(preset);
        },
        set3dBuildings: (enabled: boolean) => toggle3dBuildings(enabled),
        toggle3dView: () => {
          const nextMode: CameraMode = cameraMode === 'fpv' ? 'aerial' : cameraMode === 'aerial' ? 'overview' : 'fpv';
          applyCameraMode(nextMode);
        },
        setCameraMode: (mode: CameraMode) => applyCameraMode(mode),
        startNavigation,
        stopNavigation
      }),
      [
        applyCameraMode,
        applyDynamicLighting,
        cameraMode,
        defaultZoom,
        locateAndCenterUser,
        startNavigation,
        stopNavigation,
        toggle3dBuildings,
        userBearing,
        userCoords
      ]
    );

    /**
     * Map Initialization Effect
     */
    useEffect(() => {
      if (!mapContainerRef.current) return;
      if (!hasToken) return;

      mapboxgl.accessToken = token;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const initialPitch = initialCameraMode === 'fpv' ? 85 : pitch;
      const initialZoomLevel = initialCameraMode === 'fpv' ? 18.2 : defaultZoom;

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: defaultCenter,
        zoom: initialZoomLevel,
        pitch: initialPitch,
        maxPitch: 85, // Set maxPitch to 85 to support dramatic first-person perspective
        bearing,
        interactive,
        attributionControl: true
      });

      mapRef.current = map;

      // Navigation Controls
      if (showNavigationControl) {
        map.addControl(
          new mapboxgl.NavigationControl({
            visualizePitch: true,
            showCompass: true,
            showZoom: true
          }),
          navigationControlPosition
        );
      }

      // Geolocate Control
      if (showGeolocateControl) {
        const geolocate = new mapboxgl.GeolocateControl({
          positionOptions: {
            enableHighAccuracy: true
          },
          trackUserLocation: true,
          showUserHeading: true
        });
        map.addControl(geolocate, 'top-right');
      }

      // Fullscreen Control
      if (showFullscreenControl) {
        map.addControl(new mapboxgl.FullscreenControl(), 'top-right');
      }

      // Map Click Handler
      if (onMapClick) {
        map.on('click', onMapClick);
      }

      // Style Load Event: Configure Mapbox Standard and 3D Extrusions
      map.on('style.load', () => {
        try {
          (map as any).setConfigProperty('basemap', 'lightPreset', currentLightPreset);
          (map as any).setConfigProperty('basemap', 'show3dObjects', is3dBuildingsEnabled);
          (map as any).setConfigProperty('basemap', 'showPointOfInterestLabels', true);
          (map as any).setConfigProperty('basemap', 'showPlaceLabels', true);
          (map as any).setConfigProperty('basemap', 'showRoadLabels', true);
        } catch (err) {
          // Fallback if classic style is used
        }

        // Add 3D building extrusions layer fallback
        try {
          if (!map.getLayer('pulse-3d-buildings')) {
            const layers = map.getStyle()?.layers;
            let labelLayerId: string | undefined;
            if (layers) {
              for (let i = 0; i < layers.length; i++) {
                if (layers[i].type === 'symbol' && (layers[i].layout as any)?.['text-field']) {
                  labelLayerId = layers[i].id;
                  break;
                }
              }
            }

            map.addLayer(
              {
                id: 'pulse-3d-buildings',
                source: 'composite',
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 14,
                layout: {
                  visibility: is3dBuildingsEnabled ? 'visible' : 'none'
                },
                paint: {
                  'fill-extrusion-color': [
                    'interpolate',
                    ['linear'],
                    ['get', 'height'],
                    0,
                    '#0B111E',
                    30,
                    '#111B30',
                    80,
                    '#182745',
                    160,
                    '#00F2FE'
                  ],
                  'fill-extrusion-height': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.5,
                    ['get', 'height']
                  ],
                  'fill-extrusion-base': [
                    'interpolate',
                    ['linear'],
                    ['zoom'],
                    14,
                    0,
                    14.5,
                    ['get', 'min_height']
                  ],
                  'fill-extrusion-opacity': 0.88
                }
              },
              labelLayerId
            );
          }
        } catch (err) {
          // Ignore
        }

        applyDynamicLighting(currentLightPreset);
      });

      // Map Load Event
      map.on('load', () => {
        setIsMapLoaded(true);
        onMapLoad?.(map);

        if (autoGeolocate) {
          locateAndCenterUser(true);
        }
      });

      // Continuous Geolocation Watch Position
      let watchId: number | null = null;
      if (navigator.geolocation && autoGeolocate) {
        watchId = navigator.geolocation.watchPosition(
          (pos) => {
            const coords: UserCoordinates = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed
            };

            const heading =
              coords.heading != null && !isNaN(coords.heading) ? coords.heading : userBearing;

            setUserCoords(coords);
            if (coords.heading != null && !isNaN(coords.heading)) {
              setUserBearing(heading);
            }

            updateUserMarker(coords.longitude, coords.latitude, heading);

            // Continuously track camera center and bearing in First-Person View
            if (isContinuousTracking && cameraMode === 'fpv' && mapRef.current) {
              mapRef.current.easeTo({
                center: [coords.longitude, coords.latitude],
                bearing: heading,
                pitch: 85,
                zoom: 18.4,
                duration: 600,
                easing: (t) => t
              });
            }
          },
          (err) => console.warn('Continuous GPS watch warning:', err.message),
          { enableHighAccuracy: true, timeout: 15000, maximumAge: 2000 }
        );
      }

      // Device Compass Orientation for Real-time Heading
      const handleDeviceOrientation = (event: DeviceOrientationEvent) => {
        if (event.alpha != null && !isSimulatingWalk) {
          const compassHeading = (360 - event.alpha) % 360;
          setUserBearing(compassHeading);

          if (userCoords) {
            updateUserMarker(userCoords.longitude, userCoords.latitude, compassHeading);

            if (isContinuousTracking && cameraMode === 'fpv' && mapRef.current) {
              mapRef.current.easeTo({
                bearing: compassHeading,
                pitch: 85,
                duration: 200,
                easing: (t) => t
              });
            }
          }
        }
      };

      window.addEventListener('deviceorientation', handleDeviceOrientation, true);

      // Cleanup on unmount
      return () => {
        if (watchId !== null) navigator.geolocation.clearWatch(watchId);
        window.removeEventListener('deviceorientation', handleDeviceOrientation);

        if (cameraNoticeTimeoutRef.current) {
          clearTimeout(cameraNoticeTimeoutRef.current);
          cameraNoticeTimeoutRef.current = null;
        }

        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
          userMarkerRef.current = null;
        }

        clearWayfindingMarkers();

        momentMarkersRef.current.forEach((m) => m.remove());
        momentMarkersRef.current.clear();

        map.remove();
        mapRef.current = null;
        setIsMapLoaded(false);
      };
    }, [
      hasToken,
      token,
      mapStyle,
      defaultCenter,
      defaultZoom,
      pitch,
      bearing,
      initialCameraMode,
      interactive,
      showNavigationControl,
      navigationControlPosition,
      showGeolocateControl,
      showFullscreenControl
    ]);

    /**
     * Respond to incoming navigation destination prop
     */
    useEffect(() => {
      if (propNavDestination) {
        startNavigation(propNavDestination);
      }
    }, [propNavDestination, startNavigation]);

    /**
     * Render Pulse Moments Markers in 3D Space
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

      // Add or update markers
      moments.forEach((moment) => {
        if (currentMarkers.has(moment.id)) {
          const marker = currentMarkers.get(moment.id)!;
          marker.setLngLat([moment.longitude, moment.latitude]);
          return;
        }

        const icon = CATEGORY_ICONS[moment.category] || '⚡';
        const isBiz = Boolean(moment.isBusiness);

        const el = document.createElement('div');
        el.className = 'pulse-3d-moment-marker';
        el.style.cursor = 'pointer';
        el.innerHTML = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 14px rgba(0,0,0,0.7)); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="padding: 6px 9px; border-radius: 14px; background: ${
              isBiz ? 'rgba(245, 158, 11, 0.95)' : 'rgba(18, 25, 39, 0.94)'
            }; border: 1.5px solid ${
          isBiz ? '#FCD34D' : 'rgba(255, 255, 255, 0.25)'
        }; display: flex; align-items: center; gap: 4px; box-shadow: 0 4px 18px rgba(0,0,0,0.6); backdrop-filter: blur(12px);">
              <span style="font-size: 14px;">${icon}</span>
              <span style="font-size: 10px; font-weight: 800; color: #FFF; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${moment.title.slice(0, 16)}
              </span>
            </div>
            <div style="width: 2.5px; height: 12px; background: ${
              isBiz ? '#F59E0B' : '#FF4757'
            }; box-shadow: 0 0 10px ${isBiz ? '#F59E0B' : '#FF4757'};"></div>
            <div style="width: 7px; height: 7px; border-radius: 9999px; background: ${
              isBiz ? '#FCD34D' : '#00F2FE'
            }; box-shadow: 0 0 8px #00F2FE;"></div>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectMoment?.(moment);
          // Fly closer with 3D perspective
          map.flyTo({
            center: [moment.longitude, moment.latitude],
            zoom: 17.5,
            pitch: 75,
            duration: 1200
          });
        });

        const newMarker = new mapboxgl.Marker({
          element: el,
          anchor: 'bottom'
        })
          .setLngLat([moment.longitude, moment.latitude])
          .addTo(map);

        currentMarkers.set(moment.id, newMarker);
      });
    }, [moments, isMapLoaded, onSelectMoment]);

    return (
      <div
        className={`relative w-full h-full min-h-[350px] overflow-hidden rounded-2xl bg-[#0A0E17] ${className}`}
        style={style}
      >
        {/* Mapbox Canvas Container */}
        <div ref={mapContainerRef} className="w-full h-full" />

        {/* Missing Token Guidance Notice */}
        {!hasToken && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-[#0A0E17]/95 backdrop-blur-md">
            <div className="max-w-md w-full glass-panel p-6 rounded-3xl border border-white/10 text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 mx-auto flex items-center justify-center border border-rose-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Mapbox Token Required</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Please provide a Mapbox access token to activate Mapbox Standard 3D building extrusions and dynamic lighting.
                </p>
              </div>
              <a
                href="https://account.mapbox.com/access-tokens/"
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <span>Get Free Mapbox Token</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        )}

        {/* =========================================================================
            GAMING HUD: STREET-LEVEL WAYFINDING NAVIGATION CUES OVERLAY
           ========================================================================= */}
        {activeRoute && (
          <div className="absolute top-4 left-4 right-4 sm:left-6 sm:right-auto sm:max-w-md z-30 animate-slide-up">
            <div className="glass-panel p-4 rounded-3xl border border-cyan-500/40 bg-[#0A0E17]/90 shadow-2xl backdrop-blur-xl text-white space-y-3">
              {/* Header Title & Close Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-ping"></span>
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1">
                    <Route className="w-3 h-3 text-cyan-400" />
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
                    <span className="text-cyan-400 font-bold">{activeRoute.totalDistanceMeters}m remaining</span>
                    <span>•</span>
                    <span className="text-amber-300 font-semibold">~{activeRoute.estimatedWalkingMinutes} min walk</span>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 font-black text-sm">
                  🎯
                </div>
              </div>

              {/* Active Step Guidance Banner */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs font-semibold">
                <Footprints className="w-4 h-4 text-cyan-400 shrink-0 animate-bounce" />
                <span className="truncate">
                  {isSimulatingWalk
                    ? `Autopilot walking: ${(simulationProgress * 100).toFixed(0)}% to destination`
                    : 'Follow street chevrons ahead toward destination'}
                </span>
              </div>

              {/* Action Controls: Autopilot Walk Simulation & Stop */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={toggleWalkSimulation}
                  className={`flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg ${
                    isSimulatingWalk
                      ? 'bg-rose-500 hover:bg-rose-600 text-white shadow-rose-500/30'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black shadow-cyan-500/30'
                  }`}
                >
                  {isSimulatingWalk ? (
                    <>
                      <Square className="w-3.5 h-3.5" />
                      <span>Pause Autopilot</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Walk Route in 3D (Autopilot)</span>
                    </>
                  )}
                </button>

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
            CONSOLIDATED CAMERA & ENVIRONMENT TOOLBAR CAPSULE
           ========================================================================= */}
        {hasToken && show3dControls && isMapLoaded && (
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2 pointer-events-auto">
            {/* Unified Camera Mode Capsule */}
            <div className="flex items-center gap-1 p-1 rounded-2xl glass-hud border border-white/15 shadow-2xl backdrop-blur-2xl">
              {/* FPV Mode (85° pitch, high zoom, tracks live heading) */}
              <button
                onClick={() => applyCameraMode('fpv')}
                title="First-Person View (85° pitch at street level, continuous heading tracking)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  cameraMode === 'fpv'
                    ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/30 ring-1 ring-white/30'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Eye className={`w-3.5 h-3.5 ${cameraMode === 'fpv' ? 'text-white' : 'text-rose-400'}`} />
                <span>FPV 85°</span>
              </button>

              {/* 3D Aerial (58° pitch) */}
              <button
                onClick={() => applyCameraMode('aerial')}
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

            {/* Consolidated Environment & Atmosphere Flyout Menu */}
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
                <div className="absolute top-full left-0 mt-2 p-2.5 rounded-2xl glass-dropdown border border-white/15 shadow-2xl backdrop-blur-2xl flex flex-col gap-2 min-w-[200px] z-30 animate-fade-in">
                  <div className="text-[10px] font-bold text-slate-400 px-1 uppercase tracking-wider flex items-center justify-between">
                    <span>Atmosphere Lighting</span>
                    <span className="text-cyan-400 capitalize">{currentLightPreset}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'night', label: 'Night', icon: Moon, color: 'text-cyan-400' },
                        { id: 'dusk', label: 'Dusk', icon: Sunset, color: 'text-amber-400' },
                        { id: 'dawn', label: 'Dawn', icon: Sunrise, color: 'text-rose-400' },
                        { id: 'day', label: 'Day', icon: Sun, color: 'text-yellow-300' }
                      ] as const
                    ).map((preset) => {
                      const isActive = currentLightPreset === preset.id;
                      const Icon = preset.icon;

                      return (
                        <button
                          key={preset.id}
                          onClick={() => {
                            setCurrentLightPreset(preset.id);
                            applyDynamicLighting(preset.id);
                          }}
                          className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                            isActive
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
                      onClick={() => toggle3dBuildings(!is3dBuildingsEnabled)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                        is3dBuildingsEnabled
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          : 'text-slate-400 hover:bg-white/5'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-cyan-400" />
                        <span>3D Buildings</span>
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-black ${
                        is3dBuildingsEnabled ? 'bg-cyan-400/20 text-cyan-300' : 'bg-white/10 text-slate-400'
                      }`}>
                        {is3dBuildingsEnabled ? 'ON' : 'OFF'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cinematic Camera Transition Toast Notification */}
        {cameraNotification && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-30 pointer-events-none cinematic-badge-enter">
            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl glass-hud border border-cyan-400/40 text-white shadow-2xl backdrop-blur-2xl">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 camera-lens-pulse" />
              <span className="text-xs font-bold tracking-wide">{cameraNotification}</span>
            </div>
          </div>
        )}

        {/* Quick GPS Recenter Button */}
        {hasToken && (
          <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2">
            <button
              onClick={() => locateAndCenterUser(true)}
              disabled={isLocating}
              title="Center on my location in First-Person View (85°)"
              className="p-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-cyan-400 border border-white/15 shadow-xl backdrop-blur-md active:scale-95 transition-all flex items-center justify-center group disabled:opacity-50"
            >
              {isLocating ? (
                <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
              ) : (
                <Crosshair className="w-5 h-5 group-hover:rotate-45 transition-transform" />
              )}
            </button>
          </div>
        )}

        {/* Locating Toast / Status Badge */}
        {isLocating && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-cyan-500/40 text-cyan-300 text-xs font-semibold shadow-xl backdrop-blur-md animate-pulse">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Calibrating 3D First-Person GPS...</span>
          </div>
        )}

        {/* Location Error Notification */}
        {locationError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs shadow-xl backdrop-blur-md">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>GPS: {locationError}. Using Victoria Island coordinates.</span>
          </div>
        )}

        {/* Custom Overlays and Child Components */}
        {children}
      </div>
    );
  }
);

MapboxMap.displayName = 'MapboxMap';
