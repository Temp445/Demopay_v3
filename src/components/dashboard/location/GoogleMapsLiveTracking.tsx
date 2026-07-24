import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleMap, MarkerF, CircleF, PolylineF, InfoWindowF, useJsApiLoader } from '@react-google-maps/api';
import { Activity, RefreshCw, Users, MapPin, Clock, Target, AlertTriangle, PauseCircle } from 'lucide-react';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import type { WorkLocation, WorkLocationTracking } from '../../../types/workLocation';

const libraries: ('places' | 'geocoding')[] = ['places', 'geocoding'];

interface GoogleMapsLiveTrackingProps {
  apiKey: string;
}

export default function GoogleMapsLiveTracking({ apiKey }: GoogleMapsLiveTrackingProps) {
  const { isLoaded } = useJsApiLoader({ googleMapsApiKey: apiKey, libraries });
  const { currentTenant } = useTenant();
  const { workLocations, loading, fetchWorkLocations } = useWorkLocationsStore();
  const [activeWorks, setActiveWorks] = useState<WorkLocation[]>([]);
  const [latestTracking, setLatestTracking] = useState<Map<string, WorkLocationTracking>>(new Map());
  const [selectedWork, setSelectedWork] = useState<WorkLocation | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeInfo, setActiveInfo] = useState<string | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentTenant) loadData();
  }, [currentTenant]);

  const loadData = async () => {
    if (!currentTenant) return;
    await fetchWorkLocations(currentTenant.id);
  };

  useEffect(() => {
    const active = workLocations.filter((wl) => wl.status === 'in_progress' || wl.status === 'paused');
    setActiveWorks(active);

    const fetchInitialTracking = async () => {
      const newTrackingMap = new Map<string, WorkLocationTracking>();
      for (const work of active) {
        try {
          const { data, error } = await supabase
            .from('work_location_tracking')
            .select('*')
            .eq('work_location_id', work.id)
            .order('recorded_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data && !error) {
            newTrackingMap.set(work.id, data as WorkLocationTracking);
          }
        } catch (error) {
          console.error('Failed to fetch tracking for', work.id, error);
        }
      }
      setLatestTracking((prev) => {
        const merged = new Map(prev);
        newTrackingMap.forEach((v, k) => merged.set(k, v));
        return merged;
      });
    };
    if (active.length > 0) fetchInitialTracking();
  }, [workLocations]);

  useEffect(() => {
    if (!currentTenant?.id || !autoRefresh) return;
    const sub = supabase
      .channel('public:work_location_tracking')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'work_location_tracking',
        filter: `tenant_id=eq.${currentTenant.id}`
      }, (payload) => {
        const newTracking = payload.new as WorkLocationTracking;
        setLatestTracking((prev) => {
          const m = new Map(prev);
          m.set(newTracking.work_location_id, newTracking);
          return m;
        });
        if (newTracking.is_within_radius === false) {
          const emp = useWorkLocationsStore.getState().workLocations.find(w => w.id === newTracking.work_location_id);
          toast.error(`ALERT: ${emp?.employee_name || 'An employee'} left their assigned work radius!`, {
            id: `radius-alert-${newTracking.work_location_id}`,
            duration: 6000,
          });
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(sub); };
  }, [currentTenant?.id, autoRefresh]);

  const calculateMapCenter = (): { lat: number; lng: number } => {
    if (activeWorks.length === 0) return { lat: 28.6139, lng: 77.2090 };
    if (selectedWork) return { lat: Number(selectedWork.latitude), lng: Number(selectedWork.longitude) };
    const avgLat = activeWorks.reduce((s, w) => s + Number(w.latitude), 0) / activeWorks.length;
    const avgLng = activeWorks.reduce((s, w) => s + Number(w.longitude), 0) / activeWorks.length;
    if (isNaN(avgLat) || isNaN(avgLng)) return { lat: 28.6139, lng: 77.2090 };
    return { lat: avgLat, lng: avgLng };
  };

  const isWithinRadius = (work: WorkLocation, tracking: WorkLocationTracking) =>
    tracking.distance_from_center ? Number(tracking.distance_from_center) <= Number(work.allowed_radius_meters) : true;

  const isSignalLost = (tracking: WorkLocationTracking | undefined) => {
    if (!tracking) return false;
    return differenceInMinutes(currentTime, parseISO(tracking.recorded_at)) >= 2;
  };

  if (!isLoaded || (loading && workLocations.length === 0)) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-full mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-green-600" />
            Live Employee Tracking
          </h1>
          <p className="text-sm text-gray-600 mt-1">Real-time location monitoring for active work assignments</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Live Auto-Update
          </label>
          <button onClick={loadData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
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
              <div className="space-y-3 max-h-[calc(100vh-300px)] overflow-y-auto">
                {activeWorks.map((work) => {
                  const tracking = latestTracking.get(work.id);
                  const within = tracking ? isWithinRadius(work, tracking) : true;
                  const lost = isSignalLost(tracking);
                  return (
                    <button key={work.id} onClick={() => {
                      setSelectedWork(work);
                      const pos = tracking ? { lat: Number(tracking.latitude), lng: Number(tracking.longitude) } : { lat: Number(work.latitude), lng: Number(work.longitude) };
                      mapRef.current?.panTo(pos);
                      mapRef.current?.setZoom(15);
                    }} className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${selectedWork?.id === work.id ? 'border-blue-500 bg-blue-50' : lost ? 'border-gray-200 bg-gray-50 opacity-80' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                            {work.employee_name}
                            {work.status === 'paused' ? (
                              <span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold"><PauseCircle className="h-3 w-3" /> PAUSED</span>
                            ) : lost ? (
                              <span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">OFFLINE</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">{work.location_name}</div>
                        </div>
                        {!within && !lost && <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" />}
                      </div>
                      {tracking ? (
                        <div className="space-y-1">
                          <div className={`flex items-center gap-1 text-xs ${lost ? 'text-gray-400' : 'text-gray-600'}`}>
                            <Clock className="h-3 w-3" />
                            {lost ? 'Signal lost at ' : 'Last update '}{format(new Date(tracking.recorded_at), 'hh:mm:ss a')}
                          </div>
                          {tracking.distance_from_center != null && (
                            <div className={`flex items-center gap-1 text-xs ${lost ? 'text-gray-400' : within ? 'text-green-600' : 'text-red-600'}`}>
                              <Target className="h-3 w-3" />
                              Gap: {Number(tracking.distance_from_center).toFixed(1)}m
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
            <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 280px)' }}>
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={calculateMapCenter()}
                zoom={selectedWork ? 15 : 12}
                onLoad={onMapLoad}
                options={{ mapTypeControl: true, mapTypeControlOptions: { position: google.maps.ControlPosition.TOP_LEFT }, streetViewControl: false, fullscreenControl: true }}
              >
                {activeWorks.map((work) => {
                  const tracking = latestTracking.get(work.id);
                  const within = tracking ? isWithinRadius(work, tracking) : true;
                  const lost = isSignalLost(tracking);
                  const workPos = { lat: Number(work.latitude), lng: Number(work.longitude) };
                  const radiusMeters = Number(work.allowed_radius_meters);

                  return (
                    <div key={work.id}>
                      <MarkerF position={workPos} onClick={() => setActiveInfo(work.id)} icon={{
                        url: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                        scaledSize: new google.maps.Size(25, 41),
                        anchor: new google.maps.Point(12, 41),
                      }} />
                      {activeInfo === work.id && (
                        <InfoWindowF position={workPos} onCloseClick={() => setActiveInfo(null)}>
                          <div className="text-sm">
                            <div className="font-semibold mb-1">{work.location_name}</div>
                            <div className="text-gray-600">Employee: {work.employee_name}</div>
                          </div>
                        </InfoWindowF>
                      )}
                      <CircleF center={workPos} radius={radiusMeters} options={{
                        strokeColor: lost ? 'gray' : within ? 'green' : 'red',
                        fillColor: lost ? 'gray' : within ? 'green' : 'red',
                        fillOpacity: 0.1,
                        strokeWeight: 2,
                      }} />
                      {tracking && tracking.latitude && tracking.longitude && (
                        <>
                          <MarkerF position={{ lat: Number(tracking.latitude), lng: Number(tracking.longitude) }} icon={{
                            url: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
                            scaledSize: new google.maps.Size(25, 41),
                            anchor: new google.maps.Point(12, 41),
                          }} />
                          <PolylineF path={[workPos, { lat: Number(tracking.latitude), lng: Number(tracking.longitude) }]} options={{
                            strokeColor: lost ? '#9ca3af' : within ? '#4ade80' : '#ef4444',
                            strokeWeight: 2,
                            strokeOpacity: 0.7,
                            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 3 }, offset: '0', repeat: '15px' }],
                          }} />
                        </>
                      )}
                    </div>
                  );
                })}
              </GoogleMap>
            </div>
            <div className="mt-3 flex items-center gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-full" />Work Site</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-full" />Employee</div>
              <div className="flex items-center gap-1"><div className="w-4 h-4 border-2 border-green-500 rounded-full" />Radius</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
