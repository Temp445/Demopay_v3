import React, { useState, useEffect } from 'react';
import { 
  X, Calendar, Clock, User, FileText, CheckCircle, 
  XCircle, Edit, Ban, AlertCircle, Briefcase, MapPin, Target 
} from 'lucide-react';
import { useGatePassesStore } from '../../../stores/gatePassesStore';
import { useLocationSettingsStore } from '../../../stores/locationSettingsStore';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import type { GatePassRequest, UpdateGatePassRequest } from '../../../types/gatePasses';
import { useRoleAccess } from '../../../hooks/useRoleAccess';
import { useEmployeesStore } from '../../../stores/employeesStore';
import { supabase } from '../../../lib/supabase';
import { useTenant } from '../../../contexts/TenantContext';
import MapPickerSwitch from '../location/MapPickerSwitch'; 

interface GatePassDetailsModalProps {
  gatePass: GatePassRequest;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

interface FormErrors {
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  reason?: string;
  company_name?: string;
  location?: string;
  allowed_radius_meters?: string;
}

export default function GatePassDetailsModal({ gatePass, isOpen, onClose, onUpdate }: GatePassDetailsModalProps) {
  const { updateGatePass, cancelGatePass, approveGatePass, rejectGatePass, fetchApproval, fetchChangeLogs, approvals, changeLogs, loading } = useGatePassesStore();
  const { settings: locationSettings } = useLocationSettingsStore();
  const { isEmployee, employeeId } = useRoleAccess();
  const { items: employees } = useEmployeesStore();
  const { currentTenant } = useTenant();

  const [isEditing, setIsEditing] = useState(false);
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [adminNames, setAdminNames] = useState<Record<string, string>>({});
  const [profilesFetched, setProfilesFetched] = useState(false);
  
  // Inline Reject State
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const [formData, setFormData] = useState<UpdateGatePassRequest>({
    start_date: gatePass.start_date,
    start_time: gatePass.start_time,
    end_date: gatePass.end_date,
    end_time: gatePass.end_time,
    reason: gatePass.reason,
    gate_pass_type: gatePass.gate_pass_type || 'normal',
    company_name: gatePass.company_name || '',
    latitude: gatePass.latitude || 0,
    longitude: gatePass.longitude || 0,
    allowed_radius_meters: gatePass.allowed_radius_meters ?? 100,
    address: gatePass.address || '',
    city: gatePass.city || '',
    state: gatePass.state || '',
    country: gatePass.country || '',
    postal_code: gatePass.postal_code || '',
    formatted_address: gatePass.formatted_address || ''
  });

  const [errors, setErrors] = useState<FormErrors>({});

  const approval = approvals[gatePass.id];
  const logs = changeLogs[gatePass.id] || [];

  useEffect(() => {
    const uuidsToFetch = new Set<string>();
    
    if (gatePass.requested_by) {
      const emp = employees.find(e => e.auth_profile_id === gatePass.requested_by || e.id === gatePass.requested_by);
      if (!emp) uuidsToFetch.add(gatePass.requested_by);
    }
    
    logs.forEach(log => {
      if (log.changed_by) {
        const emp = employees.find(e => e.auth_profile_id === log.changed_by || e.id === log.changed_by);
        if (!emp) uuidsToFetch.add(log.changed_by);
      }
    });

    if (uuidsToFetch.size > 0) {
      const fetchProfiles = async () => {
        if (!currentTenant?.id) {
          setProfilesFetched(true);
          return;
        }
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', Array.from(uuidsToFetch))
          .eq('tenant_id', currentTenant.id);
        
        if (data) {
          const names: Record<string, string> = {};
          data.forEach(p => {
            names[p.id] = p.full_name || p.email || 'Admin';
          });
          setAdminNames(prev => ({...prev, ...names}));
        }
        setProfilesFetched(true);
      };
      fetchProfiles();
    } else {
      setProfilesFetched(true);
    }
  }, [gatePass.requested_by, logs, employees, currentTenant?.id]);

  useEffect(() => {
    if (isOpen) {
      setProfilesFetched(false);
      fetchApproval(gatePass.id);
      fetchChangeLogs(gatePass.id);
      setIsEditing(false);
      setShowCancelForm(false);
      setShowRejectForm(false);
      setCancellationReason('');
      setRejectionReason('');
      setFormData({
        start_date: gatePass.start_date,
        start_time: gatePass.start_time,
        end_date: gatePass.end_date,
        end_time: gatePass.end_time,
        reason: gatePass.reason,
        gate_pass_type: gatePass.gate_pass_type || 'normal',
        company_name: gatePass.company_name || '',
        latitude: gatePass.latitude || 0,
        longitude: gatePass.longitude || 0,
        allowed_radius_meters: gatePass.allowed_radius_meters ?? 100,
        address: gatePass.address || '',
        city: gatePass.city || '',
        state: gatePass.state || '',
        country: gatePass.country || '',
        postal_code: gatePass.postal_code || '',
        formatted_address: gatePass.formatted_address || ''
      });
      setErrors({});
    }
  }, [isOpen, gatePass, fetchApproval, fetchChangeLogs]);

  const canEdit = gatePass.status === 'pending';
  const canCancel = gatePass.status === 'pending';
  const canApprove = gatePass.status === 'pending' && !isEmployee && gatePass.employee_id !== employeeId;

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.start_date) newErrors.start_date = 'Start date is required';
    if (!formData.start_time) newErrors.start_time = 'Start time is required';
    if (!formData.end_date) newErrors.end_date = 'End date is required';
    if (!formData.end_time) newErrors.end_time = 'End time is required';
    if (!formData.reason || formData.reason?.trim() === '') newErrors.reason = 'Reason is required';

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

