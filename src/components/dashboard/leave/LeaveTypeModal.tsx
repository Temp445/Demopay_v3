import React, { useState, useEffect } from 'react';
import { X, AlertCircle, Info } from 'lucide-react';
import { useLeaveStore, type LeaveType } from '../../../stores/leaveStore';

interface LeaveTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<LeaveType, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  leaveType?: LeaveType | null;
}

// 1. Define initial state outside or inside to reuse it for resets
const initialFormState = {
  // Basic fields
  name: '',
  description: '',
  default_days: 0,
  requires_approval: true,
  is_active: true,
  is_paid: true,

  // Holiday/Week off settings
  before_leave_holiday: false,
  before_leave_week_off: false,
  after_leave_holiday: false,
  after_leave_week_off: false,
  in_between_leave_holiday: false,
  in_between_leave_week_off: false,

  // Leave Credit Policy
  credit_policy_type: 'fixed' as 'earned' | 'fixed',
  earned_initial_credit: 0,
  earned_days_to_work: 0,
  earned_days_credited: 0,
  fixed_credit_frequency: 'yearly' as 'monthly' | 'yearly',

  // Leave Carry Forward
  carry_forward_type: 'elapsed' as 'carry_forward' | 'elapsed',
  carry_forward_frequency: 'yearly' as 'monthly' | 'yearly',
  carry_forward_min_limit: 0,
  carry_forward_max_limit: 0,

  // Leave Occurrence
  min_days_per_occurrence: 0.5,
  max_days_per_occurrence: 30,
  gap_between_occurrences: 0,
  max_occasions: 999,

  // Leave Encashment
  encashment_applicable: false,
  encashment_min_limit: 0,
  encashment_max_limit: 0,
  encashment_frequency: 'yearly' as 'monthly' | 'yearly',
};

