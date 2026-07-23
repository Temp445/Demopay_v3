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

export interface Map3DRoute {
  coordinates: [number, number][]; // array of [lat, lng]
  color?: string;
  weight?: number;
  dashArray?: number[];
}

export interface Map3DMarker {
  lat: number;
  lng: number;
  color?: string;
  popupHTML?: string;
}

export interface Map3DCircle {
  lat: number;
  lng: number;
  radius: number; // in meters
  color?: string;
}

interface MapLibre3DViewerProps {
  center: [number, number]; // [lat, lng]
  routes?: Map3DRoute[];
  markers?: Map3DMarker[];
  circles?: Map3DCircle[];
  height?: string;
}

export default function MapLibre3DViewer({
  center,
  routes = [],
  markers = [],
  circles = [],
  height = '560px'
}: MapLibre3DViewerProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markerRefs = useRef<maplibregl.Marker[]>([]);
  const [pitch, setPitch] = useState(52);
  const [bearing, setBearing] = useState(-20);
  const [showControls, setShowControls] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const safeLat = typeof center[0] === 'number' && !isNaN(center[0]) ? center[0] : 13.0827;
    const safeLng = typeof center[1] === 'number' && !isNaN(center[1]) ? center[1] : 80.2707;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [safeLng, safeLat],
      zoom: 16,
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

      layers.forEach((layer) => {
        if (layer.type !== 'fill-extrusion') return;
        try {
          map.current!.setPaintProperty(layer.id, 'fill-extrusion-color', '#8bbbd4');
          map.current!.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.85);
        } catch { /* ignore */ }
      });

      // Add Sources and Layers for Circles
      circles.forEach((circle, idx) => {
        const sourceId = `circle-source-${idx}`;
        map.current!.addSource(sourceId, {
          type: 'geojson',
          data: createGeoJSONCircle([circle.lng, circle.lat], circle.radius)
        });
        map.current!.addLayer({
          id: `circle-layer-${idx}`,
          type: 'fill',
          source: sourceId,
          paint: {
            'fill-color': circle.color || '#4f46e5',
            'fill-opacity': 0.15
          }
        });
        map.current!.addLayer({
          id: `circle-outline-layer-${idx}`,
          type: 'line',
          source: sourceId,
          paint: {
            'line-color': circle.color || '#4f46e5',
            'line-width': 2,
            'line-dasharray': [4, 4]
          }
        });
      });

      // Add Sources and Layers for Routes
      routes.forEach((route, idx) => {
        const sourceId = `route-source-${idx}`;
        const geojson = {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: route.coordinates.map(c => [c[1], c[0]]) // MapLibre takes [lng, lat]
              },
              properties: {}
            }
          ]
        };
        map.current!.addSource(sourceId, {
          type: 'geojson',
          data: geojson as any
        });
        map.current!.addLayer({
          id: `route-layer-${idx}`,
          type: 'line',
          source: sourceId,
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': route.color || '#4f46e5',
            'line-width': route.weight || 4,
            ...(route.dashArray && { 'line-dasharray': route.dashArray })
          }
        });
      });
    });

    map.current.on('styleimagemissing', (e: maplibregl.MapStyleImageMissingEvent) => {
      if (!map.current || map.current.hasImage(e.id)) return;
      const emptyImage = { width: 1, height: 1, data: new Uint8Array(4) };
      map.current.addImage(e.id, emptyImage);
    });

    // Add Markers
    markers.forEach((markerData) => {
      const marker = new maplibregl.Marker({ color: markerData.color || '#4f46e5', scale: 1.1 })
        .setLngLat([markerData.lng, markerData.lat]);
        
      if (markerData.popupHTML) {
        const popup = new maplibregl.Popup({ offset: 25 }).setHTML(markerData.popupHTML);
        marker.setPopup(popup);
      }
      
      marker.addTo(map.current!);
      markerRefs.current.push(marker);
    });

    map.current.on('pitch', () => {
      if (map.current) setPitch(Math.round(map.current.getPitch()));
    });
    map.current.on('rotate', () => {
      if (map.current) setBearing(Math.round(map.current.getBearing()));
    });

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
  }, []); // We mount once. If dynamic updates are needed, we can implement them later, but for viewer it's usually static data on mount.

  const handlePitchChange = (v: number) => {
    setPitch(v);
    map.current?.setPitch(v);
  };

  const handleBearingChange = (v: number) => {
    setBearing(v);
    map.current?.setBearing(v);
  };

  const resetView = () => {
    map.current?.easeTo({ pitch: 52, bearing: -20, zoom: 16, duration: 700 });
    setPitch(52);
    setBearing(-20);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: geoLat, longitude: geoLng } = pos.coords;
        map.current?.easeTo({ center: [geoLng, geoLat], zoom: 17, duration: 700 });
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
    <div className={`relative w-full overflow-hidden ${height === '100%' ? 'h-full flex-1' : 'rounded-xl border border-gray-300'}`} style={height === '100%' ? { height: '100%', minHeight: '100%' } : { height }}>
      <div ref={mapContainer} className="w-full h-full" style={{ minHeight: '300px' }} />

      <div className="absolute top-14 left-2 sm:top-16 sm:left-4 z-10 flex flex-col gap-2 pointer-events-none">
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
            <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-xs min-w-[170px] border border-gray-200 pointer-events-auto">
              <span className="shrink-0 font-semibold w-9 text-gray-600">Tilt</span>
              <input
                type="range" min={0} max={85} step={1} value={pitch}
                onChange={(e) => handlePitchChange(Number(e.target.value))}
                className="w-full h-1.5 accent-indigo-600 cursor-pointer"
              />
              <span className="shrink-0 w-8 text-right font-mono text-gray-500">{pitch}°</span>
            </div>

            <div className="bg-white/95 backdrop-blur-sm rounded-lg shadow-md px-3 py-2 flex items-center gap-2 text-xs min-w-[170px] border border-gray-200 pointer-events-auto">
              <span className="shrink-0 font-semibold w-9 text-gray-600">Spin</span>
              <input
                type="range" min={-180} max={180} step={1} value={bearing}
                onChange={(e) => handleBearingChange(Number(e.target.value))}
                className="w-full h-1.5 accent-indigo-600 cursor-pointer"
              />
              <span className="shrink-0 w-8 text-right font-mono text-gray-500">{bearing}°</span>
            </div>

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

      <button
        type="button"
        onClick={handleLocateMe}
        disabled={isLocating}
        title="Detect my current location"
        className="absolute bottom-28 right-2 sm:bottom-28 sm:right-2 z-[1000] pointer-events-auto bg-white rounded-full h-9 w-9 sm:h-10 sm:w-10 shadow-md border border-gray-200 flex items-center justify-center text-gray-700 hover:text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
      >
        {isLocating ? (
          <svg className="animate-spin w-4 h-4 sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4l-3 3-3-3h4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 sm:w-5 sm:h-5">
            <circle cx="12" cy="12" r="3" />
            <line x1="12" y1="2" x2="12" y2="6" />
            <line x1="12" y1="18" x2="12" y2="22" />
            <line x1="2" y1="12" x2="6" y2="12" />
            <line x1="18" y1="12" x2="22" y2="12" />
          </svg>
        )}
      </button>

      <div className="absolute bottom-1 right-12 sm:right-14 z-10 text-[9px] sm:text-[10px] text-gray-500 bg-white/70 rounded px-1 pointer-events-none">
        Click map or drag pin · Scroll to zoom
      </div>
    </div>
  );
}
