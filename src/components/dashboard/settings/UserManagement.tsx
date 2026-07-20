import { useState, useEffect } from 'react';
import { Users, Shield, AlertCircle, Search, RefreshCw } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { validateAuth } from '../../../stores/utils/storeUtils';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { restrictedEmployeeRoutes } from '../../../stores/userAccessControlStore';

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  user_role: string;
  created_at: string;
  tenant_id: string;
}

export default function UserManagementPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [employeeEmails, setEmployeeEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    const checkRoleAndFetch = async () => {
      if (!user) return;
      
      try {
        setLoading(true);
        // 1. Fetch current user's role independently
        const { data: profile, error: roleError } = await supabase
          .from('profiles')
          .select('user_role')
          .eq('id', user.id)
          .single();

        if (roleError) throw roleError;


        // 2. If Admin/HR/Reporting Head, fetch all users
        if (profile.user_role === 'Admin' || profile.user_role === 'HR Team' || profile.user_role === 'Reporting Head') {
          await fetchUsers();
        } else {
          setError('Unauthorized access');
        }
      } catch (err) {
        console.error('Initial load error:', err);
        setError('Failed to verify permissions');
      } finally {
        setLoading(false);
      }
    };

    checkRoleAndFetch();
  }, [user]);

  const fetchUsers = async () => {
    try {
      setLoading(true);

      const auth = await validateAuth();
      if (!auth.isAuthenticated || !auth.tenantId) {
        alert("Authentication or Tenant ID missing");
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, full_name, user_role, created_at, tenant_id')
        .eq('tenant_id', auth.tenantId)
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Also fetch employee emails
      const { data: employees, error: employeesError } = await supabase
        .from('employees')
        .select('email')
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'Active');

      if (employeesError) {
        console.error('Failed to load employee emails:', employeesError);
      } else {
        const emails = new Set((employees || []).map(emp => emp.email.toLowerCase()));
        setEmployeeEmails(emails);
      }

      setUsers(profiles || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

const handleRoleChange = async (userId: string, newRole: string) => {
    if (userId === user?.id) {
      toast.error('You cannot change your own role');
      return;
    }

    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return;



    // --- Ensure at least one Admin remains ---
    if (targetUser.user_role === 'Admin' && newRole !== 'Admin') {
      const adminCount = users.filter(u => u.user_role === 'Admin').length;

      if (adminCount <= 1) {
        toast.error('At least one Admin must exist in the system.');
        return;
      }
    }

    // --- NEW: Prevent role change to Employee/Reporting Head if not in employees table ---
    if (newRole === 'Employee' || newRole === 'Reporting Head') {
      if (!employeeEmails.has(targetUser.email.toLowerCase())) {
        toast.error(`This user is not mapped in the employees table and cannot have the ${newRole} role.`);
        return;
      }
    }

    // --- Block role change from Reporting Head if they have active subordinates ---
    // ONLY blocks when changing to a non-HR/non-Admin role (e.g. Employee).
    // Changing to HR Team or Admin is ALWAYS allowed — is_reporting_head will be
    // automatically disabled by the employee update that runs below.
    const isHROrAdmin = newRole.toLowerCase().includes('hr') || newRole.toLowerCase().includes('admin');

    if (targetUser.user_role === 'Reporting Head' && newRole !== 'Reporting Head' && !isHROrAdmin) {
      try {
        setUpdatingUserId(userId);

        // Find the employee record for this user
        const { data: employeeData, error: empFetchError } = await supabase
          .from('employees')
          .select('id, name, email, is_reporting_head')
          .ilike('email', targetUser.email)
          .eq('tenant_id', targetUser.tenant_id)
          .eq('status', 'Active')
          .maybeSingle();

        if (!empFetchError && employeeData) {
          const { data: subordinatesData } = await supabase
            .from('employees')
            .select('id, name, reporting_to')
            .eq('status', 'Active');

          const activeSubordinates = (subordinatesData || []).filter(e => {
            if (e.id === employeeData.id) return false;
            if (!e.reporting_to) return false;
            if (Array.isArray(e.reporting_to)) {
              return e.reporting_to.includes(employeeData.id);
            }
            if (typeof e.reporting_to === 'string') {
              try {
                const parsed = JSON.parse(e.reporting_to);
                if (Array.isArray(parsed)) return parsed.includes(employeeData.id);
              } catch {}
              return e.reporting_to.split(',').map((s: string) => s.trim()).includes(employeeData.id);
            }
            return false;
          });

          if (activeSubordinates.length > 0) {
            // Has subordinates — block and instruct to reassign first
            const names = activeSubordinates.map(sub => `"${sub.name}"`).join(', ');
            toast.error(
              `Cannot change role. "${employeeData.name}" still has ${activeSubordinates.length} employee(s) reporting to them: ${names}. Please reassign them to another manager first, then change the role.`
            );
            setUpdatingUserId(null);
            return;
          }
          // No subordinates — fall through and allow the role change
        }
      } catch (err: any) {
        console.error('Failed to check subordinates before role change:', err);
      } finally {
        setUpdatingUserId(null);
      }
    }

    try {
      setUpdatingUserId(userId);

      // Check if employee records exist and synchronize status/role
      const { data: matchingEmployees } = await supabase
        .from('employees')
        .select('id, role_id')
        .ilike('email', targetUser.email)
        .eq('tenant_id', targetUser.tenant_id)
        .eq('status', 'Active');

      if (matchingEmployees && matchingEmployees.length > 0) {
        const updates: any = {
          is_reporting_head: newRole === 'Reporting Head'
        };

        // Find the role record in the roles table for this tenant
        const { data: roleRecord } = await supabase
          .from('roles')
          .select('id')
          .eq('name', newRole)
          .eq('tenant_id', targetUser.tenant_id)
          .maybeSingle();

        if (roleRecord) {
          updates.role_id = roleRecord.id;
        }

        // Loop and update all matching employee records to keep everything in sync!
        for (const empRecord of matchingEmployees) {
          const { error: empUpdateError } = await supabase
            .from('employees')
            .update(updates)
            .eq('id', empRecord.id);

          if (empUpdateError) throw empUpdateError;
        }
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          user_role: newRole,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // --- NEW: Reset screen permissions on role change ---
      // This allows the user to revert to the default permissions for their new role.
      const { error: permResetError } = await supabase
        .from('user_screen_permissions')
        .delete()
        .eq('user_id', userId);

      if (permResetError) {
        console.error('Failed to reset user permissions:', permResetError);
        // We don't throw here to avoid failing the whole role change if just permission reset fails
      } else {
        // If changed to Employee, explicitly write disabled records for all restrictedEmployeeRoutes in the DB to block them completely
        if (newRole === 'Employee') {
          const auth = await validateAuth();
          const { data: restrictedScreens } = await supabase
            .from('application_screens')
            .select('id')
            .eq('tenant_id', targetUser.tenant_id)
            .in('screen_route', restrictedEmployeeRoutes);

          if (restrictedScreens && restrictedScreens.length > 0) {
            const permInserts = restrictedScreens.map(scr => ({
              tenant_id: targetUser.tenant_id,
              user_id: userId,
              screen_id: scr.id,
              is_enabled: false,
              created_by: auth.userId || null
            }));

            await supabase
              .from('user_screen_permissions')
              .insert(permInserts);
          }
        }
      }
      // ----------------------------------------------------

      // Refresh employees store in background
      useEmployeesStore.getState().fetchEmployees().catch(err => console.error(err));

      setUsers(prev => prev.map(u => u.id === userId ? { ...u, user_role: newRole } : u));
      toast.success(`Role updated to ${newRole}`);
    } catch (err: any) {
      toast.error(err.message || 'Update failed');
    } finally {
      setUpdatingUserId(null);
    }
  };

  const filteredUsers = users.filter(u => 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.full_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading && !users.length) {
    return (
 <div className="flex min-h-screen items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error === 'Unauthorized access') {
    return (
      <div className="p-8 text-center bg-white rounded-lg shadow">
        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-600">You do not have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 bg-white rounded-lg shadow">
      {/* Header */}
      <div className="md:flex md:items-center md:justify-between mb-8">
        <div className="flex-1 min-w-0">
          <h2 className=" font-bold leading-7 text-gray-900 text-lg sm:truncate flex items-center">
            <Users className="mr-3 h-5 w-5 text-indigo-600" />
            User Management
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Control system access, modify roles, and manage employee accounts.
          </p>
        </div>
        <div className="mt-4 flex md:mt-0 md:ml-4 space-x-3">
          <button
            onClick={fetchUsers}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats & Tools */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 mb-8">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-2">
            <div className="flex items-center">
              <div className="flex-shrink-0 bg-indigo-100 p-3 rounded-md">
                <Users className="h-5 w-5 text-indigo-600" />
              </div>
              <div className="ml-5">
                <p className="text-sm font-medium text-gray-500 truncate">Total Users</p>
                <p className="text-lg font-semibold text-gray-900">{users.length}</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Search Bar */}
        <div className="sm:col-span-2 ">
          <div className="relative rounded-md shadow-sm">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              className="focus:ring-indigo-500 focus:border-indigo-500 block w-full pl-10 sm:text-sm border rounded-md py-2.5"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white shadow overflow-hidden border-b border-gray-200 sm:rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Join Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredUsers.map((u) => (
              <tr key={u.id} className={u.id === user?.id ? 'bg-indigo-50/50' : ''}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="h-10 w-10 flex-shrink-0 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-indigo-700 font-bold">{(u.full_name || u.email).charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{u.full_name || 'No Name'}</div>
                      <div className="text-sm text-gray-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    u.user_role === 'Admin' ? 'bg-purple-100 text-purple-800' : 
                    u.user_role === 'HR Team' ? 'bg-blue-100 text-blue-800' : 
                    u.user_role === 'Reporting Head' ? 'bg-indigo-100 text-indigo-800' : 
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {u.user_role}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
            {/* Find this section inside your table rows mapping */}
  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
    <div className="flex justify-end items-center space-x-2">
      <select
        value={u.user_role}
        onChange={(e) => handleRoleChange(u.id, e.target.value)}
        disabled={
          u.id === user?.id || 
          updatingUserId === u.id
        }
        className="text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option 
          value="Employee" 
          disabled={!employeeEmails.has(u.email.toLowerCase())}
          title={!employeeEmails.has(u.email.toLowerCase()) ? "User not found in active employees list" : ""}
        >
          Employee
        </option>
        <option 
          value="Reporting Head" 
          disabled={!employeeEmails.has(u.email.toLowerCase())}
          title={!employeeEmails.has(u.email.toLowerCase()) ? "User not found in active employees list" : ""}
        >
          Reporting Head
        </option>
        <option value="HR Team">HR Team</option>
        <option value="Admin">
          Admin
        </option>
      </select>
      {updatingUserId === u.id && <RefreshCw className="h-4 w-4 animate-spin text-indigo-600" />}
    </div>
  </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500">No users found matching your search.</p>
          </div>
        )}
      </div>

      {/* Role Info Card */}
                <div className="mt-4 p-4 bg-blue-50 rounded-md">
            <div className="flex">
              <div className="flex-shrink-0">
                <Shield className="h-5 w-5 text-blue-400" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">About User Roles</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <ul className="list-disc list-inside space-y-1">
                    <li><strong>Admin:</strong> Full system access and user management capabilities</li>
                    <li><strong>HR Team:</strong> Access to HR functions, payroll, and user management</li>
                    <li><strong>Employee:</strong> Basic access to personal information. <span className="text-red-600 font-semibold">(Requires user to be in Employees table)</span></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
    </div>
  );
}