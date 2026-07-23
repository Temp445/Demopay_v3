import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Circle,
  Polyline,
  ZoomControl
} from 'react-leaflet';
import { Activity, RefreshCw, Users, MapPin, Clock, Target, AlertTriangle, PauseCircle, ArrowLeft } from 'lucide-react';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { WorkLocation } from '../../../types/workLocation';
import MapLibre3DViewer from './MapLibre3DViewer';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const activeWorkerIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const workSiteIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function LiveTrackingDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const targetWorkId = searchParams.get('workId');

  const { currentTenant } = useTenant();
  const { workLocations, loading, fetchWorkLocations } = useWorkLocationsStore();
  const { settings: locationSettings } = useLocationSettingsStore();
  const [activeWorks, setActiveWorks] = useState<WorkLocation[]>([]);
  const [latestTracking, setLatestTracking] = useState<Map<string, any>>(new Map());
  const [selectedWork, setSelectedWork] = useState<WorkLocation | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  const [mapType, setMapType] = useState<'street' | 'satellite' | '3d'>('street');
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentTenant) {
      loadData();
    }
  }, [currentTenant]);

  const loadData = async () => {
    if (!currentTenant) return;
    await fetchWorkLocations(currentTenant.id);
  };

  useEffect(() => {
    const fetchActiveState = async () => {
      const candidates = workLocations.filter((wl) => ['assigned', 'in_progress', 'paused'].includes(wl.status));

      const newTrackingMap = new Map<string, any>();
      const trulyActive: WorkLocation[] = [];

      for (const work of candidates) {
        try {
          const { data, error } = await supabase
            .from('journey_tracking_logs')
            .select('*')
            .eq('work_location_id', work.id)
            .order('timestamp', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (data && !error) {
            if (work.status === 'assigned') {
              const activeJourneyEvents = ['START_JOURNEY', 'LIVE_TRACK_JOURNEY', 'REACHED_LOCATION', 'GPS_SIGNAL_LOST', 'GPS_SIGNAL_RESTORED', 'LIVE_TRACK_WORK'];
              if (!activeJourneyEvents.includes(data.event_type)) {
                continue;
              }
            }

            trulyActive.push(work);

            newTrackingMap.set(work.id, {
              latitude: data.latitude,
              longitude: data.longitude,
              recorded_at: data.timestamp,
              event_type: data.event_type,
            });
          } else if (work.status === 'in_progress' || work.status === 'paused') {
            trulyActive.push(work);
          }
        } catch (error) {
          console.error('Failed to fetch initial tracking for', work.id, error);
        }
      }

      setActiveWorks(trulyActive);
      setLatestTracking(newTrackingMap);

      // Auto-Select worker if directed from another page via ?workId=...
      if (targetWorkId) {
        const targetLocation = trulyActive.find(w => w.id === targetWorkId);
        if (targetLocation) {
          setSelectedWork(targetLocation);
        }
      }
    };

    if (workLocations.length > 0) {
      fetchActiveState();
    }
  }, [workLocations, targetWorkId]);

  // Automatically center the map whenever `selectedWork` changes
  useEffect(() => {
    if (selectedWork && mapRef.current) {
      const tracking = latestTracking.get(selectedWork.id);
      if (tracking && tracking.latitude && tracking.longitude) {
        mapRef.current.setView([Number(tracking.latitude), Number(tracking.longitude)], 15);
      } else {
        mapRef.current.setView([Number(selectedWork.latitude), Number(selectedWork.longitude)], 15);
      }
    }
  }, [selectedWork, latestTracking]);

  // Real-time Subscription AND Admin Notification Alerts
  useEffect(() => {
    if (!currentTenant?.id || !autoRefresh) return;

    const trackingSubscription = supabase
      .channel('public:journey_tracking_logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'journey_tracking_logs',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        (payload) => {
          const newLog = payload.new as any;
          if (!newLog.work_location_id || !newLog.latitude || !newLog.longitude) return;

          setLatestTracking((prev) => {
            const newMap = new Map(prev);
            newMap.set(newLog.work_location_id, {
              latitude: newLog.latitude || prev.get(newLog.work_location_id)?.latitude,
              longitude: newLog.longitude || prev.get(newLog.work_location_id)?.longitude,
              recorded_at: newLog.timestamp,
              event_type: newLog.event_type,
            });
            return newMap;
          });

          if (newLog.event_type === 'START_JOURNEY' || newLog.event_type === 'COMPLETE_WORK') {
            fetchWorkLocations(currentTenant.id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(trackingSubscription);
    };
  }, [currentTenant?.id, autoRefresh, fetchWorkLocations]);

  const calculateMapCenter = (): [number, number] => {
    if (activeWorks.length === 0) return [13.0827, 80.2707];
    if (selectedWork) return [Number(selectedWork.latitude), Number(selectedWork.longitude)];

    const avgLat = activeWorks.reduce((sum, w) => sum + Number(w.latitude), 0) / activeWorks.length;
    const avgLng = activeWorks.reduce((sum, w) => sum + Number(w.longitude), 0) / activeWorks.length;

    if (isNaN(avgLat) || isNaN(avgLng)) return [13.0827, 80.2707];

    return [avgLat, avgLng];
  };

  const isWithinRadius = (work: WorkLocation, tracking: any) => {
    if (!tracking.latitude || !tracking.longitude) return true;
    const R = 6371e3; // metres
    const φ1 = (Number(work.latitude) * Math.PI) / 180;
    const φ2 = (Number(tracking.latitude) * Math.PI) / 180;
    const Δφ = ((Number(tracking.latitude) - Number(work.latitude)) * Math.PI) / 180;
    const Δλ = ((Number(tracking.longitude) - Number(work.longitude)) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;

    tracking.calculated_distance = distance;

    return distance <= Number(work.allowed_radius_meters);
  };

  const isSignalLost = (tracking: any | undefined) => {
    if (!tracking || !tracking.recorded_at) return false;
    if (tracking.event_type === 'GPS_SIGNAL_LOST') return true;

    const maxDelayMins = (locationSettings?.journey_tracking_interval_mins || 5) + 2;
    return differenceInMinutes(currentTime, parseISO(tracking.recorded_at)) >= maxDelayMins;
  };

  if (loading && workLocations.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard/location-tracking')}
            className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors flex items-center justify-center"
            title="Back to Locations"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Activity className="h-6 w-6 text-green-600" />
              Live Employee Tracking
            </h1>
            <p className="text-sm text-gray-600 mt-1">
              Real-time location monitoring for active work assignments
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 space-y-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                Active Workers ({activeWorks.length})
              </h3>
            </div>

            {activeWorks.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No active workers</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto pr-2">
                {activeWorks.map((work) => {
                  const tracking = latestTracking.get(work.id);
                  const withinRadius = tracking ? isWithinRadius(work, tracking) : true;
                  const signalLost = isSignalLost(tracking);
                  const isTraveling = work.status === 'assigned';

                  return (
                    <button
                      key={work.id}
                      onClick={() => {
                        setSelectedWork(work);
                      }}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${selectedWork?.id === work.id
                        ? 'border-blue-500 bg-blue-50'
                        : signalLost
                          ? 'border-gray-200 bg-gray-50 opacity-80'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                        }`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {work.employee_name}
                            {work.status === 'paused' ? (
                              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                                <PauseCircle className="h-3 w-3" /> PAUSED
                              </span>
                            ) : work.status === 'assigned' ? (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold ${signalLost ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                TRAVELING {signalLost ? '(OFFLINE)' : ''}
                              </span>
                            ) : signalLost ? (
                              <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                                OFFLINE
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{work.location_name}</div>
                        </div>
                        {!withinRadius && !signalLost && !isTraveling && (
                          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        )}
                      </div>

                      {tracking ? (
                        <div className="space-y-1">
                          <div className={`flex items-center gap-1 text-xs ${signalLost ? 'text-gray-400 font-medium' : 'text-gray-600'}`}>
                            <Clock className="h-3 w-3" />
                            {signalLost ? 'Signal lost at ' : 'Last update '} {format(new Date(tracking.recorded_at), 'hh:mm:ss a')}
                          </div>
                          {tracking.calculated_distance !== undefined && !isTraveling && (
                            <div className={`flex items-center gap-1 text-xs ${signalLost ? 'text-gray-400' : withinRadius ? 'text-green-600' : 'text-red-600'}`}>
                              <Target className="h-3 w-3" />
                              Gap from center: {tracking.calculated_distance.toFixed(1)}m
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400 italic mt-2">Waiting for GPS signal...</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="col-span-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-600" />
                Live Locations Map
              </h3>
            </div>

            <div className="border border-gray-300 rounded-lg overflow-hidden relative" style={{ height: 'calc(100vh - 280px)' }}>

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
                  center={calculateMapCenter()}
                  height="100%"
                  circles={activeWorks.map(work => {
                    const tracking = latestTracking.get(work.id);
                    const withinRadius = tracking ? isWithinRadius(work, tracking) : true;
                    const signalLost = isSignalLost(tracking);
                    const isTraveling = work.status === 'assigned';
                    
                    return {
                      lat: Number(work.latitude),
                      lng: Number(work.longitude),
                      radius: Number(work.allowed_radius_meters),
                      color: signalLost ? '#9ca3af' : isTraveling ? '#3b82f6' : withinRadius ? '#22c55e' : '#ef4444'
                    };
                  })}
                  markers={[
                    ...activeWorks.map(work => ({
                      lat: Number(work.latitude),
                      lng: Number(work.longitude),
                      color: '#ef4444',
                      popupHTML: `<div class="font-bold">${work.location_name}</div><div class="text-xs">Assigned Site Center</div>`
                    })),
                    ...activeWorks.filter(w => latestTracking.get(w.id)).map(work => {
                      const tracking = latestTracking.get(work.id)!;
                      const withinRadius = isWithinRadius(work, tracking);
                      const signalLost = isSignalLost(tracking);
                      const isTraveling = work.status === 'assigned';
                      
                      let color = '#3b82f6';
                      if (signalLost) color = '#9ca3af';
                      else if (!isTraveling && withinRadius) color = '#22c55e';
                      else if (!isTraveling && !withinRadius) color = '#ef4444';

                      return {
                        lat: Number(tracking.latitude),
                        lng: Number(tracking.longitude),
                        color,
                        popupHTML: `<div class="font-bold">${work.employee_name}</div><div class="text-xs font-semibold" style="color:${color}">${isTraveling ? 'En Route to Site' : withinRadius ? 'Within allowed area' : 'Outside allowed area'}</div><div class="text-[10px] text-gray-500 mt-1">Last Update: ${new Date(tracking.recorded_at).toLocaleTimeString()}</div>`
                      };
                    })
                  ]}
                  routes={activeWorks.map(work => {
                    const tracking = latestTracking.get(work.id);
                    if (!tracking) return null;
                    return {
                      coordinates: [[Number(work.latitude), Number(work.longitude)], [Number(tracking.latitude), Number(tracking.longitude)]] as [number, number][],
                      color: '#9ca3af',
                      dashArray: [4, 4],
                      weight: 2
                    };
                  }).filter(Boolean) as any}
                />
              ) : (
              <MapContainer
                center={calculateMapCenter()}
                zoom={selectedWork ? 15 : 12}
                maxZoom={21}
                style={{ height: '100%', width: '100%' }}
                ref={mapRef}
                zoomControl={false}
                attributionControl={false}
              >
                <ZoomControl position="bottomright" />

                <TileLayer
                  maxZoom={21}
                  url={mapType === 'street'
                    ? "https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
                    : "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"}
                  attribution='&copy; Google Maps'
                />

                {activeWorks.map((work) => {
                  const tracking = latestTracking.get(work.id);
                  const withinRadius = tracking ? isWithinRadius(work, tracking) : true;
                  const signalLost = isSignalLost(tracking);
                  const isTraveling = work.status === 'assigned';

                  const workLat = Number(work.latitude);
                  const workLng = Number(work.longitude);
                  const radiusMeters = Number(work.allowed_radius_meters);

                  return (
                    <div key={work.id}>
                      <Marker position={[workLat, workLng]} icon={workSiteIcon}>
                        <Popup>
                          <div className="text-sm">
                            <div className="font-semibold mb-1">{work.location_name}</div>
                            <div className="text-gray-600 mb-1">Employee: {work.employee_name}</div>
                            <div className="text-xs font-bold mt-1 text-red-600">Assigned Site Center</div>
                          </div>
                        </Popup>
                      </Marker>

                      <Circle
                        center={[workLat, workLng]}
                        radius={radiusMeters}
                        pathOptions={{
                          color: signalLost ? 'gray' : isTraveling ? '#3b82f6' : withinRadius ? 'green' : 'red',
                          fillColor: signalLost ? 'gray' : isTraveling ? '#3b82f6' : withinRadius ? 'green' : 'red',
                          fillOpacity: 0.1,
                          weight: 2,
                        }}
                      />

                      {tracking && tracking.latitude && tracking.longitude && (
                        <>
                          <Marker position={[Number(tracking.latitude), Number(tracking.longitude)]} icon={activeWorkerIcon}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold mb-1">{work.employee_name}</div>
                                {work.status === 'paused' && (
                                  <div className="text-xs font-bold text-yellow-600 mt-1 mb-1">Currently Auto-Paused</div>
                                )}
                                {signalLost && (
                                  <div className="text-xs font-bold text-gray-500 mt-1 mb-1">GPS Signal Lost / Offline</div>
                                )}
                                <div className={`text-xs mb-1 font-bold ${signalLost ? 'text-gray-500' : isTraveling ? 'text-blue-600' : withinRadius ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                  {isTraveling ? 'En Route to Site' : withinRadius ? 'Within allowed area' : 'Outside allowed area'}
                                </div>
                                <div className={`text-xs ${signalLost ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {signalLost ? 'Signal lost at: ' : 'Last update: '} {format(new Date(tracking.recorded_at), 'hh:mm:ss a')}
                                </div>
                                {tracking.calculated_distance !== undefined && (
                                  <div className={`text-xs ${signalLost ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Distance from center: {tracking.calculated_distance.toFixed(1)}m
                                  </div>
                                )}
                              </div>
                            </Popup>
                          </Marker>

                          <Polyline
                            positions={[
                              [workLat, workLng],
                              [Number(tracking.latitude), Number(tracking.longitude)]
                            ]}
                            pathOptions={{
                              color: signalLost ? '#9ca3af' : isTraveling ? '#3b82f6' : withinRadius ? '#4ade80' : '#ef4444',
                              dashArray: '5, 10',
                              weight: 2,
                              opacity: 0.7
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              </MapContainer>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                Assigned Work Site
              </div>
              <div className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                Employee Live Location
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-4 border-2 border-green-500 rounded-full" />
                Allowed Radius
              </div>
              <div className="flex items-center gap-1">
                <div className="w-4 h-0 border-t-2 border-dashed border-gray-400" />
                Distance Gap Line
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}