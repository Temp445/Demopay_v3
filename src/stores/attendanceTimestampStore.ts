import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import {
  validateAuth,
  createAuthError,
  createTenantError,
  initialStoreState,
  setLoading,
  setError,
  setSuccess,
  type StoreState,
} from './utils/storeUtils';

export interface AttendanceTimestamp {
  id: string;
  employee_id: string;
  shift_id: string | null;
  entry: 'IN' | 'OUT';
  timestamp: string;
  timing_status: 'OK' | 'OUTSIDE_SHIFT' | 'NO_SHIFT_ASSIGNED';
  created_at: string;
  shift_name?: string;
  latitude?: number;
  longitude?: number;
  attendance_mode?: 'Device' | 'Manual' | 'Live' | 'Facial Recognition';
  manual_reason?: string;
  distance_from_branch?: number;
  office_location_status?: 'Office' | 'Outside Office';
  location_address?: string;
}

export interface CreateTimestampRequest {
  employee_id: string;
  shift_id: string | null;
  entry: 'IN' | 'OUT';
  timestamp: string;
  timing_status?: 'OK' | 'OUTSIDE_SHIFT' | 'NO_SHIFT_ASSIGNED';
  latitude?: number;
  longitude?: number;
  attendance_mode: 'Device' | 'Manual' | 'Live' | 'Facial Recognition';
  manual_reason?: string;
  distance_from_branch?: number;
  office_location_status?: 'Office' | 'Outside Office';
  location_address?: string;
  captured_image?: string;
}

interface AttendanceTimestampStore extends StoreState<AttendanceTimestamp> {
  createTimestamp: (request: CreateTimestampRequest) => Promise<AttendanceTimestamp>;
  fetchTimestampsByEmployee: (employeeId: string, date: string) => Promise<void>;
  fetchTimestampsByDateRange: (employeeId: string, startDate: string, endDate: string) => Promise<void>;
  getTodayTimestamps: (employeeId: string) => Promise<AttendanceTimestamp[]>;
  getLatestEntryType: (employeeId: string, date: string) => Promise<{ type: 'IN' | 'OUT', timestamp: string, office_location_status?: string | null, office_arrival_processed?: boolean } | null>;
  reset: () => void;
}

