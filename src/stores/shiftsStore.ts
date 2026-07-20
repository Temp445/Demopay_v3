import { create } from "zustand";
import { persist } from "zustand/middleware";
import { format } from "date-fns";
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
  removeItem,
  type StoreState,
} from "./utils/storeUtils";

export interface Shift {
  id: string;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  break_start_time: string;
  break_end_time: string;
  shift_type: "morning" | "afternoon" | "night";
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  tenant_id?: string;
}

export interface ShiftAssignment {
  id: string;
  shift_id: string;
  employee_id: string;
  schedule_date: string;
  status: "scheduled" | "in_progress" | "completed" | "cancelled" | "absent";
  clock_in: string | null;
  clock_out: string | null;
  actual_break_start: string | null;
  actual_break_end: string | null;
  overtime_minutes: number;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
  tenant_id?: string;
}

export interface RotationPattern {
  type: "none" | "daily" | "weekly" | "monthly";
  interval?: number;
  startDate: string;
  endDate?: string;
}

export interface BulkAssignmentRequest {
  shift_id: string;
  employee_ids: string[];
  rotation: RotationPattern;
  department?: string;
}

interface ShiftStore extends StoreState<Shift> {
  assignments: StoreState<ShiftAssignment>;
  currentFetchRange: { startDate: string; endDate: string; employeeId?: string } | null;

  fetchShifts: () => Promise<void>;
  createShift: (
    shift: Omit<Shift, "id" | "created_at" | "updated_at" | "tenant_id">,
  ) => Promise<Shift>;
  updateShift: (id: string, updates: Partial<Shift>) => Promise<Shift>;
  deleteShift: (id: string) => Promise<void>;

  fetchShiftAssignments: (
    startDate: string,
    endDate: string,
    employeeId?: string,
  ) => Promise<void>;
  createShiftAssignment: (
    assignment: Omit<
      ShiftAssignment,
      "id" | "created_at" | "updated_at" | "tenant_id"
    >,
  ) => Promise<ShiftAssignment>;
  updateShiftAssignment: (
    id: string,
    updates: Partial<ShiftAssignment>,
  ) => Promise<ShiftAssignment>;
  deleteShiftAssignment: (id: string) => Promise<void>;

  deleteShiftFromDate: (shiftId: string, date: string) => Promise<void>;
  createBulkAssignments: (request: any) => Promise<any>;
  
  // New function for the modal that doesn't overwrite global state
  getPreAssignedEmployees: (shiftId: string, startDate: string, endDate: string) => Promise<string[]>;
}

