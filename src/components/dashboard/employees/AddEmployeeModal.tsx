import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useDepartmentsStore } from '../../../stores/departmentsStore';
import { useRolesStore } from '../../../stores/rolesStore';
import { useCadresStore } from '../../../stores/cadresStore';
import { useAuth } from '../../../contexts/AuthContext';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';

interface AddEmployeeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEmployeeAdded: () => void;
}

const initialFormData = {
  name: '',
  email: '',
  employee_code: '',
  department: '',
  cadre: '',
  role: '',
  start_date: '',
  status: 'Active' as const,
  address: '',
  date_of_birth: '',
  // --- NEW FIELDS ---
  father_name: '',
  uan_number: '',
  contact_number: '',
  is_reporting_head: false,
  reporting_to: [] as string[],
};

export default function AddEmployeeModal({
  isOpen,
  onClose,
  onEmployeeAdded,
}: AddEmployeeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isValidatingEmail, setIsValidatingEmail] = useState(false);
  const { user } = useAuth();
  const { currentTenant } = useTenant();

  const { createEmployee, items: employees } = useEmployeesStore();
  const { items: departments, fetchDepartments } = useDepartmentsStore();
  const { items: roles, fetchRoles } = useRolesStore();
  const { items: cadres, fetchCadres } = useCadresStore();

  const [formData, setFormData] = useState(initialFormData);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [managerRoleFilter, setManagerRoleFilter] = useState('All');
  const isHROrAdminSelected = (formData.role || '').toLowerCase().includes('hr') || (formData.role || '').toLowerCase().includes('admin');

  const getEmployeeRole = (emp: any) => {
    if (!emp) return 'Employee';
    const profile = profiles.find(p => p.email?.toLowerCase() === emp.email?.toLowerCase());
    if (profile?.user_role) return profile.user_role;
    if (emp.is_reporting_head === true) return 'Reporting Head';
    return emp.role || 'Employee';
  };

  useEffect(() => {
    if (isOpen) {
      fetchDepartments();
      fetchRoles();
      fetchCadres();
      setFormData(initialFormData);
      setError(null);
      setLoading(false);

      // Fetch user profiles for mapping roles
      const fetchProfiles = async () => {
        if (!currentTenant?.id) return;
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('tenant_id', currentTenant.id);
        if (!error && data) {
          setProfiles(data);

          // Find first profile whose role is Admin to pre-select it by default
          const adminProfile = data.find(p => (p.user_role || '').toLowerCase().includes('admin'));
          if (adminProfile) {
            const empRecord = employees.find(e => e.email?.toLowerCase() === adminProfile.email?.toLowerCase());
            const defaultId = empRecord ? empRecord.id : adminProfile.id;
            setFormData(prev => ({
              ...prev,
              reporting_to: [defaultId]
            }));
          }
        }
      };
      fetchProfiles();
    }
  }, [isOpen, fetchDepartments, fetchRoles, fetchCadres, currentTenant, employees]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!formData.reporting_to || formData.reporting_to.length === 0) {
      const msg = 'Please select at least one reporting to person (Admin/HR Team/Head).';
      setError(msg);
      toast.error(msg);
      setLoading(false);
      return;
    }

    try {
      const employeeData = {
        ...formData,
        // Only include optional fields if they have values to keep DB clean
        ...(formData.employee_code ? { employee_code: formData.employee_code } : {}),
        ...(formData.address ? { address: formData.address } : {}),
        ...(formData.date_of_birth ? { date_of_birth: formData.date_of_birth } : {}),
        // --- NEW FIELDS MAPPING ---
        ...(formData.father_name ? { father_name: formData.father_name } : {}),
        ...(formData.uan_number ? { uan_number: formData.uan_number } : {}),
        ...(formData.contact_number ? { contact_number: formData.contact_number } : {}),
        is_reporting_head: formData.is_reporting_head,
        reporting_to: formData.reporting_to.length > 0 ? formData.reporting_to : null,
        // Cadre (mandatory — pass always)
        cadre: formData.cadre,
      };

      // createEmployee resolves department_id/role_id/cadre_id from names internally
      await createEmployee(employeeData as any);
      onEmployeeAdded();
      onClose();

      // Reset form
      setFormData(initialFormData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add employee');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              type="button"
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
              onClick={onClose}
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Add New Employee
              </h3>
              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}
              <form onSubmit={handleSubmit} className="mt-6 space-y-6">

                {/* 1. Full Name */}
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {/* 2. Father Name (NEW) */}
                <div>
                  <label htmlFor="father_name" className="block text-sm font-medium text-gray-700">
                    Father's Name *
                  </label>
                  <input
                    type="text"
                    id="father_name"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.father_name}
                    onChange={(e) => setFormData({ ...formData, father_name: e.target.value })}
                    placeholder="Enter father's name"
                    required
                  />
                </div>

                {/* 3. Email */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    required
                    className={`mt-1 block w-full rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm ${isValidatingEmail ? 'border-yellow-300' : 'border-gray-300'
                      }`}
                    value={formData.email}
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      setError(null);
                    }}
                  />
                </div>

                {/* 4. Contact Number (NEW) */}
                <div>
                  <label htmlFor="contact_number" className="block text-sm font-medium text-gray-700">
                    Contact Number
                  </label>
                  <input
                    type="tel"
                    id="contact_number"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    placeholder="Enter phone number"
                  />
                </div>

                {/* 5. Employee Code */}
                <div>
                  <label htmlFor="employee_code" className="block text-sm font-medium text-gray-700">
                    Employee Code *
                  </label>
                  <input
                    type="text"
                    id="employee_code"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.employee_code}
                    onChange={(e) => setFormData({ ...formData, employee_code: e.target.value })}
                    placeholder="Enter employee code"
                  />
                </div>

                {/* 6. UAN Number (NEW) */}
                <div>
                  <label htmlFor="uan_number" className="block text-sm font-medium text-gray-700">
                    UAN Number
                  </label>
                  <input
                    type="text"
                    id="uan_number"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.uan_number}
                    onChange={(e) => setFormData({ ...formData, uan_number: e.target.value })}
                    placeholder="Enter UAN number"
                  />
                </div>

                {/* 7. Cadre */}
                <div>
                  <label htmlFor="cadre" className="block text-sm font-medium text-gray-700">
                    Cadre *
                  </label>
                  <select
                    id="cadre"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.cadre}
                    onChange={(e) => setFormData({ ...formData, cadre: e.target.value })}
                  >
                    <option value="">Select Cadre</option>
                    {cadres.map((cadre) => (
                      <option key={cadre.id} value={cadre.name}>
                        {cadre.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 7b. Department */}
                <div>
                  <label htmlFor="department" className="block text-sm font-medium text-gray-700">
                    Department *
                  </label>
                  <select
                    id="department"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  >
                    <option value="">Select Department</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 8. Role */}
                <div>
                  <label htmlFor="role" className="block text-sm font-medium text-gray-700">
                    Designation *
                  </label>
                  <select
                    id="role"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                    value={formData.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      const isHR = newRole.toLowerCase().includes('hr');
                      setFormData(prev => {
                        let nextReportingTo = prev.reporting_to;
                        let nextIsReportingHead = prev.is_reporting_head;

                        if (isHR) {
                          nextIsReportingHead = false;
                          nextReportingTo = prev.reporting_to.filter(id => {
                            const emp = employees.find(e => e.id === id);
                            const profile = profiles.find(p => p.id === id || p.email?.toLowerCase() === emp?.email?.toLowerCase());
                            const role = (profile?.user_role || emp?.role || '').toLowerCase();
                            return role.includes('admin');
                          });

                          if (nextReportingTo.length === 0) {
                            const adminProfile = profiles.find(p => (p.user_role || '').toLowerCase().includes('admin'));
                            if (adminProfile) {
                              const empRecord = employees.find(e => e.email?.toLowerCase() === adminProfile.email?.toLowerCase());
                              const defaultId = empRecord ? empRecord.id : adminProfile.id;
                              nextReportingTo = [defaultId];
                            }
                          }
                        }

                        return {
                          ...prev,
                          role: newRole,
                          is_reporting_head: nextIsReportingHead,
                          reporting_to: nextReportingTo
                        };
                      });
                    }}
                  >
                    <option value="">Select Role</option>
                    {roles.map((role) => (
                      <option key={role.id} value={role.name}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                {/* 8b. Reporting Head Checkbox */}
                <div className={`${isHROrAdminSelected ? 'hidden' : 'flex'} items-start bg-gray-50 p-3 rounded-md border border-gray-200`}>
                  <div className="flex items-center h-5">
                    <input
                      id="is_reporting_head"
                      type="checkbox"
                      disabled={isHROrAdminSelected}
                      className={`h-4 w-4 rounded ${isHROrAdminSelected ? 'border-gray-200 text-gray-300 cursor-not-allowed bg-gray-100' : 'focus:ring-indigo-500 text-indigo-600 border-gray-300 cursor-pointer'}`}
                      checked={isHROrAdminSelected ? false : formData.is_reporting_head}
                      onChange={(e) => {
                        if (isHROrAdminSelected) return;
                        const checked = e.target.checked;
                        setFormData(prev => {
                          let nextReportingTo = prev.reporting_to;
                          if (checked) {
                            nextReportingTo = prev.reporting_to.filter(id => {
                              const emp = employees.find(e => e.id === id);
                              const profile = profiles.find(p => p.id === id || p.email?.toLowerCase() === emp?.email?.toLowerCase());
                              const role = (profile?.user_role || emp?.role || '').toLowerCase();
                              return role.includes('admin') || role.includes('hr');
                            });

                            // Auto change/fallback to primary Admin if reporting_to becomes empty!
                            if (nextReportingTo.length === 0) {
                              const adminProfile = profiles.find(p => (p.user_role || '').toLowerCase().includes('admin'));
                              if (adminProfile) {
                                const empRecord = employees.find(e => e.email?.toLowerCase() === adminProfile.email?.toLowerCase());
                                const defaultId = empRecord ? empRecord.id : adminProfile.id;
                                nextReportingTo = [defaultId];
                              }
                            }
                          }
                          return {
                            ...prev,
                            is_reporting_head: checked,
                            reporting_to: nextReportingTo
                          };
                        });
                      }}
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label htmlFor="is_reporting_head" className={`font-medium ${isHROrAdminSelected ? 'text-gray-400 cursor-not-allowed' : 'text-gray-900 cursor-pointer'}`}>
                      Reporting Head
                    </label>
                    <p className={`${isHROrAdminSelected ? 'text-gray-300' : 'text-gray-500'}`}>
                      {isHROrAdminSelected ? 'This option is disabled for HR Team and Admin roles.' : 'Enable this option to allow this employee to act as a Reporting Head for other employees.'}
                    </p>
                  </div>
                </div>

                {/* 8c. Reporting To Selection Checklist */}
                {(() => {

                  const getEligibleReportingHeads = () => {
                    const list: any[] = [];
                    const addedEmails = new Set<string>();

                    // 1. Allow standard employees with is_reporting_head === true (ONLY IF current employee is NOT reporting head AND NOT HR/Admin!)
                    if (!formData.is_reporting_head && !isHROrAdminSelected) {
                      employees.forEach(emp => {
                        // Only include if they exist in User Management (profiles table)
                        const hasProfile = profiles.some(p => p.email?.toLowerCase() === emp.email?.toLowerCase());
                        if (!hasProfile) return;

                        const role = getEmployeeRole(emp);
                        const roleLower = role.toLowerCase();
                        if (roleLower === 'employee') return; // Exclude standard Employee role

                        const isHeadRole = roleLower.includes('admin') || roleLower.includes('hr') || roleLower.includes('reporting');
                        if (isHeadRole) {
                          const status = (emp.status || '').toLowerCase();
                          const isValidStatus = status === 'active' || status === 'rejoin';

                          if (roleLower.includes('admin') || roleLower.includes('hr') || isValidStatus) {
                            list.push({
                              id: emp.id,
                              name: emp.name,
                              email: emp.email,
                              role: role
                            });
                            if (emp.email) {
                              addedEmails.add(emp.email.toLowerCase());
                            }
                          }
                        }
                      });
                    }

                    // 2. Add profiles (If HR selected, only add Admins. Otherwise add Admin, HR, and Reporting Head)
                    profiles.forEach(profile => {
                      const role = profile.user_role || '';
                      const roleLower = role.toLowerCase();
                      if (roleLower === 'employee') return; // Exclude standard Employee role

                      const isAllowedRole = isHROrAdminSelected
                        ? roleLower.includes('admin')
                        : formData.is_reporting_head
                          ? (roleLower.includes('admin') || roleLower.includes('hr'))
                          : (roleLower.includes('admin') || roleLower.includes('hr') || roleLower.includes('reporting'));
                      if (!isAllowedRole) return;

                      const emailLower = (profile.email || '').toLowerCase();
                      if (emailLower && addedEmails.has(emailLower)) return;

                      const empRecord = employees.find(e => e.email?.toLowerCase() === emailLower);
                      list.push({
                        id: empRecord ? empRecord.id : profile.id,
                        name: profile.full_name || empRecord?.name || profile.email?.split('@')[0] || 'No Name',
                        email: profile.email,
                        role: role
                      });

                      if (emailLower) {
                        addedEmails.add(emailLower);
                      }
                    });

                    return list;
                  };

                  const eligibleHeads = getEligibleReportingHeads().filter(head => {
                    if (isHROrAdminSelected) return true;
                    if (managerRoleFilter === 'All') return true;
                    if (managerRoleFilter === 'Admin') return (head.role || '').toLowerCase().includes('admin');
                    if (managerRoleFilter === 'HR Team') return (head.role || '').toLowerCase().includes('hr');
                    if (managerRoleFilter === 'Reporting Head') return head.role === 'Reporting Head';
                    return true;
                  });

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-sm font-semibold text-gray-700">
                          Reporting To (Admin/HR Team/Head)
                        </label>
                        {!isHROrAdminSelected && (
                          <select
                            value={managerRoleFilter}
                            onChange={(e) => setManagerRoleFilter(e.target.value)}
                            className="text-[10px] font-bold border border-gray-200 rounded px-1.5 py-0.5 bg-gray-50 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-gray-600 cursor-pointer"
                          >
                            <option value="All">All Roles</option>
                            <option value="Admin">Admin</option>
                            <option value="HR Team">HR Team</option>
                            <option value="Reporting Head">Reporting Head</option>
                          </select>
                        )}
                      </div>
                      <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto space-y-2 bg-white shadow-inner">
                        {eligibleHeads.length === 0 ? (
                          <div className="text-xs text-gray-400 italic">No eligible managers found for role filter.</div>
                        ) : (
                          eligibleHeads.map((head) => {
                            const isChecked = formData.reporting_to.includes(head.id);
                            return (
                              <label key={head.id} className="flex items-center gap-2.5 text-xs text-gray-700 hover:bg-gray-50 p-1.5 rounded-md cursor-pointer transition-colors">
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4 cursor-pointer"
                                  checked={isChecked}
                                  onChange={() => {
                                    if (isChecked && formData.reporting_to.length <= 1) {
                                      const msg = 'An employee must have at least one reporting manager. To change their manager, please select a new manager first, and then deselect the old one.';
                                      setError(msg);
                                      toast.error(msg);
                                      return;
                                    }
                                    setError(null);
                                    setFormData(prev => ({
                                      ...prev,
                                      reporting_to: isChecked
                                        ? prev.reporting_to.filter(id => id !== head.id)
                                        : [...prev.reporting_to, head.id]
                                    }));
                                  }}
                                />
                                <div className="flex w-full justify-between">
                                  <div className="flex flex-col">
                                    <span className="font-bold text-gray-900">{head.name}</span>
                                    <span className="text-[10px] text-gray-400 font-medium">{head.email || 'No Email'}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-0.5">
                                    {(() => {
                                      const role = head.role || 'Employee';
                                      if (role === 'Reporting Head') {
                                        return (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[8px] font-black uppercase tracking-wider">
                                            Reporting Head
                                          </span>
                                        );
                                      }
                                      if (role.toLowerCase().includes('admin')) {
                                        return (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200 text-[8px] font-black uppercase tracking-wider">
                                            {role}
                                          </span>
                                        );
                                      }
                                      if (role.toLowerCase().includes('hr')) {
                                        return (
                                          <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[8px] font-black uppercase tracking-wider">
                                            {role}
                                          </span>
                                        );
                                      }
                                      return (
                                        <span className="text-[10px] text-gray-400 font-semibold">{role}</span>
                                      );
                                    })()}
                                    <span className="text-[10px] text-gray-300">•</span>
                                  </div>
                                </div>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* 9. Join Date */}
                <div>
                  <label htmlFor="start_date" className="block text-sm font-medium text-gray-700">
                    Join Date *
                  </label>
                  <input
                    type="date"
                    id="start_date"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>

                {/* 10. Date of Birth */}
                <div>
                  <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700">
                    Date of Birth *
                  </label>
                  <input
                    type="date"
                    id="date_of_birth"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.date_of_birth}
                    onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                    max={new Date().toISOString().split('T')[0]}
                    required
                  />
                </div>

                {/* 11. Address */}
                <div>
                  <label htmlFor="address" className="block text-sm font-medium text-gray-700">
                    Address (Optional)
                  </label>
                  <textarea
                    id="address"
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="Enter full address"
                  />
                </div>

                {/* Actions */}
                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add Employee'}
                  </button>
                  <button
                    type="button"
                    className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                    onClick={onClose}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}