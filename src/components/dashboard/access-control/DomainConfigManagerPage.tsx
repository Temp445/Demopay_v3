import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { Search, Plus, Globe, MonitorPlay, Loader2, ChevronDown, Settings2, Edit2, Power, PowerOff, Check, X, Link, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface ApplicationScreenDef {
  group: string;
  route: string;
  label: string;
}

interface DomainConfig {
  id?: string;
  domain_name: string;
  tenant_id?: string;
  config: { screens: Record<string, boolean>; features?: Record<string, boolean> };
  is_active: boolean;
  allow_to_landing_page: boolean;
  subscription_enabled?: boolean;
}

interface Tenant {
  id: string;
  name: string;
  subscription_enabled?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildDefaultConfig(allScreens: ApplicationScreenDef[]): DomainConfig['config'] {
  const screens: Record<string, boolean> = {};
  allScreens.forEach(s => { screens[s.route] = true; });
  return { screens, features: { live_tracking: true, face_enrollment: true } };
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DomainConfigManagerPage() {
  const [domains, setDomains] = useState<DomainConfig[]>([]);
  const [allScreens, setAllScreens] = useState<ApplicationScreenDef[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [allTenants, setAllTenants] = useState<Tenant[]>([]);

  const [loading, setLoading] = useState(true);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<string>('ALL');
  const [mainTab, setMainTab] = useState<'DOMAIN' | 'MANAGE'>('DOMAIN');
  const [domainDropdownOpen, setDomainDropdownOpen] = useState(false);
  const [domainSearchQuery, setDomainSearchQuery] = useState('');
  const [selectedDomainName, setSelectedDomainName] = useState<string | null>(null);

  // Create Domain State
  const [createDomainName, setCreateDomainName] = useState('');
  const [createDomainSubscription, setCreateDomainSubscription] = useState(false);
  const [creatingDomain, setCreatingDomain] = useState(false);

  // Link Tenant State
  const [linkDomainName, setLinkDomainName] = useState('');
  const [linkTenantId, setLinkTenantId] = useState('');
  const [linkAllowToLandingPage, setLinkAllowToLandingPage] = useState(true);
  const [linkTenantSubscription, setLinkTenantSubscription] = useState(false);
  const [linkDomainScreens, setLinkDomainScreens] = useState<Record<string, boolean>>({});
  const [linkingTenant, setLinkingTenant] = useState(false);

  // Manage Domains Modal States
  const [editingDomainGroup, setEditingDomainGroup] = useState<string | null>(null);
  const [editGroupSubscription, setEditGroupSubscription] = useState(false);
  const [editGroupTenants, setEditGroupTenants] = useState<{ id: string; tenant_id: string; is_active: boolean; allow_to_landing_page: boolean; tenant_subscription: boolean; }[]>([]);

  // ─── Data Fetching ────────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: screensData, error: screensError } = await supabase
      .from('application_screens')
      .select('screen_name, screen_route, screen_group')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (screensError) toast.error('Failed to load application screens.');

    const uniqueScreensMap = new Map<string, ApplicationScreenDef>();
    (screensData || []).forEach(s => {
      if (!uniqueScreensMap.has(s.screen_route)) {
        uniqueScreensMap.set(s.screen_route, {
          route: s.screen_route,
          label: s.screen_name,
          group: (s.screen_group || 'GENERAL').toUpperCase()
        });
      }
    });
    const uniqueScreens = Array.from(uniqueScreensMap.values());
    setAllScreens(uniqueScreens);
    setGroups([...new Set(uniqueScreens.map(s => s.group))].sort());

    const { data: tenantsData, error: tenantsError } = await supabase
      .from('tenants')
      .select('*')
      .order('name', { ascending: true });

    if (!tenantsError && tenantsData) {
      setAllTenants(tenantsData);
    }

    const { data, error } = await supabase
      .from('domain_configurations')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      toast.error('Failed to load domain configurations.');
    } else {
      setDomains((data || []).map(d => ({
        id: d.id,
        domain_name: d.domain_name,
        tenant_id: d.tenant_id,
        config: d.config,
        is_active: d.is_active,
        allow_to_landing_page: d.allow_to_landing_page,
        subscription_enabled: d.subscription_enabled,
      })));
    }
    
    // Initialize new domain screens default
    if (screensData && screensData.length > 0) {
      const initial: Record<string, boolean> = {};
      screensData.forEach(s => initial[s.route] = true);
      setNewDomainScreens(initial);
    }

    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const groupedDomains = useMemo(() => {
    const map = new Map<string, DomainConfig[]>();
    domains.forEach(d => {
      if (!map.has(d.domain_name)) map.set(d.domain_name, []);
      map.get(d.domain_name)!.push(d);
    });
    return Array.from(map.entries()).map(([domain_name, configs]) => ({
      domain_name,
      configs,
      is_active: configs.some(c => c.is_active),
      subscription_enabled: configs.some(c => c.subscription_enabled)
    }));
  }, [domains]);

  // ─── Actions ──────────────────────────────────────────────────────────────
  const handleCreateDomain = async () => {
    const trimmed = createDomainName.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed) { toast.error('Please enter a valid domain name.'); return; }
    
    if (domains.some(d => d.domain_name === trimmed)) {
      toast.error('This domain already exists.');
      return;
    }

    setCreatingDomain(true);
    const { data, error } = await supabase
      .from('domain_configurations')
      .insert({ 
        domain_name: trimmed, 
        config: { screens: {}, features: { live_tracking: true, face_enrollment: true } }, 
        is_active: true, 
        tenant_id: null,
        allow_to_landing_page: true,
        subscription_enabled: createDomainSubscription
      })
      .select()
      .single();
      
    if (error) {
      toast.error(`Failed to create domain: ${error.message || 'Unknown error'}`);
    } else {
      setDomains(prev => [...prev, { id: data.id, domain_name: data.domain_name, tenant_id: data.tenant_id, config: data.config, is_active: data.is_active, allow_to_landing_page: data.allow_to_landing_page, subscription_enabled: data.subscription_enabled }]);
      toast.success(`Domain "${trimmed}" created successfully.`);
      setCreateDomainName('');
      setCreateDomainSubscription(false);
    }
    setCreatingDomain(false);
  };

  const handleLinkTenant = async () => {
    if (!linkDomainName) { toast.error('Please select a domain.'); return; }
    if (!linkTenantId) { toast.error('Please select a tenant.'); return; }
    
    if (domains.some(d => d.domain_name === linkDomainName && d.tenant_id === linkTenantId)) {
      toast.error('This tenant is already linked to this domain.');
      return;
    }

    // Find the domain group to get its subscription status
    const group = groupedDomains.find(g => g.domain_name === linkDomainName);
    if (!group) return;

    setLinkingTenant(true);
    
    const { data, error } = await supabase
      .from('domain_configurations')
      .insert({ 
        domain_name: linkDomainName, 
        config: { screens: linkDomainScreens, features: { live_tracking: true, face_enrollment: true } }, 
        is_active: true, 
        tenant_id: linkTenantId,
        allow_to_landing_page: linkAllowToLandingPage,
        subscription_enabled: group.subscription_enabled
      })
      .select()
      .single();
      
    if (error) {
      toast.error(`Failed to link tenant: ${error.message || 'Unknown error'}`);
    } else {
      setDomains(prev => [...prev, { id: data.id, domain_name: data.domain_name, tenant_id: data.tenant_id, config: data.config, is_active: data.is_active, allow_to_landing_page: data.allow_to_landing_page, subscription_enabled: data.subscription_enabled }]);
      
      if (linkTenantSubscription && group.subscription_enabled) {
         await supabase.from('tenants').update({ subscription_enabled: true }).eq('id', linkTenantId);
         setAllTenants(prev => prev.map(t => t.id === linkTenantId ? { ...t, subscription_enabled: true } : t));
      }

      toast.success(`Tenant successfully linked to "${linkDomainName}".`);
      setLinkDomainName('');
      setLinkTenantId('');
    }
    setLinkingTenant(false);
  };

  const handleSaveDomainGroupEdits = async () => {
    if (!editingDomainGroup) return;

    let hasError = false;
    for (const tenantConfig of editGroupTenants) {
      const { error: configError } = await supabase.from('domain_configurations').update({
        is_active: tenantConfig.is_active,
        allow_to_landing_page: tenantConfig.allow_to_landing_page,
        subscription_enabled: editGroupSubscription
      }).eq('id', tenantConfig.id);

      if (configError) hasError = true;

      const { error: tenantError } = await supabase.from('tenants').update({
        subscription_enabled: editGroupSubscription ? tenantConfig.tenant_subscription : false
      }).eq('id', tenantConfig.tenant_id);

      if (tenantError) hasError = true;
    }

    if (hasError) {
      toast.error('Some updates failed. Reloading data...');
    } else {
      toast.success('Domain settings updated successfully');
    }
    
    setEditingDomainGroup(null);
    fetchData(); // Reload all data to ensure sync
  };


  const handleDeleteDomain = async (id: string, domainName: string) => {
    if (window.confirm(`Are you sure you want to delete the domain config for "${domainName}"? This action cannot be undone.`)) {
      const { error } = await supabase.from('domain_configurations').delete().eq('id', id);
      if (error) {
        toast.error('Failed to delete domain');
      } else {
        setDomains(prev => prev.filter(d => d.id !== id));
        toast.success('Domain deleted successfully');
      }
    }
  };

  const toggleScreen = async (activeDomain: DomainConfig, route: string, currentValue: boolean) => {
    if (!activeDomain?.id) return;
    const updatedConfig = {
      ...activeDomain.config,
      screens: { ...activeDomain.config.screens, [route]: !currentValue }
    };
    setDomains(prev => prev.map(d => d.id === activeDomain.id ? { ...d, config: updatedConfig } : d));
    
    // Update domain_configurations
    const { error } = await supabase.from('domain_configurations').update({ config: updatedConfig }).eq('id', activeDomain.id);
    if (error) toast.error('Failed to save setting in domain config');
    
    // Sync with application_screens table for this tenant
    if (activeDomain.tenant_id) {
      const { error: screenError } = await supabase
        .from('application_screens')
        .update({ is_active: !currentValue })
        .eq('tenant_id', activeDomain.tenant_id)
        .eq('screen_route', route);
        
      if (screenError) {
        console.error('Failed to sync with application_screens:', screenError);
      }
    }
  };

  // ─── Derived State ────────────────────────────────────────────────────────
  const uniqueDomainNames = useMemo(() => {
    return Array.from(new Set(domains.map(d => d.domain_name))).sort();
  }, [domains]);

  useEffect(() => {
    if (uniqueDomainNames.length > 0 && !selectedDomainName) {
      setSelectedDomainName(uniqueDomainNames[0]);
    }
  }, [uniqueDomainNames, selectedDomainName]);

  const tenantsForActiveDomain = useMemo(() => {
    if (!selectedDomainName) return [];
    const tenantIds = domains.filter(d => d.domain_name === selectedDomainName).map(d => d.tenant_id);
    return allTenants.filter(t => tenantIds.includes(t.id));
  }, [selectedDomainName, domains, allTenants]);

  useEffect(() => {
    if (tenantsForActiveDomain.length > 0) {
      if (!selectedTenantId || !tenantsForActiveDomain.find(t => t.id === selectedTenantId)) {
        setSelectedTenantId(tenantsForActiveDomain[0].id);
      }
    } else {
      setSelectedTenantId(null);
    }
  }, [tenantsForActiveDomain, selectedTenantId]);

  const selectedTenant = allTenants.find(t => t.id === selectedTenantId);
  const activeDomain = domains.find(d => d.domain_name === selectedDomainName && d.tenant_id === selectedTenantId);

  const filteredScreens = useMemo(() => {
    let result = allScreens;
    if (activeTab !== 'ALL') result = result.filter(s => s.group === activeTab);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(s => s.label.toLowerCase().includes(q) || s.route.toLowerCase().includes(q));
    }
    return result;
  }, [allScreens, activeTab, searchQuery]);

  const activeCount = useMemo(() => {
    if (!activeDomain) return 0;
    return allScreens.filter(s => activeDomain.config.screens[s.route] !== false).length;
  }, [activeDomain, allScreens]);

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4 h-full p-2 sm:p-4 overflow-hidden bg-slate-50/50">
      
      {/* ── TOP LEVEL TABS ── */}
      <div className="flex bg-white rounded-xl border border-slate-200 p-1 flex-shrink-0 shadow-sm w-max mb-1">
        <button
          onClick={() => setMainTab('DOMAIN')}
          className={`px-6 py-2 text-[13px] font-bold rounded-lg transition-colors ${
            mainTab === 'DOMAIN' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Domain Configuration
        </button>
        <button
          onClick={() => setMainTab('MANAGE')}
          className={`px-6 py-2 text-[13px] font-bold rounded-lg transition-colors ${
            mainTab === 'MANAGE' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
          }`}
        >
          Manage Domains
        </button>
      </div>

      {/* ── Manage Domains Section (Top) ── */}
      {mainTab === 'MANAGE' && (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col flex-shrink-0 flex-1 min-h-0">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">Manage Domains</h3>
            <p className="text-[12px] font-medium text-slate-500 mt-0.5">Add, edit, disable, or link domains to tenants</p>
          </div>
        </div>
        
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Form 1: Register New Domain */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <h4 className="text-[13px] font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                Register New Domain
              </h4>
              
              <div className="space-y-4 flex-1">
                <div className="space-y-1.5 w-full">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Domain Name</label>
                  <input
                    type="text"
                    placeholder="e.g. client1.acepayroll.in"
                    value={createDomainName}
                    onChange={e => setCreateDomainName(e.target.value)}
                    disabled={creatingDomain}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>
                
                <label className="flex items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div>
                    <span className="text-[13px] font-bold text-slate-800 block">Subscription Management</span>
                    <span className="text-[11px] text-slate-500">Enable subscriptions for this domain</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateDomainSubscription(!createDomainSubscription)}
                    className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${createDomainSubscription ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${createDomainSubscription ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>
              </div>

              <div className="mt-5 flex items-center justify-end w-full">
                <button
                  onClick={handleCreateDomain}
                  disabled={creatingDomain || !createDomainName.trim()}
                  className="flex items-center justify-center gap-1.5 px-6 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm w-full sm:w-auto"
                >
                  {creatingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Register Domain
                </button>
              </div>
            </div>

            {/* Form 2: Link Tenant */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col">
              <h4 className="text-[13px] font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                <Link className="w-4 h-4 text-indigo-600" />
                Link Tenant to Domain
              </h4>
              
              <div className="space-y-4 flex-1">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 space-y-1.5 w-full">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Select Domain</label>
                    <select
                      value={linkDomainName}
                      onChange={e => {
                         setLinkDomainName(e.target.value);
                         const group = groupedDomains.find(g => g.domain_name === e.target.value);
                         if (group && !group.subscription_enabled) setLinkTenantSubscription(false);
                      }}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="" disabled>Select domain...</option>
                      {groupedDomains.map(g => (
                        <option key={g.domain_name} value={g.domain_name}>{g.domain_name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex-1 space-y-1.5 w-full">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Select Tenant</label>
                    <select
                      value={linkTenantId}
                      onChange={e => setLinkTenantId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="" disabled>Select tenant...</option>
                      {allTenants.map(t => {
                         const isAlreadyLinked = linkDomainName && domains.some(d => d.domain_name === linkDomainName && d.tenant_id === t.id);
                         return (
                           <option key={t.id} value={t.id} disabled={!!isAlreadyLinked}>
                             {t.name} {isAlreadyLinked ? '(Already linked)' : ''}
                           </option>
                         );
                      })}
                    </select>
                  </div>
                </div>

                <div className="mt-2 space-y-1.5 w-full">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Initial Screen Access</label>
                    <button 
                      onClick={() => {
                        const allTrue = {};
                        allScreens.forEach(s => allTrue[s.route] = true);
                        setLinkDomainScreens(allTrue);
                      }}
                      className="text-[10px] text-indigo-600 font-bold hover:underline"
                    >
                      Select All
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 border border-slate-200 rounded-lg p-2 bg-slate-50 max-h-32 overflow-y-auto">
                     {allScreens.map(s => (
                       <label key={s.route} className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 p-1.5 rounded transition-colors">
                          <input 
                            type="checkbox" 
                            checked={linkDomainScreens[s.route] !== false} 
                            onChange={(e) => setLinkDomainScreens(prev => ({...prev, [s.route]: e.target.checked}))} 
                            className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 border-slate-300 flex-shrink-0" 
                          />
                          <span className="truncate">{s.label}</span>
                       </label>
                     ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <label className="flex flex-1 items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                    <div>
                      <span className="text-[13px] font-bold text-slate-800 block">Landing Page</span>
                      <span className="text-[11px] text-slate-500">Initial page is Landing Page</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinkAllowToLandingPage(!linkAllowToLandingPage)}
                      className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${linkAllowToLandingPage ? 'bg-emerald-500' : 'bg-slate-300'}`}
                    >
                      <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${linkAllowToLandingPage ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </label>

                  <label className={`flex flex-1 items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg transition-colors ${linkDomainName && groupedDomains.find(g => g.domain_name === linkDomainName)?.subscription_enabled ? 'bg-slate-50 hover:bg-slate-100' : 'bg-slate-100/50 opacity-60'}`}>
                    <div>
                      <span className="text-[13px] font-bold text-slate-800 block">Tenant Subscription</span>
                      <span className="text-[11px] text-slate-500">Enable for selected tenant</span>
                    </div>
                    <button
                      type="button"
                      disabled={!linkDomainName || !groupedDomains.find(g => g.domain_name === linkDomainName)?.subscription_enabled}
                      onClick={() => setLinkTenantSubscription(!linkTenantSubscription)}
                      className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${linkTenantSubscription ? 'bg-emerald-500' : 'bg-slate-300'} ${!linkDomainName || !groupedDomains.find(g => g.domain_name === linkDomainName)?.subscription_enabled ? 'cursor-not-allowed' : ''}`}
                    >
                      <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${linkTenantSubscription ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                  </label>
                </div>
              </div>

              <div className="mt-5 flex items-center justify-end w-full">
                <button
                  onClick={handleLinkTenant}
                  disabled={linkingTenant || !linkDomainName || !linkTenantId}
                  className="flex items-center justify-center gap-1.5 px-6 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm w-full sm:w-auto"
                >
                  {linkingTenant ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link className="w-4 h-4" />}
                  Link Tenant
                </button>
              </div>
            </div>
          </div>

          {/* Domains List */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between sticky top-0 z-10">
              <h4 className="text-[13px] font-extrabold text-slate-800 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                Edit Domain
              </h4>
            </div>
            {domains.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-[13px]">
                No domains configured yet. Use the form above to add your first domain.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Domain Name</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Linked Tenant</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Status</th>
                      <th className="px-4 py-3 text-[11px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {groupedDomains.map(group => {
                      return (
                        <tr key={group.domain_name} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <Globe className={`w-4 h-4 ${group.is_active ? 'text-indigo-500' : 'text-slate-400'}`} />
                              <span className={`text-[13px] font-bold ${group.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{group.domain_name}</span>
                            </div>
                          </td>
                              <td className="px-4 py-3 min-w-[200px]">
                                <span className="text-[12px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-md line-clamp-1" title={`${group.configs.length} Tenant(s)`}>
                                  {group.configs.length} Tenant(s)
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${group.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${group.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {group.is_active ? 'Active' : 'Disabled'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingDomainGroup(group.domain_name);
                                      setEditGroupSubscription(!!group.subscription_enabled);
                                      setEditGroupTenants(group.configs.map(c => {
                                        const t = allTenants.find(t => t.id === c.tenant_id);
                                        return {
                                          id: c.id!,
                                          tenant_id: c.tenant_id!,
                                          is_active: c.is_active,
                                          allow_to_landing_page: c.allow_to_landing_page,
                                          tenant_subscription: !!t?.subscription_enabled
                                        };
                                      }));
                                    }}
                                    title="Edit Domain Settings"
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDomain(group.configs[0].id!, group.domain_name)}
                                    title="Delete Domain"
                                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* ── MAIN DOMAIN SECTION ── */}
      {mainTab === 'DOMAIN' && (
      <>
      {/* ── TOP BAR: Domain Switcher ── */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 flex-shrink-0">
        {/* Label */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Globe className="w-4 h-4 text-indigo-600" />
          </div>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Domain</span>
        </div>

        {/* Domain searchable dropdown */}
        {loading && uniqueDomainNames.length === 0 ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading domains...
          </div>
        ) : (
          <div className="relative flex-1 max-w-md">
            <button
              onClick={() => setDomainDropdownOpen(o => !o)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-700 transition-colors"
            >
              <span className="flex items-center gap-2.5 truncate">
                <span className="w-6 h-6 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center text-[11px] font-black flex-shrink-0">
                  {selectedDomainName?.charAt(0).toUpperCase() ?? '?'}
                </span>
                <span className="truncate">{selectedDomainName ?? 'Select Domain'}</span>
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${domainDropdownOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {domainDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden flex flex-col max-h-[320px]">
                {/* Search Input */}
                <div className="p-2 border-b border-slate-100 bg-slate-50/50">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      autoFocus
                      placeholder="Search domains..."
                      value={domainSearchQuery}
                      onChange={e => setDomainSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[12px] focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow"
                    />
                  </div>
                </div>

                {/* Domain List */}
                <div className="flex-1 overflow-y-auto py-1">
                  {uniqueDomainNames.filter(d => d.toLowerCase().includes(domainSearchQuery.toLowerCase())).length === 0 ? (
                    <div className="px-4 py-6 text-center text-[12px] text-slate-500">No domains found</div>
                  ) : (
                    uniqueDomainNames
                      .filter(d => d.toLowerCase().includes(domainSearchQuery.toLowerCase()))
                      .map(domainName => {
                        const isActive = domainName === selectedDomainName;
                        return (
                          <button
                            key={domainName}
                            onClick={() => { 
                              setSelectedDomainName(domainName); 
                              setActiveTab('ALL'); 
                              setSearchQuery(''); 
                              setDomainSearchQuery('');
                              setDomainDropdownOpen(false); 
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left text-[13px] font-semibold transition-colors ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-700 hover:bg-slate-50'}`}
                          >
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black flex-shrink-0 ${isActive ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {domainName.charAt(0).toUpperCase()}
                            </span>
                            <span className="truncate">{domainName}</span>
                          </button>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── MAIN CONTENT PANEL ── */}
      {!selectedDomainName ? (
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex items-center justify-center flex-col gap-3 min-h-[300px]">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
            <Globe className="w-7 h-7 text-indigo-300" />
          </div>
          <p className="font-bold text-slate-600">Select a domain above to get started</p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-0" style={{ minHeight: '500px' }}>

          {/* ── Panel Header ── */}
          <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 flex items-center justify-center text-white font-black text-base flex-shrink-0 shadow-md shadow-indigo-200">
                {selectedDomainName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight truncate">{selectedDomainName}</h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <MonitorPlay className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <span className="text-[12px] text-indigo-600 font-bold">{tenantsForActiveDomain.length} Tenant(s) linked</span>
                </div>
              </div>
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-52 flex-shrink-0">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search screens..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* ── Tenant Tabs ── */}
          {tenantsForActiveDomain.length > 0 && (
            <div className="flex overflow-x-auto border-b border-slate-200 bg-slate-50" style={{ scrollbarWidth: 'none' }}>
              {tenantsForActiveDomain.map(t => {
                 const isActive = t.id === selectedTenantId;
                 return (
                   <button
                     key={t.id}
                     onClick={() => { setSelectedTenantId(t.id); setActiveTab('ALL'); setSearchQuery(''); }}
                     className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-[12px] font-extrabold tracking-wide transition-all border-b-2 ${
                       isActive 
                         ? 'border-indigo-600 text-indigo-600 bg-white' 
                         : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50'
                     }`}
                   >
                     <div className={`w-4 h-4 rounded flex items-center justify-center text-[9px] ${isActive ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-200 text-slate-500'}`}>
                       {t.name.charAt(0)}
                     </div>
                     {t.name}
                   </button>
                 );
              })}
            </div>
          )}

          {/* ── Content ── */}
          {tenantsForActiveDomain.length === 0 ? (
            <div className="flex-1 flex items-center justify-center p-8 text-center">
              <p className="text-slate-500 text-[13px] font-bold">No tenants are currently linked to this domain.</p>
            </div>
          ) : !activeDomain || !selectedTenant ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border-2 border-amber-100 flex items-center justify-center mb-4">
                <Globe className="w-8 h-8 text-amber-400" />
              </div>
              <h3 className="text-base font-extrabold text-slate-800">No Domain Configured</h3>
              <p className="text-slate-500 text-[13px] mt-2 max-w-sm leading-relaxed">
                Please ensure a valid domain is mapped to <span className="font-bold text-slate-700">{selectedTenant?.name ?? 'the selected tenant'}</span>.
              </p>
            </div>
          ) : (
            <>
              {/* ── Group Tabs ── */}
              <div className="flex overflow-x-auto border-b border-slate-100 px-2" style={{ scrollbarWidth: 'none' }}>
                {['ALL', ...groups].map(grp => (
                  <button
                    key={grp}
                    onClick={() => setActiveTab(grp)}
                    className={`px-4 py-3 text-[10px] font-extrabold tracking-widest whitespace-nowrap border-b-2 flex-shrink-0 transition-all ${
                      activeTab === grp
                        ? 'border-indigo-600 text-indigo-700'
                        : 'border-transparent text-slate-400 hover:text-slate-600'
                    }`}
                  >
                    {grp}
                  </button>
                ))}
              </div>

              <div className="flex flex-col flex-1 overflow-hidden min-h-0">
                {/* ── Table Header ── */}
                <div className="grid grid-cols-12 px-4 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-100 text-[9px] font-extrabold text-slate-400 uppercase tracking-widest flex-shrink-0">
                  <div className="col-span-7 sm:col-span-5">Screen &amp; Group</div>
                  <div className="hidden sm:block col-span-5">Route Path</div>
                  <div className="col-span-5 sm:col-span-2 text-right">Access</div>
                </div>

              {/* ── Table Body ── */}
              <div className="flex-1 overflow-y-auto">
                {filteredScreens.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Search className="w-8 h-8 text-slate-200" />
                    <p className="text-slate-400 text-[13px] font-medium">No screens match your search.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                    {filteredScreens.map(screen => {
                      const isEnabled = activeDomain.config.screens[screen.route] !== false;
                      return (
                        <div
                          key={screen.route}
                          className={`grid grid-cols-12 px-4 sm:px-6 py-3.5 items-center transition-colors ${isEnabled ? 'hover:bg-indigo-50/30' : 'hover:bg-slate-50'}`}
                        >
                          {/* Screen name + badge */}
                          <div className="col-span-7 sm:col-span-5 flex items-center gap-2 min-w-0">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isEnabled ? 'bg-emerald-400' : 'bg-slate-200'}`} />
                            <span className={`text-[13px] font-semibold truncate ${isEnabled ? 'text-slate-800' : 'text-slate-400'}`}>
                              {screen.label}
                            </span>
                            <span className="hidden sm:inline-flex px-1.5 py-0.5 rounded-md text-[9px] font-extrabold tracking-wider bg-slate-100 text-slate-500 whitespace-nowrap flex-shrink-0">
                              {screen.group}
                            </span>
                          </div>

                          {/* Route */}
                          <div className="hidden sm:flex col-span-5 items-center min-w-0">
                            <code className="text-[11px] font-mono text-slate-500 truncate">{screen.route}</code>
                          </div>

                          {/* Toggle */}
                          <div className="col-span-5 sm:col-span-2 flex justify-end">
                            <button
                              onClick={() => toggleScreen(activeDomain, screen.route, isEnabled)}
                              className={`w-10 h-5 rounded-full relative transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-indigo-500 flex-shrink-0 ${isEnabled ? 'bg-indigo-600' : 'bg-slate-200'}`}
                            >
                              <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── Footer Stats ── */}
              <div className="px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2 flex-shrink-0">
                <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest">
                  Total: <span className="text-slate-800">{allScreens.length}</span>
                </span>
                <div className="flex items-center gap-4 text-[11px] font-bold uppercase tracking-widest">
                  <span className="flex items-center gap-1.5 text-emerald-600">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    Active: {activeCount}
                  </span>
                  <span className="text-slate-400">Inactive: {allScreens.length - activeCount}</span>
                </div>
              </div>

            </div>
            </>
          )}
        </div>
      )}
      </>
      )}

      {/* ── Edit Domain Modal ── */}
      {editingDomainGroup && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
                <Globe className="w-4 h-4 text-indigo-600" />
                Domain Settings: {editingDomainGroup}
              </h3>
              <button onClick={() => setEditingDomainGroup(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6">
              
              {/* Domain Level Settings */}
              <div className="space-y-4">
                <h4 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Global Settings</h4>
                
                <label className="flex items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg bg-indigo-50/50 hover:bg-indigo-50 transition-colors">
                  <div>
                    <span className="text-[13px] font-bold text-slate-800 block">Subscription Management</span>
                    <span className="text-[11px] text-slate-500">Enable subscriptions for ALL tenants under this domain</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextVal = !editGroupSubscription;
                      setEditGroupSubscription(nextVal);
                      if (!nextVal) {
                        setEditGroupTenants(prev => prev.map(t => ({ ...t, tenant_subscription: false })));
                      }
                    }}
                    className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${editGroupSubscription ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${editGroupSubscription ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>
              </div>

              {/* Linked Tenants */}
              <div className="space-y-4">
                <h4 className="text-[12px] font-extrabold text-slate-800 uppercase tracking-widest border-b border-slate-100 pb-2">Linked Tenants ({editGroupTenants.length})</h4>
                
                <div className="space-y-3">
                  {editGroupTenants.map((tConfig, index) => {
                    const tenant = allTenants.find(t => t.id === tConfig.tenant_id);
                    return (
                      <div key={tConfig.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[13px] font-bold text-slate-800">{tenant?.name || 'Unknown Tenant'}</span>
                        </div>
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <label className="flex items-center justify-between cursor-pointer p-2 border border-slate-100 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                            <span className="text-[11px] font-bold text-slate-700">Domain Status</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newArr = [...editGroupTenants];
                                newArr[index].is_active = !newArr[index].is_active;
                                setEditGroupTenants(newArr);
                              }}
                              className={`w-8 h-4 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${tConfig.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-[2px] left-[2px] bg-white w-[12px] h-[12px] rounded-full transition-transform duration-200 shadow-sm ${tConfig.is_active ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </label>

                          <label className="flex items-center justify-between cursor-pointer p-2 border border-slate-100 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                            <span className="text-[11px] font-bold text-slate-700">Landing Page</span>
                            <button
                              type="button"
                              onClick={() => {
                                const newArr = [...editGroupTenants];
                                newArr[index].allow_to_landing_page = !newArr[index].allow_to_landing_page;
                                setEditGroupTenants(newArr);
                              }}
                              className={`w-8 h-4 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${tConfig.allow_to_landing_page ? 'bg-emerald-500' : 'bg-slate-300'}`}
                            >
                              <span className={`absolute top-[2px] left-[2px] bg-white w-[12px] h-[12px] rounded-full transition-transform duration-200 shadow-sm ${tConfig.allow_to_landing_page ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </label>

                          <label className={`flex items-center justify-between cursor-pointer p-2 border border-slate-100 rounded-lg transition-colors ${editGroupSubscription ? 'bg-slate-50 hover:bg-slate-100' : 'bg-slate-100/50 opacity-60'}`}>
                            <span className="text-[11px] font-bold text-slate-700">Subscription</span>
                            <button
                              type="button"
                              disabled={!editGroupSubscription}
                              onClick={() => {
                                const newArr = [...editGroupTenants];
                                newArr[index].tenant_subscription = !newArr[index].tenant_subscription;
                                setEditGroupTenants(newArr);
                              }}
                              className={`w-8 h-4 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${tConfig.tenant_subscription && editGroupSubscription ? 'bg-emerald-500' : 'bg-slate-300'} ${!editGroupSubscription ? 'cursor-not-allowed' : ''}`}
                            >
                              <span className={`absolute top-[2px] left-[2px] bg-white w-[12px] h-[12px] rounded-full transition-transform duration-200 shadow-sm ${tConfig.tenant_subscription && editGroupSubscription ? 'translate-x-4' : 'translate-x-0'}`} />
                            </button>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingDomainGroup(null)}
                className="px-4 py-2 text-[13px] font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDomainGroupEdits}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 transition-colors shadow-sm flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
