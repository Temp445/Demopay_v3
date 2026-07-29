import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { Activity, RefreshCw, Users, MapPin, Clock, Target, AlertTriangle, PauseCircle, ArrowLeft, Search, Filter, X } from 'lucide-react';
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

const getEmployeeColor = (name: string, code?: string) => {
  const str = code || name || 'A';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 40%)`;
};

const getEmployeeIcon = (name: string, code?: string) => {
  const color = getEmployeeColor(name, code);

  return new L.DivIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
      "></div>
    `,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
    popupAnchor: [0, -7]
  });
};

const workSiteIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const LiveTrackingRoute = ({
  start,
  end,
  pathOptions,
  shouldFetchOptimized
}: {
  start: [number, number];
  end: [number, number];
  pathOptions: any;
  shouldFetchOptimized: boolean;
}) => {
  const [routedPositions, setRoutedPositions] = useState<[number, number][] | null>(null);

  useEffect(() => {
    let active = true;
    if (shouldFetchOptimized) {
      const fetchRoute = async () => {
        try {
          const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?overview=full&geometries=geojson`);
          const data = await response.json();
          if (data.code === 'Ok' && data.routes.length > 0 && active) {
            const coords = data.routes[0].geometry.coordinates.map((c: [number, number]) => [c[1], c[0]]);
            setRoutedPositions(coords);
          }
        } catch (error) {
          console.error("OSRM route fetch failed", error);
        }
      };
      fetchRoute();
    } else {
      setRoutedPositions(null);
    }
    return () => { active = false; };
  }, [shouldFetchOptimized, start[0], start[1], end[0], end[1]]);

  if (routedPositions) {
     return <Polyline positions={routedPositions} pathOptions={{ ...pathOptions, dashArray: undefined }} />;
  }

  return (
    <Polyline
      positions={[start, end]}
      pathOptions={pathOptions}
    />
  );
};

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
  const activeWorksRef = useRef<WorkLocation[]>([]);

  // --- Enterprise: Search & Filter state ---
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'traveling' | 'working' | 'paused' | 'offline'>('all');

  // --- Enterprise: Debounce buffer for Realtime WebSocket updates ---
  // Instead of calling setLatestTracking on every single incoming GPS ping,
  // we accumulate all changes in a ref and flush to state every 500ms.
  // This prevents excessive React re-renders when many employees are pinging simultaneously.
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);




  const fetchActiveState = useCallback(async () => {
    if (!currentTenant) return;
      const { data: outsideData } = await supabase
        .from('outside_office_approvals')
        .select(`*, employees!employee_id(name, employee_code, email)`)
        .eq('tenant_id', currentTenant.id)
        .in('status', ['pending', 'approved'])
        .is('clock_out_time', null)
        .is('inside_office_clock_in_time', null);

      const outsideOfficeMocks = (outsideData || []).map((req: any) => ({
        id: `outside_${req.id}`,
        employee_id: req.employee_id,
        employee_name: req.employees?.name || 'Outside Worker',
        employee_email: req.employees?.email || '',
        location_name: 'Outside Office',
        formatted_address: req.attendance_location || 'Remote Work',
        latitude: 0,
        longitude: 0,
        allowed_radius_meters: 50,
        status: 'in_progress',
        created_at: req.clock_in_time,
        is_outside_office: true
      }));

      const candidates = [...workLocations.filter((wl) => ['assigned', 'in_progress', 'paused'].includes(wl.status)), ...outsideOfficeMocks];

      const newTrackingMap = new Map<string, any>();
      const trulyActive: WorkLocation[] = [];

      for (const work of candidates) {
        try {
          let data, error;
          if ((work as any).is_outside_office) {
            const res = await supabase
              .from('attendance_travel_logs')
              .select('*')
              .eq('employee_id', work.employee_id)
              .gte('recorded_at', work.created_at)
              .order('recorded_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            
            if (res.data) {
              data = {
                latitude: res.data.latitude,
                longitude: res.data.longitude,
                timestamp: res.data.recorded_at,
                event_type: 'LIVE_TRACK_JOURNEY',
              };
            }
            error = res.error;
          } else {
            const { data: journeyData, error: journeyError } = await supabase
              .from('journey_tracking_logs')
              .select('*')
              .eq('work_location_id', work.id)
              .order('timestamp', { ascending: false })
              .limit(1)
              .maybeSingle();
              
            const { data: workData, error: workError } = await supabase
              .from('work_location_tracking')
              .select('*')
              .eq('work_location_id', work.id)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle();

            let latestData = journeyData;
            let isWorkData = false;

            if (workData && journeyData) {
              if (new Date(workData.created_at) > new Date(journeyData.timestamp)) {
                latestData = workData;
                isWorkData = true;
              }
            } else if (workData) {
              latestData = workData;
              isWorkData = true;
            }

            if (latestData) {
              data = {
                latitude: latestData.latitude,
                longitude: latestData.longitude,
                timestamp: isWorkData ? latestData.created_at : latestData.timestamp,
                event_type: isWorkData ? 'LIVE_TRACK_WORK' : latestData.event_type
              };
            }
            error = journeyError || workError;
          }

          if (data && !error) {
            if (work.status === 'assigned') {
              const activeJourneyEvents = ['START_JOURNEY', 'LIVE_TRACK_JOURNEY', 'REACHED_LOCATION', 'GPS_SIGNAL_LOST', 'GPS_SIGNAL_RESTORED', 'LIVE_TRACK_WORK', 'HEARTBEAT'];
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
      activeWorksRef.current = trulyActive;
      setLatestTracking(newTrackingMap);

      // Auto-Select worker if directed from another page via ?workId=...
      if (targetWorkId) {
        const targetLocation = trulyActive.find(w => w.id === targetWorkId);
        if (targetLocation) {
          setSelectedWork(targetLocation);
        }
      }
    }, [workLocations, targetWorkId, currentTenant]);

  useEffect(() => {
    if (workLocations.length > 0 || currentTenant) {
      fetchActiveState();
    }
  }, [workLocations, targetWorkId, currentTenant, fetchActiveState]);



  const loadData = async () => {
    if (!currentTenant) return;
    await fetchWorkLocations(currentTenant.id);
    await fetchActiveState();
  };

  useEffect(() => {
    if (currentTenant) {
      loadData();
    }
  }, [currentTenant, fetchWorkLocations, fetchActiveState]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWork]);

  // Real-time Subscription with Debounced State Updates
  useEffect(() => {
    if (!currentTenant?.id || !autoRefresh) return;

    // Flush buffered WebSocket updates to React state every 500ms
    const flushTimer = setInterval(() => {
      if (pendingUpdatesRef.current.size === 0) return;
      const updates = new Map(pendingUpdatesRef.current);
      pendingUpdatesRef.current.clear();
      setLatestTracking(prev => {
        const newMap = new Map(prev);
        updates.forEach((value, key) => newMap.set(key, value));
        return newMap;
      });
    }, 500);

    const trackingSubscription = supabase
      .channel('public:tracking_logs')
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
          if (!newLog.work_location_id) return;

          const prev = pendingUpdatesRef.current.get(newLog.work_location_id);
          pendingUpdatesRef.current.set(newLog.work_location_id, {
            latitude: newLog.latitude || prev?.latitude,
            longitude: newLog.longitude || prev?.longitude,
            recorded_at: newLog.timestamp,
            event_type: newLog.event_type,
          });

          if (newLog.event_type === 'START_JOURNEY' || newLog.event_type === 'COMPLETE_WORK') {
            fetchWorkLocations(currentTenant.id);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'attendance_travel_logs',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        (payload) => {
          const newLog = payload.new as any;
          const outsideWorker = activeWorksRef.current.find(w => (w as any).is_outside_office && w.employee_id === newLog.employee_id);
          if (outsideWorker) {
            const prev = pendingUpdatesRef.current.get(outsideWorker.id);
            pendingUpdatesRef.current.set(outsideWorker.id, {
              latitude: newLog.latitude || prev?.latitude,
              longitude: newLog.longitude || prev?.longitude,
              recorded_at: newLog.recorded_at,
              event_type: 'LIVE_TRACK_JOURNEY',
            });
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'work_location_tracking',
          filter: `tenant_id=eq.${currentTenant.id}`
        },
        (payload) => {
          const newLog = payload.new as any;
          if (!newLog.work_location_id) return;

          const prev = pendingUpdatesRef.current.get(newLog.work_location_id);
          pendingUpdatesRef.current.set(newLog.work_location_id, {
            latitude: newLog.latitude || prev?.latitude,
            longitude: newLog.longitude || prev?.longitude,
            recorded_at: newLog.created_at,
            event_type: 'LIVE_TRACK_WORK',
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(flushTimer);
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
    if ((work as any).is_outside_office) return true;
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

    const nonTrackingEvents = ['REACHED_ENDPOINT', 'PAUSE_WORK', 'COMPLETE_WORK'];
    if (nonTrackingEvents.includes(tracking.event_type)) return false;
    if (!locationSettings?.radius_monitoring_enabled && ['START_WORK', 'RESUME_WORK'].includes(tracking.event_type)) return false;

    const maxDelayMins = (locationSettings?.journey_tracking_interval_mins || 5) + 2;
    return differenceInMinutes(currentTime, parseISO(tracking.recorded_at)) >= maxDelayMins;
  };

  // --- Enterprise: Computed filtered + searched list ---
  const filteredWorks = useMemo(() => {
    return activeWorks.filter(work => {
      const tracking = latestTracking.get(work.id);
      const signalLost = isSignalLost(tracking);
      const isReached = tracking?.event_type === 'REACHED_LOCATION' || (tracking?.event_type === 'LIVE_TRACK_WORK' && work.status === 'assigned');
      const isTraveling = work.status === 'assigned' && !isReached;
      const isPaused = work.status === 'paused';

      // Status filter
      if (filterStatus === 'traveling' && !isTraveling) return false;
      if (filterStatus === 'working' && (isTraveling || isPaused || signalLost)) return false;
      if (filterStatus === 'paused' && !isPaused) return false;
      if (filterStatus === 'offline' && !signalLost) return false;

      // Search filter (name or location)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          (work.employee_name?.toLowerCase().includes(q)) ||
          (work.location_name?.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [activeWorks, latestTracking, filterStatus, searchQuery, currentTime]);

  if (loading && workLocations.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className=" max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="col-span-1 lg:col-span-4 space-y-4 order-2 lg:order-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-600" />
                Active Workers ({activeWorks.length})
              </h3>
              {selectedWork && (
                <button
                  onClick={() => setSelectedWork(null)}
                  className="flex items-center gap-1 text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
                >
                  Show all
                </button>
              )}
            </div>
            {selectedWork && (
              <div className="mb-2 flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                <div 
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0 border border-white shadow-sm" 
                  style={{ backgroundColor: getEmployeeColor(selectedWork.employee_name || 'Worker', selectedWork.employee_code as string | undefined) }} 
                />
                <span className="text-xs text-blue-700 font-medium truncate">Viewing: <strong>{selectedWork.employee_name}</strong></span>
              </div>
            )}

            {/* --- Enterprise: Search Bar --- */}
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or location..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* --- Enterprise: Status Filter Tabs --- */}
            <div className="flex flex-wrap gap-1 mb-3">
              {(['all', 'traveling', 'working', 'paused', 'offline'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setFilterStatus(s)}
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize transition-colors ${
                    filterStatus === s
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {filteredWorks.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">
                  {activeWorks.length === 0 ? 'No active workers' : 'No results match your filter'}
                </p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto pr-2">
                {filteredWorks.map((work) => {
                  const tracking = latestTracking.get(work.id);
                  const isOutside = (work as any).is_outside_office;
                  const withinRadius = tracking ? (isOutside ? true : isWithinRadius(work, tracking)) : true;
                  const signalLost = isSignalLost(tracking);
                  const isReached = tracking?.event_type === 'REACHED_LOCATION';
                  const isTraveling = work.status === 'assigned' && !isReached;

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
                            <div 
                              className="w-2.5 h-2.5 rounded-full shadow-sm border border-white flex-shrink-0" 
                              style={{ backgroundColor: getEmployeeColor(work.employee_name || 'Worker', work.employee_code as string | undefined) }} 
                            />
                            {work.employee_name}
                            {work.employee_code && <span className="text-xs text-gray-500 font-normal">({work.employee_code as string})</span>}
                            {work.status === 'paused' ? (
                              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                                <PauseCircle className="h-3 w-3" /> PAUSED
                              </span>
                            ) : isReached ? (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold ${signalLost ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'
                                }`}>
                                ARRIVED {signalLost ? '(OFFLINE)' : ''}
                              </span>
                            ) : isTraveling ? (
                              <span className={`text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 font-bold ${signalLost ? 'bg-orange-100 text-orange-800' : 'bg-purple-100 text-purple-800'
                                }`}>
                                TRAVELING {signalLost ? '(OFFLINE)' : ''}
                              </span>
                            ) : signalLost ? (
                              <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                                OFFLINE
                              </span>
                            ) : isOutside ? (
                              <span className="text-[10px] bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold">
                                REMOTE
                              </span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            <span className="font-medium text-gray-700">{work.location_name}</span>
                            {(work.formatted_address || work.address) && (
                              <span className="block mt-0.5 text-[11px] leading-tight">
                                {work.formatted_address || [work.address, work.city, work.state].filter(Boolean).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        {!withinRadius && !signalLost && !isTraveling && !isOutside && (
                          <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />
                        )}
                      </div>

                      {tracking ? (
                        <div className="space-y-1">
                          <div className={`flex items-center gap-1 text-xs ${signalLost ? 'text-gray-400 font-medium' : 'text-gray-600'}`}>
                            <Clock className="h-3 w-3" />
                            {signalLost ? 'Signal lost at ' : 'Last update '} {format(new Date(tracking.recorded_at), 'hh:mm:ss a')}
                          </div>
                          {tracking.calculated_distance !== undefined && !isTraveling && !isOutside && !withinRadius && (
                            <div className={`flex items-center gap-1 text-xs ${signalLost ? 'text-gray-400' : 'text-red-600'}`}>
                              <Target className="h-3 w-3" />
                              Gap from center: {tracking.calculated_distance >= 1000 ? (tracking.calculated_distance / 1000).toFixed(2) + ' km' : tracking.calculated_distance.toFixed(1) + ' m'}
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

        <div className="col-span-1 lg:col-span-8 order-1 lg:order-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-600" />
                Live Locations Map
              </h3>
            </div>



            <div className="border border-gray-300 rounded-lg overflow-hidden relative z-0" style={{ height: 'calc(100vh - 280px)' }}>

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
                  circles={(selectedWork ? [selectedWork] : activeWorks).filter(w => !(w as any).is_outside_office).map(work => {
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
                    ...(selectedWork ? [selectedWork] : activeWorks).filter(w => !(w as any).is_outside_office).map(work => ({
                      lat: Number(work.latitude),
                      lng: Number(work.longitude),
                      color: '#ef4444',
                      popupHTML: `<div class="font-bold">${work.location_name}</div><div class="text-xs">Assigned Site Center</div>`
                    })),
                    ...(selectedWork ? [selectedWork] : activeWorks).filter(w => latestTracking.get(w.id)).map(work => {
                      const tracking = latestTracking.get(work.id)!;
                      const isOutside = (work as any).is_outside_office;
                      const withinRadius = isOutside ? true : isWithinRadius(work, tracking);
                      const signalLost = isSignalLost(tracking);
                      const isTraveling = work.status === 'assigned';
                      
                      let color = '#3b82f6';
                      if (signalLost) color = '#9ca3af';
                      else if (isOutside) color = '#8b5cf6'; // Purple for remote
                      else if (!isTraveling && withinRadius) color = '#22c55e';
                      else if (!isTraveling && !withinRadius) color = '#ef4444';

                      const statusText = isOutside ? 'Remote Work Location' : (isTraveling ? 'En Route to Site' : withinRadius ? 'Within allowed area' : 'Outside allowed area');

                      return {
                        lat: Number(tracking.latitude),
                        lng: Number(tracking.longitude),
                        color,
                        popupHTML: `<div class="font-bold">${work.employee_name}</div><div class="text-xs font-semibold" style="color:${color}">${statusText}</div><div class="text-[10px] text-gray-500 mt-1">Last Update: ${new Date(tracking.recorded_at).toLocaleTimeString()}</div>`
                      };
                    })
                  ]}
                  routes={(selectedWork ? [selectedWork] : activeWorks).filter(w => !(w as any).is_outside_office).map(work => {
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

                {(selectedWork ? [selectedWork] : activeWorks).map((work) => {
                  const tracking = latestTracking.get(work.id);
                  const isOutside = (work as any).is_outside_office;
                  const withinRadius = tracking ? (isOutside ? true : isWithinRadius(work, tracking)) : true;
                  const signalLost = isSignalLost(tracking);
                  const isReached = tracking?.event_type === 'REACHED_LOCATION' || (tracking?.event_type === 'LIVE_TRACK_WORK' && work.status === 'assigned');
                  const isTraveling = work.status === 'assigned' && !isReached;

                  const workLat = Number(work.latitude);
                  const workLng = Number(work.longitude);
                  const radiusMeters = Number(work.allowed_radius_meters);

                  return (
                    <div key={work.id}>
                      {!isOutside && (
                        <>
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
                        </>
                      )}

                      {tracking && tracking.latitude && tracking.longitude && (
                        <>
                          <Marker position={[Number(tracking.latitude), Number(tracking.longitude)]} icon={getEmployeeIcon(work.employee_name || 'Worker', work.employee_code as string | undefined)}>
                            <Popup>
                              <div className="text-sm">
                                <div className="font-semibold mb-1">
                                  {work.employee_name}
                                  {work.employee_code && <span className="text-gray-500 font-normal ml-1">({work.employee_code as string})</span>}
                                </div>
                                {work.status === 'paused' && (
                                  <div className="text-xs font-bold text-yellow-600 mt-1 mb-1">Currently Auto-Paused</div>
                                )}
                                {signalLost && (
                                  <div className="text-xs font-bold text-gray-500 mt-1 mb-1">GPS Signal Lost / Offline</div>
                                )}
                                <div className={`text-xs mb-1 font-bold ${signalLost ? 'text-gray-500' : isTraveling ? 'text-blue-600' : isReached ? 'text-teal-600' : isOutside ? 'text-purple-600' : withinRadius ? 'text-green-600' : 'text-red-600'
                                  }`}>
                                  {isOutside ? 'Remote Work Location' : isTraveling ? 'En Route to Site' : isReached ? 'Arrived at Site' : withinRadius ? 'Within allowed area' : 'Outside allowed area'}
                                </div>
                                <div className={`text-xs ${signalLost ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {signalLost ? 'Signal lost at: ' : 'Last update: '} {format(new Date(tracking.recorded_at), 'hh:mm:ss a')}
                                </div>
                                {tracking.calculated_distance !== undefined && !isOutside && !withinRadius && (
                                  <div className={`text-xs ${signalLost ? 'text-gray-400' : 'text-gray-500'}`}>
                                    Distance from center: {tracking.calculated_distance >= 1000 ? (tracking.calculated_distance / 1000).toFixed(2) + ' km' : tracking.calculated_distance.toFixed(1) + ' m'}
                                  </div>
                                )}
                              </div>
                            </Popup>
                          </Marker>

                          {!isOutside && (
                            <LiveTrackingRoute
                              start={[Number(tracking.latitude), Number(tracking.longitude)]}
                              end={[workLat, workLng]}
                              pathOptions={{
                                color: signalLost ? '#9ca3af' : isTraveling ? '#3b82f6' : isReached ? '#14b8a6' : withinRadius ? '#4ade80' : '#ef4444',
                                dashArray: '5, 10',
                                weight: 5,
                                opacity: 0.7
                              }}
                              shouldFetchOptimized={activeWorks.length <= 5 || selectedWork?.id === work.id}
                            />
                          )}
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