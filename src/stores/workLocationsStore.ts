import { create } from 'zustand';
import type {
  WorkLocation,
  WorkLocationTracking,
  WorkLocationViolation,
  WorkLocationNotification,
  CreateWorkLocationInput,
  GPSCoordinates,
} from '../types/workLocation';
import * as workLocationLib from '../lib/workLocations';
import { gpsTrackingService } from '../lib/gpsTracking';
import { useLocationSettingsStore } from './locationSettingsStore';

let forcePingInterval: ReturnType<typeof setInterval> | null = null;

interface WorkLocationsState {
  workLocations: WorkLocation[];
  trackingHistory: WorkLocationTracking[];
  violations: WorkLocationViolation[];
  notifications: WorkLocationNotification[];
  activeWorkLocation: WorkLocation | null;
  activeWorkPauses: any[];
  loading: boolean;
  error: string | null;

  isTracking: boolean;
  currentPosition: GPSCoordinates | null;
  lastTrackingUpdate: string | null;

  fetchWorkLocations: (tenantId: string) => Promise<void>;
  fetchEmployeeWorkLocations: (tenantId: string, employeeId: string) => Promise<void>;
  fetchActiveWorkLocation: (tenantId: string, employeeId: string) => Promise<void>;
  createWorkLocation: (tenantId: string, userId: string, input: CreateWorkLocationInput) => Promise<void>;
  startWork: (workLocationId: string) => Promise<void>;
  pauseWork: (workLocationId: string, reason: string, finalPosition?: GPSCoordinates) => Promise<void>;
  resumeWork: (workLocationId: string) => Promise<void>;
  completeWork: (workLocationId: string, reason: string) => Promise<void>;
  approveWork: (workLocationId: string, userId: string, workAmount?: number, workAmountUnit?: string) => Promise<void>;
  cancelWorkLocation: (workLocationId: string, reason: string) => Promise<void>;
  deleteWorkLocation: (workLocationId: string) => Promise<void>;

  startTracking: (tenantId: string, workLocation: WorkLocation, employeeId: string) => Promise<void>;
  stopTracking: () => void;
  recordManualPosition: (tenantId: string, workLocationId: string, employeeId: string, workLocation: WorkLocation) => Promise<void>;

  fetchTrackingHistory: (workLocationId: string) => Promise<void>;
  fetchWorkPauses: (workLocationId: string) => Promise<void>;
  fetchViolations: (tenantId: string, workLocationId?: string) => Promise<void>;
  fetchNotifications: (tenantId: string, userId: string) => Promise<void>;
  markNotificationAsRead: (notificationId: string) => Promise<void>;
  updateWorkLocation: (workLocationId: string, updates: any) => Promise<void>;
  denyWorkLocation: (workLocationId: string, reason: string) => Promise<void>;

  clearError: () => void;
  reset: () => void;
}

