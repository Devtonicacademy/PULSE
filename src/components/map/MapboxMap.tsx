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
  Sparkles
} from 'lucide-react';
import { Moment, MomentCategory } from '../../types/pulse';

export interface UserCoordinates {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export type MapboxLightPreset = 'night' | 'dusk' | 'dawn' | 'day';

export interface MapboxMapProps {
  /** Optional Mapbox access token. Defaults to VITE_MAPBOX_TOKEN env variable */
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
  /** Default zoom level (defaults to 15.5 for optimal 3D building viewing) */
  defaultZoom?: number;
  /** Initial pitch / 3D tilt angle in degrees (0 - 85, default: 58) */
  pitch?: number;
  /** Initial bearing / rotation angle in degrees (-180 - 180, default: -18) */
  bearing?: number;
  /** Automatically request user GPS geolocation and center the map on initial mount (default: true) */
  autoGeolocate?: boolean;
  /** Display a custom pulsing radar marker at user's current GPS location (default: true) */
  showUserMarker?: boolean;
  /** Display native Mapbox navigation controls (+/- zoom, compass pitch/bearing) (default: true) */
  showNavigationControl?: boolean;
  /** Position of navigation controls (default: 'top-right') */
  navigationControlPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  /** Display native Mapbox geolocate button control (default: true) */
  showGeolocateControl?: boolean;
  /** Display native fullscreen toggle control (default: false) */
  showFullscreenControl?: boolean;
  /** Display the interactive 3D and lighting controls toolbar (defaults to true) */
  show3dControls?: boolean;
  /** Optional array of Pulse live moments to display as 3D pins on the map */
  moments?: Moment[];
  /** Callback fired when a live moment marker is clicked */
  onSelectMoment?: (moment: Moment) => void;
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
      defaultCenter = [3.4219, 6.4281], // Lagos coordinates fallback
      defaultZoom = 15.5,
      pitch = 58,
      bearing = -18,
      autoGeolocate = true,
      showUserMarker = true,
      showNavigationControl = true,
      navigationControlPosition = 'top-right',
      showGeolocateControl = true,
      showFullscreenControl = false,
      show3dControls = true,
      moments = [],
      onSelectMoment,
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

    const [isLocating, setIsLocating] = useState<boolean>(false);
    const [userCoords, setUserCoords] = useState<UserCoordinates | null>(null);
    const [locationError, setLocationError] = useState<string | null>(null);
    const [isMapLoaded, setIsMapLoaded] = useState<boolean>(false);

    // 3D & Dynamic Lighting State
    const [currentLightPreset, setCurrentLightPreset] = useState<MapboxLightPreset>(initialLightPreset);
    const [is3dBuildingsEnabled, setIs3dBuildingsEnabled] = useState<boolean>(initialEnable3dBuildings);
    const [is3dPerspective, setIs3dPerspective] = useState<boolean>(pitch > 15);

    // Resolve token: explicit prop takes precedence, then Vite env variable
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
          // Fallback if not using Standard basemap
        }

        // 2. Configure Mapbox GL v3 dynamic directional & ambient lights when supported
        if (enableDynamicLighting && typeof (map as any).setLights === 'function') {
          try {
            const lightConfigs: Record<
              MapboxLightPreset,
              { sunDir: [number, number]; sunColor: string; sunIntensity: number; ambColor: string; ambIntensity: number }
            > = {
              night: {
                sunDir: [220, 16],
                sunColor: '#00F2FE',
                sunIntensity: 0.35,
                ambColor: '#0C1322',
                ambIntensity: 0.45
              },
              dusk: {
                sunDir: [255, 18],
                sunColor: '#FFA502',
                sunIntensity: 0.65,
                ambColor: '#1A1226',
                ambIntensity: 0.5
              },
              dawn: {
                sunDir: [70, 24],
                sunColor: '#FF6B6B',
                sunIntensity: 0.7,
                ambColor: '#1E1A2C',
                ambIntensity: 0.5
              },
              day: {
                sunDir: [180, 52],
                sunColor: '#FFFFFF',
                sunIntensity: 0.85,
                ambColor: '#243044',
                ambIntensity: 0.55
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
            // Ignore if custom lighting API is restricted
          }
        }

        // 3. Update custom 3D building fill-extrusion color if layer exists
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

      // Mapbox Standard 3D objects
      try {
        (map as any).setConfigProperty('basemap', 'show3dObjects', enabled);
      } catch (e) {
        // Fallback
      }

      // Custom extrusion layer if present
      if (map.getLayer('pulse-3d-buildings')) {
        map.setLayoutProperty('pulse-3d-buildings', 'visibility', enabled ? 'visible' : 'none');
      }
    }, []);

