import React, { useState } from 'react';
import { DollarSign, Percent, Clock, Calendar, Database, FileText, Sliders } from 'lucide-react';

interface FunctionalSettingsProps {
  onSave: (data: any) => void;
  isSaving: boolean;
}

export default function FunctionalSettings({ onSave, isSaving }: FunctionalSettingsProps) {
  const [formData, setFormData] = useState({
    // Salary Components
    defaultSalaryComponents: [
      { id: '1', name: 'Basic Salary', type: 'earning', taxable: true, default: true },
      { id: '2', name: 'House Rent Allowance', type: 'earning', taxable: false, default: true },
      { id: '3', name: 'Transport Allowance', type: 'earning', taxable: true, default: true },
      { id: '4', name: 'Income Tax', type: 'deduction', taxable: false, default: true },
      { id: '5', name: 'Provident Fund', type: 'deduction', taxable: false, default: true }
    ],
    
    // Tax Settings
    taxCalculationMethod: 'progressive',
    taxBrackets: [
      { id: '1', min: 0, max: 10000, rate: 0 },
      { id: '2', min: 10001, max: 50000, rate: 10 },
      { id: '3', min: 50001, max: 100000, rate: 20 },
      { id: '4', min: 100001, max: null, rate: 30 }
    ],
    
    // Overtime Settings
    overtimeEnabled: true,
    overtimeRate: 1.5,
    overtimeCalculationMethod: 'hourly',
    overtimeMinimumMinutes: 30,
    
    // Leave Settings
    leaveTypes: [
      { id: '1', name: 'Annual Leave', defaultDays: 20, paid: true, carryOver: true, carryOverLimit: 5 },
      { id: '2', name: 'Sick Leave', defaultDays: 10, paid: true, carryOver: false, carryOverLimit: 0 },
      { id: '3', name: 'Unpaid Leave', defaultDays: 0, paid: false, carryOver: false, carryOverLimit: 0 }
    ],
    
    // Attendance Settings
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    workHoursPerDay: 8,
    gracePeriodMinutes: 15,
    halfDayThresholdHours: 4,
    
    // Audit Settings
    enableAuditTrail: true,
    auditTrailRetentionDays: 365,
    
    // Data Retention
    payrollDataRetentionYears: 7,
    employeeDataRetentionYears: 5,
    attendanceDataRetentionYears: 3,
    
    // Calculation Precision
    salaryPrecision: 2,
    taxPrecision: 2,
    percentagePrecision: 4
  });

  const [newComponent, setNewComponent] = useState({ name: '', type: 'earning', taxable: true });
  const [newTaxBracket, setNewTaxBracket] = useState({ min: '', max: '', rate: '' });
  const [newLeaveType, setNewLeaveType] = useState({ name: '', defaultDays: 0, paid: true, carryOver: false, carryOverLimit: 0 });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    // Validate overtime rate
    if (formData.overtimeEnabled && (formData.overtimeRate <= 0 || formData.overtimeRate > 3)) {
      errors.overtimeRate = 'Overtime rate must be between 0 and 3';
    }
    
    // Validate tax brackets
    const sortedBrackets = [...formData.taxBrackets].sort((a, b) => a.min - b.min);
    for (let i = 0; i < sortedBrackets.length - 1; i++) {
      if (sortedBrackets[i].max !== null && sortedBrackets[i].max >= sortedBrackets[i + 1].min) {
        errors.taxBrackets = 'Tax brackets must not overlap';
        break;
      }
    }
    
    // Validate retention periods
    if (formData.payrollDataRetentionYears < 1) {
      errors.payrollDataRetention = 'Payroll data retention must be at least 1 year';
    }
    
    if (formData.employeeDataRetentionYears < 1) {
      errors.employeeDataRetention = 'Employee data retention must be at least 1 year';
    }
    
    if (formData.attendanceDataRetentionYears < 1) {
      errors.attendanceDataRetention = 'Attendance data retention must be at least 1 year';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (validateForm()) {
      onSave(formData);
    }
  };

  const handleAddSalaryComponent = () => {
    if (newComponent.name.trim()) {
      const newId = (Math.max(...formData.defaultSalaryComponents.map(c => parseInt(c.id))) + 1).toString();
      
      setFormData({
        ...formData,
        defaultSalaryComponents: [
          ...formData.defaultSalaryComponents,
          { 
            id: newId, 
            name: newComponent.name, 
            type: newComponent.type, 
            taxable: newComponent.taxable,
            default: false
          }
        ]
      });
      
      setNewComponent({ name: '', type: 'earning', taxable: true });
    }
  };

  const handleRemoveSalaryComponent = (id: string) => {
    setFormData({
      ...formData,
      defaultSalaryComponents: formData.defaultSalaryComponents.filter(comp => comp.id !== id)
    });
  };

  const handleAddTaxBracket = () => {
    if (newTaxBracket.min && newTaxBracket.rate) {
      const newId = (Math.max(...formData.taxBrackets.map(b => parseInt(b.id))) + 1).toString();
      
      setFormData({
        ...formData,
        taxBrackets: [
          ...formData.taxBrackets,
          { 
            id: newId, 
            min: parseInt(newTaxBracket.min), 
            max: newTaxBracket.max ? parseInt(newTaxBracket.max) : null, 
            rate: parseInt(newTaxBracket.rate)
          }
        ].sort((a, b) => a.min - b.min)
      });
      
      setNewTaxBracket({ min: '', max: '', rate: '' });
    }
  };

  const handleRemoveTaxBracket = (id: string) => {
    setFormData({
      ...formData,
      taxBrackets: formData.taxBrackets.filter(bracket => bracket.id !== id)
    });
  };

  const handleAddLeaveType = () => {
    if (newLeaveType.name.trim()) {
      const newId = (Math.max(...formData.leaveTypes.map(l => parseInt(l.id))) + 1).toString();
      
      setFormData({
        ...formData,
        leaveTypes: [
          ...formData.leaveTypes,
          { 
            id: newId, 
            name: newLeaveType.name, 
            defaultDays: newLeaveType.defaultDays,
            paid: newLeaveType.paid,
            carryOver: newLeaveType.carryOver,
            carryOverLimit: newLeaveType.carryOverLimit
          }
        ]
      });
      
      setNewLeaveType({ name: '', defaultDays: 0, paid: true, carryOver: false, carryOverLimit: 0 });
    }
  };

  const handleRemoveLeaveType = (id: string) => {
    setFormData({
      ...formData,
      leaveTypes: formData.leaveTypes.filter(type => type.id !== id)
    });
  };

  const handleWorkingDayToggle = (day: string) => {
    const newWorkingDays = formData.workingDays.includes(day)
      ? formData.workingDays.filter(d => d !== day)
      : [...formData.workingDays, day];
    
    setFormData({
      ...formData,
      workingDays: newWorkingDays
    });
  };

  return (
    <div>
      <h2 className="text-lg font-medium text-gray-900">Functional Settings</h2>
      <p className="mt-1 text-sm text-gray-500">
        Configure salary components, tax rules, leave policies, and system-wide settings.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-8">
        {/* Salary Components */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <DollarSign className="h-5 w-5 mr-2 text-indigo-500" />
            Salary Components
          </h3>
          <div className="mt-4">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Component Name
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Taxable
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Default
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {formData.defaultSalaryComponents.map((component) => (
                    <tr key={component.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {component.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                          component.type === 'earning' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {component.type === 'earning' ? 'Earning' : 'Deduction'}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {component.taxable ? 'Yes' : 'No'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {component.default ? 'Yes' : 'No'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-900"
                          onClick={() => handleRemoveSalaryComponent(component.id)}
                          disabled={component.default}
                        >
                          {component.default ? 'Default' : 'Remove'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label htmlFor="new-component-name" className="block text-sm font-medium text-gray-700">
                  New Component Name
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="new-component-name"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newComponent.name}
                    onChange={(e) => setNewComponent({ ...newComponent, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="new-component-type" className="block text-sm font-medium text-gray-700">
                  Type
                </label>
                <div className="mt-1">
                  <select
                    id="new-component-type"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newComponent.type}
                    onChange={(e) => setNewComponent({ ...newComponent, type: e.target.value as 'earning' | 'deduction' })}
                  >
                    <option value="earning">Earning</option>
                    <option value="deduction">Deduction</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-1">
                <label htmlFor="new-component-taxable" className="block text-sm font-medium text-gray-700">
                  Taxable
                </label>
                <div className="mt-1">
                  <select
                    id="new-component-taxable"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newComponent.taxable ? 'yes' : 'no'}
                    onChange={(e) => setNewComponent({ ...newComponent, taxable: e.target.value === 'yes' })}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-1 flex items-end">
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  onClick={handleAddSalaryComponent}
                  disabled={!newComponent.name}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tax Calculation Settings */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Percent className="h-5 w-5 mr-2 text-indigo-500" />
            Tax Calculation Settings
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label htmlFor="tax-calculation-method" className="block text-sm font-medium text-gray-700">
                Tax Calculation Method
              </label>
              <div className="mt-1">
                <select
                  id="tax-calculation-method"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.taxCalculationMethod}
                  onChange={(e) => setFormData({ ...formData, taxCalculationMethod: e.target.value })}
                >
                  <option value="progressive">Progressive (Tax Brackets)</option>
                  <option value="flat">Flat Rate</option>
                  <option value="custom">Custom Formula</option>
                </select>
              </div>
            </div>

            {formData.taxCalculationMethod === 'progressive' && (
              <div className="sm:col-span-6">
                <label className="block text-sm font-medium text-gray-700">
                  Tax Brackets
                </label>
                <div className="mt-2">
                  <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                    <table className="min-w-full divide-y divide-gray-300">
                      <thead className="bg-gray-50">
                        <tr>
                          <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                            Min Income
                          </th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Max Income
                          </th>
                          <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                            Tax Rate (%)
                          </th>
                          <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {formData.taxBrackets.map((bracket) => (
                          <tr key={bracket.id}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                              {bracket.min.toLocaleString()}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {bracket.max !== null ? bracket.max.toLocaleString() : 'No Limit'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {bracket.rate}%
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <button
                                type="button"
                                className="text-red-600 hover:text-red-900"
                                onClick={() => handleRemoveTaxBracket(bracket.id)}
                              >
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
                    <div className="sm:col-span-2">
                      <label htmlFor="new-bracket-min" className="block text-sm font-medium text-gray-700">
                        Min Income
                      </label>
                      <div className="mt-1">
                        <input
                          type="number"
                          id="new-bracket-min"
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          value={newTaxBracket.min}
                          onChange={(e) => setNewTaxBracket({ ...newTaxBracket, min: e.target.value })}
                          min="0"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-2">
                      <label htmlFor="new-bracket-max" className="block text-sm font-medium text-gray-700">
                        Max Income (leave empty for no limit)
                      </label>
                      <div className="mt-1">
                        <input
                          type="number"
                          id="new-bracket-max"
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          value={newTaxBracket.max}
                          onChange={(e) => setNewTaxBracket({ ...newTaxBracket, max: e.target.value })}
                          min={newTaxBracket.min ? parseInt(newTaxBracket.min) + 1 : 1}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-1">
                      <label htmlFor="new-bracket-rate" className="block text-sm font-medium text-gray-700">
                        Tax Rate (%)
                      </label>
                      <div className="mt-1">
                        <input
                          type="number"
                          id="new-bracket-rate"
                          className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                          value={newTaxBracket.rate}
                          onChange={(e) => setNewTaxBracket({ ...newTaxBracket, rate: e.target.value })}
                          min="0"
                          max="100"
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-1 flex items-end">
                      <button
                        type="button"
                        className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        onClick={handleAddTaxBracket}
                        disabled={!newTaxBracket.min || !newTaxBracket.rate}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
                {validationErrors.taxBrackets && (
                  <p className="mt-2 text-sm text-red-600">{validationErrors.taxBrackets}</p>
                )}
              </div>
            )}

            {formData.taxCalculationMethod === 'flat' && (
              <div className="sm:col-span-3">
                <label htmlFor="flat-tax-rate" className="block text-sm font-medium text-gray-700">
                  Flat Tax Rate (%)
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="flat-tax-rate"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={formData.taxBrackets[0]?.rate || 0}
                    onChange={(e) => setFormData({
                      ...formData,
                      taxBrackets: [{ id: '1', min: 0, max: null, rate: parseInt(e.target.value) }]
                    })}
                    min="0"
                    max="100"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Overtime Settings */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-indigo-500" />
            Overtime Settings
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="overtime-enabled"
                    type="checkbox"
                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    checked={formData.overtimeEnabled}
                    onChange={(e) => setFormData({ ...formData, overtimeEnabled: e.target.checked })}
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="overtime-enabled" className="font-medium text-gray-700">
                    Enable Overtime Calculation
                  </label>
                  <p className="text-gray-500">Allow overtime hours to be tracked and paid</p>
                </div>
              </div>
            </div>

            {formData.overtimeEnabled && (
              <>
                <div className="sm:col-span-3">
                  <label htmlFor="overtime-rate" className="block text-sm font-medium text-gray-700">
                    Overtime Rate Multiplier
                  </label>
                  <div className="mt-1">
                    <input
                      type="number"
                      id="overtime-rate"
                      className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                        validationErrors.overtimeRate ? 'border-red-300' : ''
                      }`}
                      value={formData.overtimeRate}
                      onChange={(e) => setFormData({ ...formData, overtimeRate: parseFloat(e.target.value) })}
                      step="0.1"
                      min="1"
                      max="3"
                    />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Standard is 1.5x regular pay rate
                  </p>
                  {validationErrors.overtimeRate && (
                    <p className="mt-2 text-sm text-red-600">{validationErrors.overtimeRate}</p>
                  )}
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="overtime-calculation-method" className="block text-sm font-medium text-gray-700">
                    Calculation Method
                  </label>
                  <div className="mt-1">
                    <select
                      id="overtime-calculation-method"
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      value={formData.overtimeCalculationMethod}
                      onChange={(e) => setFormData({ ...formData, overtimeCalculationMethod: e.target.value })}
                    >
                      <option value="hourly">Hourly Rate</option>
                      <option value="daily">Daily Rate</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>
                </div>

                <div className="sm:col-span-3">
                  <label htmlFor="overtime-minimum" className="block text-sm font-medium text-gray-700">
                    Minimum Minutes for Overtime
                  </label>
                  <div className="mt-1">
                    <input
                      type="number"
                      id="overtime-minimum"
                      className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                      value={formData.overtimeMinimumMinutes}
                      onChange={(e) => setFormData({ ...formData, overtimeMinimumMinutes: parseInt(e.target.value) })}
                      min="0"
                      step="5"
                    />
                  </div>
                  <p className="mt-1 text-sm text-gray-500">
                    Minimum time required to qualify for overtime
                  </p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Leave Settings */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Calendar className="h-5 w-5 mr-2 text-indigo-500" />
            Leave Settings
          </h3>
          <div className="mt-4">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Leave Type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Default Days
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Paid
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Carry Over
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Carry Over Limit
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {formData.leaveTypes.map((leaveType) => (
                    <tr key={leaveType.id}>
                      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                        {leaveType.name}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {leaveType.defaultDays}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {leaveType.paid ? 'Yes' : 'No'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {leaveType.carryOver ? 'Yes' : 'No'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                        {leaveType.carryOver ? leaveType.carryOverLimit : 'N/A'}
                      </td>
                      <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-900"
                          onClick={() => handleRemoveLeaveType(leaveType.id)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <label htmlFor="new-leave-type" className="block text-sm font-medium text-gray-700">
                  New Leave Type
                </label>
                <div className="mt-1">
                  <input
                    type="text"
                    id="new-leave-type"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newLeaveType.name}
                    onChange={(e) => setNewLeaveType({ ...newLeaveType, name: e.target.value })}
                  />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label htmlFor="new-leave-days" className="block text-sm font-medium text-gray-700">
                  Default Days
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="new-leave-days"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newLeaveType.defaultDays}
                    onChange={(e) => setNewLeaveType({ ...newLeaveType, defaultDays: parseInt(e.target.value) })}
                    min="0"
                  />
                </div>
              </div>

              <div className="sm:col-span-1">
                <label htmlFor="new-leave-paid" className="block text-sm font-medium text-gray-700">
                  Paid
                </label>
                <div className="mt-1">
                  <select
                    id="new-leave-paid"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newLeaveType.paid ? 'yes' : 'no'}
                    onChange={(e) => setNewLeaveType({ ...newLeaveType, paid: e.target.value === 'yes' })}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-1">
                <label htmlFor="new-leave-carry" className="block text-sm font-medium text-gray-700">
                  Carry Over
                </label>
                <div className="mt-1">
                  <select
                    id="new-leave-carry"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={newLeaveType.carryOver ? 'yes' : 'no'}
                    onChange={(e) => setNewLeaveType({ ...newLeaveType, carryOver: e.target.value === 'yes' })}
                  >
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-1 flex items-end">
                <button
                  type="button"
                  className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  onClick={handleAddLeaveType}
                  disabled={!newLeaveType.name}
                >
                  Add
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Attendance Settings */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Clock className="h-5 w-5 mr-2 text-indigo-500" />
            Attendance Settings
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <label className="block text-sm font-medium text-gray-700">
                Working Days
              </label>
              <div className="mt-2 flex flex-wrap gap-3">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day) => (
                  <div key={day} className="flex items-center">
                    <input
                      id={`day-${day}`}
                      type="checkbox"
                      className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                      checked={formData.workingDays.includes(day)}
                      onChange={() => handleWorkingDayToggle(day)}
                    />
                    <label htmlFor={`day-${day}`} className="ml-2 text-sm text-gray-700">
                      {day}
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="work-hours" className="block text-sm font-medium text-gray-700">
                Work Hours Per Day
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="work-hours"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.workHoursPerDay}
                  onChange={(e) => setFormData({ ...formData, workHoursPerDay: parseInt(e.target.value) })}
                  min="1"
                  max="24"
                />
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="grace-period" className="block text-sm font-medium text-gray-700">
                Grace Period (minutes)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="grace-period"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.gracePeriodMinutes}
                  onChange={(e) => setFormData({ ...formData, gracePeriodMinutes: parseInt(e.target.value) })}
                  min="0"
                  max="60"
                />
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Time allowed after shift start before marked late
              </p>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="half-day-threshold" className="block text-sm font-medium text-gray-700">
                Half Day Threshold (hours)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="half-day-threshold"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.halfDayThresholdHours}
                  onChange={(e) => setFormData({ ...formData, halfDayThresholdHours: parseInt(e.target.value) })}
                  min="1"
                  max={formData.workHoursPerDay}
                />
              </div>
              <p className="mt-1 text-sm text-gray-500">
                Hours worked to qualify as half day
              </p>
            </div>
          </div>
        </div>

        {/* Audit and Data Retention */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Database className="h-5 w-5 mr-2 text-indigo-500" />
            Audit Trail and Data Retention
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-6">
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="audit-trail"
                    type="checkbox"
                    className="focus:ring-indigo-500 h-4 w-4 text-indigo-600 border-gray-300 rounded"
                    checked={formData.enableAuditTrail}
                    onChange={(e) => setFormData({ ...formData, enableAuditTrail: e.target.checked })}
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="audit-trail" className="font-medium text-gray-700">
                    Enable Audit Trail
                  </label>
                  <p className="text-gray-500">Track all changes made to payroll and employee data</p>
                </div>
              </div>
            </div>

            {formData.enableAuditTrail && (
              <div className="sm:col-span-3">
                <label htmlFor="audit-retention" className="block text-sm font-medium text-gray-700">
                  Audit Trail Retention (days)
                </label>
                <div className="mt-1">
                  <input
                    type="number"
                    id="audit-retention"
                    className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                    value={formData.auditTrailRetentionDays}
                    onChange={(e) => setFormData({ ...formData, auditTrailRetentionDays: parseInt(e.target.value) })}
                    min="30"
                  />
                </div>
              </div>
            )}

            <div className="sm:col-span-2">
              <label htmlFor="payroll-retention" className="block text-sm font-medium text-gray-700">
                Payroll Data Retention (years)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="payroll-retention"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.payrollDataRetention ? 'border-red-300' : ''
                  }`}
                  value={formData.payrollDataRetentionYears}
                  onChange={(e) => setFormData({ ...formData, payrollDataRetentionYears: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
              {validationErrors.payrollDataRetention && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.payrollDataRetention}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="employee-retention" className="block text-sm font-medium text-gray-700">
                Employee Data Retention (years)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="employee-retention"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.employeeDataRetention ? 'border-red-300' : ''
                  }`}
                  value={formData.employeeDataRetentionYears}
                  onChange={(e) => setFormData({ ...formData, employeeDataRetentionYears: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
              {validationErrors.employeeDataRetention && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.employeeDataRetention}</p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="attendance-retention" className="block text-sm font-medium text-gray-700">
                Attendance Data Retention (years)
              </label>
              <div className="mt-1">
                <input
                  type="number"
                  id="attendance-retention"
                  className={`shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md ${
                    validationErrors.attendanceDataRetention ? 'border-red-300' : ''
                  }`}
                  value={formData.attendanceDataRetentionYears}
                  onChange={(e) => setFormData({ ...formData, attendanceDataRetentionYears: parseInt(e.target.value) })}
                  min="1"
                />
              </div>
              {validationErrors.attendanceDataRetention && (
                <p className="mt-2 text-sm text-red-600">{validationErrors.attendanceDataRetention}</p>
              )}
            </div>
          </div>
        </div>

        {/* Calculation Precision */}
        <div>
          <h3 className="text-md font-medium text-gray-900 flex items-center">
            <Sliders className="h-5 w-5 mr-2 text-indigo-500" />
            Calculation Precision
          </h3>
          <div className="mt-4 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-6">
            <div className="sm:col-span-2">
              <label htmlFor="salary-precision" className="block text-sm font-medium text-gray-700">
                Salary Decimal Places
              </label>
              <div className="mt-1">
                <select
                  id="salary-precision"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.salaryPrecision}
                  onChange={(e) => setFormData({ ...formData, salaryPrecision: parseInt(e.target.value) })}
                >
                  <option value="0">0 (Whole Numbers)</option>
                  <option value="1">1 (Tenths)</option>
                  <option value="2">2 (Cents/Pennies)</option>
                  <option value="3">3 (Thousandths)</option>
                  <option value="4">4 (Ten Thousandths)</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="tax-precision" className="block text-sm font-medium text-gray-700">
                Tax Decimal Places
              </label>
              <div className="mt-1">
                <select
                  id="tax-precision"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.taxPrecision}
                  onChange={(e) => setFormData({ ...formData, taxPrecision: parseInt(e.target.value) })}
                >
                  <option value="0">0 (Whole Numbers)</option>
                  <option value="1">1 (Tenths)</option>
                  <option value="2">2 (Cents/Pennies)</option>
                  <option value="3">3 (Thousandths)</option>
                  <option value="4">4 (Ten Thousandths)</option>
                </select>
              </div>
            </div>

            <div className="sm:col-span-2">
              <label htmlFor="percentage-precision" className="block text-sm font-medium text-gray-700">
                Percentage Decimal Places
              </label>
              <div className="mt-1">
                <select
                  id="percentage-precision"
                  className="shadow-sm focus:ring-indigo-500 focus:border-indigo-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  value={formData.percentagePrecision}
                  onChange={(e) => setFormData({ ...formData, percentagePrecision: parseInt(e.target.value) })}
                >
                  <option value="0">0 (Whole Numbers)</option>
                  <option value="1">1 (Tenths)</option>
                  <option value="2">2 (Hundredths)</option>
                  <option value="3">3 (Thousandths)</option>
                  <option value="4">4 (Ten Thousandths)</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-5 border-t border-gray-200">
          <div className="flex justify-end">
            <button
              type="button"
              className="bg-white py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="ml-3 inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              {isSaving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}