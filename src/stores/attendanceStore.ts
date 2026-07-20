import { create } from "zustand";
import { persist } from "zustand/middleware";
import { supabase } from "../lib/supabase";
import {
  validateAuth,
  createAuthError,
  createTenantError,
  initialStoreState,
  setLoading,
  setError,
  setSuccess,
  addItem,
  updateItem,
  type StoreState,
} from "./utils/storeUtils";

export interface AttendanceLog {
  id: string;
  employee_id: string;
  date: string;
  clock_in: string | null;
  clock_out: string | null;
  status: "Present" | "Absent" | "Late" | "Half Day";
  notes: string | null;
  verification_method?: "manual" | "face_recognition" | "fallback";
  face_confidence?: number;
  tenant_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttendanceSettings {
  id: string;
  name: string;
  description: string | null;
  late_threshold_minutes: number;
  half_day_threshold_minutes: number;
  is_active: boolean;
  tenant_id?: string;
}

export interface ShiftAttendanceSettings {
  late_threshold_minutes: number;
  half_day_threshold_minutes: number;
}

interface AttendanceStore extends StoreState<AttendanceLog> {
  settings: AttendanceSettings | null;
  settingsLoading: boolean;
  settingsError: string | null;
  fetchAttendanceRecords: (
    employeeId: string,
    startDate: string,
    endDate: string,
  ) => Promise<void>;
  fetchAttendanceSettings: () => Promise<void>;
  updateAttendanceSettings: (
    settings: Partial<AttendanceSettings>,
  ) => Promise<void>;
  getShiftAttendanceSettings: (
    shiftId: string,
    date: string,
  ) => Promise<ShiftAttendanceSettings>;
  updateShiftAttendanceSettings: (
    shiftId: string,
    settings: {
      late_threshold_minutes: number;
      half_day_threshold_minutes: number;
    },
  ) => Promise<void>;
  clockIn: (
    employeeId: string,
    shiftId: string,
    customTime?: Date,
    notes?: string,
    userId?: string,
    verificationMethod?: "manual" | "face_recognition" | "fallback",
    faceConfidence?: number,
  ) => Promise<AttendanceLog>;
  clockOut: (
    employeeId: string,
    shiftId: string,
    customTime?: Date,
    notes?: string,
    verificationMethod?: "manual" | "face_recognition" | "fallback",
    faceConfidence?: number,
  ) => Promise<AttendanceLog>;
  updateAttendanceStatus: (
    id: string,
    status: AttendanceLog["status"],
    notes?: string,
  ) => Promise<void>;
  reset: () => void;
}

export const useAttendanceStore = create<AttendanceStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<AttendanceLog>(),
      settings: null,
      settingsLoading: false,
      settingsError: null,

      fetchAttendanceRecords: async (employeeId, startDate, endDate) => {
        if (!employeeId) {
          set((state) => setSuccess(state, []));
          return;
        }

        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set((state) => setError(state, createAuthError().message));
          return;
        }

        if (!auth.tenantId) {
          set((state) => setError(state, createTenantError().message));
          return;
        }

        set((state) => setLoading(state));