export const useAttendanceTimestampStore = create<AttendanceTimestampStore>((set, get) => ({
  ...initialStoreState<AttendanceTimestamp>(),

  createTimestamp: async (request) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) throw createAuthError();
    if (!auth.tenantId) throw createTenantError();

    set(state => setLoading(state));

    try {
      const insertData = {
        employee_id: request.employee_id,
        shift_id: request.shift_id,
        entry: request.entry,
        timestamp: request.timestamp,
        timing_status: request.timing_status || 'OK',
        latitude: request.latitude,
        longitude: request.longitude,
        attendance_mode: request.attendance_mode,
        manual_reason: request.manual_reason,
        distance_from_branch: request.distance_from_branch,
        office_location_status: request.office_location_status,
        location_address: request.location_address,
        captured_image: request.captured_image,
      };

      const { data, error } = await supabase
        .from('attendance_timestamp')
        .insert(insertData)
        .select('*, shifts(name)')
        .single();

      if (error) throw error;

      const timestamp: AttendanceTimestamp = {
        ...data,
        shift_name: data.shifts?.name || undefined,
      };

      set(state => ({
        ...state,
        items: [timestamp, ...state.items],
        loading: false,
        error: null,
      }));

      return timestamp;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create timestamp';
      set(state => setError(state, errorMessage));
      throw error;
    }
  },

  fetchTimestampsByEmployee: async (employeeId, date) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError().message));
      return;
    }

    set(state => setLoading(state));

    try {
      // Fetch a wider range (previous day to next day) to safely group cross-midnight punches
      const startOfRange = new Date(date);
      startOfRange.setDate(startOfRange.getDate() - 1);
      startOfRange.setHours(0, 0, 0, 0);

      const endOfRange = new Date(date);
      endOfRange.setDate(endOfRange.getDate() + 1);
      endOfRange.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('attendance_timestamp')
        .select('*, shifts(name, start_time, end_time)')
        .eq('employee_id', employeeId)
        .gte('timestamp', startOfRange.toISOString())
        .lte('timestamp', endOfRange.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Group punches logically by shift date
      const logicalPunches: any[] = [];
      let lastPunch: any = null;
      let lastPunchDate: string | null = null;

      (data || []).forEach(entry => {
        const localObj = new Date(entry.timestamp);
        const yyyy = localObj.getFullYear();
        const mm = String(localObj.getMonth() + 1).padStart(2, '0');
        const dd = String(localObj.getDate()).padStart(2, '0');
        const actualDate = `${yyyy}-${mm}-${dd}`;
        
        let targetDate = actualDate;
        
        // Night Shift Grouping Logic: OUT punches <= 16 hours after IN punch belong to IN punch's date
        if (entry.entry === 'OUT' && lastPunch?.entry === 'IN' && lastPunchDate && lastPunchDate !== actualDate) {
            const diffHours = (new Date(entry.timestamp).getTime() - new Date(lastPunch.timestamp).getTime()) / (1000 * 60 * 60);
            if (diffHours <= 16) {
                targetDate = lastPunchDate;
            }
        }
        
        if (targetDate === date) {
            logicalPunches.push(entry);
        }
        
        lastPunch = entry;
        lastPunchDate = actualDate;
      });

      // Fetch active shifts for best-fit dynamic fallback
      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true);

      // Fetch employee's assigned shift for the day
      const { data: assignments } = await supabase
        .from('shift_assignments')
        .select('shift_id')
        .eq('tenant_id', auth.tenantId)
        .eq('employee_id', employeeId)
        .eq('schedule_date', date);

      const assignedShiftId = assignments && assignments.length > 0 ? assignments[0].shift_id : null;
      const assignedShift = assignedShiftId && shiftsData ? shiftsData.find(s => s.id === assignedShiftId) : null;

      const timestamps: AttendanceTimestamp[] = logicalPunches.map((entry: any) => {
        let shiftName = entry.shifts?.name || undefined;
        let timingStatus = entry.timing_status;

        if (!shiftName && shiftsData && assignedShift) {
          shiftName = assignedShift.name;
          if (timingStatus === 'NO_SHIFT_ASSIGNED') {
            const punchDate = new Date(entry.timestamp);
            const punchMinutes = punchDate.getHours() * 60 + punchDate.getMinutes();
            const [startH, startM] = assignedShift.start_time.split(':').map(Number);
            const [endH, endM] = assignedShift.end_time.split(':').map(Number);
            const startMinutes = startH * 60 + startM;
            const endMinutes = endH * 60 + endM;

            const isInsideShift =
              startMinutes < endMinutes
                ? punchMinutes >= startMinutes && punchMinutes <= endMinutes
                : punchMinutes >= startMinutes || punchMinutes <= endMinutes;

            timingStatus = isInsideShift ? 'OK' : 'OUTSIDE_SHIFT';
          }
        }
        return {
          ...entry,
          shift_name: shiftName,
          timing_status: timingStatus,
        };
      });

      set(state => ({
        ...state,
        items: timestamps,
        loading: false,
        error: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch timestamps';
      set(state => setError(state, errorMessage));
    }
  },

  fetchTimestampsByDateRange: async (employeeId, startDate, endDate) => {
    const auth = await validateAuth();
    if (!auth.isAuthenticated) {
      set(state => setError(state, createAuthError().message));
      return;
    }

    set(state => setLoading(state));

    try {
      const startOfRange = new Date(startDate);
      startOfRange.setHours(0, 0, 0, 0);

      const endOfRange = new Date(endDate);
      endOfRange.setHours(23, 59, 59, 999);

      const { data, error } = await supabase
        .from('attendance_timestamp')
        .select('*, shifts(name, start_time, end_time)')
        .eq('employee_id', employeeId)
        .gte('timestamp', startOfRange.toISOString())
        .lte('timestamp', endOfRange.toISOString())
        .order('timestamp', { ascending: true });

      if (error) throw error;

      // Fetch active shifts for best-fit dynamic fallback
      const { data: shiftsData } = await supabase
        .from('shifts')
        .select('*')
        .eq('tenant_id', auth.tenantId)
        .eq('is_active', true);

      // Fetch assignments for the date range
      const { data: assignments } = await supabase
        .from('shift_assignments')
        .select('schedule_date, shift_id')
        .eq('tenant_id', auth.tenantId)
        .eq('employee_id', employeeId)
        .gte('schedule_date', startDate)
        .lte('schedule_date', endDate);

      const assignmentsMap = new Map<string, string>();
      (assignments || []).forEach(a => assignmentsMap.set(a.schedule_date, a.shift_id));

      const timestamps: AttendanceTimestamp[] = (data || []).map((entry: any) => {
        let shiftName = entry.shifts?.name || undefined;
        let timingStatus = entry.timing_status;

        if (!shiftName && shiftsData) {
          const punchDateObj = new Date(entry.timestamp);
          const localDateObj = new Date(punchDateObj.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
          const yyyy = localDateObj.getFullYear();
          const mm = String(localDateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(localDateObj.getDate()).padStart(2, '0');
          const localDateStr = `${yyyy}-${mm}-${dd}`;

          const assignedShiftId = assignmentsMap.get(localDateStr);
          const assignedShift = assignedShiftId ? shiftsData.find(s => s.id === assignedShiftId) : null;

          if (assignedShift) {
             shiftName = assignedShift.name;
             if (timingStatus === 'NO_SHIFT_ASSIGNED') {
                 const punchMinutes = punchDateObj.getHours() * 60 + punchDateObj.getMinutes();
                 const [startH, startM] = assignedShift.start_time.split(':').map(Number);
                 const [endH, endM] = assignedShift.end_time.split(':').map(Number);
                 const startMinutes = startH * 60 + startM;
                 const endMinutes = endH * 60 + endM;
                 
                 const isInsideShift =
                   startMinutes < endMinutes
                     ? punchMinutes >= startMinutes && punchMinutes <= endMinutes
                     : punchMinutes >= startMinutes || punchMinutes <= endMinutes;

                 timingStatus = isInsideShift ? 'OK' : 'OUTSIDE_SHIFT';
             }
          }
        }
        return {
          ...entry,
          shift_name: shiftName,
          timing_status: timingStatus,
        };
      });

      set(state => ({
        ...state,
        items: timestamps,
        loading: false,
        error: null,
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch timestamps';
      set(state => setError(state, errorMessage));
    }
  },

  getTodayTimestamps: async (employeeId) => {
    const today = new Date().toISOString().split('T')[0];
    await get().fetchTimestampsByEmployee(employeeId, today);
    return get().items;
  },

  getLatestEntryType: async (employeeId, date) => {
    try {
      // Parse 'date' as a LOCAL date (YYYY-MM-DD), not UTC
      const [yyyy, mm, dd] = date.split('-').map(Number);

      // End of local day
      const endOfDay = new Date(yyyy, mm - 1, dd, 23, 59, 59, 999);

      // Start = local midnight of that day minus 24 hours (to catch previous-day clock-ins, e.g. night shifts)
      const startOfQuery = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
      startOfQuery.setTime(startOfQuery.getTime() - 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('attendance_timestamp')
        .select('entry, timestamp, office_location_status, office_arrival_processed')
        .eq('employee_id', employeeId)
        .gte('timestamp', startOfQuery.toISOString())
        .lte('timestamp', endOfDay.toISOString())
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      return data ? { 
        type: data.entry, 
        timestamp: data.timestamp,
        office_location_status: data.office_location_status,
        office_arrival_processed: data.office_arrival_processed
      } : null;
    } catch (error) {
      console.error('Failed to get latest entry type:', error);
      return null;
    }
  },

  reset: () => {
    set(initialStoreState<AttendanceTimestamp>());
  },
}));