export const useShiftsStore = create<ShiftStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<Shift>(),
      assignments: initialStoreState<ShiftAssignment>(),
      currentFetchRange: null,

      getPreAssignedEmployees: async (shiftId, startDate, endDate) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return [];
        try {
          const { data, error } = await supabase
            .from("shift_assignments")
            .select("employee_id")
            .eq("tenant_id", auth.tenantId)
            .eq("shift_id", shiftId)
            .gte("schedule_date", startDate)
            .lte("schedule_date", endDate);
          if (error) throw error;
          return [...new Set(data.map(d => d.employee_id))];
        } catch (err) {
          console.error('Failed to get pre-assigned employees:', err);
          return [];
        }
      },

      fetchShifts: async () => {
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
            .from("shifts")
            .select("*")
            .eq("tenant_id", auth.tenantId)
            .order("created_at", { ascending: false });

          if (error) throw error;
          set((state) => setSuccess(state, data || []));
        } catch (error) {
          set((state) =>
            setError(
              state,
              error instanceof Error ? error.message : "Failed to fetch shifts",
            ),
          );
        }
      },

      createShift: async (shift) => {
        //... (keep existing createShift logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => setLoading(state));

        try {
          const { data, error } = await supabase
            .from("shifts")
            .insert([{ ...shift, tenant_id: auth.tenantId }])
            .select()
            .single();

          if (error) throw error;
          set((state) => addItem(state, data));
          return data;
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "Failed to create shift";
          set((state) => setError(state, msg));
          throw error;
        }
      },

      updateShift: async (id, updates) => {
         //... (keep existing updateShift logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => setLoading(state));

        try {
          const { data, error } = await supabase
            .from("shifts")
            .update(updates)
            .eq("id", id)
            .eq("tenant_id", auth.tenantId)
            .select()
            .single();

          if (error) throw error;
          set((state) => updateItem(state, id, data));
          return data;
        } catch (error) {
          const msg =
            error instanceof Error ? error.message : "Failed to update shift";
          set((state) => setError(state, msg));
          throw error;
        }
      },

      deleteShift: async (id) => {
        //... (keep existing deleteShift logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => setLoading(state));

        try {
          const { error } = await supabase
            .from("shifts")
            .delete()
            .eq("id", id)
            .eq("tenant_id", auth.tenantId);

          if (error) throw error;
          set((state) => removeItem(state, id));
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : "This shift cannot be deleted as it is currently assigned to employees.";
          set((state) => setError(state, msg));
          throw error;
        }
      },

      fetchShiftAssignments: async (startDate, endDate, employeeId) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated || !auth.tenantId) return;

        // Track the currently requested range for refreshing after assignment
        set((state) => ({
          ...state,
          currentFetchRange: { startDate, endDate, employeeId },
          assignments: setLoading(state.assignments),
        }));

        try {
          let query = supabase
            .from("shift_assignments")
            .select(
              `
        *,
        shift:shifts (
          name,
          start_time,
          end_time
        ),
        employee:employees (
          name
        )
      `,
            )
            .eq("tenant_id", auth.tenantId)
            .gte("schedule_date", startDate)
            .lte("schedule_date", endDate);

          if (employeeId) {
            query = query.eq("employee_id", employeeId);
          }

          const { data, error } = await query;

          if (error) throw error;

          // --- AUTO-ABSENT LOGIC START ---
          const today = format(new Date(), 'yyyy-MM-dd');
          const idsToMarkAbsent: string[] = [];
          
          const processedData = (data || []).map((assignment: ShiftAssignment) => {
             const isPastDate = assignment.schedule_date < today;
             const isNoShow = assignment.status === 'scheduled' || assignment.status === 'cancelled';
             const hasNoClockIn = !assignment.clock_in;

             if (isPastDate && isNoShow && hasNoClockIn) {
                idsToMarkAbsent.push(assignment.id);
                return { ...assignment, status: 'absent' as const };
             }
             return assignment;
          });

          if (idsToMarkAbsent.length > 0) {
             const { error: updateError } = await supabase
               .from('shift_assignments')
               .update({ status: 'absent' }) 
               .in('id', idsToMarkAbsent);
               
             if (updateError) {
               console.error('Failed to auto-mark past shifts as absent:', updateError);
             }
          }
          // --- AUTO-ABSENT LOGIC END ---

          set(state => ({
            ...state,
            assignments: setSuccess(state.assignments, processedData),
          }));
        } catch (error) {
          const msg = error instanceof Error ? error.message : 'Failed to fetch assignments';
          set(state => ({
            ...state,
            assignments: setError(state.assignments, msg),
          }));
          throw error;
        }
      },

      createShiftAssignment: async (assignment) => {
        //... (keep existing createShiftAssignment logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => ({
          ...state,
          assignments: setLoading(state.assignments),
        }));

        try {
          const { data, error } = await supabase
            .from("shift_assignments")
            .insert([{ ...assignment, tenant_id: auth.tenantId }])
            .select()
            .single();

          if (error) throw error;
          set((state) => ({
            ...state,
            assignments: addItem(state.assignments, data),
          }));
          return data;
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : "Failed to create assignment";
          set((state) => ({
            ...state,
            assignments: setError(state.assignments, msg),
          }));
          throw error;
        }
      },

      updateShiftAssignment: async (id, updates) => {
        //... (keep existing updateShiftAssignment logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => ({
          ...state,
          assignments: setLoading(state.assignments),
        }));

        try {
          const { data, error } = await supabase
            .from("shift_assignments")
            .update(updates)
            .eq("id", id)
            .eq("tenant_id", auth.tenantId)
            .select()
            .single();

          if (error) throw error;
          set((state) => ({
            ...state,
            assignments: updateItem(state.assignments, id, data),
          }));
          return data;
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : "Failed to update assignment";
          set((state) => ({
            ...state,
            assignments: setError(state.assignments, msg),
          }));
          throw error;
        }
      },

      deleteShiftAssignment: async (id) => {
        //... (keep existing deleteShiftAssignment logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => ({
          ...state,
          assignments: setLoading(state.assignments),
        }));

        try {
          const { error } = await supabase
            .from("shift_assignments")
            .delete()
            .eq("id", id)
            .eq("tenant_id", auth.tenantId);

          if (error) throw error;
          set((state) => ({
            ...state,
            assignments: removeItem(state.assignments, id),
          }));
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : "Failed to delete assignment";
          set((state) => ({
            ...state,
            assignments: setError(state.assignments, msg),
          }));
          throw error;
        }
      },

      deleteShiftFromDate: async (shiftId: string, date: string) => {
        //... (keep existing deleteShiftFromDate logic unchanged)
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set((state) => ({
          ...state,
          assignments: setLoading(state.assignments),
        }));

        try {
          const { error } = await supabase
            .from("shift_assignments")
            .delete()
            .eq("shift_id", shiftId)
            .eq("schedule_date", date)
            .eq("tenant_id", auth.tenantId)
            // Allow deleting scheduled OR absent
            .in("status", ["scheduled", "absent"]);

          if (error) throw error;

          set((state) => {
            const currentItems = state.assignments.items || [];
            const updatedItems = currentItems.filter(
              (item) =>
                !(
                  item.shift_id === shiftId &&
                  item.schedule_date.startsWith(date)
                ),
            );

            return {
              ...state,
              assignments: {
                ...state.assignments,
                items: updatedItems,
                isLoading: false,
                error: null,
              },
            };
          });
        } catch (error) {
          const msg =
            error instanceof Error
              ? error.message
              : "Failed to delete shift schedule";
          set((state) => ({
            ...state,
            assignments: setError(state.assignments, msg),
          }));
          throw error;
        }
      },

      createBulkAssignments: async (request: any) => {
        try {
          const auth = await validateAuth();
          if (!auth.isAuthenticated) throw createAuthError();
          if (!auth.tenantId) throw createTenantError();

          const { data, error } = await supabase.rpc(
            "create_bulk_assignments",
            {
              p_shift_id: request.shift_id,
              p_employee_ids: request.employee_ids,
              p_start_date: request.rotation.startDate,
              p_end_date:
                request.rotation.endDate || request.rotation.startDate,
              p_department: request.department || null,
              p_tenant_id: auth.tenantId,
            },
          );

          if (error) {
            console.error("Bulk assignment error:", error);
            return {
              success: false,
              errors: [
                {
                  code: error.code,
                  message: error.message,
                  details: { hint: error.hint, details: error.details },
                },
              ],
              skippedDates: [],
            };
          }

          if (!data || !data[0] || !data[0].success) {
            return {
              success: false,
              errors: data?.[0]?.errors || [
                { code: "UNKNOWN", message: "Bulk assignment failed" },
              ],
              skippedDates: [],
            };
          }

          // FIX: Don't fetch the assigned dates. Instead, refresh the dates the calendar is currently looking at!
          const range = get().currentFetchRange;
          if (range) {
            await get().fetchShiftAssignments(range.startDate, range.endDate, range.employeeId);
          }

          return {
            success: true,
            assignments: data[0].assignments,
            skippedDates: data[0].skipped_dates || [],
          };
        } catch (error) {
          console.error("Bulk assignment failed:", error);
          return {
            success: false,
            errors: [
              {
                code: "UNEXPECTED_ERROR",
                message:
                  error instanceof Error
                    ? error.message
                    : "An unexpected error occurred",
              },
            ],
            skippedDates: [],
          };
        }
      },
    }),
    {
      name: "shifts-storage",
      partialize: (state) => ({
        items: state.items,
        assignments: state.assignments,
        initialized: state.initialized,
      }),
    },
  ),
);
