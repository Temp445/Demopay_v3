import { useState, useEffect, useRef } from 'react';
import { MapPin, Play, StopCircle, Activity, AlertTriangle, CheckCircle, Clock, Target, Map, ExternalLink, PauseCircle, PlayCircle, History, Briefcase, Navigation, Plus, Home, ArrowRight, RotateCcw, X, WifiOff, Info, Gauge } from 'lucide-react';
import { useWorkLocationsStore } from '../../../stores/workLocationsStore';
import { useJourneyTrackingStore } from '../../../stores/journeyTrackingStore';
import { useGatePassesStore } from '../../../stores/gatePassesStore'; 
import { useTenant } from '../../../contexts/TenantContext';
import { getUserEmployeeData } from '../../../lib/roleBasedAccess';
import { useUserProfileStore } from '../../../stores/userProfileStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { supabase } from '../../../lib/supabase';
import { gpsTrackingService } from '../../../lib/gpsTracking';
import MapViewerSwitch from './MapViewerSwitch';
import MapPickerSwitch from './MapPickerSwitch';
import type { WorkLocation } from '../../../types/workLocation';

export default function EmployeeWorkPage() {
  const { currentTenant } = useTenant();
  const userId = useUserProfileStore(state => state.userId);
  const locationSettings = useLocationSettingsStore(state => state.settings);
  const fetchLocationSettings = useLocationSettingsStore(state => state.fetchSettings);
  const locationSettingsInitialized = useLocationSettingsStore(state => state.initialized);

  const workLocations = useWorkLocationsStore(state => state.workLocations);
  const wlLoading = useWorkLocationsStore(state => state.loading);
  const fetchEmployeeWorkLocations = useWorkLocationsStore(state => state.fetchEmployeeWorkLocations);
  const fetchWorkPauses = useWorkLocationsStore(state => state.fetchWorkPauses);
  const startWork = useWorkLocationsStore(state => state.startWork);
  const pauseWork = useWorkLocationsStore(state => state.pauseWork);
  const resumeWork = useWorkLocationsStore(state => state.resumeWork);
  const completeWork = useWorkLocationsStore(state => state.completeWork);

  // Use the newly created direct-assign function
  const createAssignedGatePass = useGatePassesStore(state => state.createAssignedGatePass);

  const currentStep = useJourneyTrackingStore(state => state.currentStep);
  const activeLocationId = useJourneyTrackingStore(state => state.activeLocationId);
  const journeyLoading = useJourneyTrackingStore(state => state.loading);
  const isBackgroundTracking = useJourneyTrackingStore(state => state.isBackgroundTracking);
  const fetchTodayLogs = useJourneyTrackingStore(state => state.fetchTodayLogs);
  const logEvent = useJourneyTrackingStore(state => state.logEvent);

  const [employeeId, setEmployeeId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [distanceFromCenter, setDistanceFromCenter] = useState<number | null>(null);
  const [isWithinRadius, setIsWithinRadius] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  
  // UI States
  const [activeTab, setActiveTab] = useState<'active' | 'history'>('active');
  const [selectedLocation, setSelectedLocation] = useState<WorkLocation | null>(null);
  const [showMapModal, setShowMapModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  
  // Add Location / Gate Pass Request Modal State
  const [showAddLocationModal, setShowAddLocationModal] = useState(false);
  const [newLocationName, setNewLocationName] = useState('');
  const [newLocationDesc, setNewLocationDesc] = useState('');
  const [newLocationStartTime, setNewLocationStartTime] = useState('');
  const [newLocationEndTime, setNewLocationEndTime] = useState('');
  const [newLocationRadius, setNewLocationRadius] = useState('100');
  const [newLocationPicked, setNewLocationPicked] = useState<{
    latitude: number; longitude: number;
    address?: string; city?: string; state?: string;
    country?: string; postal_code?: string; formatted_address?: string;
  } | null>(null);
  
  const [reasonText, setReasonText] = useState('');
  const [submittingModal, setSubmittingModal] = useState(false);

  // Post-complete "What's Next?" flow
  const [showPostCompleteOptions, setShowPostCompleteOptions] = useState(false);
  const [showNextLocationModal, setShowNextLocationModal] = useState(false);

  // Rework during return
  const [showReworkReturnModal, setShowReworkReturnModal] = useState(false);
  const [reworkReason, setReworkReason] = useState('');
  const [reworkLocationPicked, setReworkLocationPicked] = useState<WorkLocation | null>(null);
  const [reworkStep, setReworkStep] = useState<'reason' | 'pick_location'>('reason');

  // Prevent infinite auto-pause loops
  const autoPauseTriggered = useRef(false);

  // Derived State: Group Tasks
  const activeTasks = workLocations.filter(loc => 
    ['assigned', 'in_progress', 'paused'].includes(loc.status) && 
    loc.employee_id === employeeId
  );

  const historyTasks = workLocations.filter(loc => 
    ['completed', 'approved', 'cancelled'].includes(loc.status) && 
    loc.employee_id === employeeId
  );
  
  const remainingAssignedTasks = activeTasks.filter(loc =>
    loc.status === 'assigned' && loc.id !== activeLocationId
  );

  const currentlyTrackingLocation = activeLocationId 
    ? workLocations.find(l => l.id === activeLocationId) 
    : undefined;

  const [currentUIPosition, setCurrentUIPosition] = useState<{lat: number, lng: number} | null>(null);
  const [currentSpeedMs, setCurrentSpeedMs] = useState<number | null>(null);

  // Actively watch the user's location to update the UI and Map
  useEffect(() => {
    let watchId: number;
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          setCurrentUIPosition({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          // Capture raw GPS speed (m/s) — null on desktop/WiFi
          setCurrentSpeedMs(position.coords.speed);
        },
        (error) => {
          console.warn('UI Geolocation Error:', error);
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
      );
    }
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    getUserEmployeeData(userId).then(({ employeeId }) => {
      setEmployeeId(employeeId);
    });
  }, [userId]);

  useEffect(() => {
    if (currentTenant?.id && !locationSettingsInitialized) {
      fetchLocationSettings(currentTenant.id);
    }
  }, [currentTenant?.id, locationSettingsInitialized]);

  // Initial Load
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (currentTenant?.id && employeeId) {
        setIsInitialLoad(true);
        await fetchEmployeeWorkLocations(currentTenant.id, employeeId);
        await fetchTodayLogs(currentTenant.id, employeeId);
        if (isMounted) setIsInitialLoad(false);
      }
    };

    loadData();

    return () => { isMounted = false; };
  }, [currentTenant?.id, employeeId, fetchEmployeeWorkLocations, fetchTodayLogs]);

  useEffect(() => {
    if (!currentTenant?.id || !employeeId) return;

    const channel = supabase
      .channel('employee-work-locations')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'work_locations',
        filter: `tenant_id=eq.${currentTenant.id}`,
      }, () => {
        fetchEmployeeWorkLocations(currentTenant.id, employeeId);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentTenant?.id, employeeId, fetchEmployeeWorkLocations]);

  useEffect(() => {
    if (currentlyTrackingLocation?.id) {
      fetchWorkPauses(currentlyTrackingLocation.id);
    }
  }, [currentlyTrackingLocation?.id, fetchWorkPauses]);

  // OFFLINE & ONLINE DETECTORS
  useEffect(() => {
    const handleOffline = async () => {
      setIsOffline(true);
      toast.error("You are offline! Live tracking paused.", { duration: 6000 });

      if (!currentTenant?.id || !employeeId) return;

      if (isBackgroundTracking && currentlyTrackingLocation?.id) {
        logEvent(currentTenant.id, employeeId, 'GPS_SIGNAL_LOST', currentlyTrackingLocation.id).catch(() => {});
      }

      if (currentlyTrackingLocation?.status === 'in_progress' && !autoPauseTriggered.current) {
        autoPauseTriggered.current = true;
        pauseWork(currentlyTrackingLocation.id, 'System Auto-Pause: Device Offline').then(() => {
            logEvent(currentTenant.id, employeeId, 'PAUSE_WORK', currentlyTrackingLocation.id).catch(() => {});
        }).catch(() => {
            autoPauseTriggered.current = false;
        });
      }
    };

    const handleOnline = async () => {
      setIsOffline(false);
      toast.success("Back online! Resuming live tracking.", { duration: 4000 });

      if (!currentTenant?.id || !employeeId || !currentlyTrackingLocation?.id) return;

      if (isBackgroundTracking) {
        logEvent(currentTenant.id, employeeId, 'GPS_SIGNAL_RESTORED', currentlyTrackingLocation.id).catch(() => {});
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [isBackgroundTracking, currentlyTrackingLocation, currentTenant?.id, employeeId, logEvent, pauseWork]);

  // RADIUS MONITORING
  useEffect(() => {
    if (currentUIPosition && currentlyTrackingLocation) {
      const distance = gpsTrackingService.calculateDistance(
        currentUIPosition.lat,
        currentUIPosition.lng,
        currentlyTrackingLocation.latitude,
        currentlyTrackingLocation.longitude
      );

      setDistanceFromCenter(distance);

      if (!locationSettings.radius_monitoring_enabled) {
        setIsWithinRadius(true);
        return;
      }

      const within = distance <= currentlyTrackingLocation.allowed_radius_meters;
      setIsWithinRadius(within);

      if (!within && currentlyTrackingLocation.status === 'in_progress' && !autoPauseTriggered.current) {
        autoPauseTriggered.current = true;
        toast.error("Warning: You have left the assigned work area!", { duration: 6000 });

        if (currentTenant?.id && employeeId) {
            // We STILL record a tracking position IMMEDIATELY to trigger the DB violation record
            // but we do NOT pause the work anymore.
            const violationPos = currentUIPosition ? {
              latitude: currentUIPosition.lat,
              longitude: currentUIPosition.lng,
              accuracy: 0 
            } : undefined;

            if (violationPos) {
              // use the store's manual record to ensure the violation is logged in DB
              const wstore = (useWorkLocationsStore.getState() as any);
              wstore.recordManualPosition(currentTenant.id, currentlyTrackingLocation.id, employeeId, currentlyTrackingLocation).catch(console.error);
            }
        }
      }

      if (within && currentlyTrackingLocation.status === 'in_progress') {
        autoPauseTriggered.current = false;
      }
    }
  }, [currentUIPosition, currentlyTrackingLocation, locationSettings.radius_monitoring_enabled, currentTenant?.id, employeeId, pauseWork, logEvent]);

  // WORKFLOW ACTIONS
  const handleStartJourney = async (location: WorkLocation) => {
    if (!currentTenant || !employeeId) return;
    setStarting(true);
    try {
        await logEvent(currentTenant.id, employeeId, 'START_JOURNEY', location.id);
        toast.success(`Journey started to ${location.location_name}`);
        setShowNextLocationModal(false);
        setShowPostCompleteOptions(false);
    } catch (e: any) {
    } finally { setStarting(false); }
  };

  const handleReachedLocation = async (location: WorkLocation) => {
    if (!currentTenant || !employeeId) return;
    setStarting(true);
    try {
        await logEvent(currentTenant.id, employeeId, 'REACHED_LOCATION', location.id);
        toast.success(`Arrived at ${location.location_name}`);
    } catch (e: any) {
    } finally { setStarting(false); }
  };

  const handleStartWork = async (location: WorkLocation) => {
    if (!currentTenant || !employeeId) return;
    setStarting(true);
    try {
      await startWork(location.id);
      await logEvent(currentTenant.id, employeeId, 'START_WORK', location.id);
      toast.success('Work started successfully.');
    } catch (error: any) {
    } finally {
      setStarting(false);
    }
  };

  const handleResumeWork = async (location: WorkLocation) => {
    if (!currentTenant || !employeeId) return;
    // ALLOW RESUME even if outside radius - as requested by user
    setStarting(true);
    try {
      await resumeWork(location.id);
      await logEvent(currentTenant.id, employeeId, 'RESUME_WORK', location.id);
      autoPauseTriggered.current = false;
      toast.success('Work resumed successfully.');
    } catch (error: any) {
    } finally {
      setStarting(false);
    }
  };

  const handlePauseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation || !reasonText.trim() || !currentTenant || !employeeId) return;

    setSubmittingModal(true);
    try {
      await pauseWork(selectedLocation.id, reasonText);
      await logEvent(currentTenant.id, employeeId, 'PAUSE_WORK', selectedLocation.id);
       toast.success('Work paused successfully');
       setShowPauseModal(false);
       setReasonText('');
       setSelectedLocation(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to pause work');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleCompleteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation || !currentTenant || !employeeId || !reasonText.trim()) return;

    setSubmittingModal(true);
    try {
      await completeWork(selectedLocation.id, reasonText);
      await logEvent(currentTenant.id, employeeId, 'COMPLETE_WORK', selectedLocation.id);
      toast.success('Work completed successfully');
      setShowCompleteModal(false);
      setReasonText('');
      setSelectedLocation(null);
      setShowPostCompleteOptions(true);
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete work');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleAddNewLocationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant || !employeeId || !userId || !newLocationName.trim()) return;
    if (!newLocationPicked) {
      toast.error('Please select a location on the map first.');
      return;
    }
    if (!newLocationStartTime || !newLocationEndTime) {
      toast.error('Please select both start and end times.');
      return;
    }

    const startStr = `${format(new Date(), 'yyyy-MM-dd')}T${newLocationStartTime}`;
    const endStr = `${format(new Date(), 'yyyy-MM-dd')}T${newLocationEndTime}`;
    if (new Date(endStr) <= new Date(startStr)) {
        toast.error('End time must be after start time.');
        return;
    }

    setSubmittingModal(true);
    try {
      // Instead of a pending gate pass, we instantly assign it
      await createAssignedGatePass({
        employee_id: employeeId,
        start_date: format(new Date(), 'yyyy-MM-dd'),
        start_time: newLocationStartTime,
        end_date: format(new Date(), 'yyyy-MM-dd'),
        end_time: newLocationEndTime,
        reason: newLocationDesc.trim() || `Visit to ${newLocationName.trim()}`,
        gate_pass_type: 'paid',
        company_name: newLocationName.trim(),
        latitude: newLocationPicked.latitude,
        longitude: newLocationPicked.longitude,
        allowed_radius_meters: locationSettings.radius_monitoring_enabled ? (parseInt(newLocationRadius) || 100) : 0,
        address: newLocationPicked.address || '',
        city: newLocationPicked.city || '',
        state: newLocationPicked.state || '',
        country: newLocationPicked.country || '',
        postal_code: newLocationPicked.postal_code || '',
        formatted_address: newLocationPicked.formatted_address || '',
      });

      toast.success('New location assigned successfully!');
      setShowAddLocationModal(false);
      setShowPostCompleteOptions(false);
      setNewLocationName('');
      setNewLocationDesc('');
      setNewLocationStartTime('');
      setNewLocationEndTime('');
      setNewLocationRadius('100');
      setNewLocationPicked(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit request');
    } finally {
      setSubmittingModal(false);
    }
  };

  const handleStartReturnJourney = async () => {
    if (!currentTenant || !employeeId) return;
    setStarting(true);
    try {
        await logEvent(currentTenant.id, employeeId, 'START_RETURN_JOURNEY', activeLocationId || undefined);
        toast.success('Started return journey. Live tracking enabled.');
        setShowPostCompleteOptions(false);
    } catch (e: any) {
    } finally { setStarting(false); }
  };

  const handleReachedEndPoint = async () => {
    if (!currentTenant || !employeeId) return;
    setStarting(true);
    try {
        await logEvent(currentTenant.id, employeeId, 'REACHED_ENDPOINT', activeLocationId || undefined);
        toast.success('Return journey completed! Ready for next assignment.');
    } catch (e: any) {
    } finally { setStarting(false); }
  };

  const handleReworkReturnConfirm = async () => {
    if (!reworkLocationPicked || !reworkReason.trim() || !currentTenant || !employeeId) return;
    setStarting(true);
    try {
      await logEvent(currentTenant.id, employeeId, 'START_JOURNEY', reworkLocationPicked.id);
      toast.success(`Detour started to ${reworkLocationPicked.location_name}. Reason: ${reworkReason}`);
      setShowReworkReturnModal(false);
      setReworkReason('');
      setReworkLocationPicked(null);
      setReworkStep('reason');
    } catch (e: any) {
      toast.error('Failed to start detour journey.');
    } finally { setStarting(false); }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'assigned': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'in_progress': return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'paused': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'approved': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'cancelled': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const formatStepName = (step: string) => {
      return step.replace(/_/g, ' ');
  };

  if (isInitialLoad) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="flex flex-col md:flex-row justify-between mb-4">
            <div className="h-8 bg-gray-200 rounded w-64 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-48"></div>
        </div>
        <div className="h-32 bg-gray-200 rounded-xl w-full border border-gray-100"></div>
        <div className="flex gap-4 border-b border-gray-200 pb-2">
            <div className="h-10 bg-gray-200 rounded w-40"></div>
            <div className="h-10 bg-gray-200 rounded w-32"></div>
        </div>
        <div className="h-64 bg-gray-200 rounded-xl w-full border border-gray-100"></div>
      </div>
    );
  }

  return (
    <div className=" max-w-5xl mx-auto space-y-6">
      
      {/* OFFLINE BANNER */}
      {isOffline && (
        <div className="bg-red-600 text-white rounded-lg p-4 flex items-start gap-3 shadow-lg">
          <WifiOff className="h-6 w-6 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-sm">You are offline</h3>
            <p className="text-red-100 text-sm mt-1">
              Please check your network or GPS connection. Your last location has been saved. Tracking will resume automatically when you reconnect.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between mb-2">
        <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Briefcase className="h-6 w-6 text-blue-600" />
            My Work Journey
            </h1>
            <p className="text-sm text-gray-600 mt-1">Manage your full day journey, locations, and continuous tracking.</p>
        </div>
      </div>

      {/* OVERALL JOURNEY STATUS CARD */}
      <div className="bg-white p-5 rounded-lg shadow-sm border border-blue-200 bg-gradient-to-r from-blue-50 to-white">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-1">Today's Journey Status</h3>
                  <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-full ${isBackgroundTracking ? 'bg-green-100' : 'bg-gray-100'}`}>
                          {isBackgroundTracking ? <Navigation className="h-5 w-5 text-green-600 animate-pulse" /> : <Home className="h-5 w-5 text-gray-400" />}
                      </div>
                      <span className="text-xl font-bold text-gray-900">{formatStepName(currentStep)}</span>
                  </div>
              </div>

              <div className="flex flex-wrap gap-2">
                  {currentStep === 'RETURNING' && (
                    <div className="flex flex-wrap gap-2">
                      <button
                          onClick={handleReachedEndPoint}
                          disabled={starting}
                          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm flex items-center gap-2"
                      >
                          <CheckCircle className="h-4 w-4" /> Reached End Point
                      </button>
                      {(remainingAssignedTasks.length > 0 || locationSettings.allow_add_new_location) && (
                        <button
                            onClick={() => { setShowReworkReturnModal(true); setReworkStep('reason'); setReworkReason(''); setReworkLocationPicked(null); }}
                            disabled={starting}
                            className="px-4 py-2 bg-orange-100 text-orange-700 border border-orange-300 rounded-lg hover:bg-orange-200 font-medium text-sm flex items-center gap-2"
                        >
                            <RotateCcw className="h-4 w-4" /> Start New Location
                        </button>
                      )}
                    </div>
                  )}
              </div>
          </div>
      </div>

      {/* WHAT'S NEXT? PANEL */}
      {(currentStep === 'COMPLETED_WORK') && showPostCompleteOptions && (
        <div className="bg-white rounded-xl border-2 border-indigo-200 shadow-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                Work Completed! What's Next?
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">Choose your next action to continue the journey.</p>
            </div>
            <button onClick={() => setShowPostCompleteOptions(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {remainingAssignedTasks.length > 0 && (
              <button
                onClick={() => setShowNextLocationModal(true)}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all text-center group"
              >
                <div className="w-12 h-12 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center transition-colors">
                  <ArrowRight className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <div className="font-semibold text-blue-900">Go to Next Location</div>
                  <div className="text-xs text-blue-600 mt-0.5">{remainingAssignedTasks.length} location{remainingAssignedTasks.length > 1 ? 's' : ''} remaining</div>
                </div>
              </button>
            )}

            {locationSettings.allow_add_new_location && (
              <button
                onClick={() => setShowAddLocationModal(true)}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-400 transition-all text-center group"
              >
                <div className="w-12 h-12 bg-emerald-100 group-hover:bg-emerald-200 rounded-full flex items-center justify-center transition-colors">
                  <Plus className="h-6 w-6 text-emerald-600" />
                </div>
                <div>
                  <div className="font-semibold text-emerald-900">Add New Location</div>
                  <div className="text-xs text-emerald-600 mt-0.5">Start journey to a new site</div>
                </div>
              </button>
            )}

            <button
              onClick={handleStartReturnJourney}
              disabled={starting}
              className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-indigo-200 bg-indigo-50 hover:bg-indigo-100 hover:border-indigo-400 transition-all text-center group disabled:opacity-60"
            >
              <div className="w-12 h-12 bg-indigo-100 group-hover:bg-indigo-200 rounded-full flex items-center justify-center transition-colors">
                {starting ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" /> : <Navigation className="h-6 w-6 text-indigo-600" />}
              </div>
              <div>
                <div className="font-semibold text-indigo-900">Start Return Journey</div>
                <div className="text-xs text-indigo-600 mt-0.5">End day & head back</div>
              </div>
            </button>
          </div>
        </div>
      )}

      {(currentStep === 'COMPLETED_WORK') && !showPostCompleteOptions && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle className="h-5 w-5" />
           <span className="font-medium text-sm">Work completed. Ready for your next action.</span>
         </div>
          <button
            onClick={() => setShowPostCompleteOptions(true)}
            className="px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-1"
          >
            <ArrowRight className="h-3.5 w-3.5" /> What's Next?
          </button>
        </div>
      )}

      {/* TABS */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('active')}
          className={
            `flex items-center gap-2 py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'active'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Activity className="h-4 w-4" />
          Active Assignments
          {activeTasks.length > 0 && (
            <span className="ml-2 bg-blue-100 text-blue-600 py-0.5 px-2 rounded-full text-xs">
              {activeTasks.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`flex items-center gap-2 py-3 px-6 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <History className="h-4 w-4" />
          History
        </button>
      </div>

      {/* ACTIVE TAB CONTENT */}
      {activeTab === 'active' && (
        <div className="space-y-6">
          {activeTasks.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No pending locations</h3>
              <p className="text-gray-500 text-sm">You don't have any active work assignments at the moment.</p>
            </div>
          ) : (
            activeTasks.map((location) => {
              const isCurrentActive = location.id === activeLocationId;
              const isLocked = activeLocationId && activeLocationId !== location.id && !['PAUSED', 'COMPLETED_WORK', 'DAY_COMPLETED'].includes(currentStep);
              
              return (
                <div key={location.id} className={`bg-white rounded-lg shadow-sm border ${isCurrentActive ? 'border-blue-400 shadow-blue-50 ring-2 ring-blue-400' : 'border-gray-200'} p-6 transition-all ${isLocked ? 'opacity-60' : ''}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <MapPin className="h-5 w-5 text-blue-600" />
                        {location.location_name}
                      </h2>
                      {location.location_description && (
                        <p className="text-sm text-gray-600 mt-1">{location.location_description}</p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border tracking-wide ${getStatusColor(location.status)}`}>
                      {location.status.replace('_', ' ').toUpperCase()}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <div className="text-xs text-gray-500 mb-1 font-medium">Location Address</div>
                      {location.formatted_address ? (
                        <button
                          onClick={() => { setSelectedLocation(location); setShowMapModal(true); }}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline text-left flex items-start gap-1"
                        >
                          {location.formatted_address}
                          <ExternalLink className="h-3 w-3 mt-1 flex-shrink-0" />
                        </button>
                      ) : (
                        <div className="text-sm text-gray-600">
                          {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                            <div className="text-xs text-gray-500 mb-1 font-medium flex items-center gap-1"><Clock className="h-3 w-3"/>Assignment Date</div>
                            <div className="text-sm font-medium text-gray-900">
                                {format(new Date(location.assignment_date), 'MMM d, yyyy')}
                            </div>
                        </div>
                        {locationSettings.radius_monitoring_enabled && (
                          <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                              <div className="text-xs text-gray-500 mb-1 font-medium flex items-center gap-1"><Target className="h-3 w-3"/> Radius</div>
                              <div className="text-sm font-medium text-gray-900">
                                  {location.allowed_radius_meters}m
                              </div>
                          </div>
                        )}
                    </div>
                  </div>

                  {isCurrentActive && isBackgroundTracking && locationSettings.live_tracking_enabled &&
                   (currentStep === 'WORKING' || currentStep === 'PAUSED') && (
                    <div className="mb-6 p-4 rounded-lg border-2 bg-gray-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {isWithinRadius ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-red-600" />}
                          <span className={`font-semibold ${isWithinRadius ? 'text-green-800' : 'text-red-800'}`}>
                            {isWithinRadius ? 'Within Work Area' : 'Outside Work Area'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {/* Movement state badge */}
                          {currentSpeedMs !== null && (
                            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                              currentSpeedMs >= 8 ? 'bg-blue-100 text-blue-700' :
                              currentSpeedMs >= 0.5 ? 'bg-yellow-100 text-yellow-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {currentSpeedMs >= 8 ? '🚗 Driving' : currentSpeedMs >= 0.5 ? '🚶 Walking' : '🔴 Idle'}
                              &nbsp;·&nbsp;{(currentSpeedMs * 3.6).toFixed(1)} km/h
                            </span>
                          )}
                          <div className="flex items-center gap-1 bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            Live Tracking
                          </div>
                        </div>
                      </div>
                      {distanceFromCenter !== null && locationSettings.radius_monitoring_enabled && (
                        <div className="text-sm text-gray-700 ml-7">
                          Distance from center: <span className="font-bold">{distanceFromCenter.toFixed(1)}m</span> / {location.allowed_radius_meters}m
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-3 pt-4 border-t border-gray-100">
                    
                    {(!activeLocationId || ['NOT_STARTED', 'PAUSED', 'COMPLETED_WORK', 'DAY_COMPLETED'].includes(currentStep)) && location.status === 'assigned' && !isLocked && (
                      <button
                        onClick={() => handleStartJourney(location)}
                        disabled={starting}
                        className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
                      >
                        {starting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Navigation className="h-4 w-4" />}
                        Start Journey
                      </button>
                    )}

                    {isCurrentActive && currentStep === 'TRAVELING' && (
                       <button
                         onClick={() => handleReachedLocation(location)}
                         disabled={starting}
                         className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
                       >
                         {starting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <MapPin className="h-4 w-4" />}
                         Reached Location
                       </button>
                    )}

                    {isCurrentActive && currentStep === 'REACHED_LOCATION' && (
                      <button
                        onClick={() => handleStartWork(location)}
                        disabled={starting}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
                      >
                        {starting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Play className="h-4 w-4" />}
                        Start Work
                      </button>
                    )}

                    {isCurrentActive && currentStep === 'PAUSED' && location.status === 'paused' && (
                      <button
                        onClick={() => handleResumeWork(location)}
                        disabled={starting}
                        className="flex-1 px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-semibold"
                      >
                        {starting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <PlayCircle className="h-4 w-4" />}
                        Resume Work
                      </button>
                    )}

                    {isCurrentActive && (currentStep === 'WORKING' || currentStep === 'PAUSED') && (
                      <>
                        {currentStep === 'WORKING' && (
                          <button
                            onClick={() => { setSelectedLocation(location); setReasonText(''); setShowPauseModal(true); }}
                            className="flex-1 px-4 py-2.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors flex items-center justify-center gap-2 font-semibold"
                          >
                            <PauseCircle className="h-4 w-4" />
                            Pause Work
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedLocation(location); setReasonText(''); setShowCompleteModal(true); }}
                          className="flex-1 px-4 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 font-semibold"
                        >
                          <StopCircle className="h-4 w-4" />
                          Complete Work
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => { setSelectedLocation(location); setShowMapModal(true); }}
                      className="px-4 py-2.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-2 font-medium"
                    >
                      <Map className="h-4 w-4" />
                      View Map
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* ADD LOCATION BUTTON */}
          {locationSettings.allow_add_new_location && (
            ['NOT_STARTED', 'COMPLETED_WORK', 'RETURNING', 'DAY_COMPLETED'].includes(currentStep) ||
            !activeTasks.some(t => ['in_progress', 'paused', 'assigned'].includes(t.status))
          ) && !showPostCompleteOptions && (
              <div className="flex justify-center mt-6">
                <button 
                  onClick={() => setShowAddLocationModal(true)}
                  className="px-6 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 font-semibold hover:border-blue-500 hover:text-blue-600 transition-colors flex items-center gap-2"
                >
                  <Plus className="h-5 w-5" /> Request New Work Location
                </button>
              </div>
          )}
        </div>
      )}

      {/* HISTORY TAB CONTENT */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {historyTasks.length === 0 ? (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
              <History className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">No History Yet</h3>
              <p className="text-gray-500 text-sm">Completed or cancelled assignments will appear here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {historyTasks.map((location) => (
                <div key={location.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 hover:border-blue-300 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-gray-900 truncate pr-4">{location.location_name}</h3>
                        <span className={`flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${getStatusColor(location.status)}`}>
                            {location.status}
                        </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-3 truncate">
                        {location.formatted_address || `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`}
                    </div>
                    <div className="text-xs text-gray-500 flex justify-between items-center border-t border-gray-100 pt-3">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3"/> {format(new Date(location.assignment_date), 'MMM d, yyyy')}</span>
                        {location.completed_at && (
                            <span className="text-green-700 font-medium">Completed: {format(new Date(location.completed_at), 'MMM d')}</span>
                        )}
                    </div>
                </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* MODALS */}

      {/* MAP MODAL */}
      {showMapModal && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-[60]">
          <div className="bg-white rounded-lg max-w-3xl w-full">
            <div className="p-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="font-bold text-lg">Location Map</h2>
              <button onClick={() => { setShowMapModal(false); setSelectedLocation(null); }} className="text-gray-500 hover:text-gray-800 text-2xl leading-none">×</button>
            </div>
            <div className="p-4">
                <MapViewerSwitch
                    latitude={selectedLocation.latitude}
                    longitude={selectedLocation.longitude}
                    locationName={selectedLocation.location_name}
                    address={selectedLocation.formatted_address}
                    height="500px"
                    radius={selectedLocation.allowed_radius_meters}
                    currentLat={currentUIPosition?.lat}
                    currentLng={currentUIPosition?.lng}
                    showNavigation={!!currentUIPosition && selectedLocation.id === activeLocationId && ['TRAVELING', 'WORKING', 'PAUSED'].includes(currentStep)}
                />
            </div>
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {showPauseModal && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Pause Work</h2>
            <p className="text-sm text-gray-600 mb-4">Location: <span className="font-semibold">{selectedLocation.location_name}</span></p>
            
            <form onSubmit={handlePauseSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason for Pausing</label>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500"
                  rows={3}
                  placeholder="E.g., Lunch break, waiting for materials..."
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowPauseModal(false); setSelectedLocation(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" disabled={submittingModal}>Cancel</button>
                <button type="submit" disabled={submittingModal} className="flex-1 px-4 py-2 bg-yellow-500 text-white rounded-lg flex items-center justify-center gap-2">
                  {submittingModal ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <PauseCircle className="h-4 w-4" />} Confirm Pause
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* COMPLETE MODAL */}
      {showCompleteModal && selectedLocation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-2">Complete Work</h2>
            <p className="text-sm text-gray-600 mb-4">Location: <span className="font-semibold">{selectedLocation.location_name}</span></p>

            <form onSubmit={handleCompleteSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">Work Summary / Reason</label>
                <textarea
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Summarize the work done or reason for completion..."
                  required
                />
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => { setShowCompleteModal(false); setSelectedLocation(null); }} className="flex-1 px-4 py-2 border border-gray-300 rounded-lg" disabled={submittingModal}>Cancel</button>
                <button type="submit" disabled={submittingModal} className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg flex items-center justify-center gap-2">
                  {submittingModal ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <StopCircle className="h-4 w-4" />} Complete Work
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEXT LOCATION MODAL */}
      {showNextLocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Navigation className="h-5 w-5 text-blue-600" />
                Select Next Location
              </h2>
              <button onClick={() => setShowNextLocationModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">Your current GPS location will be used as the starting point for the next journey.</p>
              <div className="space-y-3">
                {remainingAssignedTasks.map((loc) => (
                  <button
                    key={loc.id}
                    onClick={() => handleStartJourney(loc)}
                    disabled={starting}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-all text-left group disabled:opacity-60"
                  >
                    <div className="w-10 h-10 bg-blue-100 group-hover:bg-blue-200 rounded-full flex items-center justify-center flex-shrink-0 transition-colors">
                      <MapPin className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-gray-900">{loc.location_name}</div>
                      {loc.location_description && (
                        <div className="text-sm text-gray-500 mt-0.5 truncate">{loc.location_description}</div>
                      )}
                      {loc.formatted_address && (
                        <div className="text-xs text-gray-400 mt-1 truncate">{loc.formatted_address}</div>
                      )}
                    </div>
                    {starting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 flex-shrink-0 mt-1" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REWORK RETURN MODAL */}
      {showReworkReturnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-orange-50 rounded-t-lg">
              <h2 className="text-xl font-bold text-orange-900 flex items-center gap-2">
                <RotateCcw className="h-5 w-5" />
                Start New Location During Return
              </h2>
              <button onClick={() => { setShowReworkReturnModal(false); setReworkReason(''); setReworkLocationPicked(null); setReworkStep('reason'); }} className="text-orange-400 hover:text-orange-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {reworkStep === 'reason' ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason for Detour <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={reworkReason}
                      onChange={(e) => setReworkReason(e.target.value)}
                      rows={3}
                      placeholder="Why are you starting a new location during return? e.g., emergency client visit..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => { setShowReworkReturnModal(false); setReworkReason(''); setReworkStep('reason'); }}
                      className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => setReworkStep('pick_location')}
                      disabled={!reworkReason.trim()}
                      className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      Next: Pick Location <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-sm text-gray-600 mb-2 p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <span className="font-medium text-orange-800">Reason:</span> {reworkReason}
                  </div>
                  {remainingAssignedTasks.length > 0 ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium text-gray-700">Select a location to visit:</p>
                      {remainingAssignedTasks.map((loc) => (
                        <button
                          key={loc.id}
                          onClick={() => setReworkLocationPicked(loc)}
                          className={`w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all text-left ${reworkLocationPicked?.id === loc.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200 hover:border-orange-300 hover:bg-orange-50/50'}`}
                        >
                          <MapPin className={`h-5 w-5 mt-0.5 flex-shrink-0 ${reworkLocationPicked?.id === loc.id ? 'text-orange-600' : 'text-gray-400'}`} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-gray-900">{loc.location_name}</div>
                            {loc.formatted_address && <div className="text-xs text-gray-400 mt-0.5 truncate">{loc.formatted_address}</div>}
                          </div>
                          {reworkLocationPicked?.id === loc.id && <CheckCircle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />}
                        </button>
                      ))}
                    </div>
                  ) : locationSettings.allow_add_new_location ? (
                    <div className="text-center py-4 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
                      No pre-assigned locations. You can add a new location from the main page.
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500 text-sm border border-dashed border-gray-300 rounded-lg">
                      No remaining assigned locations.
                    </div>
                  )}
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setReworkStep('reason')} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm">
                      ← Back
                    </button>
                    <button
                      onClick={handleReworkReturnConfirm}
                      disabled={!reworkLocationPicked || starting}
                      className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {starting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> : <Navigation className="h-4 w-4" />}
                      Start Journey
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ADD NEW LOCATION / REQUEST GATE PASS MODAL */}
      {showAddLocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            {/* Sticky Header */}
            <div className="sticky z-50 top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Briefcase className="h-5 w-5 text-blue-600" />
                Add New Work Location
              </h2>
              <button
                type="button"
                onClick={() => { 
                  setShowAddLocationModal(false); 
                  setNewLocationPicked(null); 
                  setNewLocationName(''); 
                  setNewLocationDesc(''); 
                  setNewLocationStartTime('');
                  setNewLocationEndTime('');
                  setNewLocationRadius('100'); 
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <span className="text-xl leading-none">×</span>
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleAddNewLocationSubmit}
              className="p-6 space-y-6"
              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
            >
              <div className="bg-blue-50 border border-blue-200 text-blue-800 text-sm p-3 rounded-lg flex items-start gap-2">
                <Info className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <p>This will create and assign a new Official Gate Pass instantly. You can begin tracking towards this location immediately.</p>
              </div>

              {/* Location Name + Date */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Company / Location Name *</label>
                  <input
                    type="text"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Client Site, Warehouse B"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="text"
                    readOnly
                    value={new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Start and End Time */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
                  <input
                    type="time"
                    value={newLocationStartTime}
                    onChange={(e) => setNewLocationStartTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
                  <input
                    type="time"
                    value={newLocationEndTime}
                    onChange={(e) => setNewLocationEndTime(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>

              {/* Work Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Work Description *</label>
                <textarea
                  value={newLocationDesc}
                  onChange={(e) => setNewLocationDesc(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={2}
                  placeholder="Reason for this visit..."
                  required
                />
              </div>

              {/* Map Picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Select Location on Map *</label>
                <MapPickerSwitch
                  onLocationSelect={(data) => setNewLocationPicked(data)}
                  showSearch={true}
                  height="400px"
                />
              </div>

              {/* Radius */}
              {locationSettings.radius_monitoring_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Allowed Radius (meters)</label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={newLocationRadius}
                    onChange={(e) => setNewLocationRadius(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="100"
                  />
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { 
                    setShowAddLocationModal(false); 
                    setNewLocationPicked(null); 
                    setNewLocationName(''); 
                    setNewLocationDesc(''); 
                    setNewLocationStartTime('');
                    setNewLocationEndTime('');
                    setNewLocationRadius('100'); 
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  disabled={submittingModal}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingModal || !newLocationPicked || !newLocationName.trim() || !newLocationStartTime || !newLocationEndTime}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex justify-center items-center gap-2"
                >
                  {submittingModal
                    ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    : <MapPin className="h-4 w-4" />}
                  Assign Location
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