  const handleUpdate = async () => {
    if (!validateForm()) return;

    try {
      const submitData: any = { ...formData };
      
      if (submitData.gate_pass_type === 'normal') {
        submitData.company_name = null;
        submitData.latitude = null;
        submitData.longitude = null;
        submitData.allowed_radius_meters = null;
        submitData.address = null;
        submitData.city = null;
        submitData.state = null;
        submitData.country = null;
        submitData.postal_code = null;
        submitData.formatted_address = null;
      } else if (!locationSettings.radius_monitoring_enabled) {
        submitData.allowed_radius_meters = 0;
      }

      await updateGatePass(gatePass.id, submitData);
      toast.success('Gate pass updated successfully');
      setIsEditing(false);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update gate pass');
    }
  };

  // --- DIRECT ACTION HANDLERS ---
  const handleDirectApprove = async () => {
    try {
      await approveGatePass(gatePass.id, {
        approved_start_date: gatePass.start_date,
        approved_start_time: gatePass.start_time,
        approved_end_date: gatePass.end_date,
        approved_end_time: gatePass.end_time,
        comments: ''
      });
      toast.success(gatePass.gate_pass_type === 'paid' ? 'Location assigned successfully' : 'Gate pass approved successfully');
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to approve gate pass');
    }
  };

  const handleRejectSubmit = async () => {
    if (!rejectionReason.trim()) {
      toast.error('Rejection reason is required');
      return;
    }
    try {
      await rejectGatePass(gatePass.id, { rejection_reason: rejectionReason });
      toast.success('Gate pass rejected successfully');
      setShowRejectForm(false);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to reject gate pass');
    }
  };

  const handleCancelSubmit = async () => {
    if (!cancellationReason.trim()) {
      toast.error('Cancellation reason is required');
      return;
    }
    try {
      await cancelGatePass(gatePass.id, { cancellation_reason: cancellationReason });
      toast.success('Gate pass cancelled successfully');
      setShowCancelForm(false);
      onUpdate();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel gate pass');
    }
  };

