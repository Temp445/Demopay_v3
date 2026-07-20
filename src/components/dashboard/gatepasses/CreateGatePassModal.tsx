import React, { useState, useEffect } from 'react';
import { X, Calendar, Clock, User, AlertCircle, MapPin, Briefcase, Target } from 'lucide-react';
import { useGatePassesStore } from '../../../stores/gatePassesStore';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { useTenant } from '../../../contexts/TenantContext';
import { supabase } from '../../../lib/supabase';
import toast from 'react-hot-toast';
import type { CreateGatePassRequest } from '../../../types/gatePasses';
import { useRoleAccess } from '../../../hooks/useRoleAccess'; 
import MapPickerSwitch from '../location/MapPickerSwitch'; 

interface CreateGatePassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormErrors {
  employee_id?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  reason?: string;
  company_name?: string;
  location?: string;
  allowed_radius_meters?: string;
}

export default function CreateGatePassModal({ isOpen, onClose, onSuccess }: CreateGatePassModalProps) {
  const { currentTenant } = useTenant();
  const { createGatePass, loading } = useGatePassesStore();
  const { items: employees, fetchEmployees } = useEmployeesStore();
  const { settings: locationSettings, fetchSettings: fetchLocationSettings, initialized: locationSettingsInitialized } = useLocationSettingsStore();
  
  const { isEmployee, employeeId, role } = useRoleAccess();
  const isReportingHead = role === 'Reporting Head';

  const subordinateIds = React.useMemo(() => {
    if (!employeeId) return [];
    return employees
      .filter(emp => {
        const reportingTo = Array.isArray(emp.reporting_to) ? emp.reporting_to : (emp.reporting_to ? [emp.reporting_to] : []);
        return reportingTo.includes(employeeId);
      })
      .map(emp => emp.id);
  }, [employees, employeeId]);
  
  const [validatingShift, setValidatingShift] = useState(false);

  const [formData, setFormData] = useState<CreateGatePassRequest>({
    employee_id: '',
    start_date: '',
    start_time: '',
    end_date: '',
    end_time: '',
    reason: '',
    gate_pass_type: 'normal',
    company_name: '',
    latitude: 0,
    longitude: 0,
    allowed_radius_meters: 100,
    address: '',
    city: '',
    state: '',
    country: '',
    postal_code: '',
    formatted_address: ''
  });

  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (isOpen) {
      fetchEmployees();
      
      // Fetch location settings to check if radius monitoring is enabled
      if (currentTenant?.id && !locationSettingsInitialized) {
        fetchLocationSettings(currentTenant.id);
      }
      
      setFormData({
        employee_id: (isEmployee || isReportingHead) && employeeId ? employeeId : '',
        start_date: '',
        start_time: '',
        end_date: '',
        end_time: '',
        reason: '',
        gate_pass_type: 'normal',
        company_name: '',
        latitude: 0,
        longitude: 0,
        allowed_radius_meters: 100,
        address: '',
        city: '',
        state: '',
        country: '',
        postal_code: '',
        formatted_address: ''
      });
      setErrors({});
    }
  }, [isOpen, fetchEmployees, isEmployee, isReportingHead, employeeId, currentTenant?.id, locationSettingsInitialized, fetchLocationSettings]);

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.employee_id) newErrors.employee_id = 'Employee is required';
    if (!formData.start_date) newErrors.start_date = 'Start date is required';
    if (!formData.start_time) newErrors.start_time = 'Start time is required';
    if (!formData.end_date) newErrors.end_date = 'End date is required';
    if (!formData.end_time) newErrors.end_time = 'End time is required';
    if (!formData.reason || formData.reason.trim() === '') newErrors.reason = 'Reason is required';

    if (formData.start_date && formData.end_date) {
      if (new Date(formData.end_date) < new Date(formData.start_date)) {
        newErrors.end_date = 'End date cannot be before start date';
      }
    }

    if (
      formData.start_date &&
      formData.end_date &&
      formData.start_time &&
      formData.end_time &&
      formData.start_date === formData.end_date
    ) {
      const startDateTime = new Date(`${formData.start_date}T${formData.start_time}`);
      const endDateTime = new Date(`${formData.end_date}T${formData.end_time}`);

      if (endDateTime <= startDateTime) {
        newErrors.end_time = 'End time must be after start time';
      }
    }

    // --- VALIDATION FOR PAID GATE PASS ---
    if (formData.gate_pass_type === 'paid') {
      if (!formData.company_name || formData.company_name.trim() === '') {
        newErrors.company_name = 'Company Name is required for paid gate passes';
      }
      if (!formData.latitude || !formData.longitude || formData.latitude === 0) {
        newErrors.location = 'Please pin the location on the map';
      }
      if (locationSettings?.radius_monitoring_enabled) {
        if (!formData.allowed_radius_meters || formData.allowed_radius_meters < 10) {
          newErrors.allowed_radius_meters = 'Radius must be at least 10 meters';
        }
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const checkShiftLimits = async (): Promise<boolean> => {
    if (!formData.employee_id || !formData.start_date) return true;

    try {
      setValidatingShift(true);
      
      const { data: assignment, error } = await supabase
        .from('shift_assignments')
        .select(`
          schedule_date,
          shifts (
            start_time,
            end_time
          )
        `)
        .eq('employee_id', formData.employee_id)
        .eq('schedule_date', formData.start_date)
        .maybeSingle();

      if (error) throw error;

      if (!assignment || !assignment.shifts) {
        setErrors(prev => ({ 
          ...prev, 
          start_date: 'No active shift found for this employee on this date' 
        }));
        return false;
      }

      const shiftData = assignment.shifts as any;
      const shiftStartDateTime = new Date(`${assignment.schedule_date}T${shiftData.start_time}`);
      let shiftEndDateTime = new Date(`${assignment.schedule_date}T${shiftData.end_time}`);

      if (shiftEndDateTime < shiftStartDateTime) {
        shiftEndDateTime.setDate(shiftEndDateTime.getDate() + 1);
      }

      const requestStartDateTime = new Date(`${formData.start_date}T${formData.start_time}`);
      const requestEndDateTime = new Date(`${formData.end_date}T${formData.end_time}`);

      if (requestStartDateTime < shiftStartDateTime) {
        setErrors(prev => ({
          ...prev,
          start_time: `Time must be within shift (${shiftData.start_time.slice(0, 5)} - ${shiftData.end_time.slice(0, 5)})`
        }));
        return false;
      }

      if (requestEndDateTime > shiftEndDateTime) {
        setErrors(prev => ({
          ...prev,
          end_time: `Time must be within shift limits (${shiftData.start_time.slice(0, 5)} - ${shiftData.end_time.slice(0, 5)})`
        }));
        return false;
      }

      return true;

    } catch (err) {
      console.error('Error validating shift limits:', err);
      toast.error('Could not verify shift limits. Please try again.');
      return false;
    } finally {
      setValidatingShift(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const isWithinShift = await checkShiftLimits();
    if (!isWithinShift) {
      return;
    }

    try {
      // Ensure we clean up data based on type and global settings
      const submitData = { ...formData };
      
      if (submitData.gate_pass_type === 'normal') {
        delete submitData.company_name;
        delete submitData.latitude;
        delete submitData.longitude;
        delete submitData.allowed_radius_meters;
        delete submitData.address;
        delete submitData.city;
        delete submitData.state;
        delete submitData.country;
        delete submitData.postal_code;
        delete submitData.formatted_address;
      } else {
        // If radius tracking is disabled globally, save as 0
        if (!locationSettings.radius_monitoring_enabled) {
          submitData.allowed_radius_meters = 0;
        }
      }

      await createGatePass(submitData);
      toast.success('Gate pass request created successfully');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create gate pass');
    }
  };

  const handleChange = (field: keyof CreateGatePassRequest, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const handleLocationSelect = (data: any) => {
    setFormData(prev => ({
      ...prev,
      latitude: data.latitude,
      longitude: data.longitude,
      address: data.address,
      city: data.city,
      state: data.state,
      country: data.country,
      postal_code: data.postal_code,
      formatted_address: data.formatted_address,
    }));
    if (errors.location) {
      setErrors(prev => ({ ...prev, location: undefined }));
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Create Gate Pass Request</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          
          {/* GATE PASS TYPE TOGGLE */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Gate Pass Type</label>
            <div className="flex space-x-6">
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  checked={formData.gate_pass_type === 'normal'}
                  onChange={() => handleChange('gate_pass_type', 'normal')}
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700">Normal Pass</span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="radio"
                  checked={formData.gate_pass_type === 'paid'}
                  onChange={() => handleChange('gate_pass_type', 'paid')}
                  className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300"
                />
                <span className="ml-2 text-sm text-gray-700 font-medium">Paid Amount (Official Visit)</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              <User className="h-4 w-4 inline-block mr-1" />
              Employee <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.employee_id}
              disabled={isEmployee}
              onChange={(e) => handleChange('employee_id', e.target.value)}
              className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                errors.employee_id
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
              } ${isEmployee ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            >
              {!isEmployee && <option value="">Select an employee</option>}
              
              {employees
                .filter(employee => {
                  if (isEmployee) return employee.id === employeeId;
                  if (isReportingHead) return employee.id === employeeId || subordinateIds.includes(employee.id);
                  return true;
                })
                .map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name} ({employee.employee_code}) - {employee.department}
                  </option>
              ))}
            </select>
            {errors.employee_id && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.employee_id}
              </p>
            )}
          </div>

          {/* CONDITIONAL: PAID PASS FIELDS */}
          {formData.gate_pass_type === 'paid' && (
            <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 space-y-4">
              <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2 border-b border-indigo-100 pb-2">
                <Briefcase className="h-4 w-4" /> Paid Visit Details
              </h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Company / Client Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.company_name}
                  onChange={(e) => handleChange('company_name', e.target.value)}
                  className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                    errors.company_name ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
                  }`}
                  placeholder="e.g., Acme Corp"
                />
                {errors.company_name && (
                  <p className="mt-1 text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {errors.company_name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <MapPin className="h-4 w-4 inline-block mr-1" />
                  Pin Location on Map <span className="text-red-500">*</span>
                </label>
                
                <div className={`${errors.location ? 'ring-2 ring-red-300 rounded-xl' : ''}`}>
                  <MapPickerSwitch
                    initialLat={formData.latitude !== 0 ? formData.latitude : undefined}
                    initialLng={formData.longitude !== 0 ? formData.longitude : undefined}
                    onLocationSelect={handleLocationSelect}
                    height="300px"
                  />
                </div>
                
                {errors.location && (
                  <p className="mt-2 text-sm text-red-600 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-1" />
                    {errors.location}
                  </p>
                )}
              </div>

              {locationSettings?.radius_monitoring_enabled && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    <Target className="h-4 w-4 inline-block mr-1" />
                    Allowed Radius (meters) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min="10"
                    step="10"
                    value={formData.allowed_radius_meters}
                    onChange={(e) => handleChange('allowed_radius_meters', parseInt(e.target.value) || 0)}
                    className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                      errors.allowed_radius_meters ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'
                    }`}
                  />
                  {errors.allowed_radius_meters && (
                    <p className="mt-1 text-sm text-red-600 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-1" />
                      {errors.allowed_radius_meters}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-gray-500">Employee must stay within this radius once they reach the location.</p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                <Calendar className="h-4 w-4 inline-block mr-1" />
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
                className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                  errors.start_date
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.start_date && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.start_date}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                <Clock className="h-4 w-4 inline-block mr-1" />
                Start Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => handleChange('start_time', e.target.value)}
                className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                  errors.start_time
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.start_time && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.start_time}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                <Calendar className="h-4 w-4 inline-block mr-1" />
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => handleChange('end_date', e.target.value)}
                min={formData.start_date}
                className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                  errors.end_date
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.end_date && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.end_date}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                <Clock className="h-4 w-4 inline-block mr-1" />
                End Time <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => handleChange('end_time', e.target.value)}
                className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                  errors.end_time
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                }`}
              />
              {errors.end_time && (
                <p className="mt-1 text-sm text-red-600 flex items-center">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  {errors.end_time}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={formData.reason}
              onChange={(e) => handleChange('reason', e.target.value)}
              rows={3}
              className={`mt-1 block w-full rounded-md shadow-sm sm:text-sm p-2 border ${
                errors.reason
                  ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                  : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
              }`}
              placeholder="Enter the reason for the gate pass..."
            />
            {errors.reason && (
              <p className="mt-1 text-sm text-red-600 flex items-center">
                <AlertCircle className="h-4 w-4 mr-1" />
                {errors.reason}
              </p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> Gate pass requests must be approved before they become effective.
            </p>
          </div>

          <div className="flex md:justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || validatingShift}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading || validatingShift ? 'Validating...' : 'Create Request'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}