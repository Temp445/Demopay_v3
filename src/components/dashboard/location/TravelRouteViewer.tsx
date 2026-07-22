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
import { X, Navigation, Clock, Ruler, Gauge } from 'lucide-react';
import { getTravelLogs, TravelBreadcrumb } from '../../../lib/travelTrackingService';

// --- Custom icons ---
const startIcon = L.divIcon({
  className: '',
  html: `<div style="background:#16a34a;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const endIcon = L.divIcon({
  className: '',
  html: `<div style="background:#dc2626;width:14px;height:14px;border-radius:50%;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

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
  totalDistanceMeters?: number;
  totalDurationSeconds?: number;
  onClose: () => void;
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
  totalDistanceMeters = 0,
  totalDurationSeconds = 0,
  onClose,
}: TravelRouteViewerProps) {
  const [logs, setLogs] = useState<TravelBreadcrumb[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLabels, setShowLabels] = useState(true);

  useEffect(() => {
    getTravelLogs(timestampId).then(data => {
      setLogs(data);
      setLoading(false);
    });
  }, [timestampId]);

  const coords: [number, number][] = logs.map(l => [l.latitude, l.longitude]);

  const avgSpeedKmh = totalDurationSeconds > 0
    ? ((totalDistanceMeters / 1000) / (totalDurationSeconds / 3600)).toFixed(1)
    : '0.0';

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
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
          <button
            onClick={onClose}
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-3 gap-px bg-gray-100 border-b border-gray-100">
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Ruler className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total Distance</p>
              <p className="text-sm font-bold text-gray-900">{formatDistance(totalDistanceMeters)}</p>
            </div>
          </div>
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Clock className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Duration</p>
              <p className="text-sm font-bold text-gray-900">{formatDuration(totalDurationSeconds)}</p>
            </div>
          </div>
          <div className="bg-white px-4 py-3 flex items-center gap-3">
            <Gauge className="h-4 w-4 text-indigo-500 flex-shrink-0" />
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">Avg Speed</p>
              <p className="text-sm font-bold text-gray-900">{avgSpeedKmh} km/h</p>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-col md:flex-row h-[500px]">
          {/* Map */}
          <div className="w-full md:flex-1 h-[300px] md:h-full relative bg-gray-50 border-b md:border-b-0 md:border-r border-gray-100">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin h-8 w-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
              </div>
            ) : logs.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                No GPS breadcrumbs recorded for this session.
              </div>
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
                  url="https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
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
                <Marker position={coords[0]} icon={startIcon}>
                  {showLabels && (
                    <Tooltip permanent direction="top" offset={[0, -10]}>
                      <span className="text-xs font-semibold text-green-700">
                        Clock In · {new Date(logs[0].recorded_at).toLocaleString()}
                      </span>
                    </Tooltip>
                  )}
                </Marker>

                {/* End marker */}
                {coords.length > 1 && (
                  <Marker position={coords[coords.length - 1]} icon={endIcon}>
                    {showLabels && (
                      <Tooltip permanent direction="top" offset={[0, -10]}>
                        <span className="text-xs font-semibold text-red-700">
                          {clockOutTime ? 'Clock Out' : 'Current Location'} · {new Date(logs[logs.length - 1].recorded_at).toLocaleString()}
                        </span>
                      </Tooltip>
                    )}
                  </Marker>
                )}
              </MapContainer>
            )}
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
              {logs.map((log, index) => (
                <div key={index} className="flex gap-3">
                  <div className="flex flex-col items-center mt-1">
                    <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${index === 0 ? 'bg-green-500' : index === logs.length - 1 ? 'bg-red-500' : 'bg-indigo-400'}`}></div>
                    {index !== logs.length - 1 && <div className="w-0.5 h-full bg-gray-200 my-1"></div>}
                  </div>
                  <div className="pb-2">
                    <p className="text-xs font-medium text-gray-900 leading-tight">
                      {index === 0 ? 'Clock In' : index === logs.length - 1 ? (clockOutTime ? 'Clock Out' : 'Current Location') : 'Checkpoint'}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{new Date(log.recorded_at).toLocaleString()}</p>
                    {log.accuracy && <p className="text-[9px] text-gray-400 mt-0.5">Acc: {Math.round(log.accuracy)}m</p>}
                  </div>
                </div>
              ))}
              {logs.length === 0 && (
                <div className="text-center text-xs text-gray-400 mt-4">
                  No checkpoints found.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between items-center bg-gray-50">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showLabels}
              onChange={(e) => setShowLabels(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 h-4 w-4"
            />
            <span className="font-medium text-gray-700">Show Map Labels</span>
          </label>
          <span>Route shown on Google Maps</span>
        </div>
      </div>
    </div>
  );
}
