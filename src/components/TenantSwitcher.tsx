import React, { useState } from 'react';
import { Building2, Check, ChevronDown } from 'lucide-react';
import { useTenant } from '../contexts/TenantContext';

export default function TenantSwitcher() {
  const { currentTenant, userTenants, switchTenant, loading } = useTenant();
  const [isOpen, setIsOpen] = useState(false);

  if (!currentTenant || userTenants.length <= 1) {
    return null;
  }

  const handleTenantSwitch = async (tenantId: string) => {
    if (tenantId === currentTenant.id) {
      setIsOpen(false);
      return;
    }

    try {
      await switchTenant(tenantId);
      setIsOpen(false);
    } catch (error) {
      console.error('Failed to switch tenant:', error);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={loading}
        className="flex items-center space-x-2 px-3 py-2 text-sm rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <Building2 className="h-5 w-5 text-gray-600" />
        <span className="font-medium text-gray-700">{currentTenant.name}</span>
        <ChevronDown className="h-4 w-4 text-gray-500" />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-20">
            <div className="py-1" role="menu">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase">
                Switch Organization
              </div>
              {userTenants.map((tenantUser) => (
                <button
                  key={tenantUser.tenant_id}
                  onClick={() => handleTenantSwitch(tenantUser.tenant_id)}
                  className="w-full flex items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 focus:outline-none"
                  role="menuitem"
                >
                  <div className="flex items-center space-x-3">
                    <Building2 className="h-4 w-4 text-gray-400" />
                    <div className="text-left">
                      <div className="font-medium">
                        {tenantUser.tenant?.name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {tenantUser.role.replace('_', ' ')}
                      </div>
                    </div>
                  </div>
                  {currentTenant.id === tenantUser.tenant_id && (
                    <Check className="h-4 w-4 text-blue-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
