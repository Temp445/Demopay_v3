import React, { useState, useEffect } from 'react';
import { Save, Percent, DollarSign, Calendar, Users, FileText, CheckCircle ,IndianRupee } from 'lucide-react';
import { useAdvancesStore } from '../../../stores/advancesStore';
import toast from 'react-hot-toast';

export default function AdvanceSettings() {
  const { settings, fetchSettings, updateSettings, loading } = useAdvancesStore();

  const [formData, setFormData] = useState({
    default_interest_rate: 0,
    max_advance_amount: null as number | null,
    max_installments: 24,
    min_installments: 1,
    allow_multiple_advances: false,
    require_justification: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (settings) {
      setFormData({
        default_interest_rate: settings.default_interest_rate,
        max_advance_amount: settings.max_advance_amount,
        max_installments: settings.max_installments,
        min_installments: settings.min_installments,
        allow_multiple_advances: settings.allow_multiple_advances,
        require_justification: settings.require_justification,
      });
    }
  }, [settings]);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (formData.default_interest_rate < 0 || formData.default_interest_rate > 100) {
      newErrors.default_interest_rate = 'Interest rate must be between 0 and 100';
    }

    if (formData.max_advance_amount !== null && formData.max_advance_amount <= 0) {
      newErrors.max_advance_amount = 'Maximum advance amount must be greater than 0';
    }

    if (formData.min_installments < 1) {
      newErrors.min_installments = 'Minimum installments must be at least 1';
    }

    if (formData.max_installments < formData.min_installments) {
      newErrors.max_installments = 'Maximum installments must be greater than or equal to minimum installments';
    }

    if (formData.max_installments > 60) {
      newErrors.max_installments = 'Maximum installments cannot exceed 60 months';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      toast.error('Please fix the errors before saving');
      return;
    }

    setIsSaving(true);

    try {
      await updateSettings(formData);
      toast.success('Advance settings saved successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900">Advance Settings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Configure default values and constraints for employee advance requests.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
        {/* Interest Rate Configuration */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center mb-4">
            <Percent className="h-5 w-5 mr-2 text-blue-500" />
            Interest Rate
          </h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="max-w-md">
              <label htmlFor="default-interest-rate" className="block text-sm font-medium text-gray-700">
                Default Interest Rate (%)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="default-interest-rate"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.default_interest_rate}
                  onChange={(e) =>
                    setFormData({ ...formData, default_interest_rate: parseFloat(e.target.value) || 0 })
                  }
                  className={`shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    errors.default_interest_rate ? 'border-red-300' : ''
                  }`}
                  placeholder="0.00"
                />
              </div>
              {errors.default_interest_rate && (
                <p className="mt-2 text-sm text-red-600">{errors.default_interest_rate}</p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                This rate will be pre-filled when employees request advances. Set to 0 for interest-free advances.
              </p>
            </div>
          </div>
        </div>

        {/* Amount Limits */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center mb-4">
            <IndianRupee className="h-5 w-5 mr-2 text-blue-500" />
            Amount Limits
          </h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="max-w-md">
              <label htmlFor="max-advance-amount" className="block text-sm font-medium text-gray-700">
                Maximum Advance Amount
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="max-advance-amount"
                  step="0.01"
                  // min="0"
                  value={formData.max_advance_amount || ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      max_advance_amount: e.target.value ? parseFloat(e.target.value) : null,
                    })
                  }
                  className={`shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    errors.max_advance_amount ? 'border-red-300' : ''
                  }`}
                  placeholder="Leave empty for no limit"
                />
              </div>
              {errors.max_advance_amount && (
                <p className="mt-2 text-sm text-red-600">{errors.max_advance_amount}</p>
              )}
              <p className="mt-2 text-sm text-gray-500">
                Set the maximum amount an employee can request as an advance. Leave empty for no limit.
              </p>
            </div>
          </div>
        </div>

        {/* Installment Configuration */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center mb-4">
            <Calendar className="h-5 w-5 mr-2 text-blue-500" />
            Installment Configuration
          </h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2 max-w-2xl">
              <div>
                <label htmlFor="min-installments" className="block text-sm font-medium text-gray-700">
                  Minimum Installments
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="min-installments"
                    min="1"
                    max="60"
                    value={formData.min_installments}
                    onChange={(e) =>
                      setFormData({ ...formData, min_installments: parseInt(e.target.value) || 1 })
                    }
                    className={`shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                      errors.min_installments ? 'border-red-300' : ''
                    }`}
                  />
                </div>
                {errors.min_installments && (
                  <p className="mt-2 text-sm text-red-600">{errors.min_installments}</p>
                )}
                <p className="mt-2 text-sm text-gray-500">Minimum number of months for repayment</p>
              </div>

              <div>
                <label htmlFor="max-installments" className="block text-sm font-medium text-gray-700">
                  Maximum Installments
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="max-installments"
                    min="1"
                    max="60"
                    value={formData.max_installments}
                    onChange={(e) =>
                      setFormData({ ...formData, max_installments: parseInt(e.target.value) || 24 })
                    }
                    className={`shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                      errors.max_installments ? 'border-red-300' : ''
                    }`}
                  />
                </div>
                {errors.max_installments && (
                  <p className="mt-2 text-sm text-red-600">{errors.max_installments}</p>
                )}
                <p className="mt-2 text-sm text-gray-500">Maximum number of months for repayment</p>
              </div>
            </div>
          </div>
        </div>

        {/* Policy Settings */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center mb-4">
            <Users className="h-5 w-5 mr-2 text-blue-500" />
            Advance Policies
          </h3>
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            {/* <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="allow-multiple-advances"
                  type="checkbox"
                  checked={formData.allow_multiple_advances}
                  onChange={(e) =>
                    setFormData({ ...formData, allow_multiple_advances: e.target.checked })
                  }
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="allow-multiple-advances" className="font-medium text-gray-700">
                  Allow Multiple Active Advances
                </label>
                <p className="text-gray-500">
                  When enabled, employees can have more than one active or pending advance at the same time.
                  When disabled, employees must fully repay existing advances before requesting new ones.
                </p>
              </div>
            </div> */}

            <div className="flex items-start">
              <div className="flex items-center h-5">
                <input
                  id="require-justification"
                  type="checkbox"
                  checked={formData.require_justification}
                  onChange={(e) =>
                    setFormData({ ...formData, require_justification: e.target.checked })
                  }
                  className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300 rounded"
                />
              </div>
              <div className="ml-3 text-sm">
                <label htmlFor="require-justification" className="font-medium text-gray-700 flex items-center">
                  <FileText className="h-4 w-4 mr-1" />
                  Require Justification
                </label>
                <p className="text-gray-500">
                  When enabled, employees must provide a justification/reason when requesting an advance.
                  This helps management understand the need for the advance.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Information Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <CheckCircle className="h-5 w-5 text-blue-400" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-blue-800">Settings Impact</h3>
              <div className="mt-2 text-sm text-blue-700">
                <ul className="list-disc list-inside space-y-1">
                  <li>These settings will apply to all new advance requests</li>
                  <li>Existing pending or active advances will not be affected</li>
                  <li>Changes take effect immediately after saving</li>
                  <li>Approvers can still modify terms during the approval process</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-5 border-t border-gray-200">
          <div className="flex">
            <button
              type="submit"
              disabled={loading || isSaving}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
