/**
 * TravelRouteViewer.tsx
 *
 * A modal that displays an employee's full travel route on a Leaflet map.
 * Shows the GPS breadcrumb polyline, start/end markers, and a summary panel.
 */
import { useEffect, useState } from 'react';
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Tooltip,
  ZoomControl,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Navigation, Clock, Ruler, Gauge, Maximize2, Minimize2, MapPin } from 'lucide-react';
import { getTravelLogs, TravelBreadcrumb, classifySpeed } from '../../../lib/travelTrackingService';
import { useSettingsStore } from '../../../stores/settingsStore';
import { supabase } from '../../../lib/supabase';
import { GoogleMap, PolylineF as GooglePolyline } from '@react-google-maps/api';
import AdvancedMarker from './AdvancedMarker';
import { useGoogleMaps } from '../../../contexts/GoogleMapsContext';
const MAP_ID = 'DEMO_MAP_ID';



// Helper to generate modern SVG map pins for Google Maps
const getPinIconUrl = (color: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${color}"><path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z"></path><circle cx="12" cy="8" r="3" fill="white"></circle></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
};

const getLeafletPinIcon = (color: string) => L.divIcon({
  className: 'bg-transparent border-none',
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${color}"><path d="M12 0C7.58 0 4 3.58 4 8c0 5.25 8 16 8 16s8-10.75 8-16c0-4.42-3.58-8-8-8z"></path><circle cx="12" cy="8" r="3" fill="white"></circle></svg>`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  tooltipAnchor: [0, -32],
});

const startIcon = getLeafletPinIcon('#16a34a');
const endIcon = getLeafletPinIcon('#dc2626');

// Fit map to all breadcrumb bounds
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 0) {
      const bounds = L.latLngBounds(coords);
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [coords, map]);
  return null;
}

