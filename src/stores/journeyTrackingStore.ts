import { create } from 'zustand';
import { JourneyEventType, JourneyTrackingLog } from '../types/workLocation';
import { gpsTrackingService } from '../lib/gpsTracking';
import * as workLocationLib from '../lib/workLocations';
import { useLocationSettingsStore } from './locationSettingsStore';
import { useWorkLocationsStore } from './workLocationsStore';
import toast from 'react-hot-toast';

export type JourneyStep = 
  | 'NOT_STARTED'        // 1. Assignment Received, waiting to start journey
  | 'TRAVELING'          // 2. Journey Started
  | 'REACHED_LOCATION'   // 3. Reached
  | 'WORKING'            // 4. Start Work / Resume Work
  | 'PAUSED'             // 5. Pause Work
  | 'COMPLETED_WORK'     // 6. Complete Work
  | 'RETURNING'          // 8. Start Return Journey
  | 'DAY_COMPLETED';     // 9. End Point Reached

interface JourneyTrackingState {
  logs: JourneyTrackingLog[];
  currentStep: JourneyStep;
  activeLocationId: string | null;
  loading: boolean;
  error: string | null;
  isBackgroundTracking: boolean;
  lastKnownPosition: { latitude: number; longitude: number; accuracy?: number } | null;

  fetchTodayLogs: (tenantId: string, employeeId: string) => Promise<void>;
  logEvent: (tenantId: string, employeeId: string, eventType: JourneyEventType, locationId?: string) => Promise<void>;
  calculateCurrentStep: (fetchedLogs: JourneyTrackingLog[], tenantId?: string, employeeId?: string) => void;
  
  startBackgroundTracking: (tenantId: string, employeeId: string, intervalMins: number) => void;
  stopBackgroundTracking: () => void;
}

let trackingIntervalRef: ReturnType<typeof setInterval> | null = null;

