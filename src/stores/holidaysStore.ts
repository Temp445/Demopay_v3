import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
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
} from './utils/storeUtils';

export type { Holiday, WeekOccurrence, WeekDay, WeekDayPattern } from '../lib/holidays';
import type { Holiday } from '../lib/holidays';

interface HolidaysStore extends StoreState<Holiday> {
  fetchHolidays: (startDate: string, endDate: string) => Promise<void>;
  fetchRecurringHolidays: (year: number) => Promise<void>;
  createHoliday: (holiday: Omit<Holiday, 'id' | 'created_at' | 'tenant_id'>) => Promise<Holiday>;
  updateHoliday: (id: string, updates: Partial<Omit<Holiday, 'id' | 'created_at' | 'tenant_id'>>) => Promise<Holiday>;
  deleteHoliday: (id: string) => Promise<void>;
  getHolidayById: (id: string) => Holiday | undefined;
  reset: () => void;
}

export const useHolidaysStore = create<HolidaysStore>()(
  persist(
    (set, get) => ({
      ...initialStoreState<Holiday>(),

      fetchHolidays: async (startDate, endDate) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set(state => setError(state, createAuthError().message));
          return;
        }

        if (!auth.tenantId) {
          set(state => setError(state, createTenantError().message));
          return;
        }

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase.rpc('get_holidays', {
            p_end_date: endDate,
            p_start_date: startDate,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => setSuccess(state, data || []));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch holidays'));
        }
      },

      fetchRecurringHolidays: async (year) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) {
          set(state => setError(state, createAuthError().message));
          return;
        }

        if (!auth.tenantId) {
          set(state => setError(state, createTenantError().message));
          return;
        }

        set(state => setLoading(state));

        try {
          const { data, error } = await supabase.rpc('get_recurring_holidays', {
            p_year: year,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => setSuccess(state, data || []));
        } catch (error) {
          set(state => setError(state, error instanceof Error ? error.message : 'Failed to fetch recurring holidays'));
        }
      },

      createHoliday: async (holiday) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          let holidayData = { ...holiday };

          if (holidayData.date === '') {
            holidayData.date = new Date().toISOString().split('T')[0];
          }

          holidayData.recurring_patterns = holidayData.recurring_patterns?.filter(
            (pattern) => pattern.weekOccurrence !== ''
          );

          const { data, error } = await supabase.rpc('insert_holiday_with_recurring', {
            holiday_data: holidayData,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => addItem(state, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create holiday';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      updateHoliday: async (id, updates) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          let updateData = { ...updates };

          updateData.recurring_patterns = updateData.recurring_patterns?.filter(
            (pattern) => pattern.weekOccurrence !== ''
          );

          const { data, error } = await supabase.rpc('update_holiday_with_recurring', {
            p_holiday_id: id,
            p_holiday_data: updateData,
            p_tenant_id: auth.tenantId,
          });

          if (error) throw error;

          set(state => updateItem(state, id, data));
          return data;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update holiday';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      deleteHoliday: async (id) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set(state => setLoading(state));

        try {
          const { error } = await supabase
            .from('holidays')
            .delete()
            .eq('id', id)
            .eq('tenant_id', auth.tenantId);

          if (error) throw error;

          set(state => removeItem(state, id));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete holiday';
          set(state => setError(state, errorMessage));
          throw error;
        }
      },

      getHolidayById: (id) => {
        return get().items.find(holiday => holiday.id === id);
      },

      reset: () => {
        set(initialStoreState<Holiday>());
      },
    }),
    {
      name: 'holidays-storage',
      partialize: (state) => ({
        items: state.items,
        initialized: state.initialized,
      }),
    }
  )
);