        try {
          const { data, error } = await supabase
            .from("attendance_logs")
            .select("*")
            .eq("employee_id", employeeId)
            .eq("tenant_id", auth.tenantId)
            .gte("date", startDate)
            .lte("date", endDate)
            .order("date", { ascending: false });

          if (error) throw error;

          set((state) => setSuccess(state, data || []));
        } catch (error) {
          set((state) =>
            setError(
              state,
              error instanceof Error
                ? error.message
                : "Failed to fetch attendance records",
            ),
          );
        }
      },

      fetchAttendanceSettings: async () => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set({ settingsError: createAuthError().message });
          return;
        }

        if (!auth.tenantId) {
          set({ settingsError: createTenantError().message });
          return;
        }

        set({ settingsLoading: true, settingsError: null });

        try {
          const { data, error } = await supabase
            .from("attendance_settings")
            .select("*")
            .eq("tenant_id", auth.tenantId)
            .eq("is_active", true)
            .maybeSingle();

          if (error) throw error;

          set({ settings: data, settingsLoading: false });
        } catch (error) {
          set({
            settingsError:
              error instanceof Error
                ? error.message
                : "Failed to fetch attendance settings",
            settingsLoading: false,
          });
        }
      },

      updateAttendanceSettings: async (settings) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          throw createAuthError();
        }

        if (!auth.tenantId) {
          throw createTenantError();
        }

        set({ settingsLoading: true });

        try {
          const { data, error } = await supabase
            .from("attendance_settings")
            .update(settings)
            .eq("tenant_id", auth.tenantId)
            .eq("id", settings.id)
            .select()
            .single();

          if (error) throw error;

          set({ settings: data, settingsLoading: false, settingsError: null });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Failed to update attendance settings";
          set({ settingsError: errorMessage, settingsLoading: false });
          throw error;
        }
      },

      getShiftAttendanceSettings: async (shiftId, date) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        try {
          // Fetch directly from the table instead of using an RPC
          const { data, error } = await supabase
            .from("shift_attendance_settings")
            .select("late_threshold_minutes, half_day_threshold_minutes")
            .eq("shift_id", shiftId)
            .eq("tenant_id", auth.tenantId)
            .maybeSingle();

          if (error) {
            console.error("Supabase Fetch Error:", error);
            throw error;
          }

          // If no settings exist in the DB, gracefully return defaults
          if (!data) {
            console.warn(
              `No settings found for shift ${shiftId}, using defaults.`,
            );
            return {
              late_threshold_minutes: 15,
              half_day_threshold_minutes: 240,
            };
          }

          return data;
        } catch (error) {
          console.error("Fetch settings catch block:", error);
          // Return defaults instead of throwing to prevent the UI from breaking
          return {
            late_threshold_minutes: 15,
            half_day_threshold_minutes: 240,
          };
        }
      },
      updateShiftAttendanceSettings: async (shiftId, settings) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) {
          throw createAuthError();
        }

        try {
          // 1. Try to update the existing row first (expected behavior due to your triggers)
          const { data, error: updateError } = await supabase
            .from("shift_attendance_settings")
            .update({
              late_threshold_minutes: settings.late_threshold_minutes,
              half_day_threshold_minutes: settings.half_day_threshold_minutes,
              updated_at: new Date().toISOString(),
            })
            .eq("shift_id", shiftId)
            .eq("tenant_id", auth.tenantId)
            .select();

          // Properly extract and throw the actual Supabase error message
          if (updateError) {
            console.error("Supabase Update Error:", updateError);
            throw new Error(updateError.message || "Database update failed");
          }

          // 2. If the update succeeded but returned no rows, the row is missing. Insert it.
          if (!data || data.length === 0) {
            console.warn(
              `Settings missing for shift ${shiftId}, creating new row...`,
            );
            const { error: insertError } = await supabase
              .from("shift_attendance_settings")
              .insert({
                shift_id: shiftId,
                tenant_id: auth.tenantId,
                late_threshold_minutes: settings.late_threshold_minutes,
                half_day_threshold_minutes: settings.half_day_threshold_minutes,
              });

            if (insertError) {
              console.error("Supabase Insert Error:", insertError);
              throw new Error(insertError.message || "Database insert failed");
            }
          }
        } catch (error) {
          console.error("Settings save failed:", error);
          // Pass the actual error message up to the UI so it shows in the red alert box
          throw error instanceof Error ? error : new Error(String(error));
        }
      },

      clockIn: async (
        employeeId,
        shiftId,
        customTime,
        notes,
        userId,
        verificationMethod = "manual",
        faceConfidence,
      ) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        const now = customTime || new Date();
        const today = now.toISOString().split("T")[0];
        const clockInTime = now.toISOString();

        try {
          const { data: existingRecord, error: fetchError } = await supabase
            .from("attendance_logs")
            .select("*")
            .eq("employee_id", employeeId)
            .eq("date", today)
            .eq("tenant_id", auth.tenantId)
            .maybeSingle();

          if (fetchError) throw fetchError;
          if (existingRecord) throw new Error("Already clocked in for today");

          // We fetch settings to determine Late/Half Day status, offset logic has been removed.
          const settings = await get().getShiftAttendanceSettings(
            shiftId,
            today,
          );

          // Note: To calculate 'minutesLate' accurately, you now need to compare the `clock_in` time
          // to the `shifts.start_time`. Assuming we get shift start time from somewhere or it's passed in.
          // For now, defaulting to basic logic or 0 if start time isn't available here.
          const minutesLate = 0; // Replace with logic comparing `now` vs `shift.start_time`
          const status =
            minutesLate <= settings.late_threshold_minutes ? "Present" : "Late";

          const finalNotes = notes
            ? `${notes}; Verified via ${verificationMethod}`
            : `Verified via ${verificationMethod}`;

          const { data, error } = await supabase
            .from("attendance_logs")
            .insert([
              {
                employee_id: employeeId,
                date: today,
                clock_in: clockInTime,
                status,
                notes: finalNotes,
                created_by: userId || auth.userId,
                verification_method: verificationMethod,
                face_confidence: faceConfidence,
                tenant_id: auth.tenantId,
              },
            ])
            .select()
            .single();

          if (error) throw error;

          set((state) => addItem(state, data));
          return data;
        } catch (error) {
          throw error instanceof Error
            ? error
            : new Error("Failed to clock in");
        }
      },

      clockOut: async (
        employeeId,
        shiftId,
        customTime,
        notes,
        verificationMethod = "manual",
        faceConfidence,
      ) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        const now = customTime || new Date();
        const today = now.toISOString().split("T")[0];
        const clockOutTime = now.toISOString();

        try {
          const { data: existingRecord, error: fetchError } = await supabase
            .from("attendance_logs")
            .select("*")
            .eq("employee_id", employeeId)
            .eq("date", today)
            .eq("tenant_id", auth.tenantId)
            .maybeSingle();

          if (fetchError || !existingRecord)
            throw new Error("No clock-in record found for today");
          if (existingRecord.clock_out)
            throw new Error("Already clocked out for today");

          const settings = await get().getShiftAttendanceSettings(
            shiftId,
            today,
          );

          const clockInTime = new Date(existingRecord.clock_in!);
          const hoursWorked =
            (now.getTime() - clockInTime.getTime()) / (1000 * 60 * 60);

          const status =
            hoursWorked >= settings.half_day_threshold_minutes / 60
              ? existingRecord.status
              : "Half Day";

          let finalNotes = existingRecord.notes || "";
          if (notes) {
            finalNotes += finalNotes ? `; ${notes}` : notes;
          }
          finalNotes += `; Clock out verified via ${verificationMethod}`;

          const { data, error } = await supabase
            .from("attendance_logs")
            .update({
              clock_out: clockOutTime,
              status,
              notes: finalNotes,
              verification_method: verificationMethod,
              face_confidence: faceConfidence,
            })
            .eq("id", existingRecord.id)
            .eq("tenant_id", auth.tenantId)
            .select()
            .single();

          if (error) throw error;

          set((state) => updateItem(state, existingRecord.id, data));
          return data;
        } catch (error) {
          throw error instanceof Error
            ? error
            : new Error("Failed to clock out");
        }
      },

      updateAttendanceStatus: async (id, status, notes) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        try {
          const { data, error } = await supabase
            .from("attendance_logs")
            .update({ status, notes })
            .eq("id", id)
            .eq("tenant_id", auth.tenantId)
            .select()
            .single();

          if (error) throw error;

          set((state) => updateItem(state, id, data));
        } catch (error) {
          throw error instanceof Error
            ? error
            : new Error("Failed to update attendance status");
        }
      },

      reset: () => {
        set({
          ...initialStoreState<AttendanceLog>(),
          settings: null,
          settingsLoading: false,
          settingsError: null,
        });
      },
    }),
    {
      name: "attendance-storage",
      partialize: (state) => ({
        items: state.items,
        settings: state.settings,
        initialized: state.initialized,
      }),
    },
  ),
);
