import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import { Settings2, X } from 'lucide-react';
import 'maplibre-gl/dist/maplibre-gl.css';

// Helper to draw a circle using GeoJSON
const createGeoJSONCircle = function(center: [number, number], radiusInMeters: number, points: number = 64): any {
  const lng = Number(center[0]);
  const lat = Number(center[1]);

  if (!radiusInMeters || radiusInMeters <= 0 || isNaN(lng) || isNaN(lat)) {
    return { type: "FeatureCollection", features: [] };
  }
  const km = radiusInMeters / 1000;
  const ret = [];
  const distanceX = km / (111.320 * Math.cos(lat * Math.PI / 180));
  const distanceY = km / 110.574;

  for(let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([lng + x, lat + y]);
  }
  ret.push(ret[0]); // close the polygon

  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ret] },
      properties: {}
    }]
  };
};

interface MapLibre3DPickerProps {
  lat: number;
  lng: number;
  onLocationChange: (lat: number, lng: number) => void;
  height?: string;
  readOnly?: boolean;
  radius?: number;
}

export default function MapLibre3DPicker({
  lat,
  lng,
  onLocationChange,
  height = '560px',
  readOnly = false,
  radius,
}: MapLibre3DPickerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const [pitch, setPitch] = useState(52);
  const [bearing, setBearing] = useState(-20);
  const [isLocating, setIsLocating] = useState(false);
  const [showControls, setShowControls] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const safeLat = typeof lat === 'number' && !isNaN(lat) && lat !== null ? lat : 13.0827;
    const safeLng = typeof lng === 'number' && !isNaN(lng) && lng !== null ? lng : 80.2707;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [safeLng, safeLat],
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

      // Add radius circle once style is loaded
      map.current!.addSource('radius-source', {
        type: 'geojson',
        data: createGeoJSONCircle([safeLngMarker, safeLatMarker], radius || 0)
      });
      map.current!.addLayer({
        id: 'radius-layer',
        type: 'fill',
        source: 'radius-source',
        paint: {
          'fill-color': '#4f46e5',
          'fill-opacity': 0.15
        }
      });
      map.current!.addLayer({
        id: 'radius-outline-layer',
        type: 'line',
        source: 'radius-source',
        paint: {
          'line-color': '#4f46e5',
          'line-width': 2,
          'line-dasharray': [4, 4]
        }
      });
    });

    // Silently handle missing sprite icons from the liberty style's incomplete sprite sheet.
    // Instead of letting MapLibre log a warning for every missing icon (gate, bollard, etc.),
    // we provide a 1×1 transparent placeholder image on demand.
    map.current!.on('styleimagemissing', (e: maplibregl.MapStyleImageMissingEvent) => {
      if (!map.current || map.current.hasImage(e.id)) return;
      const emptyImage = { width: 1, height: 1, data: new Uint8Array(4) };
      map.current.addImage(e.id, emptyImage);
    });

    // Draggable indigo marker (unless readOnly)
    const safeLatMarker = typeof lat === 'number' && !isNaN(lat) && lat !== null ? lat : 13.0827;
    const safeLngMarker = typeof lng === 'number' && !isNaN(lng) && lng !== null ? lng : 80.2707;
    
    marker.current = new maplibregl.Marker({ color: '#4f46e5', draggable: !readOnly, scale: 1.1 })
      .setLngLat([safeLngMarker, safeLatMarker])
      .addTo(map.current);

    if (!readOnly) {
      marker.current.on('dragend', () => {
        const pos = marker.current!.getLngLat();
        onLocationChange(pos.lat, pos.lng);
      });

      // Click map to reposition marker
      map.current.on('click', (e) => {
        marker.current!.setLngLat([e.lngLat.lng, e.lngLat.lat]);
        onLocationChange(e.lngLat.lat, e.lngLat.lng);
      });
    }

    // Keep sliders in sync with manual mouse drag on map
    map.current.on('pitch', () => {
      if (map.current) setPitch(Math.round(map.current.getPitch()));
    });
    map.current.on('rotate', () => {
      if (map.current) setBearing(Math.round(map.current.getBearing()));
    });

    // Auto-resize map when container dimensions change (e.g. fullscreen toggle)
    const resizeObserver = new ResizeObserver(() => {
      map.current?.resize();
    });
    resizeObserver.observe(mapContainer.current);

    return () => {
      resizeObserver.disconnect();
      map.current?.remove();
      map.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external lat/lng → marker + pan
  useEffect(() => {
    if (!map.current || !marker.current || lat == null || lng == null || isNaN(lat) || isNaN(lng)) return;
    marker.current.setLngLat([lng, lat]);
    map.current.easeTo({ center: [lng, lat], duration: 500 });
    
    // Sync radius
    const source = map.current.getSource('radius-source') as maplibregl.GeoJSONSource;
    if (source) {
      source.setData(createGeoJSONCircle([lng, lat], radius || 0));
    }
  }, [lat, lng, radius]);

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
    <div className={`relative w-full ${height === '100%' ? 'h-full flex-1' : 'overflow-hidden rounded-xl border border-gray-300'}`} style={height === '100%' ? { height: '100%', minHeight: '100%' } : { height }}>
      {/* Map canvas — fills entire container */}
      <div ref={mapContainer} className="w-full h-full" style={{ minHeight: '300px' }} />

      {/* Navigation controls are allowed to show on mobile now */}

      {/* Controls overlay
          IMPORTANT: pointer-events-none on container so the map canvas
          receives drag/pan events everywhere. Only individual controls
          have pointer-events-auto so they remain clickable. */}
      <div className="absolute top-14 left-2 sm:top-16 sm:left-4 z-10 flex flex-col gap-2 pointer-events-none">
        
        {/* Toggle Controls Button */}
        <button
          type="button"
          onClick={() => setShowControls(!showControls)}
          className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md h-9 w-9 flex items-center justify-center text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors pointer-events-auto border border-gray-200"
          title="3D View Settings"
        >
          {showControls ? <X className="h-5 w-5" /> : <Settings2 className="h-5 w-5" />}
        </button>

        {showControls && (
          <div className="flex flex-col gap-2 animate-in slide-in-from-left-4 fade-in duration-200">
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
        )}
      </div>

      {/* GPS locate-me button — positioned above the maplibre navigation controls on all screens */}
      <button
        type="button"
        onClick={handleLocateMe}
        disabled={isLocating}
        title="Detect my current location"
        className="absolute bottom-28 right-2 sm:bottom-28 sm:right-2 z-[1000] pointer-events-auto bg-white rounded-full h-9 w-9 sm:h-10 sm:w-10 shadow-md border border-gray-200 flex items-center justify-center text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {isLocating ? (
          /* Spinner */
          <svg className="animate-spin w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
          </svg>
        ) : (
          /* GPS crosshair icon */
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </button>

      {/* Attribution */}
      <div className="absolute bottom-1 right-12 sm:right-14 z-10 text-[9px] sm:text-[10px] text-gray-500 bg-white/70 rounded px-1 pointer-events-none">
        Click map or drag pin · Scroll to zoom
      </div>
    </div>
  );
}
