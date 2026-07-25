import React, { useState, useEffect } from 'react';
import { X, Calendar as CalendarIcon } from 'lucide-react';
import { useCompOffStore } from '../../../stores/compOffStore';
import { useLeaveStore, type LeaveType } from '../../../stores/leaveStore';

interface AddCompOffRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  employeeId: string;
  employeeName: string;
  onSuccess: () => void;
}

export default function AddCompOffRequestModal({
  isOpen,
  onClose,
  employeeId,
  employeeName,
  onSuccess,
}: AddCompOffRequestModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { submitRequest } = useCompOffStore();
  const { leaveTypes, fetchLeaveTypes } = useLeaveStore();

  const [formData, setFormData] = useState({
    employee_id: employeeId,
    leave_type_id: '',
    worked_date: '',
    reason: '',
  });

  useEffect(() => {
    if (isOpen) {
      fetchLeaveTypes();
      setFormData({
        employee_id: employeeId,
        leave_type_id: '',
        worked_date: '',
        reason: '',
      });
      setError(null);
    }
  }, [isOpen, employeeId, fetchLeaveTypes]);

  const compOffTypes = leaveTypes.items.filter(lt => {
    const name = lt.name.toLowerCase();
    return name.includes('comp off') || name.includes('compensatory') || name.includes('co');
  });

  useEffect(() => {
    if (compOffTypes.length === 1 && !formData.leave_type_id) {
      setFormData(prev => ({ ...prev, leave_type_id: compOffTypes[0].id }));
    }
  }, [compOffTypes, formData.leave_type_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (!formData.leave_type_id) {
      setError("Please select a Comp Off Leave Type.");
      return;
    }

    if (!formData.worked_date) {
      setError("Please select the date you worked.");
      return;
    }
    
    // Basic validation: Cannot request comp off for future date
    if (new Date(formData.worked_date) > new Date()) {
      setError("You cannot request Comp Off for a future date.");
      return;
    }

    try {
      setLoading(true);
      await submitRequest(formData);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity" aria-hidden="true">
          <div className="absolute inset-0 bg-gray-500 opacity-75"></div>
        </div>

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="absolute top-0 right-0 pt-4 pr-4">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none"
            >
              <X className="h-6 w-6" />
            </button>
          </div>

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center mb-4">
                  <CalendarIcon className="h-5 w-5 mr-2 text-indigo-500" />
                  Request Comp Off Credit
                </h3>
                
                <p className="text-sm text-gray-500 mb-4">
                  Requesting comp off credit for: <strong>{employeeName}</strong>
                </p>

                {error && (
                  <div className="mb-4 bg-red-50 p-4 rounded-md">
                    <p className="text-sm text-red-700">{error}</p>
                  </div>
                )}
                
                {compOffTypes.length === 0 ? (
                  <div className="mb-4 bg-yellow-50 p-4 rounded-md">
                    <p className="text-sm text-yellow-700">No Comp Off leave types are configured in Settings. Please ask your Admin to create one.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Leave Type
                      </label>
                      <select
                        required
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.leave_type_id}
                        onChange={(e) => setFormData({ ...formData, leave_type_id: e.target.value })}
                      >
                        <option value="">Select a Leave Type</option>
                        {compOffTypes.map(lt => (
                          <option key={lt.id} value={lt.id}>{lt.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Date Worked (Weekend / Holiday)
                      </label>
                      <input
                        type="date"
                        required
                        max={new Date().toISOString().split('T')[0]}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.worked_date}
                        onChange={(e) => setFormData({ ...formData, worked_date: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Reason for Working
                      </label>
                      <textarea
                        required
                        rows={3}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.reason}
                        onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                        placeholder="e.g., Required for urgent server deployment"
                      />
                    </div>

                    <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                      >
                        {loading ? 'Submitting...' : 'Submit Request'}
                      </button>
                      <button
                        type="button"
                        onClick={onClose}
                        className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
