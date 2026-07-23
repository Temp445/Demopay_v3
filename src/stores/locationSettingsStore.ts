import { create } from 'zustand';
import { supabase } from '../lib/supabase';

export interface LocationSettings {
  id?: string;
  tenant_id?: string;
  live_tracking_enabled: boolean;
  radius_monitoring_enabled: boolean;
  work_event_notifications_enabled: boolean;
  violation_notifications_enabled: boolean;
  journey_tracking_interval_mins: number;
  minimum_movement_threshold_meters: number;
  work_radius_tracking_interval_mins: number;
  work_radius_minimum_movement_threshold_meters: number;
  allow_add_new_location: boolean;
  field_work_integration_enabled: boolean;
  field_work_component_id: string | null;
  travel_allowance_method: 'manual' | 'distance' | 'fixed';
  travel_allowance_rate: number;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_SETTINGS: LocationSettings = {
  live_tracking_enabled: true,
  radius_monitoring_enabled: true,
  work_event_notifications_enabled: true,
  violation_notifications_enabled: true,
  journey_tracking_interval_mins: 5,
  minimum_movement_threshold_meters: 10,
  work_radius_tracking_interval_mins: 15,
  work_radius_minimum_movement_threshold_meters: 10,
  allow_add_new_location: false,
  field_work_integration_enabled: false,
  field_work_component_id: null,
  travel_allowance_method: 'manual',
  travel_allowance_rate: 0,
};

interface LocationSettingsStore {
  settings: LocationSettings;
  loading: boolean;
  saving: boolean;
  error: string | null;
  initialized: boolean;

  fetchSettings: (tenantId: string) => Promise<void>;
  saveSettings: (tenantId: string, settings: Partial<LocationSettings>) => Promise<void>;
}

export const useLocationSettingsStore = create<LocationSettingsStore>((set, get) => ({
  settings: { ...DEFAULT_SETTINGS },
  loading: false,
  saving: false,
  error: null,
  initialized: false,

  fetchSettings: async (tenantId: string) => {
    set({ loading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('location_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      set({
        settings: data ? { ...DEFAULT_SETTINGS, ...data } : { ...DEFAULT_SETTINGS },
        loading: false,
        initialized: true,
      });
    } catch (error: any) {
      set({
        error: error.message,
        loading: false,
        settings: { ...DEFAULT_SETTINGS },
        initialized: true,
      });
    }
  },

  saveSettings: async (tenantId: string, updates: Partial<LocationSettings>) => {
    set({ saving: true, error: null });
    try {
      const current = get().settings;
      const merged = { ...current, ...updates };

      const { data: existing } = await supabase
        .from('location_settings')
        .select('id')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      let result;
      if (existing) {
        result = await supabase
          .from('location_settings')
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq('tenant_id', tenantId)
          .select()
          .single();
      } else {
        result = await supabase
          .from('location_settings')
          .insert({ ...merged, tenant_id: tenantId })
          .select()
          .single();
      }

      if (result.error) throw result.error;

      set({ settings: { ...DEFAULT_SETTINGS, ...result.data }, saving: false });
    } catch (error: any) {
      set({ error: error.message, saving: false });
      throw error;
    }
  },
}));
