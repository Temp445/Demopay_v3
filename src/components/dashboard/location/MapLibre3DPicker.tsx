import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

interface MapLibre3DPickerProps {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
  height?: string;
}

export default function MapLibre3DPicker({
  lat,
  lng,
  onLocationChange,
  height = '560px',
}: MapLibre3DPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [pitch, setPitch] = useState(52);
  const [bearing, setBearing] = useState(-20);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [lng, lat],
      zoom: 17,
      pitch: 52,
      bearing: -20,
      maxPitch: 85,
      antialias: true,
      attributionControl: false,
    });

    map.current.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      'bottom-right'
    );

    map.current.on('style.load', () => {
      if (!map.current) return;

      const layers = map.current.getStyle().layers ?? [];

      // ONLY touch fill-extrusion layers (buildings).
      // Do NOT touch symbol/label layers — that's what was hiding company names.
      layers.forEach((layer) => {
        if (layer.type !== 'fill-extrusion') return;

        // Safe flat color — no complex expressions that can fail and render black
        try {
          map.current!.setPaintProperty(layer.id, 'fill-extrusion-color', '#8bbbd4');
          map.current!.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.85);
        } catch { /* ignore */ }
      });
    });

    // Draggable indigo marker
    marker.current = new maplibregl.Marker({ color: '#4f46e5', draggable: true, scale: 1.1 })
      .setLngLat([lng, lat])
      .addTo(map.current);

    marker.current.on('dragend', () => {
      const pos = marker.current!.getLngLat();
      onLocationChange(pos.lat, pos.lng);
    });

    // Click map to reposition marker
    map.current.on('click', (e) => {
      marker.current!.setLngLat([e.lngLat.lng, e.lngLat.lat]);
      onLocationChange(e.lngLat.lat, e.lngLat.lng);
    });

    // Keep sliders in sync with manual mouse drag on map
    map.current.on('pitch', () => {
      if (map.current) setPitch(Math.round(map.current.getPitch()));
    });
    map.current.on('rotate', () => {
      if (map.current) setBearing(Math.round(map.current.getBearing()));
    });

    return () => {
      map.current?.remove();
      map.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng → marker + pan
  useEffect(() => {
    if (!map.current || !marker.current || isNaN(lat) || isNaN(lng)) return;
    marker.current.setLngLat([lng, lat]);
    map.current.easeTo({ center: [lng, lat], duration: 500 });
  }, [lat, lng]);

  const handlePitchChange = (v: number) => {
    setPitch(v);
    map.current?.setPitch(v);
  };

  const handleBearingChange = (v: number) => {
    setBearing(v);
    map.current?.setBearing(v);
  };

  const resetView = () => {
    map.current?.easeTo({ pitch: 52, bearing: -20, zoom: 17, duration: 700 });
    setPitch(52);
    setBearing(-20);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: geoLat, longitude: geoLng } = pos.coords;
        marker.current?.setLngLat([geoLng, geoLat]);
        map.current?.easeTo({ center: [geoLng, geoLat], zoom: 17, duration: 700 });
        onLocationChange(geoLat, geoLng);
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
        alert('Unable to retrieve your location. Please check browser permissions.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="relative w-full rounded-xl overflow-hidden shadow-md border border-gray-300" style={{ height }}>
      {/* Map canvas — fills entire container */}
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* Controls overlay
          IMPORTANT: pointer-events-none on container so the map canvas
          receives drag/pan events everywhere. Only individual controls
          have pointer-events-auto so they remain clickable. */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 pointer-events-none">
        {/* Tilt slider */}
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-xs min-w-[170px] border border-gray-200 pointer-events-auto">
          <span className="shrink-0 font-semibold w-9 text-gray-600">Tilt</span>
          <input
            type="range" min={0} max={85} step={1} value={pitch}
            onChange={(e) => handlePitchChange(Number(e.target.value))}
            className="w-full h-1.5 accent-indigo-600 cursor-pointer"
          />
          <span className="shrink-0 w-8 text-right font-mono text-gray-500">{pitch}°</span>
        </div>

        {/* Spin / bearing slider */}
        <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-xs min-w-[170px] border border-gray-200 pointer-events-auto">
          <span className="shrink-0 font-semibold w-9 text-gray-600">Spin</span>
          <input
            type="range" min={-180} max={180} step={1} value={bearing}
            onChange={(e) => handleBearingChange(Number(e.target.value))}
            className="w-full h-1.5 accent-indigo-600 cursor-pointer"
          />
          <span className="shrink-0 w-8 text-right font-mono text-gray-500">{bearing}°</span>
        </div>

        {/* Reset button */}
        <button
          type="button"
          onClick={resetView}
          className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 transition-colors self-start border border-gray-200 pointer-events-auto"
        >
          ↺ Reset View
        </button>
      </div>

      {/* GPS locate-me button — bottom right above navigation controls */}
      <button
        type="button"
        onClick={handleLocateMe}
        disabled={isLocating}
        title="Detect my current location"
        className="absolute bottom-24 right-3 z-10 pointer-events-auto bg-white rounded-full w-10 h-10 shadow-md border border-gray-200 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {isLocating ? (
          /* Spinner */
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
          </svg>
        ) : (
          /* GPS crosshair icon */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </button>

      {/* Attribution */}
      <div className="absolute bottom-1 right-14 z-10 text-[10px] text-gray-400 bg-white/70 rounded px-1 pointer-events-none">
        Click map or drag pin · Scroll to zoom
      </div>
    </div>
  );
}
