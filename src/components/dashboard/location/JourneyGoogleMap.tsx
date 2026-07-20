import { useCallback, useRef, useMemo } from 'react';
import { GoogleMap, Marker, Polyline, Circle, useJsApiLoader } from '@react-google-maps/api';
import type { WorkSitePin, PathSegment } from './JourneyLeafletMap';

const libraries: ('geocoding' | 'places')[] = ['geocoding', 'places'];

export interface JourneyPoint {
  lat: number;
  lng: number;
  type: string;
  time: string;
}

const SITE_COLORS_GOOGLE = ['#ef4444', '#f97316', '#eab308', '#7c3aed', '#2563eb'];

interface JourneyGoogleMapProps {
  apiKey: string;
  points: JourneyPoint[];
  workLat: number;
  workLng: number;
  workName: string;
  radiusMeters?: number;
  height?: string;
  // Multi-location support
  workSites?: WorkSitePin[];
  segments?: PathSegment[];
}

export default function JourneyGoogleMap({ 
  apiKey, points, workLat, workLng, workName, radiusMeters, height = '400px',
  workSites, segments
}: JourneyGoogleMapProps) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries });
  const mapRef = useRef<google.maps.Map | null>(null);

  const center = useMemo(() => {
    if (points.length === 0) return { lat: workLat, lng: workLng };
    return { lat: points[0].lat, lng: points[0].lng };
  }, [points, workLat, workLng]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
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
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy'
        }}
      >
        {/* ---- MULTI-SEGMENT POLYLINES ---- */}
        {segments && segments.length > 0 ? (
          segments.map((seg, si) => (
            <Polyline
              key={si}
              path={seg.points.map(p => ({ lat: p.lat, lng: p.lng }))}
              options={{ strokeColor: seg.color, strokeOpacity: 0.85, strokeWeight: 4 }}
            />
          ))
        ) : (
          /* ---- SINGLE PATH FALLBACK ---- */
          points.length > 1 && (
            <Polyline
              path={points.map(p => ({ lat: p.lat, lng: p.lng }))}
              options={{ strokeColor: '#6366f1', strokeOpacity: 0.8, strokeWeight: 4 }}
            />
          )
        )}

        {/* Journey event markers */}
        {points.map((p, i) => {
          const isLastEvent = i === points.length - 1;
          const statusStr = (p.type || '').toLowerCase();
          const isTrackingPoint = statusStr === 'traveling' || statusStr === 'working';

          if (isTrackingPoint && !isLastEvent) {
            const bgColor = statusStr === 'traveling' ? '#4336f0ff' : '#0ea5e9';
            return (
              <Marker
                key={`pt-${i}-${p.lat}-${p.lng}`}
                position={{ lat: p.lat, lng: p.lng }}
                title={`${p.type}\n${p.time}`}
                icon={{
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
            <Marker
              key={`pt-${i}-${p.lat}-${p.lng}`}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.type}\n${p.time}`}
              icon={{
                url: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
                scaledSize: new google.maps.Size(22, 36),
                anchor: new google.maps.Point(11, 36),
              }}
            />
          );
        })}

        {/* ---- MULTI WORK SITE MARKERS ---- */}
        {hasMultiSite ? (
          workSites!.map((ws, si) => (
            <div key={`ws-${si}`}>
              <Marker
                position={{ lat: ws.lat, lng: ws.lng }}
                title={`${ws.name} — Work Site ${si + 1}`}
                icon={{
                  url: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${ws.color || 'red'}.png`,
                  scaledSize: new google.maps.Size(25, 41),
                  anchor: new google.maps.Point(12, 41),
                }}
              />
              {ws.radiusMeters && ws.radiusMeters > 0 && (
                <Circle
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
          <Marker
            position={{ lat: workLat, lng: workLng }}
            title={workName}
            icon={{
              url: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
              scaledSize: new google.maps.Size(25, 41),
              anchor: new google.maps.Point(12, 41),
            }}
          />
        )}
      </GoogleMap>
    </div>
  );
}