interface TravelRouteViewerProps {
  timestampId: string;
  employeeName: string;
  clockInTime: string;
  clockOutTime?: string;
  clockInLat?: number | null;
  clockInLng?: number | null;
  clockOutLat?: number | null;
  clockOutLng?: number | null;
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  plannedDistanceMeters?: number | null;
  roadsApiWarnings?: string[] | null;
  onClose: () => void;
  clockOutLabel?: string;
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

export default function TravelRouteViewer({
  timestampId,
  employeeName,
  clockInTime,
  clockOutTime,
  clockInLat,
  clockInLng,
  clockOutLat,
  clockOutLng,
  totalDistanceMeters = 0,
  totalDurationSeconds = 0,
  plannedDistanceMeters,
  roadsApiWarnings,
  onClose,
  clockOutLabel,
}: TravelRouteViewerProps) {
  const [logs, setLogs] = useState<TravelBreadcrumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [mapType, setMapType] = useState<'map' | 'satellite' | '3d'>('map');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [googleMap, setGoogleMap] = useState<google.maps.Map | null>(null);
  const [fetchedPlannedDistance, setFetchedPlannedDistance] = useState<number | null>(null);
  const [fetchedRoadsApiWarnings, setFetchedRoadsApiWarnings] = useState<string[] | null>(null);
  const { companySettings } = useSettingsStore();

  const isGoogleEnabled = companySettings?.google_maps_enabled && companySettings?.google_maps_api_key;
  const { isLoaded } = useGoogleMaps();

  useEffect(() => {
    let active = true;
    
    async function loadData() {
      try {
        const data = await getTravelLogs(timestampId);
        if (!active) return;
        
        let finalLogs = [...data];
        let finalClockInLat = clockInLat;
        let finalClockInLng = clockInLng;
        let finalClockOutLat = clockOutLat;
        let finalClockOutLng = clockOutLng;
        let empId: string | null = null;

        // Always attempt to fetch the attendance_timestamp to get planned_distance_meters, roads_api_warnings, and coordinates
        const { data: tsData } = await supabase
          .from('attendance_timestamp')
          .select('latitude, longitude, employee_id, planned_distance_meters, roads_api_warnings')
          .eq('id', timestampId)
          .single();
          
        if (tsData) {
          if (finalClockInLat == null && tsData.latitude != null) finalClockInLat = tsData.latitude;
          if (finalClockInLng == null && tsData.longitude != null) finalClockInLng = tsData.longitude;
          empId = tsData.employee_id;
          if (tsData.planned_distance_meters != null) setFetchedPlannedDistance(tsData.planned_distance_meters);
          if (tsData.roads_api_warnings != null) setFetchedRoadsApiWarnings(tsData.roads_api_warnings);
        }

        // Fallback: fetch Clock Out coordinates if missing
        if (clockOutTime && (finalClockOutLat == null || finalClockOutLng == null) && empId) {
          const { data: outTsData } = await supabase
            .from('attendance_timestamp')
            .select('latitude, longitude')
            .eq('employee_id', empId)
            .eq('timestamp', clockOutTime)
            .maybeSingle();
            
          if (outTsData) {
            if (outTsData.latitude != null) finalClockOutLat = outTsData.latitude;
            if (outTsData.longitude != null) finalClockOutLng = outTsData.longitude;
          }
        }

        if (finalClockInLat != null && finalClockInLng != null) {
          const hasStart = finalLogs.length > 0 && Math.abs(new Date(finalLogs[0].recorded_at).getTime() - new Date(clockInTime).getTime()) < 60000;
          if (!hasStart) {
            finalLogs.unshift({
              id: 'synthetic-in',
              start_timestamp_id: timestampId,
              latitude: finalClockInLat,
              longitude: finalClockInLng,
              cumulative_distance_meters: 0,
              recorded_at: clockInTime,
              speed_ms: null,
              accuracy: null,
              created_at: clockInTime
            } as any);
          }
        }

        if (clockOutTime && finalClockOutLat != null && finalClockOutLng != null) {
          const hasEnd = finalLogs.length > 0 && Math.abs(new Date(finalLogs[finalLogs.length - 1].recorded_at).getTime() - new Date(clockOutTime).getTime()) < 60000;
          if (!hasEnd) {
            finalLogs.push({
              id: 'synthetic-out',
              start_timestamp_id: timestampId,
              latitude: finalClockOutLat,
              longitude: finalClockOutLng,
              cumulative_distance_meters: totalDistanceMeters || 0,
              recorded_at: clockOutTime,
              speed_ms: null,
              accuracy: null,
              created_at: clockOutTime
            } as any);
          }
        }

        setLogs(finalLogs);
        setLoading(false);
      } catch (err) {
        console.error('Failed to load travel route:', err);
        if (active) setLoading(false);
      }
    }
    
    loadData();
    return () => { active = false; };
  }, [timestampId, clockInTime, clockOutTime, clockInLat, clockInLng, clockOutLat, clockOutLng, totalDistanceMeters]);

  const coords: [number, number][] = logs.map(l => [l.latitude, l.longitude]);

  const getLogLabel = (index: number) => {
    if (logs.length === 1) {
      const logTime = new Date(logs[0].recorded_at).getTime();
      const inTime = new Date(clockInTime).getTime();
      if (clockOutTime) {
        const outTime = new Date(clockOutTime).getTime();
        // If it's closer to clockOut time than clockIn time
        if (Math.abs(logTime - outTime) < Math.abs(logTime - inTime)) {
          return clockOutLabel || 'Clock Out';
        }
      }
      return 'Clock In';
    }
    if (index === 0) return 'Clock In';
    if (index === logs.length - 1) return clockOutTime ? (clockOutLabel || 'Clock Out') : 'Current Location';
    return 'Checkpoint';
  };

  const effectiveDurationSeconds = totalDurationSeconds > 0 
    ? totalDurationSeconds 
    : (clockOutTime ? Math.floor((new Date(clockOutTime).getTime() - new Date(clockInTime).getTime()) / 1000) : 0);

  const effectiveDistanceMeters = totalDistanceMeters > 0 
    ? totalDistanceMeters 
    : (logs.length > 0 ? logs[logs.length - 1].cumulative_distance_meters || 0 : 0);

  const finalPlannedDistance = plannedDistanceMeters ?? fetchedPlannedDistance;
  const finalRoadsWarnings = roadsApiWarnings ?? fetchedRoadsApiWarnings;

  const avgSpeedKmh = effectiveDurationSeconds > 0
    ? ((effectiveDistanceMeters / 1000) / (effectiveDurationSeconds / 3600)).toFixed(1)
    : '0.0';

  const maxSpeedKmh = logs.length > 0
    ? Math.max(...logs.map(l => (l.speed_ms != null ? l.speed_ms : 0))) * 3.6
    : 0;

  return (
    <div className={`fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-4'}`}>
      <div className={`bg-white shadow-2xl w-full flex flex-col overflow-hidden ${isFullscreen ? 'h-full max-w-full rounded-none' : 'max-w-4xl max-h-[90vh] rounded-2xl'}`}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center">
              <Navigation className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">{employeeName}'s Travel Route</h2>
              <p className="text-xs text-gray-500">
                {new Date(clockInTime).toLocaleString()} 
                {clockOutTime ? ` → ${new Date(clockOutTime).toLocaleTimeString()}` : ' → In progress'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            >
              {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className={`grid ${finalPlannedDistance != null ? 'grid-cols-5' : 'grid-cols-4'} gap-px bg-gray-100 border-b border-gray-100`}>
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Ruler className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Distance</p>
              <p className="text-sm font-bold text-gray-900">{formatDistance(effectiveDistanceMeters)}</p>
            </div>
          </div>
          {finalPlannedDistance != null && (
            <div className="bg-white px-4 py-3 flex items-center gap-3">
              <Ruler className="h-4 w-4 text-emerald-500 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">Planned Distance</p>
                <div className="flex items-center gap-1">
                  <p className="text-sm font-bold text-gray-900">{formatDistance(finalPlannedDistance)}</p>
                  {finalPlannedDistance > 0 && effectiveDistanceMeters > 0 && Math.abs(effectiveDistanceMeters - finalPlannedDistance) / finalPlannedDistance > 0.2 && (
                    <span className="text-[10px] bg-amber-100 text-amber-800 px-1 py-0.5 rounded font-medium ml-1">
                      {(((effectiveDistanceMeters - finalPlannedDistance) / finalPlannedDistance) * 100) > 0 ? '+' : ''}{Math.round(((effectiveDistanceMeters - finalPlannedDistance) / finalPlannedDistance) * 100)}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Clock className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Duration</p>
              <p className="text-sm font-bold text-gray-900">{formatDuration(effectiveDurationSeconds)}</p>
            </div>
          </div>
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Gauge className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avg Speed</p>
              <p className="text-sm font-bold text-gray-900">{avgSpeedKmh} km/h</p>
            </div>
          </div>
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Gauge className="h-4 w-4 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Max Speed</p>
              <p className="text-sm font-bold text-gray-900">
                {maxSpeedKmh > 0 ? `${maxSpeedKmh.toFixed(1)} km/h` : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Warnings Banner */}
        {finalRoadsWarnings && finalRoadsWarnings.length > 0 && (
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-3">
            <div className="flex items-start gap-2">
              <div className="mt-0.5 text-amber-500 shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h4 className="text-sm font-medium text-amber-800">Route Analysis Warnings</h4>
                <ul className="mt-1 text-xs text-amber-700 list-disc list-inside space-y-0.5">
                  {finalRoadsWarnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className={`flex flex-col md:flex-row ${isFullscreen ? 'flex-1 min-h-0' : 'h-[500px]'}`}>
          {/* Map */}
          <div className="w-full md:flex-1 h-[300px] md:h-full relative bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100 flex flex-col">
            {!isGoogleEnabled && (
              <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-[1000] flex bg-white rounded-md shadow-md border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setMapType('map')}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === 'map' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  Map
                </button>
                <button
                  type="button"
                  onClick={() => setMapType('satellite')}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === 'satellite' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  Satellite
                </button>
                <button
                  type="button"
                  onClick={() => setMapType('3d')}
                  className={`px-3 py-1.5 text-xs font-semibold transition-colors ${mapType === '3d' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}
                >
                  3D
                </button>
              </div>
            )}

            <div className="flex-1 w-full h-full relative">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No GPS breadcrumbs recorded for this session.
              </div>
            ) : mapType === '3d' ? (
              <MapLibre3DViewer
                center={coords[0] || [13.0827, 80.2707]}
                routes={[{ coordinates: coords, color: '#4f46e5', weight: 4 }]}
                markers={[
                  ...(coords.length > 0 ? [{
                    lat: coords[0][0],
                    lng: coords[0][1],
                    color: getLogLabel(0) === 'Clock Out' ? '#dc2626' : '#16a34a',
                    popupHTML: `<div class="font-bold ${getLogLabel(0) === 'Clock Out' ? 'text-red-700' : 'text-green-700'}">${getLogLabel(0)}</div><div class="text-xs">${new Date(logs[0].recorded_at).toLocaleString()}</div>`
                  }] : []),
                  ...(coords.length > 1 ? [{
                    lat: coords[coords.length - 1][0],
                    lng: coords[coords.length - 1][1],
                    color: '#dc2626',
                    popupHTML: `<div class="font-bold text-red-700">${getLogLabel(coords.length - 1)}</div><div class="text-xs">${new Date(logs[logs.length - 1].recorded_at).toLocaleString()}</div>`
                  }] : [])
                ]}
                height="100%"
              />
            ) : isGoogleEnabled && isLoaded ? (
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                options={{
                  mapId: MAP_ID,
                  disableDefaultUI: false,
                  mapTypeControl: true,
                  mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT },
                  streetViewControl: false,
                  fullscreenControl: true,
                }}
                onLoad={(map) => {
                  setGoogleMap(map);
                  if (coords.length > 0) {
                    const bounds = new google.maps.LatLngBounds();
                    coords.forEach(coord => bounds.extend({ lat: coord[0], lng: coord[1] }));
                    map.fitBounds(bounds);
                  }
                }}
              >
                <GooglePolyline
                  path={coords.map(c => ({ lat: c[0], lng: c[1] }))}
                  options={{ strokeColor: '#4f46e5', strokeWeight: 4, strokeOpacity: 0.85 }}
                />
                
                <AdvancedMarker 
                  map={googleMap}
                  position={{ lat: coords[0][0], lng: coords[0][1] }} 
                  iconUrl={getPinIconUrl(getLogLabel(0) === 'Clock Out' ? '#dc2626' : '#16a34a')}
                  iconSize={[32, 32]}
                  iconAnchor={[16, 32]}
                  title={showLabels ? `${getLogLabel(0)} · ${new Date(logs[0].recorded_at).toLocaleString()}` : getLogLabel(0)}
                />
                
                {coords.length > 1 && (
                  <AdvancedMarker 
                    map={googleMap}
                    position={{ lat: coords[coords.length - 1][0], lng: coords[coords.length - 1][1] }} 
                    iconUrl={getPinIconUrl('#dc2626')}
                    iconSize={[32, 32]}
                    iconAnchor={[16, 32]}
                    title={showLabels ? `${getLogLabel(coords.length - 1)} · ${new Date(logs[logs.length - 1].recorded_at).toLocaleString()}` : getLogLabel(coords.length - 1)}
                  />
                )}
              </GoogleMap>
            ) : (
              <MapContainer
                center={coords[0] || [13.0827, 80.2707]}
                zoom={14}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
                attributionControl={false}
              >
                <ZoomControl position="bottomright" />
                <FitBounds coords={coords} />

                <TileLayer
                  url={mapType === 'satellite' 
                    ? "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                    : "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"}
                  maxZoom={21}
                  attribution="© Google Maps"
                />

                {/* Route polyline */}
                <Polyline
                  positions={coords}
                  pathOptions={{
                    color: '#4f46e5',
                    weight: 4,
                    opacity: 0.85,
                    lineJoin: 'round',
                  }}
                />

                {/* Start marker */}
                <Marker position={coords[0]} icon={getLogLabel(0) === 'Clock Out' ? endIcon : startIcon}>
                  <Tooltip direction="top" offset={[0, -10]}>
                    <span className={`text-xs font-semibold ${getLogLabel(0) === 'Clock Out' ? 'text-red-700' : 'text-green-700'}`}>
                      {getLogLabel(0)} · {new Date(logs[0].recorded_at).toLocaleString()}
                    </span>
                  </Tooltip>
                </Marker>

                {/* End marker */}
                {coords.length > 1 && (
                  <Marker position={coords[coords.length - 1]} icon={endIcon}>
                    <Tooltip direction="top" offset={[0, -10]}>
                      <span className="text-xs font-semibold text-red-700">
                        {getLogLabel(coords.length - 1)} · {new Date(logs[logs.length - 1].recorded_at).toLocaleString()}
                      </span>
                    </Tooltip>
                  </Marker>
                )}
              </MapContainer>
            )}
            </div>
          </div>

          {/* Timeline History */}
          <div className="w-full md:w-72 h-[200px] md:h-full bg-white flex flex-col">
            <div className="p-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
              <h3 className="text-sm font-semibold text-gray-900">GPS Checkpoints</h3>
              <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                {logs.length}
              </span>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {logs.map((log, index) => {
                const label = getLogLabel(index);
                const state = classifySpeed(log.speed_ms);
                const dotColor =
                  label === 'Clock In' ? 'bg-green-500' :
                  label === 'Clock Out' || label === 'Current Location' ? 'bg-red-500' :
                  state === 'driving' ? 'bg-blue-500' :
                  state === 'walking' ? 'bg-yellow-400' :
                  'bg-indigo-400';

                const speedBadgeColor =
                  state === 'driving' ? 'bg-blue-50 text-blue-700' :
                  state === 'walking' ? 'bg-yellow-50 text-yellow-700' :
                  state === 'stationary' ? 'bg-gray-100 text-gray-500' : '';

                return (
                  <div key={index} className="flex gap-3">
                    <div className="flex flex-col items-center mt-1">
                      {label === 'Clock In' || label === 'Clock Out' || label === 'Current Location' ? (
                        <div className={`p-1 rounded-full shrink-0 ${label === 'Clock In' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                          <MapPin className="w-3 h-3" />
                        </div>
                      ) : (
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotColor}`}></div>
                      )}
                      {index !== logs.length - 1 && <div className="w-0.5 h-full bg-gray-200 my-1"></div>}
                    </div>
                    <div className="pb-2">
                      <p className="text-xs font-medium text-gray-900 leading-tight">
                        {label}
                      </p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{new Date(log.recorded_at).toLocaleString()}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {log.accuracy && <p className="text-[9px] text-gray-400">Acc: {Math.round(log.accuracy)}m</p>}
                        {log.speed_ms != null && (
                          <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${speedBadgeColor}`}>
                            {state === 'driving' ? '🚗' : state === 'walking' ? '🚶' : '•'} {(log.speed_ms * 3.6).toFixed(1)} km/h
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {logs.length === 0 && (
                <div className="text-center text-xs text-gray-400 mt-4">
                  No checkpoints found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-500 flex justify-end items-center bg-gray-50">
          <span>Route shown on Google Maps</span>
        </div>
      </div>
    </div>
  );
}
