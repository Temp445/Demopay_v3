import React, { useState, useEffect } from 'react';
import { X, Save, DollarSign } from 'lucide-react';
import { useStructureAssignmentsStore } from '../../../stores/structureAssignmentsStore';

interface EditIndividualValuesModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: {
    assignment_id: string;
    employee_code: string;
    employee_name: string;
    individual_component_values: Record<string, number>;
  };
  individualComponents: Array<{
    id?: string;
    name: string;
    component_type: 'earning' | 'deduction';
    description?: string;
  }>;
}

export default function EditIndividualValuesModal({
  isOpen,
  onClose,
  assignment,
  individualComponents,
}: EditIndividualValuesModalProps) {
  const { updateIndividualValues } = useStructureAssignmentsStore();
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && assignment) {
      // Initialize with existing values or empty strings
      // UPDATED: Use component IDs instead of names
      const initialValues: Record<string, string> = {};
      individualComponents.forEach((comp) => {
        if (comp.id) {
          const existingValue = assignment.individual_component_values?.[comp.id];
          initialValues[comp.id] = existingValue != null ? String(existingValue) : '';
        }
      });
      setValues(initialValues);
      setErrors({});
    }
  }, [isOpen, assignment, individualComponents]);

  // UPDATED: Use componentId instead of componentName
  const handleValueChange = (componentId: string, value: string) => {
    setValues((prev) => ({ ...prev, [componentId]: value }));

    // Clear error for this field
    if (errors[componentId]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[componentId];
        return newErrors;
      });
    }
  };

  const validateValues = (): boolean => {
    const newErrors: Record<string, string> = {};
    let isValid = true;

    // UPDATED: Use component IDs instead of names for validation
    individualComponents.forEach((comp) => {
      if (!comp.id) return;

      const value = values[comp.id];

      if (!value || value.trim() === '') {
        newErrors[comp.id] = 'This field is required';
        isValid = false;
      } else {
        const numValue = parseFloat(value);
        if (isNaN(numValue)) {
          newErrors[comp.id] = 'Please enter a valid number';
          isValid = false;
        } else if (numValue < 0) {
          newErrors[comp.id] = 'Value cannot be negative';
          isValid = false;
        }
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const handleSave = async () => {
    if (!validateValues()) {
      return;
    }

    setIsSubmitting(true);
    try {
      // Convert string values to numbers
      const numericValues: Record<string, number> = {};
      Object.entries(values).forEach(([key, value]) => {
        numericValues[key] = parseFloat(value);
      });

      await updateIndividualValues(assignment.assignment_id, numericValues);
      onClose();
    } catch (error) {
      console.error('Error updating individual values:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const earnings = individualComponents.filter((c) => c.component_type === 'earning');
  const deductions = individualComponents.filter((c) => c.component_type === 'deduction');

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onClose} />

        <div className="inline-block w-full max-w-3xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  Edit Individual Component Values
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  Employee: <span className="font-medium">{assignment.employee_code}</span> -{' '}
                  {assignment.employee_name}
                </p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[60vh] overflow-y-auto">
            <div className="space-y-6">
              {/* Earnings Section */}
              {earnings.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <div className="h-1 w-1 rounded-full bg-green-500 mr-2"></div>
                    Earnings Components
                  </h4>
                  <div className="space-y-4">
                    {/* UPDATED: Use component IDs for data storage while displaying component names */}
                    {earnings.map((comp) => (
                      <div key={comp.id || comp.name}>
                        <label className="block text-sm font-medium text-gray-700">
                          {comp.name}
                          {comp.description && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({comp.description})
                            </span>
                          )}
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">₹</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={`block w-full pl-7 pr-3 py-2 border ${
                              comp.id && errors[comp.id]
                                ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                                : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                            } rounded-md sm:text-sm`}
                            placeholder="0.00"
                            value={comp.id ? (values[comp.id] || '') : ''}
                            onChange={(e) => comp.id && handleValueChange(comp.id, e.target.value)}
                          />
                        </div>
                        {comp.id && errors[comp.id] && (
                          <p className="mt-1 text-sm text-red-600">{errors[comp.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Deductions Section */}
              {deductions.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <div className="h-1 w-1 rounded-full bg-red-500 mr-2"></div>
                    Deduction Components
                  </h4>
                  <div className="space-y-4">
                    {/* UPDATED: Use component IDs for data storage while displaying component names */}
                    {deductions.map((comp) => (
                      <div key={comp.id || comp.name}>
                        <label className="block text-sm font-medium text-gray-700">
                          {comp.name}
                          {comp.description && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({comp.description})
                            </span>
                          )}
                        </label>
                        <div className="mt-1 relative rounded-md shadow-sm">
                          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <span className="text-gray-500 sm:text-sm">₹</span>
                          </div>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            className={`block w-full pl-7 pr-3 py-2 border ${
                              comp.id && errors[comp.id]
                                ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                                : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                            } rounded-md sm:text-sm`}
                            placeholder="0.00"
                            value={comp.id ? (values[comp.id] || '') : ''}
                            onChange={(e) => comp.id && handleValueChange(comp.id, e.target.value)}
                          />
                        </div>
                        {comp.id && errors[comp.id] && (
                          <p className="mt-1 text-sm text-red-600">{errors[comp.id]}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {individualComponents.length === 0 && (
                <div className="py-8 text-center">
                  <DollarSign className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900">
                    No individual components
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    This salary structure has no individual components to configure.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSubmitting}
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSubmitting ? 'Saving...' : 'Save Values'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
