import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { MapPin, Locate } from 'lucide-react';
import { buildPulseStyle } from '../map/pulseMapStyle';
import { getApproximateAreaName } from '../../utils/geoUtils';

interface LocationPickerProps {
  /** Where the map opens */
  center: { latitude: number; longitude: number };
  /** Called with the spot under the pin each time the map stops moving */
  onChange: (spot: { latitude: number; longitude: number }) => void;
  /** Re-centres on the user's real position (omit when it is unknown) */
  onUseMyLocation?: () => void;
}

/**
 * A small map with a pin fixed at its centre: drag the map until the pin is on the place.
 * Dragging the map instead of the pin keeps it easy on touch screens.
 */
export const LocationPicker: React.FC<LocationPickerProps> = ({ center, onChange, onUseMyLocation }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [spot, setSpot] = useState(center);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildPulseStyle(),
      center: [center.longitude, center.latitude],
      zoom: 16.5,
      pitch: 0,
      attributionControl: { compact: true }
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const report = () => {
      const c = map.getCenter();
      const next = { latitude: c.lat, longitude: c.lng };
      setSpot(next);
      onChangeRef.current(next);
    };
    map.on('moveend', report);
    report();
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // The map is built once; later centre changes go through flyTo below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recenter = () => {
    onUseMyLocation?.();
  };

  // A new "my location" fix moves the map there
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    if (Math.abs(c.lat - center.latitude) > 1e-6 || Math.abs(c.lng - center.longitude) > 1e-6) {
      map.flyTo({ center: [center.longitude, center.latitude], zoom: Math.max(map.getZoom(), 16.5), essential: true });
    }
  }, [center.latitude, center.longitude]);

  return (
    <div className="space-y-1.5">
      <div className="relative h-48 rounded-xl overflow-hidden border border-white/10" data-testid="location-picker">
        <div ref={containerRef} className="absolute inset-0" />
        {/* Pin fixed at the centre; its tip sits on the chosen spot */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full pointer-events-none drop-shadow-lg">
          <MapPin className="w-8 h-8 text-accent-400 fill-accent-500/40" />
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/80 pointer-events-none" />
        {onUseMyLocation && (
          <button
            type="button"
            onClick={recenter}
            title="Jump to my location"
            className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-900/90 border border-white/15 text-[10px] font-bold text-slate-200 hover:bg-slate-800"
          >
            <Locate className="w-3 h-3 text-signal-400" /> My location
          </button>
        )}
      </div>
      <div className="text-[10px] text-slate-400 flex items-center justify-between">
        <span>Drag the map to put the pin on the spot</span>
        <span className="text-signal-300 font-medium">{getApproximateAreaName(spot.latitude, spot.longitude)}</span>
      </div>
    </div>
  );
};
