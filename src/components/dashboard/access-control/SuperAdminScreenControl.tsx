import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useTenant } from '../../../contexts/TenantContext';

// --- Types ---
export interface Tenant {
  id: string;
  name: string;
  subdomain: string;
  status: 'Active' | 'Suspended' | 'Inactive';
}

export interface ApplicationScreen {
  id: string;
  tenant_id: string;
  screen_name: string;
  screen_route: string;
  screen_group: string | null;
  description: string | null;
  is_active: boolean;
}

export default function SuperAdminScreenManager() {
  const { user, loading: authLoading } = useAuth();
  const { currentTenant } = useTenant();
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>('');
  
  const [screens, setScreens] = useState<ApplicationScreen[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  
  const [loading, setLoading] = useState<{ tenants: boolean; screens: boolean }>({
    tenants: true,
    screens: false,
  });

  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10;

  useEffect(() => {
    const checkRole = async () => {
      if (!user) {
        setIsAuthorized(false);
        return;
      }

      const { data, error } = await supabase
        .from('tenant_users')
        .select('role')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error checking authorization:', error);
        setIsAuthorized(false);
      } else if (data && (data.role === 'manager')) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    };

    if (!authLoading) {
      checkRole();
    }
  }, [user, authLoading]);

  useEffect(() => {
    if (isAuthorized !== true) return;

    const fetchAllTenants = async () => {
      setLoading(prev => ({ ...prev, tenants: true }));
      let query = supabase
        .from('tenants')
        .select('id, name, subdomain, status')
        .order('name', { ascending: true });

      if (currentTenant?.id) {
        query = query.neq('id', currentTenant.id);
      }

      const { data, error } = await query;

      if (error) console.error('Error fetching tenants:', error);
      else setTenants((data as Tenant[]) || []);
      
      setLoading(prev => ({ ...prev, tenants: false }));
    };

    fetchAllTenants();
  }, [isAuthorized, currentTenant?.id]);

  // 2. Fetch screens when a tenant is selected
  useEffect(() => {
    if (!selectedTenantId || isAuthorized !== true) return;

    const fetchTenantScreens = async () => {
      setLoading(prev => ({ ...prev, screens: true }));
      setCurrentPage(1); 
      setSelectedGroup(''); 
      
      const { data, error } = await supabase
        .from('application_screens')
        .select('*')
        .eq('tenant_id', selectedTenantId)
        .order('display_order', { ascending: true });

      if (error) console.error('Error fetching screens:', error);
      else setScreens((data as ApplicationScreen[]) || []);
      
      setLoading(prev => ({ ...prev, screens: false }));
    };

    fetchTenantScreens();
  }, [selectedTenantId, isAuthorized]);

  // 3. Extract unique groups and auto-select the first one
  const groups = useMemo(() => {
    const uniqueGroups = Array.from(new Set(screens.map(s => s.screen_group || 'General')));
    return uniqueGroups.sort();
  }, [screens]);

  useEffect(() => {
    if (groups.length > 0 && !groups.includes(selectedGroup)) {
      setSelectedGroup(groups[0]);
    }
  }, [groups, selectedGroup]);

  // 4. Toggle Global Screen Status
  const handleToggleScreen = async (screenId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;

    setScreens(prev => prev.map(s => s.id === screenId ? { ...s, is_active: newStatus } : s));

    const { error } = await supabase
      .from('application_screens')
      .update({ is_active: newStatus, updated_at: new Date().toISOString() })
      .eq('id', screenId)
      .eq('tenant_id', selectedTenantId);

    if (error) {
      console.error('Update failed:', error);
      setScreens(prev => prev.map(s => s.id === screenId ? { ...s, is_active: currentStatus } : s));
    }
  };

  // --- Filtering & Pagination Logic ---
  const filteredScreens = useMemo(() => {
    return screens.filter(s => (s.screen_group || 'General') === selectedGroup);
  }, [screens, selectedGroup]);

  const totalPages = Math.ceil(filteredScreens.length / itemsPerPage);
  
  const currentScreens = filteredScreens.slice(
    (currentPage - 1) * itemsPerPage, 
    currentPage * itemsPerPage
  );

  // --- Render Authorization States ---
  if (authLoading || isAuthorized === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-gray-500 animate-pulse">Verifying access permissions...</div>
      </div>
    );
  }

  if (isAuthorized === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-sm border border-red-100 text-center">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
          <p className="text-gray-600">
            You do not have the required permissions to view this page. This area is restricted to Managers and Administrators only.
          </p>
        </div>
      </div>
    );
  }

  // --- Main Render (Authorized Users Only) ---
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <header className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Global Tenant Management</h1>
          <p className="text-gray-600">Control application access across all organizations.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sidebar: Tenant List */}
          <div className="lg:col-span-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[700px]">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <span className="text-sm font-semibold text-gray-700">All Tenants</span>
            </div>
            <ul className="divide-y divide-gray-100 overflow-y-auto flex-1">
              {loading.tenants ? (
                <li className="p-4 text-center text-gray-400 text-sm">Loading organizations...</li>
              ) : tenants.map((tenant) => (
                <li 
                  key={tenant.id}
                  onClick={() => setSelectedTenantId(tenant.id)}
                  className={`p-4 cursor-pointer transition-colors hover:bg-indigo-50 ${
                    selectedTenantId === tenant.id ? 'bg-indigo-50 border-l-4 border-indigo-600' : 'border-l-4 border-transparent'
                  }`}
                >
                  <div className="font-medium text-gray-900 break-words">{tenant.name}</div>
                  <div className="text-xs text-gray-500 break-words">{tenant.subdomain}</div>
                </li>
              ))}
            </ul>
          </div>

          {/* Main Content: Screen Controls */}
          <div className="lg:col-span-3">
            {!selectedTenantId ? (
              <div className="h-[700px] flex flex-col items-center justify-center bg-white border-2 border-dashed border-gray-300 rounded-xl text-gray-400 p-6 text-center">
                <p>Select a tenant from the left to manage screens</p>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[700px]">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center bg-white flex-wrap gap-2">
                  <h3 className="font-bold text-gray-800 break-words">
                    Active Screens: {tenants.find(t => t.id === selectedTenantId)?.name}
                  </h3>
                  {loading.screens && <span className="text-xs text-indigo-600 animate-pulse">Refreshing...</span>}
                </div>

                {/* Navbar / Tabs for Screen Groups */}
                <div className="px-6 py-2 border-b border-gray-200 bg-gray-50 flex flex-wrap gap-x-6 gap-y-2">
                  {groups.length === 0 && !loading.screens ? (
                    <div className="py-2 text-sm text-gray-400">No categories found.</div>
                  ) : (
                    groups.map((group) => (
                      <button
                        key={group}
                        onClick={() => {
                          setSelectedGroup(group);
                          setCurrentPage(1); 
                        }}
                        className={`py-2 border-b-2 font-medium text-sm transition-colors ${
                          selectedGroup === group 
                            ? 'border-indigo-600 text-indigo-600' 
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                      >
                        {group}
                      </button>
                    ))
                  )}
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200 table-fixed">
                    <thead className="bg-white sticky top-0 z-10 shadow-sm">
                      <tr>
                        <th className="w-1/3 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-white">Screen Name</th>
                        <th className="w-1/2 px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase bg-white">Route</th>
                        <th className="w-1/6 px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase bg-white">Access</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {currentScreens.length === 0 && !loading.screens ? (
                        <tr><td colSpan={3} className="px-6 py-10 text-center text-gray-400">No screens found in this category.</td></tr>
                      ) : currentScreens.map((screen) => (
                        <tr key={screen.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-900 break-words">{screen.screen_name}</div>
                            {screen.description && (
                              <div className="text-xs text-gray-500 mt-1 break-words">{screen.description}</div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600 border border-gray-200 break-all inline-block">
                              {screen.screen_route}
                            </code>
                          </td>
                          <td className="px-6 py-4 text-right align-middle">
                            <button
                              onClick={() => handleToggleScreen(screen.id, screen.is_active)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                                screen.is_active ? 'bg-indigo-600' : 'bg-gray-200'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out ${
                                screen.is_active ? 'translate-x-6' : 'translate-x-1'
                              }`} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="px-6 py-3 border-t border-gray-200 flex flex-wrap gap-4 items-center justify-between bg-white">
                    <div className="text-sm text-gray-500">
                      Showing <span className="font-medium">{filteredScreens.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredScreens.length)}</span> of <span className="font-medium">{filteredScreens.length}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-gray-300 bg-white rounded text-sm text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        Prev
                      </button>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-gray-300 bg-white rounded text-sm text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}