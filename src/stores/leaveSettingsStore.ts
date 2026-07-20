import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { validateAuth, createAuthError, createTenantError } from './utils/storeUtils';

export interface EmployeeLeaveSetting {
    leave_type_id: string;
    leave_name: string;
    master_default_days: number;
    is_applicable: boolean;
    applicable_days: number | null;
    opening_days: number | null;
    effective_days: number;
    priority_source: 'not_applicable' | 'opening_balance' | 'applicable_days' | 'master_default';
}

export interface ApplicableSettingPayload {
    employee_id: string;
    leave_type_id: string;
    is_applicable: boolean;
    applicable_days: number | null;
}

export interface OpeningBalancePayload {
    employee_id: string;
    leave_type_id: string;
    year: number;
    opening_days: number | null;
}

interface LeaveSettingsStore {
    isLoading: boolean;
    error: string | null;

    // Fetch combined settings for an employee for a specific year
    getEmployeeSettings: (employeeId: string, year: number) => Promise<EmployeeLeaveSetting[]>;

    // Bulk upsert settings
    upsertLeaveSettings: (
        applicableSettings: ApplicableSettingPayload[] | null,
        openingBalances: OpeningBalancePayload[] | null
    ) => Promise<void>;

    // Force apply settings to live balance
    applySettingsToBalance: (employeeId: string, year: number) => Promise<void>;

    clearError: () => void;
}

export const useLeaveSettingsStore = create<LeaveSettingsStore>((set) => ({
    isLoading: false,
    error: null,

    getEmployeeSettings: async (employeeId, year) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set({ isLoading: true, error: null });

        try {
            const { data, error } = await supabase
                .rpc('get_employee_leave_settings', {
                    p_employee_id: employeeId,
                    p_year: year,
                    p_tenant_id: auth.tenantId,
                });

            if (error) throw error;
            return data as EmployeeLeaveSetting[];
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to fetch settings';
            set({ error: message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    upsertLeaveSettings: async (applicableSettings, openingBalances) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        set({ isLoading: true, error: null });

        try {
            const { error } = await supabase
                .rpc('upsert_employee_leave_settings', {
                    p_tenant_id: auth.tenantId,
                    p_applicable_settings: applicableSettings || [],
                    p_opening_balances: openingBalances || [],
                });

            if (error) throw error;
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to save settings';
            set({ error: message });
            throw error;
        } finally {
            set({ isLoading: false });
        }
    },

    applySettingsToBalance: async (employeeId, year) => {
        const auth = await validateAuth();
        if (!auth.isAuthenticated) throw createAuthError();
        if (!auth.tenantId) throw createTenantError();

        try {
            const { error } = await supabase
                .rpc('apply_leave_settings_to_balance', {
                    p_employee_id: employeeId,
                    p_year: year,
                    p_tenant_id: auth.tenantId,
                });

            if (error) throw error;
        } catch (error) {
            console.error('Failed to apply settings to live balance:', error);
            throw error;
        }
    },

    clearError: () => set({ error: null }),
}));
