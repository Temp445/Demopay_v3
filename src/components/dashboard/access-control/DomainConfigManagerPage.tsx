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
}

interface Tenant {
  id: string;
  name: string;
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

  const [newDomain, setNewDomain] = useState('');
  const [addingDomain, setAddingDomain] = useState(false);

  const [selectedTenantsForNewDomain, setSelectedTenantsForNewDomain] = useState<string[]>([]);
  const [isTenantMultiSelectOpen, setIsTenantMultiSelectOpen] = useState(false);
  
  // Manage Domains Modal States
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editingDomainName, setEditingDomainName] = useState('');
  const [linkingTenantId, setLinkingTenantId] = useState('');
  const [editFormIsActive, setEditFormIsActive] = useState(false);
  const [editFormAllowToLandingPage, setEditFormAllowToLandingPage] = useState(true);

  const [newDomainScreens, setNewDomainScreens] = useState<Record<string, boolean>>({});
  const [newAllowToLandingPage, setNewAllowToLandingPage] = useState(true);

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
      .select('id, name')
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

  // ─── Actions ──────────────────────────────────────────────────────────────
  const handleAddDomain = async () => {
    if (selectedTenantsForNewDomain.length === 0) { toast.error('Please select at least one tenant.'); return; }
    const trimmed = newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed) { toast.error('Please enter a valid domain name.'); return; }
    
    const alreadyLinked = selectedTenantsForNewDomain.find(tenantId => 
      domains.some(d => d.domain_name === trimmed && d.tenant_id === tenantId)
    );
    
    if (alreadyLinked) {
      const tenantName = allTenants.find(t => t.id === alreadyLinked)?.name || 'a selected tenant';
      toast.error(`This domain is already linked to ${tenantName}.`);
      return;
    }

    setAddingDomain(true);
    let successCount = 0;
    
    for (const tenantId of selectedTenantsForNewDomain) {
      const { data, error } = await supabase
        .from('domain_configurations')
        .insert({ 
          domain_name: trimmed, 
          config: { screens: newDomainScreens, features: { live_tracking: true, face_enrollment: true } }, 
          is_active: true, 
          tenant_id: tenantId,
          allow_to_landing_page: newAllowToLandingPage
        })
        .select()
        .single();
        
      if (error) {
        toast.error(`Failed to add domain for a tenant: ${error.message || 'Unknown error'}`);
      } else {
        setDomains(prev => [...prev, { id: data.id, domain_name: data.domain_name, tenant_id: data.tenant_id, config: data.config, is_active: data.is_active, allow_to_landing_page: data.allow_to_landing_page }]);
        successCount++;
      }
    }
    
    if (successCount > 0) {
      toast.success(`Domain "${trimmed}" linked to ${successCount} tenant(s).`);
      setNewDomain('');
      setSelectedTenantsForNewDomain([]);
      setIsTenantMultiSelectOpen(false);
      if (!selectedTenantId) {
        setSelectedTenantId(selectedTenantsForNewDomain[0]);
      }
    }
    
    setAddingDomain(false);
  };

  const handleSaveDomainEdits = async () => {
    if (!editingDomainId) return;
    const trimmed = editingDomainName.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    if (!trimmed) {
      toast.error('Domain name cannot be empty');
      return;
    }
    if (!linkingTenantId) {
      toast.error('Tenant must be selected');
      return;
    }

    if (domains.some(d => d.id !== editingDomainId && d.domain_name === trimmed && d.tenant_id === linkingTenantId)) {
      toast.error('This domain name is already linked to this tenant.');
      return;
    }

    const { error } = await supabase.from('domain_configurations').update({
      domain_name: trimmed,
      tenant_id: linkingTenantId,
      is_active: editFormIsActive,
      allow_to_landing_page: editFormAllowToLandingPage
    }).eq('id', editingDomainId);

    if (error) {
      toast.error(`Failed to update domain: ${error.message || 'Unknown error'}`);
    } else {
      setDomains(prev => prev.map(d => d.id === editingDomainId ? { 
        ...d, 
        domain_name: trimmed, 
        tenant_id: linkingTenantId,
        is_active: editFormIsActive,
        allow_to_landing_page: editFormAllowToLandingPage
      } : d));
      toast.success('Domain updated successfully');
      setEditingDomainId(null);
    }
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
          {/* Add Form */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h4 className="text-[13px] font-extrabold text-slate-800 mb-4 flex items-center gap-2">
              <Plus className="w-4 h-4 text-indigo-600" />
              Add New Domain
            </h4>
            <div className="flex flex-col sm:flex-row gap-4 items-end">
              <div className="flex-1 space-y-1.5 w-full">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Select Tenant</label>
                <div className="relative">
                  <div
                    onClick={() => !addingDomain && setIsTenantMultiSelectOpen(!isTenantMultiSelectOpen)}
                    className={`w-full flex items-center justify-between pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 cursor-pointer transition-all ${addingDomain ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white focus:ring-2 focus:ring-indigo-500'}`}
                  >
                    <span className="truncate">
                      {selectedTenantsForNewDomain.length === 0 
                        ? 'Select tenant(s)...' 
                        : `${selectedTenantsForNewDomain.length} tenant(s) selected`}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 absolute right-3 transition-transform ${isTenantMultiSelectOpen ? 'rotate-180' : ''}`} />
                  </div>
                  
                  {isTenantMultiSelectOpen && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-60 overflow-y-auto">
                      <div className="p-1">
                        {allTenants.map(t => {
                          const isAlreadyLinked = domains.some(d => d.tenant_id === t.id && d.domain_name === newDomain.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0]);
                          const isSelected = selectedTenantsForNewDomain.includes(t.id);
                          
                          return (
                            <label
                              key={t.id}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-semibold cursor-pointer transition-colors ${
                                isAlreadyLinked && newDomain.trim() !== '' 
                                  ? 'opacity-50 cursor-not-allowed text-slate-400' 
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                disabled={isAlreadyLinked && newDomain.trim() !== ''}
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTenantsForNewDomain(prev => [...prev, t.id]);
                                  } else {
                                    setSelectedTenantsForNewDomain(prev => prev.filter(id => id !== t.id));
                                  }
                                }}
                                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                              />
                              <span className="truncate flex-1">{t.name}</span>
                              {isAlreadyLinked && newDomain.trim() !== '' && (
                                <span className="text-[10px] text-amber-500 flex-shrink-0">Already linked</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-1.5 w-full">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Domain Name</label>
                <input
                  type="text"
                  placeholder="e.g. client1.acepayroll.in"
                  value={newDomain}
                  onChange={e => setNewDomain(e.target.value)}
                  disabled={addingDomain}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="mt-4 space-y-1.5 w-full">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Initial Screen Access</label>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold">
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">Total: {allScreens.length}</span>
                    <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">Selected: {allScreens.filter(s => newDomainScreens[s.route] !== false).length}</span>
                    <span className="bg-slate-50 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">Unselected: {allScreens.filter(s => newDomainScreens[s.route] === false).length}</span>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    const allTrue: Record<string, boolean> = {};
                    allScreens.forEach(s => allTrue[s.route] = true);
                    setNewDomainScreens(allTrue);
                  }}
                  className="text-[10px] text-indigo-600 font-bold hover:underline"
                >
                  Select All
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 border border-slate-200 rounded-lg p-3 bg-slate-50 max-h-80 overflow-y-auto">
                 {allScreens.map(s => (
                   <label key={s.route} className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 p-1.5 rounded transition-colors">
                      <input 
                        type="checkbox" 
                        checked={newDomainScreens[s.route] !== false} 
                        onChange={(e) => setNewDomainScreens(prev => ({...prev, [s.route]: e.target.checked}))} 
                        className="rounded text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 border-slate-300 flex-shrink-0" 
                      />
                      <span className="truncate">{s.label} <span className="text-[10px] text-slate-400 ml-1">({s.group})</span></span>
                   </label>
                 ))}
              </div>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <label className="flex flex-1 items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                <div>
                  <span className="text-[13px] font-bold text-slate-800 block">Allow to Landing Page</span>
                  <span className="text-[11px] text-slate-500">Initial page is Landing Page (if disabled, goes to Login)</span>
                </div>
                <button
                  type="button"
                  onClick={() => setNewAllowToLandingPage(!newAllowToLandingPage)}
                  className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${newAllowToLandingPage ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${newAllowToLandingPage ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end w-full">
              <button
                onClick={handleAddDomain}
                disabled={addingDomain || !newDomain.trim() || selectedTenantsForNewDomain.length === 0}
                className="flex items-center justify-center gap-1.5 px-6 py-2 bg-indigo-600 text-white rounded-lg text-[13px] font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm w-full sm:w-auto"
              >
                {addingDomain ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Add Domain
              </button>
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
                    {domains.map(domain => {
                      const tenant = allTenants.find(t => t.id === domain.tenant_id);
                      return (
                        <tr key={domain.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-3 min-w-[200px]">
                            <div className="flex items-center gap-2">
                              <Globe className={`w-4 h-4 ${domain.is_active ? 'text-indigo-500' : 'text-slate-400'}`} />
                              <span className={`text-[13px] font-bold ${domain.is_active ? 'text-slate-800' : 'text-slate-400'}`}>{domain.domain_name}</span>
                            </div>
                          </td>
                              <td className="px-4 py-3 min-w-[200px]">
                                <span className="text-[12px] font-semibold text-slate-600 bg-slate-100 px-2 py-1 rounded-md line-clamp-1" title={tenant?.name}>
                                  {tenant?.name || 'Unknown Tenant'}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${domain.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  <div className={`w-1.5 h-1.5 rounded-full ${domain.is_active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                                  {domain.is_active ? 'Active' : 'Disabled'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => {
                                      setEditingDomainId(domain.id!);
                                      setEditingDomainName(domain.domain_name);
                                      setLinkingTenantId(domain.tenant_id!);
                                      setEditFormIsActive(domain.is_active);
                                      setEditFormAllowToLandingPage(domain.allow_to_landing_page);
                                    }}
                                    title="Edit Domain"
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteDomain(domain.id!, domain.domain_name)}
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
      {editingDomainId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-[14px] font-bold text-slate-800 flex items-center gap-2">
                <Edit2 className="w-4 h-4 text-indigo-600" />
                Edit Domain Details
              </h3>
              <button onClick={() => setEditingDomainId(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Domain Name</label>
                <input
                  type="text"
                  value={editingDomainName}
                  onChange={e => setEditingDomainName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">Linked Tenant</label>
                <select
                  value={linkingTenantId}
                  onChange={e => setLinkingTenantId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>Select tenant</option>
                  {allTenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5 pt-2">
                <label className="flex items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div>
                    <span className="text-[13px] font-bold text-slate-800 block">Domain Status</span>
                    <span className="text-[11px] text-slate-500">Allow access to this domain</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditFormIsActive(!editFormIsActive)}
                    className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${editFormIsActive ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${editFormIsActive ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>

                <label className="flex items-center justify-between cursor-pointer p-3 border border-slate-200 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors">
                  <div>
                    <span className="text-[13px] font-bold text-slate-800 block">Allow to Landing Page</span>
                    <span className="text-[11px] text-slate-500">Initial page is Landing Page (if disabled, goes to Login)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditFormAllowToLandingPage(!editFormAllowToLandingPage)}
                    className={`w-9 h-5 rounded-full relative transition-colors duration-200 focus:outline-none flex-shrink-0 ${editFormAllowToLandingPage ? 'bg-emerald-500' : 'bg-slate-300'}`}
                  >
                    <span className={`absolute top-[2px] left-[2px] bg-white w-[16px] h-[16px] rounded-full transition-transform duration-200 shadow-sm ${editFormAllowToLandingPage ? 'translate-x-4' : 'translate-x-0'}`} />
                  </button>
                </label>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setEditingDomainId(null)}
                className="px-4 py-2 text-[13px] font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDomainEdits}
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
