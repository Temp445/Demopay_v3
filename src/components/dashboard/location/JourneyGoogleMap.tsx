import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { GoogleMap, PolylineF, CircleF, DirectionsRenderer } from '@react-google-maps/api';
import AdvancedMarker from './AdvancedMarker';
import { useGoogleMaps } from '../../../contexts/GoogleMapsContext';
const MAP_ID = 'DEMO_MAP_ID';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { WorkSitePin, PathSegment } from './JourneyLeafletMap';



export interface JourneyPoint {
  lat: number;
  lng: number;
  type: string;
  time: string;
}

const mapColor = (c: string) => {
  if (c === 'red') return '#ef4444';
  if (c === 'green') return '#10b981';
  if (c === 'blue') return '#3b82f6';
  if (c === 'violet') return '#8b5cf6';
  return c;
};

const getPinIconUrl = (color: string) => {
  const hex = mapColor(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${hex}"><path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z"></path><circle cx="12" cy="8" r="3" fill="white"></circle></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const SITE_COLORS_GOOGLE = ['#ef4444', '#f97316', '#eab308', '#7c3aed', '#2563eb'];

interface JourneyGoogleMapProps {
  apiKey: string;
  points: JourneyPoint[];
  workLat: number;
  workLng: number;
  workName: string;
  radiusMeters?: number;
  height?: string;
  workSites?: WorkSitePin[];
  segments?: PathSegment[];
  hideWorkSite?: boolean;
}

export default function JourneyGoogleMap({ 
  apiKey, points, workLat, workLng, workName, radiusMeters, height = '400px',
  workSites, segments, hideWorkSite = false
}: JourneyGoogleMapProps) {
  const { isLoaded } = useGoogleMaps();
  const mapRef = useRef<google.maps.Map | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const { companySettings } = useSettingsStore();


  const center = useMemo(() => {
    if (points.length === 0) return { lat: workLat, lng: workLng };
    return { lat: points[0].lat, lng: points[0].lng };
  }, [points, workLat, workLng]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMap(map);
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: workLat, lng: workLng });
    points.forEach(p => bounds.extend({ lat: p.lat, lng: p.lng }));
    if (workSites) {
      workSites.forEach(ws => bounds.extend({ lat: ws.lat, lng: ws.lng }));
    }
    map.fitBounds(bounds);
  }, [points, workLat, workLng, workSites]);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center bg-slate-100 rounded-xl" style={{ height }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const hasMultiSite = workSites && workSites.length > 0;

  return (
    <div className="rounded-xl overflow-hidden shadow-sm" style={{ height }}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={center}
        zoom={13}
        onLoad={onLoad}
        options={{
          mapId: MAP_ID,
          mapTypeControl: true,
          mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy'
        }}
      >
        {/* ---- MULTI-SEGMENT POLYLINES ---- */}
        {segments && segments.length > 0 ? (
          segments.map((seg, si) => (
            <PolylineF
              key={si}
              path={seg.points.map(p => ({ lat: p.lat, lng: p.lng }))}
              options={{ strokeColor: seg.color, strokeOpacity: 0.85, strokeWeight: 4 }}
            />
          ))
        ) : (
          /* ---- SINGLE PATH FALLBACK ---- */
          points.length > 1 ? (
            <PolylineF
              path={points.map(p => ({ lat: p.lat, lng: p.lng }))}
              options={{ strokeColor: '#4f46e5', strokeOpacity: 0.85, strokeWeight: 4 }}
            />
          ) : null
        )}

        {/* Journey event markers */}
        {points.map((p, i) => {
          const isLastEvent = i === points.length - 1;
          const statusStr = (p.type || '').toLowerCase();
          const isTrackingPoint = statusStr === 'traveling' || statusStr === 'working';

          if (isTrackingPoint && !isLastEvent) {
            const bgColor = statusStr === 'traveling' ? '#4336f0ff' : '#0ea5e9';
            return (
              <AdvancedMarker
                key={`pt-${i}-${p.lat}-${p.lng}`}
                map={map}
                position={{ lat: p.lat, lng: p.lng }}
                title={`${p.type}\n${p.time}`}
                symbol={{
                  path: 0, // google.maps.SymbolPath.CIRCLE is 0
                  fillColor: bgColor,
                  fillOpacity: 1,
                  strokeColor: '#ffffff',
                  strokeWeight: 1,
                  scale: 3, // Small dot size
                }}
              />
            );
          }

          let color = 'blue';
          if (i === 0) color = 'green';
          else if (isLastEvent) color = 'violet';

          return (
            <AdvancedMarker
              key={`pt-${i}-${p.lat}-${p.lng}`}
              map={map}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.type}\n${p.time}`}
              iconUrl={getPinIconUrl(color)}
              iconSize={[32, 32]}
              iconAnchor={[16, 32]}
            />
          );
        })}

        {/* ---- MULTI WORK SITE MARKERS ---- */}
        {!hideWorkSite && (
          hasMultiSite ? (
            workSites!.map((ws, si) => (
              <div key={`ws-${si}`}>
                <AdvancedMarker
                  map={map}
                  position={{ lat: ws.lat, lng: ws.lng }}
                  title={`${ws.name} — Work Site ${si + 1}`}
                  iconUrl={getPinIconUrl(ws.color || 'red')}
                  iconSize={[32, 32]}
                  iconAnchor={[16, 32]}
                />
                {ws.radiusMeters && ws.radiusMeters > 0 && (
                  <CircleF
                    center={{ lat: ws.lat, lng: ws.lng }}
                    radius={ws.radiusMeters}
                    options={{
                      strokeColor: SITE_COLORS_GOOGLE[si % SITE_COLORS_GOOGLE.length],
                      strokeOpacity: 0.6,
                      strokeWeight: 2,
                      fillColor: SITE_COLORS_GOOGLE[si % SITE_COLORS_GOOGLE.length],
                      fillOpacity: 0.06,
                    }}
                  />
                )}
              </div>
            ))
          ) : (
            /* ---- SINGLE WORK SITE MARKER ---- */
            <AdvancedMarker
              map={map}
              position={{ lat: workLat, lng: workLng }}
              title={workName}
              iconUrl={getPinIconUrl('red')}
              iconSize={[32, 32]}
              iconAnchor={[16, 32]}
            />
          )
        )}
      </GoogleMap>
    </div>
  );
}