export const useJourneyTrackingStore = create<JourneyTrackingState>((set, get) => ({
  logs: [],
  currentStep: 'NOT_STARTED',
  activeLocationId: null,
  loading: false,
  error: null,
  isBackgroundTracking: false,
  lastKnownPosition: null,

  fetchTodayLogs: async (tenantId: string, employeeId: string) => {
    set({ loading: true, error: null });
    try {
      const logs = await workLocationLib.getTodayJourneyLogs(tenantId, employeeId);
      set({ logs, loading: false });
      get().calculateCurrentStep(logs, tenantId, employeeId);
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  calculateCurrentStep: (fetchedLogs: JourneyTrackingLog[], tenantId?: string, employeeId?: string) => {
    if (!fetchedLogs || fetchedLogs.length === 0) {
      set({ currentStep: 'NOT_STARTED', activeLocationId: null });
      return;
    }

    const latestLog = fetchedLogs[fetchedLogs.length - 1];
    let step: JourneyStep = 'NOT_STARTED';

    switch (latestLog.event_type) {
      case 'START_JOURNEY': step = 'TRAVELING'; break;
      case 'LIVE_TRACK_JOURNEY': step = 'TRAVELING'; break;
      case 'REACHED_LOCATION': step = 'REACHED_LOCATION'; break;
      case 'START_WORK': step = 'WORKING'; break;
      case 'LIVE_TRACK_WORK': step = 'WORKING'; break;
      case 'RESUME_WORK': step = 'WORKING'; break;
      case 'PAUSE_WORK': step = 'PAUSED'; break;
      case 'COMPLETE_WORK': step = 'COMPLETED_WORK'; break;
      case 'START_RETURN_JOURNEY': step = 'RETURNING'; break;
      case 'REACHED_ENDPOINT': step = 'DAY_COMPLETED'; break;
    }

    set({ currentStep: step, activeLocationId: latestLog.work_location_id || null });

    // Auto-resume background tracking if in an active state and credentials provided
    if (tenantId && employeeId) {
      const settings = useLocationSettingsStore.getState().settings;
      if (['TRAVELING', 'RETURNING'].includes(step)) {
         get().startBackgroundTracking(tenantId, employeeId, settings.journey_tracking_interval_mins);
      } else if (['WORKING'].includes(step) && settings.radius_monitoring_enabled) {
         get().startBackgroundTracking(tenantId, employeeId, settings.work_radius_tracking_interval_mins);
      } else {
         get().stopBackgroundTracking();
      }
    }
  },

  logEvent: async (tenantId: string, employeeId: string, eventType: JourneyEventType, locationId?: string) => {
    set({ loading: true, error: null });
    try {
      const settings = useLocationSettingsStore.getState().settings;
      const isOfflineEvent = ['GPS_SIGNAL_LOST', 'GPS_SIGNAL_RESTORED'].includes(eventType);
      
      let position: { latitude: number; longitude: number; accuracy?: number } | null = null;
      let battery = null;

      try {
        position = await gpsTrackingService.getCurrentPosition();
        battery = await gpsTrackingService.getBatteryLevel();
        // Cache the last known good position
        set({ lastKnownPosition: position });
      } catch (err: any) {
        if (isOfflineEvent) {
          // For offline events, fall back to last cached position - this is the whole point!
          position = get().lastKnownPosition;
          console.info('Using cached position for offline event:', position);
        } else if (settings.live_tracking_enabled || settings.radius_monitoring_enabled) {
          throw new Error(`Location fetch failed: ${err.message}. Admin policy strictly requires location tracking to be recorded.`);
        } else {
          console.warn('Proceeding without GPS due to relaxed settings.');
        }
      }

      // If locationId not provided, use the last known activeLocationId if available.
      const targetLocationId = locationId || get().activeLocationId || undefined;

      const newLog = await workLocationLib.logJourneyEvent(
        tenantId,
        employeeId,
        eventType,
        position,
        targetLocationId,
        battery || undefined
      );

      const logs = [...get().logs, newLog];
      set({ logs, loading: false });
      get().calculateCurrentStep(logs);

      // Handle Background Tracking State Changes
      if (['START_JOURNEY', 'START_RETURN_JOURNEY'].includes(eventType)) {
          get().startBackgroundTracking(tenantId, employeeId, settings.journey_tracking_interval_mins);
      } else if (['REACHED_LOCATION', 'REACHED_ENDPOINT'].includes(eventType)) {
          get().stopBackgroundTracking();
      } else if (['START_WORK', 'RESUME_WORK'].includes(eventType)) {
          if (settings.radius_monitoring_enabled) {
              get().startBackgroundTracking(tenantId, employeeId, settings.work_radius_tracking_interval_mins);
          } else {
              get().stopBackgroundTracking();
          }
      } else if (['PAUSE_WORK', 'COMPLETE_WORK'].includes(eventType)) {
          get().stopBackgroundTracking();
      }

    } catch (error: any) {
      set({ error: error.message, loading: false });
      toast.error(error.message || 'Failed to record journey event.');
      throw error;
    }
  },

  startBackgroundTracking: (tenantId: string, employeeId: string, intervalMins: number) => {
    get().stopBackgroundTracking(); // Clear any existing

    const ms = intervalMins * 60 * 1000;
    set({ isBackgroundTracking: true });

    let lastLogTime = Date.now();

    const performLivePing = async (manualPosition?: any) => {
      try {
        const step = get().currentStep;
        let pEvent: JourneyEventType = 'LIVE_TRACK_JOURNEY';
        if (step === 'WORKING' || step === 'PAUSED') {
          pEvent = 'LIVE_TRACK_WORK';
        }
        
        const position = manualPosition || await gpsTrackingService.getCurrentPosition();
        const battery = await gpsTrackingService.getBatteryLevel();
        
        // Cache the last known position for offline fallback
        set({ lastKnownPosition: position });
        
        await workLocationLib.logJourneyEvent(
            tenantId,
            employeeId,
            pEvent,
            position,
            get().activeLocationId || undefined,
            battery || undefined
        );

        if (get().activeLocationId) {
            const wstore = useWorkLocationsStore.getState();
            const loc = wstore.workLocations.find(l => l.id === get().activeLocationId);
            if (loc) {
                const lsStore = useLocationSettingsStore.getState();
                const radiusMonitoringEnabled = lsStore.settings.radius_monitoring_enabled;
                
                try {
                  await workLocationLib.recordTracking(
                      tenantId,
                      loc.id,
                      employeeId,
                      position,
                      loc,
                      battery || undefined,
                      radiusMonitoringEnabled
                  );
                } catch (e) {
                  console.warn("Legacy work_location_tracking insertion failed", e);
                }

                if (pEvent === 'LIVE_TRACK_WORK') {
                    const distance = gpsTrackingService.calculateDistance(position.latitude, position.longitude, loc.latitude, loc.longitude);
                    if (distance > loc.allowed_radius_meters) {
                        toast.error('Warning: You have left the assigned work area!', { duration: 8000 });
                    }
                }
            }
        }
      } catch (err) {
        console.warn('Interval ping failed', err);
        toast.error("GPS Signal Lost! Please check location permissions.", { id: 'gps-interval-fail' });
      }
    };

    // Enable GPS Hardware tracking (Resilient to background tab throttling)
    gpsTrackingService.startTracking(
      (position) => {
        const now = Date.now();
        // Fire if the expected interval has passed
        if (now - lastLogTime >= ms) {
           lastLogTime = now;
           performLivePing(position);
        }
      },
      (err) => {
        console.warn('Background tracking error:', err);
        toast.error("GPS Tracking Interrupted. Check browser location permissions.");
      },
      { enableHighAccuracy: true }
    );

    // Dedicated JS thread interval for stationary workers
    trackingIntervalRef = setInterval(() => {
      const now = Date.now();
      // Ensure we don't double ping if watchPosition recently fired
      if (now - lastLogTime >= (ms - 5000)) {
         lastLogTime = now;
         performLivePing();
      }
    }, ms);
  },

  stopBackgroundTracking: () => {
    if (trackingIntervalRef) {
      clearInterval(trackingIntervalRef);
      trackingIntervalRef = null;
    }
    gpsTrackingService.stopTracking();
    set({ isBackgroundTracking: false });
  }
}));
