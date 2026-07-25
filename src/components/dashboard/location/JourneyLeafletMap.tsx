import { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Circle, useMap, Tooltip, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { JourneyPoint } from './JourneyGoogleMap';
import MapLibre3DViewer, { Map3DMarker, Map3DRoute, Map3DCircle } from './MapLibre3DViewer';

export interface WorkSitePin {
  id?: string; // Added to uniquely identify sites
  lat: number;
  lng: number;
  name: string;
  radiusMeters?: number;
  color?: string;
}

export interface PathSegment {
  points: JourneyPoint[];
  color: string;
  label: string;
}

// Helper to calculate distance in meters between two coordinates
function getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in meters
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) +
            Math.cos(p1) * Math.cos(p2) *
            Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Helper to auto-fit the map to show all points
function MapBounds({ points, workLat, workLng, workSites }: { points: JourneyPoint[]; workLat: number; workLng: number; workSites?: WorkSitePin[] }) {
  const map = useMap();
  useEffect(() => {
    if (!points) return;
    const allPoints: [number, number][] = [[workLat, workLng], ...points.map(p => [p.lat, p.lng] as [number, number])];
    if (workSites) {
      workSites.forEach(ws => allPoints.push([ws.lat, ws.lng]));
    }
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [map, points, workLat, workLng, workSites]);
  return null;
}

// 1. PIN ICON GENERATOR
const getOffsetIcon = (color: string, index: number, total: number) => {
  if (total <= 1) {
    return new L.Icon({
      iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png`,
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [22, 36],
      iconAnchor: [11, 36],
      popupAnchor: [1, -34],
      tooltipAnchor: [0, -36], 
      shadowSize: [41, 41]
    });
  }

  const radiusPixels = 22; 
  const angle = (index / total) * 2 * Math.PI;
  const offsetX = Math.round(radiusPixels * Math.cos(angle));
  const offsetY = Math.round(radiusPixels * Math.sin(angle));

  const htmlString = `
    <div style="position: absolute; left: ${offsetX}px; top: ${offsetY}px; width: 22px; height: 36px; margin-left: -11px; margin-top: -36px;">
      <img 
        src="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${color}.png" 
        style="width: 100%; height: 100%; filter: drop-shadow(2px 3px 3px rgba(0,0,0,0.4));" 
      />
    </div>
    ${index === 0 ? `<div style="position: absolute; left: -4px; top: -4px; width: 8px; height: 8px; background: #333; border-radius: 50%; border: 2px solid white; box-shadow: 0 1px 3px rgba(0,0,0,0.5); z-index: 1000;"></div>` : ''}
  `;

  return new L.DivIcon({
    className: 'custom-grouped-pin',
    html: htmlString,
    iconSize: [0, 0], 
    iconAnchor: [0, 0], 
    tooltipAnchor: [offsetX, offsetY - 36] 
  });
};

// 2. DOT ICON GENERATOR
const getEventDotIcon = (statusType: string, index: number, total: number, isLast: boolean) => {
  let bgColor = '#3b82f6';
  const statusStr = (statusType || '').toLowerCase();
  
  // Check if this is a continuous tracking point (Traveling or Working)
  const isTrackingPoint = statusStr === 'traveling' || statusStr === 'working';
  
  if (statusStr.includes('journey') || statusStr === 'traveling') bgColor = '#4336f0ff';
  else if (statusStr.includes('work') || statusStr === 'working') bgColor = '#0ea5e9';
  else if (isLast) bgColor = '#8b5cf6';
  else if (statusStr.includes('reached')) bgColor = '#0ea5e9';

  // SET SIZE: 5px for continuous live tracking, 12px for major events
  const dotSize = isTrackingPoint ? 5 : 12;
  // Reduce border for the small dots so the color is still visible
  const borderSize = isTrackingPoint ? 1 : 2;

  const radiusPixels = dotSize;
  const angle = (index / total) * 2 * Math.PI;
  const offsetX = total > 1 ? Math.round(radiusPixels * Math.cos(angle)) : 0;
  const offsetY = total > 1 ? Math.round(radiusPixels * Math.sin(angle)) : 0;

  const htmlString = `
    <div style="
      position: absolute; 
      left: ${offsetX}px; 
      top: ${offsetY}px; 
      width: ${dotSize}px; 
      height: ${dotSize}px; 
      background-color: ${bgColor}; 
      border: ${borderSize}px solid #ffffff; 
      border-radius: 50%; 
      box-shadow: 0 2px 4px rgba(0,0,0,0.4);
      transform: translate(-50%, -50%);
      z-index: ${isLast ? 999 : (isTrackingPoint ? 400 : 500)};
    "></div>
    ${index === 0 && total > 1 ? `<div style="position: absolute; width: 4px; height: 4px; background: #666; border-radius: 50%; transform: translate(-50%, -50%); z-index: 1000;"></div>` : ''}
  `;

  return new L.DivIcon({
    className: 'custom-event-dot',
    html: htmlString,
    iconSize: [0, 0], 
    iconAnchor: [0, 0], 
    tooltipAnchor: [offsetX, offsetY - (dotSize / 2)] 
  });
};

const SITE_COLORS = ['red', 'orange', 'gold', 'violet', 'blue'];

const sortPointsByTime = (pts: JourneyPoint[]) => {
  if (!pts || !Array.isArray(pts)) return [];
  return [...pts].sort((a, b) => {
    const tA = new Date(a.time).getTime();
    const tB = new Date(b.time).getTime();
    return isNaN(tA) || isNaN(tB) ? 0 : tA - tB;
  });
};

interface JourneyLeafletMapProps {
  points?: JourneyPoint[];
  workLat: number;
  workLng: number;
  workName: string;
  radiusMeters?: number;
  height?: string;
  workSites?: WorkSitePin[];
  segments?: PathSegment[];
  hideWorkSite?: boolean;
}

export default function JourneyLeafletMap({ 
  points = [], workLat, workLng, workName, radiusMeters, height = '400px',
  workSites, segments = [], hideWorkSite = false
}: JourneyLeafletMapProps) {
  
  const chronologicallySortedPoints = useMemo(() => sortPointsByTime(points), [points]);
  
  const timelinePathCoords = useMemo(() => {
    return chronologicallySortedPoints.map(p => [p.lat, p.lng] as [number, number]);
  }, [chronologicallySortedPoints]);

  const center: [number, number] = chronologicallySortedPoints.length > 0 
    ? [chronologicallySortedPoints[0].lat, chronologicallySortedPoints[0].lng] 
    : [workLat, workLng];
  const hasMultiSite = workSites && workSites.length > 0;

  const [mapType, setMapType] = useState<'street' | 'satellite' | '3d'>('street');

  // Dynamic Circle Style Logic
  const getCircleStyle = (lat: number, lng: number, radius: number | undefined, siteId?: string) => {
    // Default Style: Blue (Location assigned, but work has not started)
    const defaultStyle = { color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.1, weight: 2, dashArray: '6 4' }; 
    if (!radius) return defaultStyle;

    // Filter points that belong to this specific site
    let sitePoints = [];
    if (siteId && chronologicallySortedPoints.some(p => (p as any).locationId)) {
       sitePoints = chronologicallySortedPoints.filter(p => (p as any).locationId === siteId);
    } else if (hasMultiSite) {
       // Spatial fallback if locationIds aren't present
       sitePoints = chronologicallySortedPoints.filter(p => getDistanceInMeters(lat, lng, p.lat, p.lng) <= (radius + 2000));
    } else {
       sitePoints = chronologicallySortedPoints;
    }

    // Only look at tracking points related to work
    const workTypes = ['Start Work', 'Working', 'Paused', 'Resumed', 'Complete'];
    const workPoints = sitePoints.filter(p => workTypes.some(wt => p.type.includes(wt)));

    if (workPoints.length === 0) {
      return defaultStyle; // Work not started
    }

    // Check if any work points strayed outside the allowed radius
    const hasViolation = workPoints.some(p => getDistanceInMeters(lat, lng, p.lat, p.lng) > radius);

    if (hasViolation) {
      // Red: Violated radius during work
      return { ...defaultStyle, color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.12 }; 
    } else {
      // Green: Worked safely within the radius
      return { ...defaultStyle, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.12 }; 
    }
  };

  const processedSegments = useMemo(() => {
    if (!segments || segments.length === 0) return [];
    
    return segments.map((seg, i, arr) => {
      const sortedPts = sortPointsByTime(seg.points);

      if (i > 0) {
        const prevSortedPts = sortPointsByTime(arr[i - 1].points);
        if (prevSortedPts.length > 0) {
          const lastOfPrev = prevSortedPts[prevSortedPts.length - 1];
          if (sortedPts.length === 0 || lastOfPrev.lat !== sortedPts[0].lat || lastOfPrev.lng !== sortedPts[0].lng) {
            sortedPts.unshift(lastOfPrev);
          }
        }
      }
      return { ...seg, points: sortedPts };
    });
  }, [segments]);

  const displayPoints = useMemo(() => {
    const grouped: Record<string, JourneyPoint[]> = {};
    chronologicallySortedPoints.forEach(p => {
      const key = `${p.lat},${p.lng}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });

    const counts: Record<string, number> = {};
    return chronologicallySortedPoints.map(p => {
      const key = `${p.lat},${p.lng}`;
      const totalAtLocation = grouped[key].length;
      if (counts[key] === undefined) counts[key] = 0;
      
      return { ...p, overlapIndex: counts[key]++, overlapTotal: totalAtLocation };
    });
  }, [chronologicallySortedPoints]);

  return (
    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm relative" style={{ height }}>
      <div className="absolute top-4 right-4 z-[1000] flex bg-white rounded-md shadow-md overflow-hidden border border-gray-300">
        <button 
          onClick={() => setMapType('street')}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === 'street' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
        >
          Map
        </button>
        <button 
          onClick={() => setMapType('satellite')}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === 'satellite' ? 'bg-blue-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
        >
          Satellite
        </button>
        <button 
          onClick={() => setMapType('3d')}
          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === '3d' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
        >
          3D
        </button>
      </div>

      {mapType === '3d' ? (
        <MapLibre3DViewer
          center={center}
          routes={processedSegments && processedSegments.length > 0 
            ? processedSegments.filter(s => s.points.length >= 2).map(s => ({
                coordinates: s.points.map(p => [p.lat, p.lng] as [number, number]),
                color: s.color || '#6366f1',
                weight: 4
              }))
            : timelinePathCoords.length > 1 ? [{ coordinates: timelinePathCoords, color: '#6366f1', weight: 4 }] : []
          }
          markers={[
            ...displayPoints.map((p, i) => {
              const MATCH_RADIUS = 200; 
              const matchedWorkSite = workSites?.find(ws => getDistanceInMeters(ws.lat, ws.lng, p.lat, p.lng) <= MATCH_RADIUS);
              const isMainWorkSite = getDistanceInMeters(workLat, workLng, p.lat, p.lng) <= MATCH_RADIUS;
              const locationText = (p as any).locationName || (matchedWorkSite ? matchedWorkSite.name : (isMainWorkSite ? workName : null));
              let color = '#3b82f6';
              if (i === 0) color = '#16a34a';
              else if (i === displayPoints.length - 1) color = '#8b5cf6';
              
              return {
                coordinates: [p.lat, p.lng] as [number, number],
                color,
                title: `${p.type}\n${new Date(p.time).toLocaleTimeString()}`,
                size: (p.type === 'traveling' || p.type === 'working') ? 0.6 : 1
              };
            }),
            ...(hideWorkSite ? [] : (hasMultiSite && workSites ? workSites.map((ws, i) => ({
              coordinates: [ws.lat, ws.lng] as [number, number],
              color: '#ef4444',
              title: `${ws.name} — Work Site ${i + 1}`,
              size: 1.2
            })) : [{
              coordinates: [workLat, workLng] as [number, number],
              color: '#ef4444',
              title: workName || 'Assigned Site',
              size: 1.2
            }]))
          ]}
          circles={[
            ...(hasMultiSite ? (workSites || []).filter(ws => ws.radiusMeters && ws.radiusMeters > 0).map(ws => ({
              lat: ws.lat,
              lng: ws.lng,
              radius: ws.radiusMeters!,
              color: getCircleStyle(ws.lat, ws.lng, ws.radiusMeters, ws.id).color
            })) : radiusMeters && radiusMeters > 0 ? [{
              lat: workLat,
              lng: workLng,
              radius: radiusMeters,
              color: getCircleStyle(workLat, workLng, radiusMeters).color
            }] : [])
          ]}
          height="100%"
        />
      ) : (
      <MapContainer
        center={center}
        zoom={13}
        maxZoom={21}
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
        scrollWheelZoom={true}
        attributionControl={false}
      >
        <ZoomControl position="bottomright" />
        
        <TileLayer
          maxZoom={21}
          url={mapType === 'street' 
            ? "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}" 
            : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"}
          attribution='© Google Maps'
        />
        
        <MapBounds points={chronologicallySortedPoints} workLat={workLat} workLng={workLng} workSites={workSites} />

        {/* --- LINEAR PATH RENDERING --- */}
        {processedSegments && processedSegments.length > 0 ? (
          processedSegments.map((seg, si) => {
            const segCoords = seg.points.map(p => [p.lat, p.lng] as [number, number]);
            if (segCoords.length < 2) return null;
            return (
              <Polyline 
                key={si} 
                positions={segCoords} 
                color={seg.color || "#6366f1"} 
                weight={4} 
                opacity={0.85} 
              />
            );
          })
        ) : (
          timelinePathCoords.length > 1 && (
            <Polyline 
              positions={timelinePathCoords} 
              color="#6366f1" 
              weight={4} 
              opacity={0.85} 
            />
          )
        )}

        {/* --- MARKER RENDERING (Using Event Dots and Pins) --- */}
        {displayPoints.map((p, i) => {
          const isLastEvent = i === displayPoints.length - 1;
          const statusStr = (p.type || '').toLowerCase();
          const isTrackingPoint = statusStr === 'traveling' || statusStr === 'working';

          let markerIcon;
          if (isTrackingPoint && !isLastEvent) {
            markerIcon = getEventDotIcon(p.type, p.overlapIndex, p.overlapTotal, isLastEvent);
          } else {
            let color = 'blue';
            if (i === 0) color = 'green';
            else if (isLastEvent) color = 'violet';
            markerIcon = getOffsetIcon(color, p.overlapIndex, p.overlapTotal);
          }

          const MATCH_RADIUS = 200; 
          
          const matchedWorkSite = workSites?.find(ws => 
            getDistanceInMeters(ws.lat, ws.lng, p.lat, p.lng) <= MATCH_RADIUS
          );
          
          const isMainWorkSite = getDistanceInMeters(workLat, workLng, p.lat, p.lng) <= MATCH_RADIUS;
          const locationText = (p as any).locationName || (matchedWorkSite ? matchedWorkSite.name : (isMainWorkSite ? workName : null));

          return (
            <Marker 
              key={`pt-${i}-${p.lat}-${p.lng}`} 
              position={[p.lat, p.lng]} 
              icon={markerIcon}
            >
              <Tooltip permanent={false} direction="top">
                <div className="flex flex-col gap-0.5 min-w-max">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-800">
                      {locationText ? `${locationText} - ${p.type}` : p.type}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">{p.time}</span>
                </div>
              </Tooltip>
            </Marker>
          );
        })}

        {/* --- WORK SITE RENDERING (Using Large Pins) --- */}
        {hasMultiSite ? (
          workSites!.map((ws, si) => (
            <div key={`ws-${si}`}>
              <Marker position={[ws.lat, ws.lng]} icon={getOffsetIcon(ws.color || SITE_COLORS[si % SITE_COLORS.length], 0, 1)}>
                <Tooltip direction="top">
                  <span className="text-xs font-bold">{ws.name}</span>
                  <br />
                  <span className="text-xs text-gray-500">Work Site {si + 1}</span>
                </Tooltip>
              </Marker>
              {ws.radiusMeters && ws.radiusMeters > 0 && (
                <Circle
                  center={[ws.lat, ws.lng]}
                  radius={ws.radiusMeters}
                  pathOptions={getCircleStyle(ws.lat, ws.lng, ws.radiusMeters, ws.id)}
                />
              )}
            </div>
          ))
        ) : (
          <>
            {/* SINGLE WORK SITE MARKER */}
            {!hideWorkSite && (
              <Marker position={[workLat, workLng]} icon={getOffsetIcon('red', 0, 1)}>
                <Tooltip direction="top">
                  <span className="text-xs font-bold">{workName}</span>
                  <br />
                  <span className="text-xs text-gray-500">Assigned Site</span>
                </Tooltip>
              </Marker>
            )}
            {!hideWorkSite && radiusMeters && radiusMeters > 0 && (
              <Circle
                center={[workLat, workLng]}
                radius={radiusMeters}
                pathOptions={getCircleStyle(workLat, workLng, radiusMeters)}
              />
            )}
          </>
        )}
      </MapContainer>
      )}
    </div>
  );
}