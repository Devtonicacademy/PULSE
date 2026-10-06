import React, { useEffect, useRef, useState, useMemo } from 'react';
import maplibregl from 'maplibre-gl';
import { usePulse } from '../../context/PulseContext';
import { RadiusKm, MomentCategory, Moment } from '../../types/pulse';
import { HotspotBottomSheet } from './HotspotBottomSheet';
import {
  Crosshair,
  Layers,
  Sparkles,
  MapPin,
  TrendingUp,
  AlertTriangle,
  Info
} from 'lucide-react';

interface LiveActivityMapProps {
  onOpenComments: (momentId: string) => void;
  onOpenReport: (momentId: string) => void;
  onStartNavigation?: (moment: Moment) => void;
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

// Generates a GeoJSON Polygon circle around center coordinates
function createGeoJSONCircle(center: [number, number], radiusInKm: number, points = 64) {
  const coords: [number, number][] = [];
  const distanceX = radiusInKm / (111.32 * Math.cos((center[1] * Math.PI) / 180));
  const distanceY = radiusInKm / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    coords.push([center[0] + x, center[1] + y]);
  }
  coords.push(coords[0]);

  return {
    type: 'Feature' as const,
    geometry: {
      type: 'Polygon' as const,
      coordinates: [coords]
    },
    properties: {}
  };
}