export default function LeaveTypeModal({ isOpen, onClose, onSave, leaveType }: LeaveTypeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { createLeaveType, updateLeaveType } = useLeaveStore();

  const [formData, setFormData] = useState(initialFormState);

  // 2. Fix the useEffect to handle both Edit (populate) and Add (reset) scenarios
  useEffect(() => {
    if (isOpen) {
      if (leaveType) {
        // EDIT MODE: Populate form with existing data
        setFormData({
          name: leaveType.name,
          description: leaveType.description || '',
          default_days: leaveType.default_days,
          requires_approval: leaveType.requires_approval,
          is_active: leaveType.is_active ?? true,
          is_paid: leaveType.is_paid ?? true,
          before_leave_holiday: leaveType.before_leave_holiday ?? false,
          before_leave_week_off: leaveType.before_leave_week_off ?? false,
          after_leave_holiday: leaveType.after_leave_holiday ?? false,
          after_leave_week_off: leaveType.after_leave_week_off ?? false,
          in_between_leave_holiday: leaveType.in_between_leave_holiday ?? false,
          in_between_leave_week_off: leaveType.in_between_leave_week_off ?? false,

          credit_policy_type: (leaveType.credit_policy_type as 'earned' | 'fixed') || 'fixed',
          earned_initial_credit: leaveType.earned_initial_credit || 0,
          earned_days_to_work: leaveType.earned_days_to_work || 0,
          earned_days_credited: leaveType.earned_days_credited || 0,
          fixed_credit_frequency: (leaveType.fixed_credit_frequency as 'monthly' | 'yearly') || 'yearly',

          carry_forward_type: (leaveType.carry_forward_type as 'carry_forward' | 'elapsed') || 'elapsed',
          carry_forward_frequency: (leaveType.carry_forward_frequency as 'monthly' | 'yearly') || 'yearly',
          carry_forward_min_limit: leaveType.carry_forward_min_limit || 0,
          carry_forward_max_limit: leaveType.carry_forward_max_limit || 0,

          min_days_per_occurrence: leaveType.min_days_per_occurrence || 0.5,
          max_days_per_occurrence: leaveType.max_days_per_occurrence || 30,
          gap_between_occurrences: leaveType.gap_between_occurrences || 0,
          max_occasions: leaveType.max_occasions || 999,

          encashment_applicable: leaveType.encashment_applicable ?? false,
          encashment_min_limit: leaveType.encashment_min_limit || 0,
          encashment_max_limit: leaveType.encashment_max_limit || 0,
          encashment_frequency: (leaveType.encashment_frequency as 'monthly' | 'yearly') || 'yearly',
        });
      } else {
        // ADD MODE: Reset form to initial state
        setFormData(initialFormState);
      }
      // Clear errors when opening
      setError(null);
    }
  }, [leaveType, isOpen]); // Added isOpen dependency to ensure check runs on modal open

  const validateForm = (): boolean => {
    if (!formData.name.trim()) {
      setError('Leave type name is required');
      return false;
    }

    if (formData.default_days < 0) {
      setError('Default days must be a positive number');
      return false;
    }

    if (formData.min_days_per_occurrence < 0) {
      setError('Minimum days per occurrence must be a positive number');
      return false;
    }

    if (formData.max_days_per_occurrence < formData.min_days_per_occurrence) {
      setError('Maximum days per occurrence must be greater than or equal to minimum days');
      return false;
    }

    if (formData.carry_forward_type === 'carry_forward') {
      if (formData.carry_forward_max_limit < formData.carry_forward_min_limit) {
        setError('Carry forward maximum limit must be greater than or equal to minimum limit');
        return false;
      }
    }

    if (formData.encashment_applicable) {
      if (formData.encashment_max_limit < formData.encashment_min_limit) {
        setError('Encashment maximum limit must be greater than or equal to minimum limit');
        return false;
      }
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      if (leaveType) {
        await updateLeaveType(leaveType.id, formData);
      } else {
        await createLeaveType(formData);
      }

      await onSave(formData);
      onClose();
    } catch (err) {
      let errorMessage = 'Failed to save leave type';
      if (err instanceof Error) {
        if (err.message.includes('duplicate key')) {
          errorMessage = 'A leave type with this name already exists';
        } else {
          errorMessage = err.message;
        }
      }
      setError(errorMessage);
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

        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">
          &#8203;
        </span>

        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full">
          <div className="absolute top-0 right-0 pt-4 pr-4 z-10">
            <button
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[calc(100vh-100px)] overflow-y-auto">
            <div className="sm:flex sm:items-start">
              <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                  {leaveType ? 'Edit Leave Type' : 'Add Leave Type'}
                </h3>

                {error && (
                  <div className="mb-4 rounded-md bg-red-50 p-4">
                    <div className="flex">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                      <div className="ml-3">
                        <h3 className="text-sm font-medium text-red-800">{error}</h3>
                      </div>
                    </div>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Basic Information */}
                  <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b border-gray-300 pb-2">
                      Basic Information
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                          Leave Type Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          id="name"
                          required
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        />
                      </div>

                      <div>
                        <label htmlFor="default_days" className="block text-sm font-medium text-gray-700">
                          Default Annual Days <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="number"
                          id="default_days"
                          required
                          min="0"
                          step="0.5"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.default_days}
                          onChange={(e) => setFormData({ ...formData, default_days: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                        Description
                      </label>
                      <textarea
                        id="description"
                        rows={2}
                        className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={formData.description}
                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="requires_approval"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          checked={formData.requires_approval}
                          onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                        />
                        <label htmlFor="requires_approval" className="ml-2 block text-sm text-gray-900">
                          Requires Approval
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="is_paid"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          checked={formData.is_paid}
                          onChange={(e) => setFormData({ ...formData, is_paid: e.target.checked })}
                        />
                        <label htmlFor="is_paid" className="ml-2 block text-sm text-gray-900">
                          Paid Leave
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          type="checkbox"
                          id="is_active"
                          className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        />
                        <label htmlFor="is_active" className="ml-2 block text-sm text-gray-900">
                          Active
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* Leave Credit Policy Section */}
                  <div className="bg-blue-50 p-4 rounded-lg space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b border-blue-300 pb-2">
                      Leave Credit Policy
                    </h4>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Policy Type
                      </label>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="policy_earned"
                            name="credit_policy_type"
                            value="earned"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={formData.credit_policy_type === 'earned'}
                            onChange={(e) => setFormData({ ...formData, credit_policy_type: 'earned' })}
                          />
                          <label htmlFor="policy_earned" className="ml-2 block text-sm text-gray-900">
                            Earned (Based on working days)
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="policy_fixed"
                            name="credit_policy_type"
                            value="fixed"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={formData.credit_policy_type === 'fixed'}
                            onChange={(e) => setFormData({ ...formData, credit_policy_type: 'fixed' })}
                          />
                          <label htmlFor="policy_fixed" className="ml-2 block text-sm text-gray-900">
                            Fixed (Periodic credit)
                          </label>
                        </div>
                      </div>
                    </div>

                    {formData.credit_policy_type === 'earned' && (
                      <div className="pl-6 space-y-3 border-l-2 border-blue-300">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label htmlFor="earned_initial_credit" className="block text-sm font-medium text-gray-700">
                              Initial Credit
                            </label>
                            <input
                              type="number"
                              id="earned_initial_credit"
                              min="0"
                              step="0.5"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.earned_initial_credit}
                              onChange={(e) => setFormData({ ...formData, earned_initial_credit: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <label htmlFor="earned_days_to_work" className="block text-sm font-medium text-gray-700">
                              Days to be Worked
                            </label>
                            <input
                              type="number"
                              id="earned_days_to_work"
                              min="0"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.earned_days_to_work}
                              onChange={(e) => setFormData({ ...formData, earned_days_to_work: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <label htmlFor="earned_days_credited" className="block text-sm font-medium text-gray-700">
                              Days Credited
                            </label>
                            <input
                              type="number"
                              id="earned_days_credited"
                              min="0"
                              step="0.5"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.earned_days_credited}
                              onChange={(e) => setFormData({ ...formData, earned_days_credited: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* {formData.credit_policy_type === 'fixed' && (
                      <div className="pl-6 border-l-2 border-blue-300">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Credit Frequency
                        </label>
                        <div className="space-y-2">
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="fixed_monthly"
                              name="fixed_credit_frequency"
                              value="monthly"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                              checked={formData.fixed_credit_frequency === 'monthly'}
                              onChange={(e) => setFormData({ ...formData, fixed_credit_frequency: 'monthly' })}
                            />
                            <label htmlFor="fixed_monthly" className="ml-2 block text-sm text-gray-900">
                              Monthly
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="radio"
                              id="fixed_yearly"
                              name="fixed_credit_frequency"
                              value="yearly"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                              checked={formData.fixed_credit_frequency === 'yearly'}
                              onChange={(e) => setFormData({ ...formData, fixed_credit_frequency: 'yearly' })}
                            />
                            <label htmlFor="fixed_yearly" className="ml-2 block text-sm text-gray-900">
                              Yearly
                            </label>
                          </div>
                        </div>
                      </div>
                    )} */}
                  </div>

                  {/* Leave Carry Forward Section */}
                  <div className="bg-green-50 p-4 rounded-lg space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b border-green-300 pb-2">
                      Leave Carry Forward
                    </h4>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Carry Forward Type
                      </label>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="cf_carry_forward"
                            name="carry_forward_type"
                            value="carry_forward"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={formData.carry_forward_type === 'carry_forward'}
                            onChange={(e) => setFormData({ ...formData, carry_forward_type: 'carry_forward' })}
                          />
                          <label htmlFor="cf_carry_forward" className="ml-2 block text-sm text-gray-900">
                            Carry Forward (Transfer unused balance)
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="cf_elapsed"
                            name="carry_forward_type"
                            value="elapsed"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={formData.carry_forward_type === 'elapsed'}
                            onChange={(e) => setFormData({ ...formData, carry_forward_type: 'elapsed' })}
                          />
                          <label htmlFor="cf_elapsed" className="ml-2 block text-sm text-gray-900">
                            Elapsed (Expire unused balance)
                          </label>
                        </div>
                      </div>
                    </div>

                    {/* <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Frequency
                      </label>
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="cf_freq_monthly"
                            name="carry_forward_frequency"
                            value="monthly"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={formData.carry_forward_frequency === 'monthly'}
                            onChange={(e) => setFormData({ ...formData, carry_forward_frequency: 'monthly' })}
                          />
                          <label htmlFor="cf_freq_monthly" className="ml-2 block text-sm text-gray-900">
                            Monthly
                          </label>
                        </div>
                        <div className="flex items-center">
                          <input
                            type="radio"
                            id="cf_freq_yearly"
                            name="carry_forward_frequency"
                            value="yearly"
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                            checked={formData.carry_forward_frequency === 'yearly'}
                            onChange={(e) => setFormData({ ...formData, carry_forward_frequency: 'yearly' })}
                          />
                          <label htmlFor="cf_freq_yearly" className="ml-2 block text-sm text-gray-900">
                            Yearly
                          </label>
                        </div>
                      </div>
                    </div> */}

                    {formData.carry_forward_type === 'carry_forward' && (
                      <div className="pl-6 space-y-3 border-l-2 border-green-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label htmlFor="carry_forward_min_limit" className="block text-sm font-medium text-gray-700">
                              Minimum Limit (days)
                            </label>
                            <input
                              type="number"
                              id="carry_forward_min_limit"
                              min="0"
                              step="0.5"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.carry_forward_min_limit}
                              onChange={(e) => setFormData({ ...formData, carry_forward_min_limit: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                          <div>
                            <label htmlFor="carry_forward_max_limit" className="block text-sm font-medium text-gray-700">
                              Maximum Limit (days)
                            </label>
                            <input
                              type="number"
                              id="carry_forward_max_limit"
                              min="0"
                              step="0.5"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.carry_forward_max_limit}
                              onChange={(e) => setFormData({ ...formData, carry_forward_max_limit: parseFloat(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Leave Occurrence Section */}
                  <div className="bg-yellow-50 p-4 rounded-lg space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b border-yellow-300 pb-2">
                      Leave Occurrence
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="min_days_per_occurrence" className="block text-sm font-medium text-gray-700">
                          Minimum Days per Occurrence
                        </label>
                        <input
                          type="number"
                          id="min_days_per_occurrence"
                          min="0"
                          step="0.5"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.min_days_per_occurrence}
                          onChange={(e) => setFormData({ ...formData, min_days_per_occurrence: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                      <div>
                        <label htmlFor="max_days_per_occurrence" className="block text-sm font-medium text-gray-700">
                          Maximum Days per Occurrence
                        </label>
                        <input
                          type="number"
                          id="max_days_per_occurrence"
                          min="0"
                          step="0.5"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.max_days_per_occurrence}
                          onChange={(e) => setFormData({ ...formData, max_days_per_occurrence: parseFloat(e.target.value) || 0 })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="gap_between_occurrences" className="block text-sm font-medium text-gray-700">
                          Gap Between Occurrences (days)
                        </label>
                        <input
                          type="number"
                          id="gap_between_occurrences"
                          min="0"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.gap_between_occurrences}
                          onChange={(e) => setFormData({ ...formData, gap_between_occurrences: parseInt(e.target.value) || 0 })}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          <Info className="inline h-3 w-3 mr-1" />
                          Employees cannot apply for leave within this gap period
                        </p>
                      </div>
                      <div>
                        <label htmlFor="max_occasions" className="block text-sm font-medium text-gray-700">
                          Maximum Occasions
                        </label>
                        <input
                          type="number"
                          id="max_occasions"
                          min="1"
                          className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                          value={formData.max_occasions}
                          onChange={(e) => setFormData({ ...formData, max_occasions: parseInt(e.target.value) || 1 })}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Leave Encashment Section */}
                  <div className="bg-purple-50 p-4 rounded-lg space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b border-purple-300 pb-2">
                      Leave Encashment
                    </h4>

                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="encashment_applicable"
                        className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                        checked={formData.encashment_applicable}
                        onChange={(e) => setFormData({ ...formData, encashment_applicable: e.target.checked })}
                      />
                      <label htmlFor="encashment_applicable" className="ml-2 block text-sm font-medium text-gray-900">
                        Encashment Applicable
                      </label>
                    </div>

                    {formData.encashment_applicable && (
                      <div className="pl-6 space-y-4 border-l-2 border-purple-300">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="encashment_min_limit" className="block text-sm font-medium text-gray-700">
                              Minimum Limit (days)
                            </label>
                            <input
                              type="number"
                              id="encashment_min_limit"
                              min="0"
                              step="0.5"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.encashment_min_limit}
                              onChange={(e) => setFormData({ ...formData, encashment_min_limit: parseFloat(e.target.value) || 0 })}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Minimum leave balance required for encashment
                            </p>
                          </div>
                          <div>
                            <label htmlFor="encashment_max_limit" className="block text-sm font-medium text-gray-700">
                              Maximum Limit (days)
                            </label>
                            <input
                              type="number"
                              id="encashment_max_limit"
                              min="0"
                              step="0.5"
                              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                              value={formData.encashment_max_limit}
                              onChange={(e) => setFormData({ ...formData, encashment_max_limit: parseFloat(e.target.value) || 0 })}
                            />
                            <p className="mt-1 text-xs text-gray-500">
                              Maximum days that can be encashed
                            </p>
                          </div>
                        </div>

                        {/* <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Encashment Frequency
                          </label>
                          <div className="space-y-2">
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="encash_monthly"
                                name="encashment_frequency"
                                value="monthly"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                checked={formData.encashment_frequency === 'monthly'}
                                onChange={(e) => setFormData({ ...formData, encashment_frequency: 'monthly' })}
                              />
                              <label htmlFor="encash_monthly" className="ml-2 block text-sm text-gray-900">
                                Monthly
                              </label>
                            </div>
                            <div className="flex items-center">
                              <input
                                type="radio"
                                id="encash_yearly"
                                name="encashment_frequency"
                                value="yearly"
                                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300"
                                checked={formData.encashment_frequency === 'yearly'}
                                onChange={(e) => setFormData({ ...formData, encashment_frequency: 'yearly' })}
                              />
                              <label htmlFor="encash_yearly" className="ml-2 block text-sm text-gray-900">
                                Yearly
                              </label>
                            </div>
                          </div>
                        </div> */}
                      </div>
                    )}

                    {!formData.encashment_applicable && (
                      <div className="pl-6 border-l-2 border-purple-300">
                        <p className="text-sm text-gray-600 italic">
                          <Info className="inline h-4 w-4 mr-1" />
                          Encashment will not be allowed for this leave type
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Holiday/Week Off Configuration */}
                  <div className="bg-gray-50 p-4 rounded-lg space-y-4">
                    <h4 className="text-md font-semibold text-gray-900 border-b border-gray-300 pb-2">
                      Holiday & Week Off Configuration
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-gray-700">Before Leave</h5>
                        <div className="space-y-1 pl-2">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="before_leave_holiday"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.before_leave_holiday}
                              onChange={(e) => setFormData({ ...formData, before_leave_holiday: e.target.checked })}
                            />
                            <label htmlFor="before_leave_holiday" className="ml-2 block text-sm text-gray-900">
                              Holiday
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="before_leave_week_off"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.before_leave_week_off}
                              onChange={(e) => setFormData({ ...formData, before_leave_week_off: e.target.checked })}
                            />
                            <label htmlFor="before_leave_week_off" className="ml-2 block text-sm text-gray-900">
                              Week Off
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-gray-700">After Leave</h5>
                        <div className="space-y-1 pl-2">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="after_leave_holiday"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.after_leave_holiday}
                              onChange={(e) => setFormData({ ...formData, after_leave_holiday: e.target.checked })}
                            />
                            <label htmlFor="after_leave_holiday" className="ml-2 block text-sm text-gray-900">
                              Holiday
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="after_leave_week_off"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.after_leave_week_off}
                              onChange={(e) => setFormData({ ...formData, after_leave_week_off: e.target.checked })}
                            />
                            <label htmlFor="after_leave_week_off" className="ml-2 block text-sm text-gray-900">
                              Week Off
                            </label>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <h5 className="text-sm font-medium text-gray-700">In Between Leave</h5>
                        <div className="space-y-1 pl-2">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="in_between_leave_holiday"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.in_between_leave_holiday}
                              onChange={(e) => setFormData({ ...formData, in_between_leave_holiday: e.target.checked })}
                            />
                            <label htmlFor="in_between_leave_holiday" className="ml-2 block text-sm text-gray-900">
                              Holiday
                            </label>
                          </div>
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id="in_between_leave_week_off"
                              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                              checked={formData.in_between_leave_week_off}
                              onChange={(e) => setFormData({ ...formData, in_between_leave_week_off: e.target.checked })}
                            />
                            <label htmlFor="in_between_leave_week_off" className="ml-2 block text-sm text-gray-900">
                              Week Off
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Form Actions */}
                  <div className="mt-5 sm:mt-6 sm:flex sm:flex-row-reverse border-t border-gray-200 pt-4">
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                    >
                      {loading ? 'Saving...' : 'Save Leave Type'}
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
    </div>
  );
}