    /**
     * Smoothly toggles between 3D perspective and 2D flat view
     */
    const toggle3dView = useCallback(() => {
      const map = mapRef.current;
      if (!map) return;

      const nextIs3d = !is3dPerspective;
      setIs3dPerspective(nextIs3d);

      map.easeTo({
        pitch: nextIs3d ? 58 : 0,
        bearing: nextIs3d ? -18 : 0,
        duration: 1200,
        essential: true
      });
    }, [is3dPerspective]);

    /**
     * Updates or creates the custom pulsing radar user marker
     */
    const updateUserMarker = useCallback(
      (lng: number, lat: number) => {
        if (!mapRef.current || !showUserMarker) return;

        if (!userMarkerRef.current) {
          const markerContainer = document.createElement('div');
          markerContainer.className = 'pulse-user-radar-marker';
          markerContainer.innerHTML = `
            <div style="position: relative; display: flex; align-items: center; justify-content: center; width: 34px; height: 34px;">
              <div style="position: absolute; width: 34px; height: 34px; border-radius: 9999px; background: rgba(0, 242, 254, 0.25); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
              <div style="position: absolute; width: 22px; height: 22px; border-radius: 9999px; background: rgba(0, 242, 254, 0.35); border: 1.5px solid rgba(0, 242, 254, 0.9);"></div>
              <div style="width: 10px; height: 10px; border-radius: 9999px; background: #00F2FE; border: 2px solid #FFFFFF; box-shadow: 0 0 12px rgba(0, 242, 254, 0.95);"></div>
            </div>
          `;

          userMarkerRef.current = new mapboxgl.Marker({
            element: markerContainer,
            anchor: 'center'
          })
            .setLngLat([lng, lat])
            .addTo(mapRef.current);
        } else {
          userMarkerRef.current.setLngLat([lng, lat]);
        }
      },
      [showUserMarker]
    );

    /**
     * Request browser GPS position and center map
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
              accuracy: position.coords.accuracy
            };

            setUserCoords(coords);
            setIsLocating(false);

            if (mapRef.current) {
              updateUserMarker(coords.longitude, coords.latitude);

              if (shouldFly) {
                mapRef.current.flyTo({
                  center: [coords.longitude, coords.latitude],
                  zoom: Math.max(mapRef.current.getZoom(), defaultZoom),
                  pitch: is3dPerspective ? 58 : 0,
                  bearing: is3dPerspective ? -18 : 0,
                  essential: true,
                  duration: 1500,
                  curve: 1.42,
                  easing: (t) => t * (2 - t)
                });
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
      [defaultZoom, is3dPerspective, onLocationError, onLocationFound, updateUserMarker]
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
              pitch: is3dPerspective ? 58 : 0,
              bearing: is3dPerspective ? -18 : 0,
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
        toggle3dView
      }),
      [
        applyDynamicLighting,
        defaultZoom,
        is3dPerspective,
        locateAndCenterUser,
        toggle3dBuildings,
        toggle3dView,
        userCoords
      ]
    );

    /**
     * Map Initialization Effect
     */
    useEffect(() => {
      if (!mapContainerRef.current) return;
      if (!hasToken) return;

      // Assign global access token
      mapboxgl.accessToken = token;

      // Clean up previous instance if any
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }

      const map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: mapStyle,
        center: defaultCenter,
        zoom: defaultZoom,
        pitch,
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
        // 1. Configure Mapbox Standard Basemap
        try {
          (map as any).setConfigProperty('basemap', 'lightPreset', currentLightPreset);
          (map as any).setConfigProperty('basemap', 'show3dObjects', is3dBuildingsEnabled);
          (map as any).setConfigProperty('basemap', 'showPointOfInterestLabels', true);
          (map as any).setConfigProperty('basemap', 'showPlaceLabels', true);
          (map as any).setConfigProperty('basemap', 'showRoadLabels', true);
        } catch (err) {
          // Fallback if classic style is passed
        }

        // 2. Add custom 3D building extrusions layer for composite source fallback
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
          // If style doesn't have composite building layer, catch gracefully
        }

