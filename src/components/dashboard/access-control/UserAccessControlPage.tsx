import React, { useEffect, useState } from 'react';
import { Shield, User, Lock, Unlock, Search, RefreshCw } from 'lucide-react';
import { useUserAccessControlStore } from '../../../stores/userAccessControlStore';
import { supabase } from '../../../lib/supabase'; // Make sure this path matches your project structure
import toast from 'react-hot-toast';

export default function UserAccessControlPage() {
  const {
    users,
    usersLoading,
    selectedUser,
    fetchUsersWithPermissions,
    selectUser,
    updateUserScreenPermission,
  } = useUserAccessControlStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [updating, setUpdating] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Fetch the current logged-in user to exclude them from the list
  useEffect(() => {
    const fetchCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setCurrentUserId(user.id);
      }
    };
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    fetchUsersWithPermissions();
  }, [fetchUsersWithPermissions]);

  const handleUserSelect = (userId: string) => {
    selectUser(userId);
  };

  const handlePermissionToggle = async (screenId: string, currentStatus: boolean) => {
    if (!selectedUser) return;

    setUpdating(true);
    try {
      await updateUserScreenPermission(selectedUser.user_id, screenId, !currentStatus);
      toast.success('Permission updated successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update permission');
    } finally {
      setUpdating(false);
    }
  };

  const handleRefresh = () => {
    fetchUsersWithPermissions();
    toast.success('User list refreshed');
  };

  // Filter users based on search query AND exclude the currently logged-in user
  const filteredUsers = users.filter(user =>
    user.user_id !== currentUserId && 
    (user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role_name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Group screens by screen_group
  const groupedScreens = selectedUser?.screens.reduce((acc, screen) => {
    const group = screen.screen_group || 'Other';
    if (!acc[group]) {
      acc[group] = [];
    }
    acc[group].push(screen);
    return acc;
  }, {} as Record<string, typeof selectedUser.screens>);

  // Get unique groups for filter
  const screenGroups = selectedUser
    ? Array.from(new Set(selectedUser.screens.map(s => s.screen_group || 'Other')))
    : [];

  // Filter screens by group
  const filteredScreens = selectedUser
    ? filterGroup === 'all'
      ? selectedUser.screens
      : selectedUser.screens.filter(s => (s.screen_group || 'Other') === filterGroup)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Shield className="h-6 w-6 text-indigo-600" />
            Screen Access Control
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage screen access permissions for HR Team and Employee users
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={usersLoading}
          className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${usersLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Selection Panel */}
        <div className="lg:col-span-1">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Select User</h2>
              <p className="mt-1 text-sm text-gray-500">
                Admin users and your own profile are excluded from this list
              </p>
            </div>

            {/* Search Bar */}
            <div className="px-4 py-3 border-b border-gray-200">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>
            </div>

            {/* User List */}
            <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
              {usersLoading ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                  Loading users...
                </div>
              ) : filteredUsers.length === 0 ? (
                <div className="px-4 py-8 text-center text-gray-500">
                  No users found
                </div>
              ) : (
                filteredUsers.map((user) => (
                  <button
                    key={user.user_id}
                    onClick={() => handleUserSelect(user.user_id)}
                    className={`w-full px-4 py-4 hover:bg-gray-50 transition-colors text-left ${
                      selectedUser?.user_id === user.user_id ? 'bg-indigo-50 border-l-4 border-indigo-600' : ''
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="flex-shrink-0">
                        <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center">
                          <User className="h-6 w-6 text-indigo-600" />
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {user.name}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{user.email}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            {user.role_name}
                          </span>
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Screen Permissions Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg">
            <div className="px-4 py-5 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Screen Access Permissions</h2>
              {selectedUser ? (
                <p className="mt-1 text-sm text-gray-500">
                  Managing permissions for <strong>{selectedUser.name}</strong> ({selectedUser.role_name})
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">
                  Select a user to manage their screen access permissions
                </p>
              )}
            </div>

            {selectedUser ? (
              <>
                {/* Group Filter */}
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setFilterGroup('all')}
                      className={`px-3 py-1 text-sm font-medium rounded-md ${
                        filterGroup === 'all'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      All Screens
                    </button>
                    {screenGroups.map((group) => (
                      <button
                        key={group}
                        onClick={() => setFilterGroup(group)}
                        className={`px-3 py-1 text-sm font-medium rounded-md ${
                          filterGroup === group
                            ? 'bg-indigo-600 text-white'
                            : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {group}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Screens List */}
                <div className="divide-y divide-gray-200 max-h-[550px] overflow-y-auto">
                  {filterGroup === 'all' ? (
                    // Show grouped view
                    Object.entries(groupedScreens || {}).map(([group, screens]) => (
                      <div key={group} className="px-4 py-3">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-indigo-600"></span>
                          {group}
                        </h3>
                        <div className="space-y-2 ml-3">
                          {screens.map((screen) => (
                            <div
                              key={screen.screen_id}
                              className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                              <div className="flex-1">
                                <p className="text-sm font-medium text-gray-900">
                                  {screen.screen_name}
                                </p>
                                <p className="text-xs text-gray-500">{screen.screen_route}</p>
                              </div>
                              <button
                                onClick={() => handlePermissionToggle(screen.screen_id, screen.is_enabled)}
                                disabled={updating}
                                className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                                  screen.is_enabled ? 'bg-indigo-600' : 'bg-gray-200'
                                } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                <span
                                  className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
                                    screen.is_enabled ? 'translate-x-5' : 'translate-x-0'
                                  }`}
                                />
                              </button>
                              <div className="ml-3 flex items-center">
                                {screen.is_enabled ? (
                                  <Unlock className="h-5 w-5 text-green-500" />
                                ) : (
                                  <Lock className="h-5 w-5 text-red-500" />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  ) : (
                    // Show filtered list
                    <div className="divide-y divide-gray-200">
                      {filteredScreens.map((screen) => (
                        <div
                          key={screen.screen_id}
                          className="flex items-center justify-between px-4 py-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">
                              {screen.screen_name}
                            </p>
                            <p className="text-xs text-gray-500">{screen.screen_route}</p>
                          </div>
                          <button
                            onClick={() => handlePermissionToggle(screen.screen_id, screen.is_enabled)}
                            disabled={updating}
                            className={`relative inline-flex flex-shrink-0 h-6 w-11 border-2 border-transparent rounded-full cursor-pointer transition-colors ease-in-out duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                              screen.is_enabled ? 'bg-indigo-600' : 'bg-gray-200'
                            } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span
                              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transform ring-0 transition ease-in-out duration-200 ${
                                screen.is_enabled ? 'translate-x-5' : 'translate-x-0'
                              }`}
                            />
                          </button>
                          <div className="ml-3 flex items-center">
                            {screen.is_enabled ? (
                              <Unlock className="h-5 w-5 text-green-500" />
                            ) : (
                              <Lock className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Summary */}
                <div className="px-4 py-4 bg-gray-50 border-t border-gray-200">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Screens:</span>
                    <span className="font-medium text-gray-900">{selectedUser.screens.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-600">Enabled:</span>
                    <span className="font-medium text-green-600">
                      {selectedUser.screens.filter(s => s.is_enabled).length}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-600">Disabled:</span>
                    <span className="font-medium text-red-600">
                      {selectedUser.screens.filter(s => !s.is_enabled).length}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="px-4 py-16 text-center text-gray-500">
                <Shield className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">No User Selected</p>
                <p className="text-sm">
                  Select a user from the list to view and manage their screen access permissions
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Info Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <Shield className="h-5 w-5 text-blue-400" />
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">Permission System Information</h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-disc list-inside space-y-1">
                <li>Admin users automatically have access to all screens</li>
                <li>HR Team and Employee users can have their permissions customized here</li>
                <li>By default, all screens are enabled for non-admin users</li>
                <li>Disabled screens will not appear in the user's navigation menu</li>
                <li>Changes take effect immediately upon the user's next login or page refresh</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
