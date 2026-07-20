import React, { useState, useEffect } from 'react';
import { Building2, Users, Save, AlertCircle } from 'lucide-react';
import { useTenant } from '../../../contexts/TenantContext';
import { updateTenant, getTenantUsers } from '../../../lib/tenants';

export default function TenantSettings() {
  const { currentTenant, refreshTenants } = useTenant();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [tenantUsers, setTenantUsers] = useState<any[]>([]);

  const [formData, setFormData] = useState({
    name: '',
    subdomain: '',
    status: 'Active' as 'Active' | 'Suspended' | 'Inactive',
  });

  useEffect(() => {
    if (currentTenant) {
      setFormData({
        name: currentTenant.name,
        subdomain: currentTenant.subdomain,
        status: currentTenant.status,
      });
      loadTenantUsers();
    }
  }, [currentTenant]);

  const loadTenantUsers = async () => {
    if (!currentTenant) return;

    try {
      const users = await getTenantUsers(currentTenant.id);
      setTenantUsers(users);
    } catch (err) {
      console.error('Failed to load tenant users:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentTenant) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await updateTenant(currentTenant.id, {
        name: formData.name,
        status: formData.status,
      });

      await refreshTenants();
      setSuccess(true);

      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update organization settings');
    } finally {
      setLoading(false);
    }
  };

  if (!currentTenant) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading organization settings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Organization Settings</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your organization details and preferences
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="flex">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error</h3>
              <div className="mt-2 text-sm text-red-700">{error}</div>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="rounded-md bg-green-50 p-4">
          <div className="flex">
            <div className="ml-3">
              <p className="text-sm font-medium text-green-800">
                Settings updated successfully!
              </p>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 bg-white shadow px-4 py-5 sm:rounded-lg sm:p-6">
        <div className="md:grid md:grid-cols-3 md:gap-6">
          <div className="md:col-span-1">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Organization Details
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Basic information about your organization
            </p>
          </div>

          <div className="mt-5 md:mt-0 md:col-span-2">
            <div className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                  Organization Name
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  required
                />
              </div>

              <div>
                <label htmlFor="subdomain" className="block text-sm font-medium text-gray-700">
                  Subdomain
                </label>
                <input
                  type="text"
                  id="subdomain"
                  value={formData.subdomain}
                  disabled
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 bg-gray-50 text-gray-500 sm:text-sm"
                />
                <p className="mt-2 text-sm text-gray-500">
                  Subdomain cannot be changed after creation
                </p>
              </div>

              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                  Status
                </label>
                <select
                  id="status"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as 'Active' | 'Suspended' | 'Inactive',
                    })
                  }
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                >
                  <option value="Active">Active</option>
                  <option value="Suspended">Suspended</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="md:grid md:grid-cols-3 md:gap-6">
          <div className="md:col-span-1">
            <h3 className="text-lg font-medium leading-6 text-gray-900">
              Organization Users
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Users who have access to this organization
            </p>
          </div>

          <div className="mt-5 md:mt-0 md:col-span-2">
            <div className="bg-gray-50 rounded-md p-4">
              <div className="space-y-3">
                {tenantUsers.map((tenantUser) => (
                  <div
                    key={tenantUser.id}
                    className="flex items-center justify-between bg-white px-4 py-3 rounded-md"
                  >
                    <div className="flex items-center space-x-3">
                      <Users className="h-5 w-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">User</p>
                        <p className="text-xs text-gray-500 capitalize">
                          {tenantUser.role.replace('_', ' ')}
                        </p>
                      </div>
                    </div>
                    {tenantUser.is_primary && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
                {tenantUsers.length === 0 && (
                  <p className="text-sm text-gray-500 text-center py-4">
                    No users found
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