        // 3. Apply dynamic lighting
        applyDynamicLighting(currentLightPreset);
      });

      // Map Load Event
      map.on('load', () => {
        setIsMapLoaded(true);
        onMapLoad?.(map);

        // Perform auto-geolocation and auto-centering on mount
        if (autoGeolocate) {
          locateAndCenterUser(true);
        }
      });

      // Cleanup on unmount
      return () => {
        if (userMarkerRef.current) {
          userMarkerRef.current.remove();
          userMarkerRef.current = null;
        }

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
      interactive,
      showNavigationControl,
      navigationControlPosition,
      showGeolocateControl,
      showFullscreenControl
    ]);

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
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6)); transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
            <div style="padding: 6px 8px; border-radius: 14px; background: ${
              isBiz ? 'rgba(245, 158, 11, 0.95)' : 'rgba(18, 25, 39, 0.92)'
            }; border: 1.5px solid ${
          isBiz ? '#FCD34D' : 'rgba(255, 255, 255, 0.2)'
        }; display: flex; items: center; gap: 4px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); backdrop-filter: blur(10px);">
              <span style="font-size: 14px;">${icon}</span>
              ${
                isBiz
                  ? '<span style="font-size: 9px; font-weight: 800; color: #000; text-transform: uppercase;">PROMO</span>'
                  : ''
              }
            </div>
            <div style="width: 2px; height: 10px; background: ${
              isBiz ? '#F59E0B' : '#FF4757'
            }; box-shadow: 0 0 8px ${isBiz ? '#F59E0B' : '#FF4757'};"></div>
            <div style="width: 6px; height: 6px; border-radius: 9999px; background: ${
              isBiz ? '#FCD34D' : '#00F2FE'
            };"></div>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelectMoment?.(moment);
          map.flyTo({
            center: [moment.longitude, moment.latitude],
            zoom: 16.5,
            pitch: 62,
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
            <div className="max-w-md w-full p-6 rounded-2xl border border-amber-500/30 bg-slate-900/90 shadow-2xl text-center space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Mapbox Access Token Required</h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  To initialize Mapbox Standard 3D, configure your public access token in the project root{' '}
                  <code className="text-amber-300 bg-slate-800 px-1.5 py-0.5 rounded font-mono text-[11px]">
                    .env
                  </code>{' '}
                  file:
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-white/10 text-left font-mono text-[11px] text-slate-300 overflow-x-auto">
                <div className="text-slate-500"># .env</div>
                <div className="text-amber-300">VITE_MAPBOX_TOKEN=pk.eyJ1...</div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1 text-xs">
                <a
                  href="https://account.mapbox.com/access-tokens/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <span>Get Free Token</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          </div>
        )}

        {/* =========================================================================
            IMMERSIVE 3D & DYNAMIC LIGHTING FLOATING TOOLBAR
           ========================================================================= */}
        {hasToken && show3dControls && isMapLoaded && (
          <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
            {/* Dynamic Lighting Preset Selector */}
            <div className="flex items-center gap-1 p-1 rounded-2xl glass-panel border border-white/15 shadow-2xl backdrop-blur-xl">
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
                    title={`Switch dynamic lighting to ${preset.label}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                      isActive
                        ? 'bg-white/15 text-white border border-white/30 shadow-md shadow-white/5'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${preset.color}`} />
                    <span className="hidden sm:inline">{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 3D View & 3D Building Extrusions Toggles */}
            <div className="flex items-center gap-1.5 p-1 rounded-2xl glass-panel border border-white/15 shadow-2xl backdrop-blur-xl w-fit">
              {/* 3D Perspective Tilt Toggle */}
              <button
                onClick={toggle3dView}
                title={is3dPerspective ? 'Switch to 2D flat view' : 'Switch to 3D perspective view'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  is3dPerspective
                    ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Box className="w-3.5 h-3.5 text-rose-400" />
                <span>{is3dPerspective ? '3D View (58°)' : '2D View'}</span>
              </button>

              {/* 3D Buildings Toggle */}
              <button
                onClick={() => toggle3dBuildings(!is3dBuildingsEnabled)}
                title="Toggle 3D building extrusions"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                  is3dBuildingsEnabled
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>3D Buildings</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick GPS Recenter Button */}
        {hasToken && (
          <div className="absolute bottom-6 right-4 z-20 flex flex-col gap-2">
            <button
              onClick={() => locateAndCenterUser(true)}
              disabled={isLocating}
              title="Center on my location in 3D"
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
            <span>Calibrating 3D GPS location...</span>
          </div>
        )}

        {/* Location Error Notification */}
        {locationError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/50 text-rose-200 text-xs shadow-xl backdrop-blur-md">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span>GPS: {locationError}. Using default coordinates.</span>
          </div>
        )}

        {/* Custom Overlays and Child Components */}
        {children}
      </div>
    );
  }
);

MapboxMap.displayName = 'MapboxMap';
