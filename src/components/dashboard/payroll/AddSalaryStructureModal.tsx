import React, { useState } from 'react';
import { X, Plus, Trash2, DollarSign, Percent } from 'lucide-react';
import { useAuth } from '../../../contexts/AuthContext';
import { useSalaryStructuresStore, type SalaryStructure, type SalaryStructureComponent } from '../../../stores/salaryStructuresStore';

interface AddSalaryStructureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStructureCreated: () => void;
}

export default function AddSalaryStructureModal({
  isOpen,
  onClose,
  onStructureCreated
}: AddSalaryStructureModalProps) {
  const { createSalaryStructure } = useSalaryStructuresStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();

  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    is_active: boolean;
    components: SalaryStructureComponent[];
  }>({
    name: '',
    description: '',
    is_active: true,
    components: [{
      key: '',
      name: '',
      component_type: 'earning',
      calculation_method: 'fixed',
      percentage_value: '',
      is_taxable: true,
      display_order: 0
    }]
  });

  const addComponent = () => {
    setFormData(prev => ({
      ...prev,
      components: [
        ...prev.components,
        {
          key: '',
          name: '',
          component_type: 'earning',
          calculation_method: 'fixed',
          percentage_value: '',
          is_taxable: true,
          display_order: prev.components.length
        }
      ]
    }));
  };

  const removeComponent = (index: number) => {
    if (formData.components.length > 1) {
      setFormData(prev => ({
        ...prev,
        components: prev.components.filter((_, i) => i !== index)
      }));
    }
  };

  const updateComponent = (index: number, updates: Partial<SalaryStructureComponent>) => {
    setFormData(prev => ({
      ...prev,
      components: prev.components.map((comp, i) => 
        i === index ? { ...comp, ...updates } : comp
      )
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);
      setError(null);

      // Validate components
      const invalidComponent = formData.components.find(comp => {
        if (!comp.name.trim()) return true;
        if  (!comp.percentage_value || parseFloat(comp.percentage_value) <= 0) return true;
        return false;
      });

      if (invalidComponent) {
        throw new Error('Please fill in all required component fields correctly');
      }

      await createSalaryStructure(formData);
      onStructureCreated();
      onClose();

      // Reset form
      setFormData({
        name: '',
        description: '',
        is_active: true,
        components: [{
          key: '',
          name: '',
          component_type: 'earning',
          calculation_method: 'fixed',
          percentage_value: '',
          is_taxable: true,
          display_order: 0
        }]
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create salary structure');
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
              onClick={onClose}
              className="bg-white rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <span className="sr-only">Close</span>
              <X className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          <div className="sm:flex sm:items-start">
            <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                Create Salary Structure
              </h3>

              {error && (
                <div className="mt-2 rounded-md bg-red-50 p-4">
                  <div className="text-sm text-red-700">{error}</div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-6 space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    Structure Name
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

                <div>
                  <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                    Description
                  </label>
                  <textarea
                    id="description"
                    rows={3}
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  />
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

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">Components</h4>
                    <button
                      type="button"
                      onClick={addComponent}
                      className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-indigo-700 bg-indigo-100 hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Component
                    </button>
                  </div>

                  {formData.components.map((component, index) => (
                    <div key={index} className="bg-gray-50 p-4 rounded-lg">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Component Name
                          </label>
                          <input
                            type="text"
                            required
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value={component.name}
                            onChange={(e) => updateComponent(index, { name: e.target.value })}
                            aria-label='Component Name'
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Component Type
                          </label>
                          <select
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value={component.component_type}
                            onChange={(e) => updateComponent(index, { 
                              component_type: e.target.value as 'earning' | 'deduction' 
                            })}
                            aria-label='Component Type'
                          >
                            <option value="earning">Earning</option>
                            <option value="deduction">Deduction</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700">
                            Calculation Method
                          </label>
                          <select
                            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                            value={component.calculation_method}
                            onChange={(e) => updateComponent(index, { 
                              calculation_method: e.target.value as 'fixed' | 'percentage',
                              percentage_value: ''
                            })}
                            aria-label='Calculation Method'
                          >
                            <option value="fixed">Fixed Amount</option>
                            <option value="percentage">Percentage</option>
                          </select>
                        </div>

                        <div>
                          {component.calculation_method === 'fixed' ? (
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Amount
                              </label>
                              <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <DollarSign className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  step="0.01"
                                  className="block w-full pl-10 pr-12 sm:text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                  value={component.percentage_value || ''}
                                  onChange={(e) => updateComponent(index, { 
                                    percentage_value: parseFloat(e.target.value).toString(2) 
                                  })}
                                  aria-label='Amount'
                                />
                              </div>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-sm font-medium text-gray-700">
                                Percentage
                              </label>
                              <div className="mt-1 relative rounded-md shadow-sm">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                  <Percent className="h-5 w-5 text-gray-400" />
                                </div>
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  max="100"
                                  step="0.01"
                                  className="block w-full pl-10 pr-12 sm:text-sm border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                                  value={component.percentage_value || ''}
                                  onChange={(e) => updateComponent(index, { 
                                    percentage_value: parseFloat(e.target.value).toString(2) 
                                  })}
                                  aria-label='Percentage'
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-4 space-y-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id={`is_taxable_${index}`}
                            className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                            checked={component.is_taxable}
                            onChange={(e) => updateComponent(index, { 
                              is_taxable: e.target.checked 
                            })}
                          />
                          <label htmlFor={`is_taxable_${index}`} className="ml-2 block text-sm text-gray-900">
                            Taxable
                          </label>
                        </div>

                        {formData.components.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeComponent(index)}
                            className="inline-flex items-center px-2 py-1 border border-transparent text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50"
                  >
                    {loading ? 'Creating...' : 'Create Structure'}
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