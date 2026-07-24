import { useCallback, useRef, useMemo, useState, useEffect } from 'react';
import { GoogleMap, MarkerF, PolylineF, CircleF, DirectionsRenderer, useJsApiLoader } from '@react-google-maps/api';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { WorkSitePin, PathSegment } from './JourneyLeafletMap';

const libraries: ('places' | 'geocoding')[] = ['places', 'geocoding'];

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

const getPinIcon = (color: string) => {
  if (!window.google) return undefined;
  const hex = mapColor(color);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${hex}"><path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z"></path><circle cx="12" cy="8" r="3" fill="white"></circle></svg>`;
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(32, 32),
    anchor: new window.google.maps.Point(16, 32),
  };
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
  const { companySettings } = useSettingsStore();
  const [directionsResponse, setDirectionsResponse] = useState<google.maps.DirectionsResult | null>(null);

  useEffect(() => {
    if (companySettings?.enable_directions_api && isLoaded && (!segments || segments.length === 0) && points.length >= 2) {
      const directionsService = new window.google.maps.DirectionsService();
      
      const origin = { lat: points[0].lat, lng: points[0].lng };
      const destination = { lat: points[points.length - 1].lat, lng: points[points.length - 1].lng };
      
      let waypointsCoords = points.slice(1, points.length - 1);
      if (waypointsCoords.length > 23) {
        const step = Math.ceil(waypointsCoords.length / 23);
        waypointsCoords = waypointsCoords.filter((_, index) => index % step === 0).slice(0, 23);
      }
      
      const waypoints = waypointsCoords.map(p => ({
        location: { lat: p.lat, lng: p.lng },
        stopover: false
      }));

      directionsService.route(
        {
          origin,
          destination,
          waypoints,
          travelMode: window.google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === window.google.maps.DirectionsStatus.OK) {
            setDirectionsResponse(result);
          } else {
            console.error('[Directions API] Error fetching journey route:', status);
          }
        }
      );
    }
  }, [isLoaded, points.length, companySettings?.enable_directions_api, segments]);

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
          mapTypeControl: true,
          mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
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
              <MarkerF
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
            <MarkerF
              key={`pt-${i}-${p.lat}-${p.lng}`}
              position={{ lat: p.lat, lng: p.lng }}
              title={`${p.type}\n${p.time}`}
              icon={getPinIcon(color)}
            />
          );
        })}

        {/* ---- MULTI WORK SITE MARKERS ---- */}
        {hasMultiSite ? (
          workSites!.map((ws, si) => (
            <div key={`ws-${si}`}>
              <MarkerF
                position={{ lat: ws.lat, lng: ws.lng }}
                title={`${ws.name} — Work Site ${si + 1}`}
                icon={getPinIcon(ws.color || 'red')}
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
          <MarkerF
            position={{ lat: workLat, lng: workLng }}
            title={workName}
            icon={getPinIcon('red')}
          />
        )}
      </GoogleMap>
    </div>
  );
}