export const LiveActivityMap: React.FC<LiveActivityMapProps> = ({
  onOpenComments,
  onOpenReport,
  onStartNavigation
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersMapRef = useRef<Map<string, maplibregl.Marker>>(new Map());

  const {
    currentLocation,
    radiusKm,
    setRadiusKm,
    useBrowserLocation,
    isLocating,
    filteredMoments,
    activityZones,
    businessPosts,
    setSelectedMoment,
    setSelectedZone,
    currentPulseScore,
    currentZoneName,
    simulateIncomingMomentAlert
  } = usePulse();

  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showBusinessPins, setShowBusinessPins] = useState(true);
  const [showLegend, setShowLegend] = useState(false);

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    // Use CartoDB Dark Matter tile style for modern sleek dark aesthetics
    const darkStyle = {
      version: 8,
      sources: {
        'carto-dark': {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
            'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png'
          ],
          tileSize: 256,
          attribution: '© CARTO, © OpenStreetMap'
        }
      },
      layers: [
        {
          id: 'carto-dark-layer',
          type: 'raster',
          source: 'carto-dark',
          minzoom: 0,
          maxzoom: 20
        }
      ]
    };

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: darkStyle as unknown as maplibregl.StyleSpecification,
      center: [currentLocation.longitude, currentLocation.latitude],
      zoom: 13.5,
      pitch: 35,
      bearing: -10,
      attributionControl: false
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // 1. Add Radius GeoJSON source and layer
      map.addSource('radius-source', {
        type: 'geojson',
        data: createGeoJSONCircle(
          [currentLocation.longitude, currentLocation.latitude],
          radiusKm
        ) as any
      });

      map.addLayer({
        id: 'radius-fill',
        type: 'fill',
        source: 'radius-source',
        paint: {
          'fill-color': '#00F2FE',
          'fill-opacity': 0.05
        }
      });

      map.addLayer({
        id: 'radius-line',
        type: 'line',
        source: 'radius-source',
        paint: {
          'line-color': '#00F2FE',
          'line-width': 1.5,
          'line-dasharray': [3, 2],
          'line-opacity': 0.6
        }
      });

      // 2. Add Heatmap Source and Layer (Feature 1: Blue -> Yellow -> Orange -> Red)
      const heatmapFeatures = filteredMoments.map((m) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [m.longitude, m.latitude]
        },
        properties: {
          score: m.engagementScore || 50
        }
      }));

      map.addSource('moments-heatmap', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: heatmapFeatures as any
        }
      });

      map.addLayer({
        id: 'moments-heat',
        type: 'heatmap',
        source: 'moments-heatmap',
        maxzoom: 16,
        paint: {
          // Increase weight as score increases
          'heatmap-weight': [
            'interpolate',
            ['linear'],
            ['get', 'score'],
            0, 0,
            100, 1
          ],
          // Heatmap intensity by zoom
          'heatmap-intensity': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 1,
            15, 3
          ],
          // Color ramp: Blue = Low, Yellow = Med, Orange = High, Red = Trending
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.2, '#3B82F6', // Blue (Low Activity)
            0.45, '#EAB308', // Yellow (Medium Activity)
            0.7, '#F97316', // Orange (High Activity)
            0.95, '#EF4444'  // Red (Trending)
          ],
          'heatmap-radius': [
            'interpolate',
            ['linear'],
            ['zoom'],
            9, 20,
            14, 55,
            16, 80
          ],
          'heatmap-opacity': 0.75
        }
      });
    });

    mapRef.current = map;

    return () => {
      markersMapRef.current.forEach((m) => m.remove());
      markersMapRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update map center and radius when currentLocation or radiusKm changes
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    // Fly to new location with smooth quad ease-out curve
    map.flyTo({
      center: [currentLocation.longitude, currentLocation.latitude],
      zoom: radiusKm <= 2 ? 14.5 : radiusKm <= 5 ? 13.5 : 12,
      essential: true,
      duration: 1400,
      curve: 1.42,
      easing: (t) => t * (2 - t)
    });

    // Update radius circle source
    const radiusSource = map.getSource('radius-source') as maplibregl.GeoJSONSource;
    if (radiusSource) {
      radiusSource.setData(
        createGeoJSONCircle(
          [currentLocation.longitude, currentLocation.latitude],
          radiusKm
        ) as any
      );
    }
  }, [currentLocation, radiusKm]);

  // Update Heatmap source data when filteredMoments change
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const heatSource = map.getSource('moments-heatmap') as maplibregl.GeoJSONSource;
    if (heatSource) {
      const features = filteredMoments.map((m) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [m.longitude, m.latitude]
        },
        properties: {
          score: m.engagementScore || 50
        }
      }));

      heatSource.setData({
        type: 'FeatureCollection',
        features: features as any
      });
    }
  }, [filteredMoments]);

  // Toggle heatmap layer visibility
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    if (map.getLayer('moments-heat')) {
      map.setLayoutProperty(
        'moments-heat',
        'visibility',
        showHeatmap ? 'visible' : 'none'
      );
    }
  }, [showHeatmap]);

  // Render DOM Markers for User Location, Moments, Hotspot Zones, and Business Live Pins with incremental diffing cache
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const activeKeys = new Set<string>();

    // 1. User Location Pulse Marker (re-use or create)
    const userKey = 'user-pulse-marker';
    activeKeys.add(userKey);
    let uMarker = markersMapRef.current.get(userKey);
    if (!uMarker) {
      const userEl = document.createElement('div');
      userEl.className = 'relative flex items-center justify-center cursor-pointer pointer-events-auto';
      userEl.innerHTML = `
        <div class="absolute -inset-3 rounded-full bg-cyan-400/20 radar-ring"></div>
        <div class="w-4 h-4 rounded-full bg-cyan-400 border-2 border-white shadow-lg shadow-cyan-400/50"></div>
      `;
      userEl.title = `Your Location: ${currentLocation.name}`;
      uMarker = new maplibregl.Marker({ element: userEl })
        .setLngLat([currentLocation.longitude, currentLocation.latitude])
        .addTo(map);
      markersMapRef.current.set(userKey, uMarker);
    } else {
      uMarker.setLngLat([currentLocation.longitude, currentLocation.latitude]);
    }

    // 2. Hotspot Zone Badges (Feature 5: Activity Score Hotspots)
    activityZones.forEach((zone) => {
      const zoneKey = `zone-${zone.id}`;
      activeKeys.add(zoneKey);

      if (!markersMapRef.current.has(zoneKey)) {
        const zoneEl = document.createElement('div');
        zoneEl.className =
          'cursor-pointer select-none transform hover:scale-110 transition-transform active:scale-95 pointer-events-auto';

        const isHigh = zone.activityScore >= 80;
        const glowColor = isHigh ? 'rgba(239, 68, 68, 0.4)' : 'rgba(234, 179, 8, 0.3)';

        zoneEl.innerHTML = `
          <div class="px-2.5 py-1 rounded-full glass-panel border border-white/20 shadow-xl flex items-center gap-1.5" style="box-shadow: 0 0 16px ${glowColor};">
            <span class="w-2 h-2 rounded-full ${isHigh ? 'bg-rose-500 animate-ping' : 'bg-amber-400'}"></span>
            <span class="text-[11px] font-bold text-white tracking-tight">${zone.zoneName}</span>
            <span class="px-1.5 py-0.2 rounded text-[10px] font-black ${
              isHigh ? 'bg-rose-500/30 text-rose-300' : 'bg-amber-500/30 text-amber-300'
            }">⚡${zone.activityScore}</span>
          </div>
        `;

        zoneEl.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedZone(zone);
          setSelectedMoment(null);
        });

        const zMarker = new maplibregl.Marker({ element: zoneEl, anchor: 'bottom' })
          .setLngLat([zone.centerLng, zone.centerLat])
          .addTo(map);

        markersMapRef.current.set(zoneKey, zMarker);
      }
    });

    // 3. Live Moment Markers (Feature 1 & Feature 3)
    filteredMoments.forEach((moment) => {
      const momentKey = `moment-${moment.id}`;
      activeKeys.add(momentKey);

      if (!markersMapRef.current.has(momentKey)) {
        const el = document.createElement('div');
        el.className =
          'relative group cursor-pointer select-none transition-transform hover:scale-125 active:scale-95 pointer-events-auto';

        const icon = CATEGORY_ICONS[moment.category] || '📍';
        const isTrending = moment.reactions.trending > 40 || moment.engagementScore > 85;
        const isAlert = moment.category === 'alerts';

        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            ${
              isAlert
                ? '<div class="absolute -inset-2 rounded-full bg-rose-500/40 animate-ping"></div>'
                : isTrending
                ? '<div class="absolute -inset-1.5 rounded-full bg-amber-500/30 animate-pulse"></div>'
                : ''
            }
            <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm shadow-xl border ${
              isAlert
                ? 'bg-rose-600 border-white text-white shadow-rose-600/50'
                : isTrending
                ? 'bg-amber-500 border-white text-white shadow-amber-500/50'
                : 'bg-slate-900/90 border-slate-700/80 text-white backdrop-blur-md'
            }">
              ${icon}
            </div>
          </div>
        `;

        el.addEventListener('click', (e) => {
          e.stopPropagation();
          setSelectedMoment(moment);
          setSelectedZone(null);
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([moment.longitude, moment.latitude])
          .addTo(map);

        markersMapRef.current.set(momentKey, marker);
      }
    });

    // 4. Business Live Pins (Feature 10)
    if (showBusinessPins) {
      businessPosts.forEach((bpost) => {
        const bKey = `bpost-${bpost.id}`;
        activeKeys.add(bKey);

        if (!markersMapRef.current.has(bKey)) {
          const bEl = document.createElement('div');
          bEl.className =
            'relative cursor-pointer transition-transform hover:scale-125 active:scale-95 pointer-events-auto';

          bEl.innerHTML = `
            <div class="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/90 border border-amber-300 text-slate-950 font-bold text-[10px] shadow-lg shadow-amber-500/30">
              <span>⚡</span>
              <span>${bpost.livePinType}</span>
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

          const bMarker = new maplibregl.Marker({ element: bEl, anchor: 'center' })
            .setLngLat([bpost.longitude, bpost.latitude])
            .addTo(map);

          markersMapRef.current.set(bKey, bMarker);
        }
      });
    }

    // 5. Reconcile / Remove deleted markers
    markersMapRef.current.forEach((marker, key) => {
      if (!activeKeys.has(key)) {
        marker.remove();
        markersMapRef.current.delete(key);
      }
    });
  }, [
    filteredMoments,
    activityZones,
    businessPosts,
    currentLocation,
    showBusinessPins,
    setSelectedMoment,
    setSelectedZone
  ]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0A0E17]">
      {/* Map Canvas Container */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Floating Top Header Overlays */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        {/* Pulse Score Quick Badge */}
        <div className="pointer-events-auto flex items-center gap-2">
          <div className="glass-panel px-3 py-1.5 rounded-full flex items-center gap-2 shadow-xl border border-white/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
            </span>
            <span className="text-xs font-bold text-white tracking-tight truncate max-w-[120px] sm:max-w-none">
              {currentZoneName}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
              ⚡ {currentPulseScore}
            </span>
          </div>
        </div>

        {/* Radius selector quick chips */}
        <div className="pointer-events-auto flex items-center gap-1 bg-slate-900/80 backdrop-blur-md p-1 rounded-full border border-white/10 shadow-xl">
          {([1, 2, 5, 10, 25] as RadiusKm[]).map((r) => (
            <button
              key={r}
              onClick={() => setRadiusKm(r)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold transition-all ${
                radiusKm === r
                  ? 'bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {r}km
            </button>
          ))}
        </div>
      </div>

      {/* Floating Controls (Right Side) */}
      <div className="absolute top-16 right-3 flex flex-col gap-2 z-10">
        {/* Recenter to User GPS */}
        <button
          onClick={useBrowserLocation}
          disabled={isLocating}
          title="Detect Current GPS Location"
          className="p-2.5 rounded-full glass-panel hover:bg-slate-800 text-cyan-300 border border-white/10 shadow-xl active:scale-95 transition-transform"
        >
          <Crosshair className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
        </button>

        {/* Toggle Heatmap */}
        <button
          onClick={() => setShowHeatmap(!showHeatmap)}
          title={showHeatmap ? 'Disable Heatmap' : 'Enable Heatmap'}
          className={`p-2.5 rounded-full glass-panel border border-white/10 shadow-xl active:scale-95 transition-transform ${
            showHeatmap ? 'text-amber-400' : 'text-slate-500'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
        </button>

        {/* Toggle Business Pins */}
        <button
          onClick={() => setShowBusinessPins(!showBusinessPins)}
          title={showBusinessPins ? 'Hide Business Pins' : 'Show Business Pins'}
          className={`p-2.5 rounded-full glass-panel border border-white/10 shadow-xl active:scale-95 transition-transform ${
            showBusinessPins ? 'text-amber-400' : 'text-slate-500'
          }`}
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Legend / Info button */}
        <button
          onClick={() => setShowLegend(!showLegend)}
          title="Heatmap Legend"
          className="p-2.5 rounded-full glass-panel hover:bg-slate-800 text-slate-300 border border-white/10 shadow-xl active:scale-95 transition-transform"
        >
          <Info className="w-4 h-4" />
        </button>

        {/* Test Alert Simulator */}
        <button
          onClick={simulateIncomingMomentAlert}
          title="Simulate Real-time Alert"
          className="p-2.5 rounded-full bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 shadow-xl active:scale-95 transition-transform"
        >
          <AlertTriangle className="w-4 h-4" />
        </button>
      </div>

      {/* Heatmap Legend Dropdown Modal */}
      {showLegend && (
        <div className="absolute top-16 right-14 z-20 glass-dropdown p-3 rounded-2xl w-56 shadow-2xl animate-fade-in border border-white/10 text-xs">
          <div className="font-bold text-white mb-2 flex items-center justify-between">
            <span>Heatmap Activity</span>
            <span className="text-[10px] text-slate-400">Live Pulse</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <span className="text-slate-300">Blue: Low Activity</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-yellow-400"></span>
              <span className="text-slate-300">Yellow: Medium Activity</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500"></span>
              <span className="text-slate-300">Orange: High Activity</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-slate-300">Red: Trending Hotspot</span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-white/10 text-[10px] text-slate-400">
            Tapping any marker opens live moments, community reactions, and directions.
          </div>
        </div>
      )}

      {/* Hotspot Bottom Sheet Drawer for Selected Moment or Zone */}
      <HotspotBottomSheet
        onOpenComments={onOpenComments}
        onOpenReport={onOpenReport}
        onStartNavigation={onStartNavigation}
      />
    </div>
  );
};
