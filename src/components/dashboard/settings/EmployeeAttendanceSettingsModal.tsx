import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { validateAuth } from '../../../stores/utils/storeUtils';
import toast from 'react-hot-toast';

interface Employee {
  id: string;
  name: string;
  employee_code: string;
  department_id?: string;
  status: string;
}

interface EmployeeSettings {
  id?: string;
  employee_id: string;
  allow_manual_clock_in_out: boolean;
  require_location: boolean;
  enable_travel_tracking: boolean;
  capture_image_while_face_clockin: boolean;
}

export interface EmployeeAttendanceSettingsRef {
  save: () => Promise<void>;
}

interface Props {
  onChange?: () => void;
}

const EmployeeAttendanceSettingsModal = forwardRef<EmployeeAttendanceSettingsRef, Props>(({ onChange }: Props = {}, ref) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<Record<string, EmployeeSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const auth = await validateAuth();
      if (!auth?.tenantId) return;

      // Fetch active employees
      const { data: empData, error: empError } = await supabase
        .from('employees')
        .select('id, name, employee_code, department_id, status')
        .eq('tenant_id', auth.tenantId)
        .eq('status', 'Active')
        .order('name');

      if (empError) throw empError;

      // Fetch existing settings
      const { data: settingsData, error: settingsError } = await supabase
        .from('employee_attendance_settings')
        .select('*')
        .eq('tenant_id', auth.tenantId);

      if (settingsError) throw settingsError;

      setEmployees(empData || []);
      
      const settingsMap: Record<string, EmployeeSettings> = {};
      settingsData?.forEach(s => {
        settingsMap[s.employee_id] = {
          id: s.id,
          employee_id: s.employee_id,
          allow_manual_clock_in_out: s.allow_manual_clock_in_out,
          require_location: s.require_location,
          enable_travel_tracking: s.enable_travel_tracking,
          capture_image_while_face_clockin: s.capture_image_while_face_clockin
        };
      });
      setSettings(settingsMap);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Failed to load employee settings');
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (employeeId: string, field: keyof EmployeeSettings, value: boolean) => {
    setSettings(prev => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || {
          employee_id: employeeId,
          allow_manual_clock_in_out: false,
          require_location: false,
          enable_travel_tracking: false,
          capture_image_while_face_clockin: false
        }),
        [field]: value
      }
    }));
    onChange?.();
  };

  const handleSelectAll = (employeeId: string, checked: boolean) => {
    setSettings(prev => ({
      ...prev,
      [employeeId]: {
        ...(prev[employeeId] || {
          employee_id: employeeId
        }),
        allow_manual_clock_in_out: checked,
        require_location: checked,
        enable_travel_tracking: checked,
        capture_image_while_face_clockin: checked
      }
    }));
    onChange?.();
  };

  useImperativeHandle(ref, () => ({
    save: handleSave
  }));

  const handleSave = async () => {
    if (Object.keys(settings).length === 0) return;
    setSaving(true);
    try {
      const auth = await validateAuth();
      if (!auth?.tenantId) return;

      const recordsToSave = Object.values(settings).map(s => ({
        ...s,
        tenant_id: auth.tenantId
      }));

      const { error } = await supabase
        .from('employee_attendance_settings')
        .upsert(recordsToSave, {
          onConflict: 'tenant_id, employee_id'
        });

      if (error) throw error;
      
      // Successfully saved child settings
    } catch (error: any) {
      console.error('Error saving specific settings:', error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (emp.employee_code && emp.employee_code.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const isGlobalAllSelected = filteredEmployees.length > 0 && filteredEmployees.every(emp => {
    const s = settings[emp.id];
    return s && s.allow_manual_clock_in_out && s.require_location && s.enable_travel_tracking && s.capture_image_while_face_clockin;
  });

  const handleGlobalSelectAll = (checked: boolean) => {
    setSettings(prev => {
      const newSettings = { ...prev };
      filteredEmployees.forEach(emp => {
        newSettings[emp.id] = {
          ...(newSettings[emp.id] || { employee_id: emp.id }),
          allow_manual_clock_in_out: checked,
          require_location: checked,
          enable_travel_tracking: checked,
          capture_image_while_face_clockin: checked
        };
      });
      return newSettings;
    });
    onChange?.();
  };

  const selectedCount = employees.filter(emp => {
    const s = settings[emp.id];
    return s && s.allow_manual_clock_in_out && s.require_location && s.enable_travel_tracking && s.capture_image_while_face_clockin;
  }).length;

  return (
    <div className="w-full bg-white rounded-lg  mt-4 overflow-hidden">
      <div className="p-">
        <div className="mb-5">
          <p className="text-sm text-gray-500 mt-1">Configure attendance rules for individual employees.</p>
        </div>

          <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="relative rounded-md shadow-sm w-full max-w-md">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="w-5 h-5 text-gray-400" />
              </div>
              <input
                type="text"
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition duration-150 ease-in-out"
                placeholder="Search employees by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <div className="text-sm font-medium text-gray-700 bg-gray-50 px-4 py-2 rounded-lg border border-gray-200 shadow-sm flex items-center">
              <span className="text-indigo-600 font-bold text-base mr-1">{selectedCount}</span> Selected 
              <span className="mx-3 text-gray-300">|</span> 
              <span className="text-gray-900 font-bold text-base mr-1">{employees.length}</span> Total Available
            </div>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-[60vh] min-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-indigo-600 sticky top-0 z-10 shadow-md">
                  <tr>
                    <th scope="col" className="px-6 py-4 w-[5%] text-center">
                      <input
                        type="checkbox"
                        checked={isGlobalAllSelected}
                        onChange={(e) => handleGlobalSelectAll(e.target.checked)}
                        className="appearance-none w-5 h-5 rounded-full border-2 border-indigo-200 checked:bg-white checked:border-white checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20viewBox=%220%200%2016%2016%22%20fill=%22%234f46e5%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20d=%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer transition-all"
                        title="Select all settings for all filtered employees"
                      />
                    </th>
                    <th scope="col" className="px-6 py-4 w-[20%] text-left text-xs font-bold text-white uppercase tracking-wider">
                      Employee
                    </th>
                    <th scope="col" className="px-6 py-4 w-[15%] text-center text-xs font-bold text-white uppercase tracking-wider">
                      Manual IN/OUT
                    </th>
                    <th scope="col" className="px-6 py-4 w-[15%] text-center text-xs font-bold text-white uppercase tracking-wider">
                      Location Required
                    </th>
                    <th scope="col" className="px-6 py-4 w-[15%] text-center text-xs font-bold text-white uppercase tracking-wider">
                      Travel Tracking
                    </th>
                    <th scope="col" className="px-6 py-4 w-[15%] text-center text-xs font-bold text-white uppercase tracking-wider">
                      Face Capture
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredEmployees.map((emp) => {
                    const empSettings = settings[emp.id] || {
                      allow_manual_clock_in_out: false,
                      require_location: false,
                      enable_travel_tracking: false,
                      capture_image_while_face_clockin: false
                    };
                    return (
                      <tr key={emp.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              empSettings.allow_manual_clock_in_out &&
                              empSettings.require_location &&
                              empSettings.enable_travel_tracking &&
                              empSettings.capture_image_while_face_clockin
                            }
                            onChange={(e) => handleSelectAll(emp.id, e.target.checked)}
                            className="appearance-none w-5 h-5 rounded-full border-2 border-gray-300 checked:bg-indigo-600 checked:border-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20viewBox=%220%200%2016%2016%22%20fill=%22white%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20d=%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer transition-all"
                            title="Select All Settings"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">{emp.name}</div>
                          <div className="text-sm text-gray-500">{emp.employee_code}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={empSettings.allow_manual_clock_in_out}
                            onChange={(e) => handleSettingChange(emp.id, 'allow_manual_clock_in_out', e.target.checked)}
                            className="appearance-none w-5 h-5 rounded-full border-2 border-gray-300 checked:bg-indigo-600 checked:border-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20viewBox=%220%200%2016%2016%22%20fill=%22white%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20d=%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer transition-all"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={empSettings.require_location}
                            onChange={(e) => handleSettingChange(emp.id, 'require_location', e.target.checked)}
                            className="appearance-none w-5 h-5 rounded-full border-2 border-gray-300 checked:bg-indigo-600 checked:border-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20viewBox=%220%200%2016%2016%22%20fill=%22white%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20d=%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer transition-all"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={empSettings.enable_travel_tracking}
                            onChange={(e) => handleSettingChange(emp.id, 'enable_travel_tracking', e.target.checked)}
                            className="appearance-none w-5 h-5 rounded-full border-2 border-gray-300 checked:bg-indigo-600 checked:border-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20viewBox=%220%200%2016%2016%22%20fill=%22white%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20d=%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer transition-all"
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <input
                            type="checkbox"
                            checked={empSettings.capture_image_while_face_clockin}
                            onChange={(e) => handleSettingChange(emp.id, 'capture_image_while_face_clockin', e.target.checked)}
                            className="appearance-none w-5 h-5 rounded-full border-2 border-gray-300 checked:bg-indigo-600 checked:border-indigo-600 checked:bg-[url('data:image/svg+xml;utf8,%3Csvg%20viewBox=%220%200%2016%2016%22%20fill=%22white%22%20xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cpath%20d=%22M12.207%204.793a1%201%200%20010%201.414l-5%205a1%201%200%2001-1.414%200l-2-2a1%201%200%20011.414-1.414L6.5%209.086l4.293-4.293a1%201%200%20011.414%200z%22/%3E%3C/svg%3E')] bg-no-repeat bg-center cursor-pointer transition-all"
                          />
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                        No employees found matching your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

        </div>
    </div>
  );
});

export default EmployeeAttendanceSettingsModal;
