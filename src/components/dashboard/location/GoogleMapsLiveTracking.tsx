import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GoogleMap, CircleF, PolylineF, InfoWindowF, DirectionsRenderer, TrafficLayer } from '@react-google-maps/api';
import AdvancedMarker from './AdvancedMarker';
import { useGoogleMaps } from '../../../contexts/GoogleMapsContext';
import { Activity, RefreshCw, MapPin, Clock, AlertTriangle, PauseCircle, ArrowLeft, Search, X } from 'lucide-react';

const MAP_ID = 'DEMO_MAP_ID';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { format, differenceInMinutes, parseISO } from 'date-fns';
import { supabase } from '../../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import type { WorkLocation } from '../../../types/workLocation';

const getEmployeeColor = (name: string, code?: string) => {
  const str = code || name || 'A';
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 40%)`;
};

const getEmployeeMarkerHtml = (name: string, code?: string, isMoving?: boolean) => {
  const color = getEmployeeColor(name, code);

  return `
    <div style="position: relative; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;">
      ${isMoving ? `
      <div style="
        position: absolute;
        width: 100%;
        height: 100%;
        background-color: ${color};
        border-radius: 50%;
        animation: live-map-pulse 2s ease-out infinite;
      "></div>
      <style>
        @keyframes live-map-pulse {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(3.5); opacity: 0; }
        }
      </style>
      ` : ''}
      <div style="
        position: relative;
        background-color: ${color};
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.4);
        z-index: 2;
      "></div>
    </div>
  `;
};

// Component to handle individual employee routing with caching threshold
const LiveEmployeeRoute = ({ 
  origin, 
  destination, 
  isLost 
}: { 
  origin: { lat: number; lng: number }; 
  destination: { lat: number; lng: number }; 
  isLost: boolean 
}) => {
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const lastFetchedOrigin = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!window.google?.maps?.DirectionsService || !window.google?.maps?.geometry) return;

    // Only refetch if we haven't fetched yet, OR if they moved more than 100 meters
    let shouldFetch = false;
    if (!lastFetchedOrigin.current) {
      shouldFetch = true;
    } else {
      const distance = window.google.maps.geometry.spherical.computeDistanceBetween(
        new window.google.maps.LatLng(lastFetchedOrigin.current.lat, lastFetchedOrigin.current.lng),
        new window.google.maps.LatLng(origin.lat, origin.lng)
      );
      if (distance > 100) { // 100 meters threshold to prevent API spam
        shouldFetch = true;
      }
    }

    if (shouldFetch) {
      lastFetchedOrigin.current = origin;
      const ds = new window.google.maps.DirectionsService();
      ds.route({
        origin,
        destination,
        travelMode: window.google.maps.TravelMode.DRIVING,
        drivingOptions: {
          departureTime: new Date(), // Request traffic-aware routing
          trafficModel: window.google.maps.TrafficModel.BEST_GUESS
        }
      }, (result, status) => {
        if (status === window.google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        }
      });
    }
  }, [origin.lat, origin.lng, destination.lat, destination.lng]);

  if (!directions) return null;

  return (
    <DirectionsRenderer
      directions={directions}
      options={{
        suppressMarkers: true,
        polylineOptions: {
          strokeColor: isLost ? '#9ca3af' : '#3b82f6', // Blue if traveling
          strokeWeight: 6,
          strokeOpacity: 0.8,
        }
      }}
    />
  );
};

interface GMapsLiveProps { apiKey: string; }

export default function GoogleMapsLiveTracking({ apiKey }: GMapsLiveProps) {
  const { isLoaded } = useGoogleMaps();
  const navigate = useNavigate();
  const { currentTenant } = useTenant();
  const { companySettings } = useSettingsStore();
  const { workLocations, loading, fetchWorkLocations } = useWorkLocationsStore();
  const { settings: locationSettings } = useLocationSettingsStore();

  const [activeWorks, setActiveWorks] = useState<WorkLocation[]>([]);
  const [latestTracking, setLatestTracking] = useState<Map<string, any>>(new Map());
  const [selectedWork, setSelectedWork] = useState<WorkLocation | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeInfo, setActiveInfo] = useState<string | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all'|'traveling'|'working'|'paused'|'offline'>('all');
  const pendingUpdatesRef = useRef<Map<string, any>>(new Map());

  const onMapLoad = useCallback((m: google.maps.Map) => { mapRef.current = m; setMap(m); }, []);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => { if (currentTenant) loadData(); }, [currentTenant]);

  const loadData = async () => {
    if (!currentTenant) return;
    await fetchWorkLocations(currentTenant.id);
  };

  useEffect(() => {
    const fetchActiveState = async () => {
      const candidates = workLocations.filter(wl => ['assigned','in_progress','paused'].includes(wl.status));
      const newMap = new Map<string, any>();
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
            let lat = data.latitude;
            let lng = data.longitude;
            
            if (!lat || !lng) {
              const { data: locData } = await supabase
                .from('journey_tracking_logs')
                .select('latitude, longitude')
                .eq('work_location_id', work.id)
                .not('latitude', 'is', null)
                .not('longitude', 'is', null)
                .order('timestamp', { ascending: false })
                .limit(1)
                .maybeSingle();
              if (locData) {
                lat = locData.latitude;
                lng = locData.longitude;
              }
            }

            if (work.status === 'assigned') {
              const ok = ['START_JOURNEY','LIVE_TRACK_JOURNEY','REACHED_LOCATION','GPS_SIGNAL_LOST','GPS_SIGNAL_RESTORED','LIVE_TRACK_WORK','HEARTBEAT'];
              if (!ok.includes(data.event_type)) continue;
            }
            trulyActive.push(work);
            newMap.set(work.id, { latitude: lat, longitude: lng, recorded_at: data.timestamp, event_type: data.event_type });
          } else if (work.status === 'in_progress' || work.status === 'paused') {
            trulyActive.push(work);
          }
        } catch (e) { console.error('tracking fetch error', work.id, e); }
      }
      setActiveWorks(trulyActive);
      setLatestTracking(newMap);
    };
    if (workLocations.length > 0) fetchActiveState();
  }, [workLocations]);

  useEffect(() => {
    if (selectedWork && mapRef.current) {
      const t = latestTracking.get(selectedWork.id);
      const pos = t?.latitude && t?.longitude
        ? { lat: Number(t.latitude), lng: Number(t.longitude) }
        : { lat: Number(selectedWork.latitude), lng: Number(selectedWork.longitude) };
      mapRef.current.panTo(pos);
      mapRef.current.setZoom(15);
    }
  }, [selectedWork, latestTracking]);

  useEffect(() => {
    if (!currentTenant?.id || !autoRefresh) return;
    const flushTimer = setInterval(() => {
      if (pendingUpdatesRef.current.size === 0) return;
      const updates = new Map(pendingUpdatesRef.current);
      pendingUpdatesRef.current.clear();
      setLatestTracking(prev => { 
        const m = new Map(prev); 
        updates.forEach((v,k) => {
          const existing = m.get(k);
          m.set(k, {
            ...v,
            latitude: v.latitude || existing?.latitude,
            longitude: v.longitude || existing?.longitude
          });
        }); 
        return m; 
      });
    }, 500);
    const sub = supabase
      .channel('google-live:journey_tracking_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'journey_tracking_logs', filter: `tenant_id=eq.${currentTenant.id}` }, (payload) => {
        const nl = payload.new as any;
        if (!nl.work_location_id) return;
        const prev = pendingUpdatesRef.current.get(nl.work_location_id);
        pendingUpdatesRef.current.set(nl.work_location_id, { 
          latitude: nl.latitude || prev?.latitude, 
          longitude: nl.longitude || prev?.longitude, 
          recorded_at: nl.timestamp, 
          event_type: nl.event_type 
        });
        if (nl.event_type === 'START_JOURNEY' || nl.event_type === 'COMPLETE_WORK') fetchWorkLocations(currentTenant.id);
      }).subscribe();
    return () => { clearInterval(flushTimer); supabase.removeChannel(sub); };
  }, [currentTenant?.id, autoRefresh, fetchWorkLocations]);

  const calcCenter = (): { lat: number; lng: number } => {
    if (activeWorks.length === 0) return { lat: 13.0827, lng: 80.2707 };
    if (selectedWork) {
      const t = latestTracking.get(selectedWork.id);
      if (t?.latitude && t?.longitude) {
        return { lat: Number(t.latitude), lng: Number(t.longitude) };
      }
      return { lat: Number(selectedWork.latitude), lng: Number(selectedWork.longitude) };
    }
    const al = activeWorks.reduce((s,w) => s + Number(w.latitude), 0) / activeWorks.length;
    const ag = activeWorks.reduce((s,w) => s + Number(w.longitude), 0) / activeWorks.length;
    return (isNaN(al)||isNaN(ag)) ? { lat: 13.0827, lng: 80.2707 } : { lat: al, lng: ag };
  };

  const inRadius = (work: WorkLocation, tr: any) => {
    if (!tr?.latitude || !tr?.longitude) return true;
    const R = 6371e3, p1 = Number(work.latitude)*Math.PI/180, p2 = Number(tr.latitude)*Math.PI/180;
    const dp = (Number(tr.latitude)-Number(work.latitude))*Math.PI/180;
    const dl = (Number(tr.longitude)-Number(work.longitude))*Math.PI/180;
    const a = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
    return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a)) <= Number(work.allowed_radius_meters);
  };

  const signalLost = (tr: any) => {
    if (!tr?.recorded_at) return false;
    if (tr.event_type === 'GPS_SIGNAL_LOST') return true;

    const nonTrackingEvents = ['REACHED_ENDPOINT', 'PAUSE_WORK', 'COMPLETE_WORK'];
    if (nonTrackingEvents.includes(tr.event_type)) return false;
    if (!locationSettings?.radius_monitoring_enabled && ['START_WORK', 'RESUME_WORK'].includes(tr.event_type)) return false;

    return differenceInMinutes(currentTime, parseISO(tr.recorded_at)) >= (locationSettings?.journey_tracking_interval_mins || 5) + 2;
  };

  const filteredWorks = useMemo(() => activeWorks.filter(work => {
    const tr = latestTracking.get(work.id);
    const lost = signalLost(tr);
    const isReached = tr?.event_type === 'REACHED_LOCATION' || (tr?.event_type === 'LIVE_TRACK_WORK' && work.status === 'assigned');
    const traveling = work.status === 'assigned' && !isReached;
    const paused = work.status === 'paused';
    if (filterStatus === 'traveling' && !traveling) return false;
    if (filterStatus === 'working' && (traveling || paused || lost)) return false;
    if (filterStatus === 'paused' && !paused) return false;
    if (filterStatus === 'offline' && !lost) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return work.employee_name?.toLowerCase().includes(q) || work.location_name?.toLowerCase().includes(q);
    }
    return true;
  }), [activeWorks, latestTracking, filterStatus, searchQuery, currentTime]);

  if (!isLoaded || (loading && workLocations.length === 0)) {
    return <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"/></div>;
  }

  return (
    <div className="max-w-full mx-auto">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2"><Activity className="h-6 w-6 text-green-600"/>Live Employee Tracking</h1>
            <p className="text-sm text-gray-600 mt-1">Real-time location monitoring for active work assignments</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
            Live Auto-Update
          </label> */}
          <button onClick={loadData} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">
            <RefreshCw className="h-4 w-4"/>Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Sidebar */}
        <div className="col-span-1 lg:col-span-4 space-y-4 order-2 lg:order-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><Activity className="h-4 w-4 text-gray-600"/>Active Workers ({activeWorks.length})</h3>
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
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400"/>
              <input type="text" placeholder="Search by name or location..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 pr-8 py-2 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"/>
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mb-3">
              {(['all','traveling','working','paused','offline'] as const).map(s => (
                <button key={s} onClick={() => setFilterStatus(s)} className={`px-2 py-0.5 text-[10px] font-semibold rounded-full capitalize transition-colors ${filterStatus===s?'bg-blue-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{s}</button>
              ))}
            </div>
            {filteredWorks.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="h-8 w-8 text-gray-400 mx-auto mb-2"/>
                <p className="text-sm text-gray-500">{activeWorks.length === 0 ? 'No active workers' : 'No results match your filter'}</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[calc(100vh-360px)] overflow-y-auto pr-2">
                {filteredWorks.map(work => {
                  const tr = latestTracking.get(work.id);
                  const within = inRadius(work, tr);
                  const lost = signalLost(tr);
                  const isReached = tr?.event_type === 'REACHED_LOCATION' || (tr?.event_type === 'LIVE_TRACK_WORK' && work.status === 'assigned');
                  const traveling = work.status === 'assigned' && !isReached;
                  return (
                    <button key={work.id} onClick={() => { setSelectedWork(work); }} className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${selectedWork?.id===work.id?'border-blue-500 bg-blue-50':lost?'border-gray-200 bg-gray-50 opacity-80':'border-gray-200 hover:border-gray-300 bg-white'}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-2 flex-wrap">
                            <div 
                              className="w-2.5 h-2.5 rounded-full shadow-sm border border-white flex-shrink-0" 
                              style={{ backgroundColor: getEmployeeColor(work.employee_name || 'Worker', work.employee_code as string | undefined) }} 
                            />
                            {work.employee_name}
                            {work.employee_code && <span className="text-xs text-gray-500 font-normal">({work.employee_code as string})</span>}
                            {work.status==='paused'&&<span className="text-[10px] bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full flex items-center gap-1 font-bold"><PauseCircle className="h-3 w-3"/>PAUSED</span>}
                            {traveling&&<span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${lost?'bg-orange-100 text-orange-800':'bg-purple-100 text-purple-800'}`}>TRAVELING{lost?' (OFFLINE)':''}</span>}
                            {isReached&&<span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${lost?'bg-orange-100 text-orange-800':'bg-teal-100 text-teal-800'}`}>ARRIVED{lost?' (OFFLINE)':''}</span>}
                            {!traveling&&!isReached&&!work.status.includes('pause')&&lost&&<span className="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full font-bold">OFFLINE</span>}
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
                        {!within&&!lost&&!traveling&&<AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0"/>}
                      </div>
                      {tr ? (
                        <div className={`flex items-center gap-1 text-xs ${lost?'text-gray-400':'text-gray-600'}`}>
                          <Clock className="h-3 w-3"/>{lost?'Signal lost at ':'Last update '}{format(new Date(tr.recorded_at),'hh:mm:ss a')}
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

        {/* Map */}
        <div className="col-span-1 lg:col-span-8 order-1 lg:order-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <div className="mb-4"><h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2"><MapPin className="h-4 w-4 text-gray-600"/>Live Locations Map</h3></div>
            <div className="border border-gray-300 rounded-lg overflow-hidden relative z-0" style={{ height: 'calc(100vh - 280px)' }}>
              <GoogleMap mapContainerStyle={{ width:'100%', height:'100%' }} center={calcCenter()} zoom={selectedWork?15:12} onLoad={onMapLoad}
                options={{ mapId: MAP_ID, mapTypeControl: true, mapTypeControlOptions:{ position: google.maps.ControlPosition.TOP_LEFT }, streetViewControl: false, fullscreenControl: true }}>
                
                <TrafficLayer />

                {(selectedWork ? [selectedWork] : activeWorks).map(work => {
                  const tr = latestTracking.get(work.id);
                  const within = inRadius(work, tr);
                  const lost = signalLost(tr);
                  const isReached = tr?.event_type === 'REACHED_LOCATION' || (tr?.event_type === 'LIVE_TRACK_WORK' && work.status === 'assigned');
                  const traveling = work.status === 'assigned' && !isReached;
                  const wp = { lat: Number(work.latitude), lng: Number(work.longitude) };
                  return (
                    <div key={work.id}>
                      <AdvancedMarker map={map} position={wp} onClick={() => setActiveInfo(work.id)} iconUrl="https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png" iconSize={[25,41]} iconAnchor={[12,41]}/>
                      {activeInfo===work.id&&<InfoWindowF position={wp} onCloseClick={() => setActiveInfo(null)}><div className="text-sm"><div className="font-semibold mb-1">{work.location_name}</div><div className="text-gray-600">Employee: {work.employee_name}</div><div className="text-xs font-bold text-red-600 mt-1">Assigned Site</div></div></InfoWindowF>}
                      <CircleF center={wp} radius={Number(work.allowed_radius_meters)} options={{ strokeColor: lost?'gray':traveling?'#3b82f6':within?'green':'red', fillColor: lost?'gray':traveling?'#3b82f6':within?'green':'red', fillOpacity:0.1, strokeWeight:2 }}/>
                      {tr?.latitude&&tr?.longitude&&(
                        <>
                          <AdvancedMarker map={map} position={{ lat:Number(tr.latitude), lng:Number(tr.longitude) }} onClick={() => setActiveInfo(`emp-${work.id}`)} html={getEmployeeMarkerHtml(work.employee_name || 'Worker', work.employee_code as string | undefined, (traveling || isReached) && !lost)} iconAnchor={[7,7]}/>
                          {activeInfo===`emp-${work.id}`&&<InfoWindowF position={{ lat:Number(tr.latitude), lng:Number(tr.longitude) }} onCloseClick={() => setActiveInfo(null)}><div className="text-sm"><div className="font-semibold mb-1">{work.employee_name}{work.employee_code && <span className="text-gray-500 font-normal ml-1">({work.employee_code as string})</span>}</div><div className={`text-xs font-bold mb-1 ${traveling?'text-blue-600':isReached?'text-teal-600':within?'text-green-600':'text-red-600'}`}>{traveling?'En Route to Site':isReached?'Arrived at Site':within?'Within allowed area':'Outside allowed area'}</div><div className="text-xs text-gray-500">Last update: {format(new Date(tr.recorded_at),'hh:mm:ss a')}</div></div></InfoWindowF>}
                          
                          {traveling && companySettings?.enable_directions_api ? (
                            <LiveEmployeeRoute
                              origin={{ lat: Number(tr.latitude), lng: Number(tr.longitude) }}
                              destination={wp}
                              isLost={lost}
                            />
                          ) : (
                            <PolylineF path={[wp,{ lat:Number(tr.latitude), lng:Number(tr.longitude) }]} options={{ strokeColor: lost?'#9ca3af':traveling?'#3b82f6':isReached?'#14b8a6':within?'#4ade80':'#ef4444', strokeWeight:2, strokeOpacity:0.7, icons:[{ icon:{ path:'M 0,-1 0,1', strokeOpacity:1, scale:3 }, offset:'0', repeat:'15px' }] }}/>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </GoogleMap>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-600">
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-red-500 rounded-full"/>Assigned Work Site</div>
              <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-full"/>Employee Live Location</div>
              <div className="flex items-center gap-1"><div className="w-4 h-4 border-2 border-green-500 rounded-full"/>Allowed Radius</div>
              <div className="flex items-center gap-1"><div className="w-4 h-0 border-t-2 border-dashed border-gray-400"/>Distance Gap Line</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}