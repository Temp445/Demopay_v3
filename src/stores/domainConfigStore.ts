import { create } from 'zustand';
import { supabase } from '../lib/supabase';

interface DomainConfig {
  screens?: Record<string, boolean>;
  features?: Record<string, boolean>;
  modules?: Record<string, boolean>;
}

interface DomainConfigState {
  config: DomainConfig | null;
  allowToLandingPage: boolean;
  loading: boolean;
  initialized: boolean;
  fetchConfig: (domain: string, fallbackDomain?: string) => Promise<void>;
  isScreenEnabled: (route: string) => boolean;
  isFeatureEnabled: (feature: string) => boolean;
}

export const useDomainConfigStore = create<DomainConfigState>((set, get) => ({
  config: null,
  allowToLandingPage: true,
  loading: false,
  initialized: false,
  fetchConfig: async (domain: string, fallbackDomain?: string) => {
    // Avoid fetching if already initialized
    if (get().initialized && !get().loading) return;

    set({ loading: true });

    try {
      const domainsToCheck = fallbackDomain ? [domain, fallbackDomain] : [domain];

      const { data, error } = await supabase
        .from('domain_configurations')
        .select('config, allow_to_landing_page')
        .in('domain_name', domainsToCheck)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching domain configuration:', error);
        // If not found or error, we'll use a permissive default
        set({ config: null, loading: false, initialized: true });
        return;
      }

      set({ 
        config: (data?.config as DomainConfig) || null,
        allowToLandingPage: data?.allow_to_landing_page ?? true,
        loading: false, 
        initialized: true 
      });
    } catch (err) {
      console.error('Failed to fetch domain configuration:', err);
      set({ config: null, loading: false, initialized: true });
    }
  },
  
  isScreenEnabled: (route: string) => {
    const { config, initialized } = get();
    
    // If not yet initialized OR no config row found for this domain → allow all (safe default)
    if (!initialized || !config || !config.screens) {
      return true;
    }

    // Normalize: strip trailing slash
    const normalizedRoute = route.endsWith('/') && route.length > 1 ? route.slice(0, -1) : route;
    
    // 1. Exact match
    if (config.screens[normalizedRoute] !== undefined) {
      return config.screens[normalizedRoute];
    }
    
    // 2. Sub-route parent match: /dashboard/leave/settings → check /dashboard/leave
    const parts = normalizedRoute.split('/').filter(Boolean);
    if (parts.length > 2 && parts[0] === 'dashboard') {
      const parentRoute = `/${parts[0]}/${parts[1]}`;
      if (config.screens[parentRoute] !== undefined) {
        return config.screens[parentRoute];
      }
    }

    // 3. ALLOW by default when a config EXISTS but doesn't mention this route.
    //    This ensures standard features aren't broken if not explicitly configured.
    return true;
  },
  
  isFeatureEnabled: (feature: string) => {
    const { config, initialized } = get();
    
    // No config → allow all features by default
    if (!initialized || !config || !config.features) {
      return true;
    }
    
    if (config.features[feature] !== undefined) {
      return config.features[feature];
    }
    
    // DENY unlisted features when a config exists
    return false;
  }
}));