export const useWorkLocationsStore = create<WorkLocationsState>((set, get) => ({
  workLocations: [],
  trackingHistory: [],
  violations: [],
  notifications: [],
  activeWorkPauses: [],
  activeWorkLocation: null,
  loading: false,
  error: null,

  isTracking: false,
  currentPosition: null,
  lastTrackingUpdate: null,

  fetchWorkLocations: async (tenantId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await workLocationLib.getWorkLocations(tenantId);
      set({ workLocations: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchEmployeeWorkLocations: async (tenantId: string, employeeId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await workLocationLib.getEmployeeWorkLocations(tenantId, employeeId);
      set({ workLocations: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchActiveWorkLocation: async (tenantId: string, employeeId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await workLocationLib.getActiveWorkLocation(tenantId, employeeId);
      set({ activeWorkLocation: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  createWorkLocation: async (tenantId: string, userId: string, input: CreateWorkLocationInput) => {
    set({ loading: true, error: null });
    try {
      const newLocation = await workLocationLib.createWorkLocation(tenantId, userId, input);
      set((state) => ({
        workLocations: [newLocation, ...state.workLocations],
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  updateWorkLocation: async (workLocationId: string, updates: any) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.updateWorkLocation(workLocationId, updates);
      set((state) => ({
        workLocations: state.workLocations.map((wl) =>
          wl.id === workLocationId ? updated : wl
        ),
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  startWork: async (workLocationId: string) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.startWork(workLocationId);
      set((state) => ({
        workLocations: state.workLocations.map((wl) =>
          wl.id === workLocationId ? updated : wl
        ),
        activeWorkLocation: updated,
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  fetchWorkPauses: async (workLocationId: string) => {
    try {
      const pauses = await workLocationLib.getWorkPauses(workLocationId);
      set({ activeWorkPauses: pauses });
    } catch (error) {
      console.error('Failed to fetch pauses', error);
    }
  },

  completeWork: async (workLocationId: string, reason: string) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.completeWork(workLocationId, reason);
      set((state) => ({
        workLocations: state.workLocations.map((wl) =>
          wl.id === workLocationId ? updated : wl
        ),
        activeWorkLocation: null,
        loading: false,
      }));
      get().stopTracking();
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  pauseWork: async (workLocationId: string, reason: string, finalPosition?: GPSCoordinates) => {
    set({ loading: true, error: null });
    // Get the workLocation from state to extract metadata
    const workLocation = get().workLocations.find(wl => wl.id === workLocationId);

    try {
      // 1. If finalPosition provided, RECORD IT while status is still 'in_progress' 
      //    This ensures the DB trigger catches the violation event!
      if (finalPosition && workLocation) {
        const radiusEnabled = useLocationSettingsStore.getState().settings.radius_monitoring_enabled;
        const batteryLevel = await gpsTrackingService.getBatteryLevel();
        
        await workLocationLib.recordTracking(
          workLocation.tenant_id,
          workLocationId,
          workLocation.employee_id,
          finalPosition,
          workLocation,
          batteryLevel || undefined,
          radiusEnabled
        );
      }

      // 2. Perform the actual pause (status change)
      const updated = await workLocationLib.pauseWork(workLocationId, reason);
      
      set((state) => ({
        workLocations: state.workLocations.map((wl) =>
          wl.id === workLocationId ? updated : wl
        ),
        activeWorkLocation: updated,
        loading: false,
      }));
      
      get().stopTracking(); // Turn off GPS hardware while manually paused to save battery
      await get().fetchWorkPauses(workLocationId);
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  resumeWork: async (workLocationId: string) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.resumeWork(workLocationId);
      set((state) => ({
        workLocations: state.workLocations.map((wl) =>
          wl.id === workLocationId ? updated : wl
        ),
        activeWorkLocation: updated,
        loading: false,
      }));
      await get().fetchWorkPauses(workLocationId);
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  approveWork: async (workLocationId: string, userId: string, workAmount?: number, workAmountUnit?: string) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.approveWork(workLocationId, userId, workAmount, workAmountUnit);
      set((state) => ({
        workLocations: state.workLocations.map((wl) => wl.id === workLocationId ? updated : wl),
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  cancelWorkLocation: async (workLocationId: string, reason: string) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.cancelWorkLocation(workLocationId, reason);
      set((state) => ({
        workLocations: state.workLocations.map((wl) => wl.id === workLocationId ? updated : wl),
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },
  
  denyWorkLocation: async (workLocationId: string, reason: string) => {
    set({ loading: true, error: null });
    try {
      const updated = await workLocationLib.denyWorkLocation(workLocationId, reason);
      set((state) => ({
        workLocations: state.workLocations.map((wl) => wl.id === workLocationId ? updated : wl),
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  deleteWorkLocation: async (workLocationId: string) => {
    set({ loading: true, error: null });
    try {
      await workLocationLib.deleteWorkLocation(workLocationId);
      set((state) => ({
        workLocations: state.workLocations.filter((wl) => wl.id !== workLocationId),
        loading: false,
      }));
    } catch (error: any) {
      set({ error: error.message, loading: false });
      throw error;
    }
  },

  startTracking: async (tenantId: string, workLocation: WorkLocation, employeeId: string) => {
    const radiusEnabled = useLocationSettingsStore.getState().settings.radius_monitoring_enabled;

    const recordPosition = async (position: GPSCoordinates) => {
      set({ currentPosition: position, lastTrackingUpdate: new Date().toISOString() });

      try {
        const batteryLevel = await gpsTrackingService.getBatteryLevel();
        await workLocationLib.recordTracking(
          tenantId,
          workLocation.id,
          employeeId,
          position,
          workLocation,
          batteryLevel || undefined,
          radiusEnabled
        );
      } catch (error) {
        console.error('Failed to record tracking:', error);
      }
    };

    const handleHardwareError = (error: string) => {
      console.warn("GPS Hardware Warning/Error:", error);
      const errMsg = error.toLowerCase();
      // AUTO PAUSE: Trigger ONLY if permissions are revoked or location services are disabled
      if (errMsg.includes('permission') || errMsg.includes('denied') || errMsg.includes('unavailable')) {
         get().pauseWork(workLocation.id, 'System Auto-Pause: GPS Signal Lost or Location Permission Revoked').catch(console.error);
         get().stopTracking();
      }
    };

    // 1. Start the hardware watcher
    gpsTrackingService.startTracking(recordPosition, handleHardwareError, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });

    set({ isTracking: true, error: null });

    // 2. Clear any existing interval to prevent memory leaks
    if (forcePingInterval) clearInterval(forcePingInterval);

    // 3. FORCE a database update every 10 seconds
    forcePingInterval = setInterval(async () => {
      try {
        if (!navigator.onLine) throw new Error("offline");
        await get().recordManualPosition(tenantId, workLocation.id, employeeId, workLocation);
      } catch (e: any) {
        console.warn("Interval manual ping failed:", e);
        const errMsg = (e.message || String(e)).toLowerCase();
        
        // AUTO PAUSE: Trigger ONLY if permissions revoked or strict offline
        if (!navigator.onLine || errMsg.includes('offline') || errMsg.includes('timeout') || errMsg.includes('permission') || errMsg.includes('denied') || errMsg.includes('unavailable')) {
           
           // Only forcefully auto-pause if they are in 'in_progress'. 
           // We don't want to pause 'assigned' traveling states, we let the dashboard handle the 'Offline' UI.
           if (workLocation.status === 'in_progress') {
               get().pauseWork(workLocation.id, 'System Auto-Pause: GPS Signal Lost or Device Offline').catch(console.error);
               get().stopTracking();
           }
        }
      }
    }, 10000); 
  },

  stopTracking: () => {
    gpsTrackingService.stopTracking();
    if (forcePingInterval) {
      clearInterval(forcePingInterval);
      forcePingInterval = null;
    }
    set({
      isTracking: false,
      currentPosition: null,
      lastTrackingUpdate: null,
    });
  },

  recordManualPosition: async (tenantId: string, workLocationId: string, employeeId: string, workLocation: WorkLocation) => {
    try {
      const radiusEnabled = useLocationSettingsStore.getState().settings.radius_monitoring_enabled;
      const position = await gpsTrackingService.getCurrentPosition();
      const batteryLevel = await gpsTrackingService.getBatteryLevel();

      await workLocationLib.recordTracking(
        tenantId,
        workLocationId,
        employeeId,
        position,
        workLocation,
        batteryLevel || undefined,
        radiusEnabled
      );

      set({ currentPosition: position, lastTrackingUpdate: new Date().toISOString() });
    } catch (error: any) {
      throw error;
    }
  },

  fetchTrackingHistory: async (workLocationId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await workLocationLib.getTrackingHistory(workLocationId);
      set({ trackingHistory: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchViolations: async (tenantId: string, workLocationId?: string) => {
    set({ loading: true, error: null });
    try {
      const data = await workLocationLib.getViolations(tenantId, workLocationId);
      set({ violations: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  fetchNotifications: async (tenantId: string, userId: string) => {
    set({ loading: true, error: null });
    try {
      const data = await workLocationLib.getWorkLocationNotifications(tenantId, userId);
      set({ notifications: data, loading: false });
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  markNotificationAsRead: async (notificationId: string) => {
    try {
      await workLocationLib.markNotificationAsRead(notificationId);
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
        ),
      }));
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  clearError: () => set({ error: null }),

  reset: () =>
    set({
      workLocations: [],
      trackingHistory: [],
      violations: [],
      notifications: [],
      activeWorkLocation: null,
      loading: false,
      error: null,
      isTracking: false,
      currentPosition: null,
      lastTrackingUpdate: null,
    }),
}));