  const handleChange = (field: keyof UpdateGatePassRequest, value: any) => {
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

  const formatDateTime = (date: string, time: string) => {
    try {
      const dateTime = new Date(`${date}T${time}`);
      return format(dateTime, 'MMM dd, yyyy hh:mm a');
    } catch (error) {
      return `${date} ${time}`;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-800 bg-yellow-100 border border-yellow-200';
      case 'approved': return 'text-green-800 bg-green-100 border border-green-200';
      case 'assigned': return 'text-blue-800 bg-blue-100 border border-blue-200';
      case 'in_progress': return 'text-orange-800 bg-orange-100 border border-orange-200';
      case 'paused': return 'text-amber-800 bg-amber-100 border border-amber-200';
      case 'completed': return 'text-emerald-800 bg-emerald-100 border border-emerald-200';
      case 'rejected': return 'text-red-800 bg-red-100 border border-red-200';
      case 'cancelled': return 'text-gray-800 bg-gray-100 border border-gray-200';
      default: return 'text-gray-800 bg-gray-100 border border-gray-200';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">Gate Pass Details</h2>
            <span className={`px-3 py-1 text-xs font-semibold rounded-full ${getStatusColor(gatePass.status)}`}>
              {gatePass.status.toUpperCase()}
            </span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
              <User className="h-4 w-4 mr-2" />
              Employee Information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-gray-500">Name</p>
                <p className="text-sm font-medium text-gray-900">{gatePass.employee?.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Employee Code</p>
                <p className="text-sm font-medium text-gray-900">{gatePass.employee?.employee_code}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Department</p>
                <p className="text-sm font-medium text-gray-900">{((gatePass.employee as any)?.department_id?.name) || gatePass.employee?.department || 'N/A'}</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
              <Calendar className="h-4 w-4 mr-2" />
              Gate Pass Details
            </h3>

            {isEditing ? (
              <div className="space-y-4">
                <div className="mb-4">
                  <label className="block text-xs text-gray-500 mb-2">Gate Pass Type (Cannot be changed)</label>
                  <div className="flex space-x-6">
                    <label className={`flex items-center ${formData.gate_pass_type !== 'normal' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input
                        type="radio"
                        checked={formData.gate_pass_type === 'normal'}
                        disabled={true}
                        className="h-4 w-4 text-indigo-600 border-gray-300 disabled:bg-gray-100"
                      />
                      <span className="ml-2 text-sm text-gray-700">Normal Pass</span>
                    </label>
                    <label className={`flex items-center ${formData.gate_pass_type !== 'paid' ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input
                        type="radio"
                        checked={formData.gate_pass_type === 'paid'}
                        disabled={true}
                        className="h-4 w-4 text-indigo-600 border-gray-300 disabled:bg-gray-100"
                      />
                      <span className="ml-2 text-sm text-gray-700 font-medium">Paid Amount (Official Visit)</span>
                    </label>
                  </div>
                </div>

                {formData.gate_pass_type === 'paid' && (
                  <div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 space-y-4 mb-4">
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
                      {errors.company_name && <p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.company_name}</p>}
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
                      {errors.location && <p className="mt-2 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.location}</p>}
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
                        {errors.allowed_radius_meters && <p className="mt-1 text-sm text-red-600 flex items-center"><AlertCircle className="h-4 w-4 mr-1" />{errors.allowed_radius_meters}</p>}
                        <p className="mt-1 text-xs text-gray-500">Employee must stay within this radius once they reach the location.</p>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                    <input type="date" value={formData.start_date} onChange={(e) => handleChange('start_date', e.target.value)} className={`block w-full rounded-md shadow-sm sm:text-sm p-2 border ${errors.start_date ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`} />
                    {errors.start_date && <p className="mt-1 text-xs text-red-600">{errors.start_date}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start Time</label>
                    <input type="time" value={formData.start_time} onChange={(e) => handleChange('start_time', e.target.value)} className={`block w-full rounded-md shadow-sm sm:text-sm p-2 border ${errors.start_time ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`} />
                    {errors.start_time && <p className="mt-1 text-xs text-red-600">{errors.start_time}</p>}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Date</label>
                    <input type="date" value={formData.end_date} onChange={(e) => handleChange('end_date', e.target.value)} min={formData.start_date} className={`block w-full rounded-md shadow-sm sm:text-sm p-2 border ${errors.end_date ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`} />
                    {errors.end_date && <p className="mt-1 text-xs text-red-600">{errors.end_date}</p>}
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End Time</label>
                    <input type="time" value={formData.end_time} onChange={(e) => handleChange('end_time', e.target.value)} className={`block w-full rounded-md shadow-sm sm:text-sm p-2 border ${errors.end_time ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`} />
                    {errors.end_time && <p className="mt-1 text-xs text-red-600">{errors.end_time}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Reason</label>
                  <textarea value={formData.reason} onChange={(e) => handleChange('reason', e.target.value)} rows={3} className={`block w-full rounded-md shadow-sm sm:text-sm p-2 border ${errors.reason ? 'border-red-300 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`} />
                  {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
                </div>

                <div className="flex justify-end gap-2">
                  <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">Cancel</button>
                  <button onClick={handleUpdate} disabled={loading} className="px-3 py-1.5 text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                    {loading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {gatePass.gate_pass_type === 'paid' && (
                  <div className="md:col-span-2 mb-2 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                    <h4 className="text-sm font-semibold text-indigo-900 flex items-center mb-3">
                      <Briefcase className="h-4 w-4 mr-2" /> Paid Visit Details
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-xs text-indigo-700 mb-1">Company / Client</p>
                        <p className="text-sm font-medium text-gray-900">{gatePass.company_name}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-indigo-700 mb-1">Location</p>
                        <p className="text-sm font-medium text-gray-900 line-clamp-2 flex items-start gap-1">
                          <MapPin className="h-3.5 w-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                          {gatePass.formatted_address || `${gatePass.latitude}, ${gatePass.longitude}`}
                          {gatePass.allowed_radius_meters && locationSettings?.radius_monitoring_enabled ? <span className="ml-1 text-gray-500 font-normal">({gatePass.allowed_radius_meters}m radius)</span> : null}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-500 mb-1">Requested By</p>
                  <p className="text-sm font-medium text-gray-900">
                    {(() => {
                      if (gatePass.requested_by) {
                        const emp = employees.find(e => e.auth_profile_id === gatePass.requested_by || e.id === gatePass.requested_by);
                        if (emp) return emp.name;
                        
                        if (adminNames[gatePass.requested_by]) {
                          return adminNames[gatePass.requested_by];
                        }
                        
                        if (!profilesFetched) return '...';
                        
                        return 'Admin / HR Team';
                      }
                      
                      const logName = logs.find(l => l.change_type === 'created')?.changed_by_name;
                      if (logName && logName !== 'System') return logName;

                      return gatePass.employee?.name || 'System';
                    })()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Requested At</p>
                  <p className="text-sm font-medium text-gray-900">
                    {format(new Date(gatePass.requested_at || gatePass.created_at || new Date()), 'MMM dd, yyyy hh:mm a')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Start Date & Time</p>
                  <p className="text-sm font-medium text-gray-900">{formatDateTime(gatePass.start_date, gatePass.start_time)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">End Date & Time</p>
                  <p className="text-sm font-medium text-gray-900">{formatDateTime(gatePass.end_date, gatePass.end_time)}</p>
                </div>
                <div className="md:col-span-2 mt-2">
                  <p className="text-xs text-gray-500 mb-1">Reason</p>
                  <p className="text-sm font-medium text-gray-900">{gatePass.reason}</p>
                </div>
              </div>
            )}
          </div>

          {/* {approval && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                {approval.action === 'approved' ? (
                  <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 mr-2 text-red-600" />
                )}
                {approval.action === 'approved' ? 'Approval Information' : 'Rejection Information'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Action By</p>
                  <p className="font-medium text-gray-900">{approval.approver_name}</p>
                </div>
                <div>
                  <p className="text-gray-500">Action Date</p>
                  <p className="font-medium text-gray-900">{format(new Date(approval.created_at!), 'MMM dd, yyyy hh:mm a')}</p>
                </div>
                {approval.action === 'rejected' && approval.rejection_reason && (
                  <div className="md:col-span-2">
                    <p className="text-gray-500">Reason</p>
                    <p className="font-medium text-red-700">{approval.rejection_reason}</p>
                  </div>
                )}
                {approval.action === 'approved' && approval.comments && (
                  <div className="md:col-span-2">
                    <p className="text-gray-500">Comments</p>
                    <p className="font-medium text-gray-900">{approval.comments}</p>
                  </div>
                )}
              </div>
            </div>
          )} */}

          {gatePass.status === 'cancelled' && gatePass.cancellation_reason && (
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                <Ban className="h-4 w-4 mr-2 text-gray-600" />
                Cancellation Information
              </h3>
              <p className="text-sm text-gray-700">{gatePass.cancellation_reason}</p>
            </div>
          )}

          {logs.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Change History
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {logs.map((log) => (
                  <div key={log.id} className="text-xs p-2 bg-gray-50 rounded">
                    <p className="text-gray-900">
                      <strong>
                        {(() => {
                          if (log.changed_by) {
                            const emp = employees.find(e => e.auth_profile_id === log.changed_by || e.id === log.changed_by);
                            if (emp) return emp.name;
                            
                            if (adminNames[log.changed_by]) {
                              return adminNames[log.changed_by];
                            }
                            
                            if (!profilesFetched) return '...';

                            return 'Admin / HR Team';
                          }
                          
                          if (log.changed_by_name && log.changed_by_name !== 'System') return log.changed_by_name;

                          return gatePass.employee?.name || 'System';
                        })()}
                      </strong> - {log.description}
                    </p>
                    <p className="text-gray-500">
                      {format(new Date(log.changed_at), 'MMM dd, yyyy hh:mm a')}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Inline Reject Form */}
          {showRejectForm && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-900 mb-3">Reject Gate Pass</h3>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                placeholder="Enter reason for rejection..."
                className="block w-full rounded-md border-red-300 shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setShowRejectForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectSubmit}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          )}

          {/* Inline Cancel Form */}
          {showCancelForm && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-red-900 mb-3">Cancel Gate Pass</h3>
              <textarea
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                rows={3}
                placeholder="Enter reason for cancellation..."
                className="block w-full rounded-md border-red-300 shadow-sm focus:ring-red-500 focus:border-red-500 sm:text-sm"
              />
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => setShowCancelForm(false)}
                  className="px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Nevermind
                </button>
                <button
                  onClick={handleCancelSubmit}
                  disabled={loading}
                  className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-4 md:gap-0 justify-between pt-4 border-t border-gray-200">
            <div className="flex gap-2">
              {canEdit && !isEditing && (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </button>
              )}
              {canCancel && !showCancelForm && (
                <button
                  onClick={() => setShowCancelForm(true)}
                  className="inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 bg-white border border-red-300 rounded-md hover:bg-red-50"
                >
                  <Ban className="h-4 w-4 mr-2" />
                  Cancel Request
                </button>
              )}
            </div>

            <div className="flex  gap-2">
              {canApprove && !showRejectForm && (
                <>
                  <button
                    onClick={handleDirectApprove}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {gatePass.gate_pass_type === 'paid' ? 'Assign Location' : 'Approve'}
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}