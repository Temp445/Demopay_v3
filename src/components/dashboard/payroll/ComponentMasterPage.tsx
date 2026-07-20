import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Search, Filter, X, Code } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { getTenantId } from '../../../lib/tenantDb';
import toast from 'react-hot-toast';
import FormulaBuilderPage from '../formula-builder/FormulaBuilderPage';

interface PayrollComponent {
  id: string;
  name: string;
  description?: string;
  component_type: 'earning' | 'deduction';
  component_category: 'general' | 'calculation';
  type_selection: 'common' | 'individual';
  amount_type: 'value' | 'percentage'; // CHANGED: Removed 'expression' option
  calculation_type: 'simple' | 'expression'; // NEW: Added calculation_type field
  value_set?: 'master_entry' | 'at_structure' | 'at_executing';
  // REMOVED: is_attendance_linked and always_treat_as_full_day fields
  is_active: boolean;
  eligibility?: 'all' | 'condition';
  eligibility_expression?: string;
  eligibility_expression_ast?: any;
  rounding_type?: 'none' | 'round' | 'floor' | 'ceil' | 'decimal2';
}

export default function ComponentMasterPage() {
  const [components, setComponents] = useState<PayrollComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'earning' | 'deduction'>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'general' | 'calculation'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingComponent, setEditingComponent] = useState<PayrollComponent | null>(null);
  const [showFormulaBuilder, setShowFormulaBuilder] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    component_type: 'earning' as 'earning' | 'deduction',
    component_category: 'general' as 'general' | 'calculation',
    type_selection: 'common' as 'common' | 'individual',
    amount_type: 'value' as 'value' | 'percentage', // CHANGED: Removed 'expression' option
    calculation_type: 'simple' as 'simple' | 'expression', // NEW: Added calculation_type field
    value_set: 'at_structure' as 'master_entry' | 'at_structure' | 'at_executing',
    // REMOVED: is_attendance_linked and always_treat_as_full_day from form state
    is_active: true,
    eligibility: 'all' as 'all' | 'condition',
    eligibility_expression: '',
    eligibility_expression_ast: null as any,
    rounding_type: 'none' as 'none' | 'round' | 'floor' | 'ceil' | 'decimal2',
  });

  useEffect(() => {
    fetchComponents();
  }, []);

  const fetchComponents = async () => {
    try {
      setLoading(true);
      const tenantId = await getTenantId();

      const { data, error } = await supabase
        .from('payroll_components')
        .select('*')
        .neq("component_category", "calculation") // Only fetch general components for master list
        .eq('tenant_id', tenantId)
        .is('statutory_component_id', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setComponents(data || []);
    } catch (error) {
      toast.error('Failed to fetch components');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast.error('Component name is required');
      return;
    }

    try {
      const tenantId = await getTenantId();

      if (editingComponent) {
        // Update existing component
        // REMOVED: is_attendance_linked and always_treat_as_full_day from database update
        const { error } = await supabase
          .from('payroll_components')
          .update({
            name: formData.name,
            description: formData.description,
            component_type: formData.component_type,
            component_category: formData.component_category,
            type_selection: formData.type_selection,
            amount_type: formData.amount_type,
            calculation_type: formData.calculation_type, // NEW: Added calculation_type to update
            value_set: formData.value_set,
            is_active: formData.is_active,
            eligibility: formData.eligibility,
            eligibility_expression: formData.eligibility === 'condition' ? formData.eligibility_expression : null,
            eligibility_expression_ast: formData.eligibility === 'condition' ? formData.eligibility_expression_ast : null,
            rounding_type: formData.rounding_type,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingComponent.id)
          .eq('tenant_id', tenantId);

        if (error) throw error;
        toast.success('Component updated successfully');
      } else {
        // Create new component
        const { error } = await supabase
          .from('payroll_components')
          .insert({
            ...formData,
            calculation_type: formData.calculation_type, // NEW: Ensure calculation_type is included
            eligibility_expression: formData.eligibility === 'condition' ? formData.eligibility_expression : null,
            eligibility_expression_ast: formData.eligibility === 'condition' ? formData.eligibility_expression_ast : null,
            tenant_id: tenantId,
          });

        if (error) throw error;
        toast.success('Component created successfully');
      }

      setShowModal(false);
      resetForm();
      fetchComponents();
    } catch (error) {
      toast.error('Failed to save component');
      console.error(error);
    }
  };

  const handleEdit = (component: PayrollComponent) => {
    setEditingComponent(component);
    setFormData({
      name: component.name,
      description: component.description || '',
      component_type: component.component_type,
      component_category: component.component_category,
      type_selection: component.type_selection,
      amount_type: component.amount_type,
      calculation_type: component.calculation_type || 'simple', // NEW: Load calculation_type from component
      value_set: component.value_set || 'at_structure',
      // REMOVED: is_attendance_linked and always_treat_as_full_day from edit loading
      is_active: component.is_active,
      eligibility: component.eligibility || 'all',
      eligibility_expression: component.eligibility_expression || '',
      eligibility_expression_ast: component.eligibility_expression_ast || null,
      rounding_type: component.rounding_type || 'none',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this component?')) return;

    try {
      const tenantId = await getTenantId();

      const { error } = await supabase
        .from('payroll_components')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenantId);

      if (error) throw error;
      toast.success('Component deleted successfully');
      fetchComponents();
    } catch (error) {
      toast.error('Failed to delete component');
      console.error(error);
    }
  };

  const resetForm = () => {
    setEditingComponent(null);
    setFormData({
      name: '',
      description: '',
      component_type: 'earning',
      component_category: 'general',
      type_selection: 'common',
      amount_type: 'value',
      calculation_type: 'simple', // NEW: Reset calculation_type to 'simple'
      value_set: 'at_structure',
      // REMOVED: is_attendance_linked and always_treat_as_full_day from form reset
      is_active: true,
      eligibility: 'all',
      eligibility_expression: '',
      eligibility_expression_ast: null,
      rounding_type: 'none',
    });
  };

  const handleExpressionSave = (expression: string, ast: any) => {
    setFormData({
      ...formData,
      eligibility_expression: expression,
      eligibility_expression_ast: ast,
    });
    setShowFormulaBuilder(false);
    toast.success('Expression saved successfully');
  };

  const filteredComponents = components.filter(comp => {
    const matchesSearch = comp.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || comp.component_type === filterType;
    const matchesCategory = filterCategory === 'all' || comp.component_category === filterCategory;
    return matchesSearch && matchesType && matchesCategory;
  });

  // Determine if fields should be disabled based on component category
  const isCalculationType = formData.component_category === 'calculation';

  return (
    <div className="py-6">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Component Master</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage payroll components for salary structures
            </p>
          </div>
          <div className="mt-4 md:mt-0">
            <button
              onClick={() => {
                resetForm();
                setShowModal(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Component
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Search className="h-4 w-4 inline mr-1" />
              Search
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search components..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Filter className="h-4 w-4 inline mr-1" />
              Type
            </label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Types</option>
              <option value="earning">Earnings</option>
              <option value="deduction">Deductions</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Category
            </label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="all">All Categories</option>
              <option value="general">General</option>
              <option value="calculation">Calculation</option>
            </select>
          </div>
        </div>

        {/* Components Table */}
        <div className="mt-8 overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
          <table className="min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
              <tr>
                <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                  Name
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Type
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Category
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Type Selection
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Amount Type
                </th>
                <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                  Status
                </th>
                <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredComponents.map((component) => (
                <tr key={component.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {component.name}
                    {component.description && (
                      <div className="text-xs text-gray-500">{component.description}</div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span className={`px-2 py-1 text-xs rounded-full ${component.component_type === 'earning'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                      }`}>
                      {component.component_type}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span className={`px-2 py-1 text-xs rounded-full ${component.component_category === 'general'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-purple-100 text-purple-800'
                      }`}>
                      {component.component_category}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 capitalize">
                    {component.type_selection}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500 capitalize">
                    {component.amount_type}
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                    <span className={`px-2 py-1 text-xs rounded-full ${component.is_active
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                      }`}>
                      {component.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                      onClick={() => handleEdit(component)}
                      className="text-indigo-600 hover:text-indigo-900 mr-3"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(component.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredComponents.length === 0 && (
            <div className="text-center py-12 bg-white">
              <p className="text-gray-500">No components found</p>
            </div>
          )}
        </div>
      </div>

      {/* Formula Builder Modal */}
      {showFormulaBuilder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Build Eligibility Expression</h3>
              <button
                onClick={() => setShowFormulaBuilder(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FormulaBuilderPage
                isModal={true}
                onSave={handleExpressionSave}
                onCancel={() => setShowFormulaBuilder(false)}
                initialExpression={formData.eligibility_expression}
                initialAst={formData.eligibility_expression_ast}
              />
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">
                {editingComponent ? 'Edit Component' : 'Add Component'}
              </h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              {/* LAYOUT OPTIMIZATION: Using grid layouts to reduce vertical height */}
              <div className="space-y-4">
                {/* Row 1: Component Name + Component Type (2 columns) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Component Name - Always editable */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Component Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="e.g., Basic Salary, HRA, PF"
                      required
                    />
                  </div>

                  {/* Component Type - Disabled for Calculation */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Component Type *
                    </label>
                    <select
                      value={formData.component_type}
                      onChange={(e) => setFormData({ ...formData, component_type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100"
                      disabled={isCalculationType}
                      required
                    >
                      <option value="earning">Earning</option>
                      <option value="deduction">Deduction</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Component Category (full width with helper text) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Component Category *
                  </label>
                  <select
                    value={formData.component_category}
                    onChange={(e) => setFormData({ ...formData, component_category: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="general">General (Manual Entry)</option>
                    <option value="calculation">Calculation (Auto-calculated)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {isCalculationType
                      ? 'Calculation type: Values automatically determined by calculation logic'
                      : 'General type: Manual value entry in salary structure'}
                  </p>
                </div>

                {/* Row 3: Type Selection + Amount Type + Calculation Type (3 columns, only for General) */}
                {!isCalculationType && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Type Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Type Selection *
                      </label>
                      <select
                        value={formData.type_selection}
                        onChange={(e) => setFormData({ ...formData, type_selection: e.target.value as any })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="common">Common (Same for all)</option>
                        <option value="individual">Individual (Per employee)</option>
                      </select>
                    </div>

                    {/* Amount Type - CHANGED: Removed 'expression' option */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Amount Type *
                      </label>
                      <select
                        value={formData.amount_type}
                        onChange={(e) => {
                          setFormData({
                            ...formData,
                            amount_type: e.target.value as 'value' | 'percentage'
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="value">Value (Fixed Amount)</option>
                        <option value="percentage">Percentage</option>
                      </select>
                    </div>

                    {/* Calculation Type - NEW: Added dropdown for calculation type */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Calculation Type *
                      </label>
                      <select
                        value={formData.calculation_type}
                        onChange={(e) => {
                          const newCalculationType = e.target.value as 'simple' | 'expression';
                          // TRANSFERRED LOGIC: Auto-set value_set to 'at_structure' when 'expression' is selected
                          setFormData({
                            ...formData,
                            calculation_type: newCalculationType,
                            value_set: newCalculationType === 'expression' ? 'at_structure' : formData.value_set
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md"
                        required
                      >
                        <option value="simple">Simple</option>
                        <option value="expression">Expression</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Row 4: Value Set (only for General Category) - UPDATED: Changed logic to use calculation_type */}
                {!isCalculationType && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Value Set *
                    </label>
                    <select
                      value={formData.value_set}
                      onChange={(e) => setFormData({ ...formData, value_set: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md disabled:bg-gray-100 disabled:cursor-not-allowed"
                      disabled={formData.calculation_type === 'expression'}
                      required
                    >
                      <option value="master_entry">Master Entry</option>
                      <option value="at_structure">At Structure Creation</option>
                      <option value="at_executing">At Executing</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      {formData.calculation_type === 'expression'
                        ? 'Expression components are always set at structure creation'
                        : 'Defines when component values are entered'}
                    </p>
                  </div>
                )}

                {/* Eligibility */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Eligibility *
                  </label>
                  <select
                    value={formData.eligibility}
                    onChange={(e) => setFormData({ ...formData, eligibility: e.target.value as 'all' | 'condition' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    required
                  >
                    <option value="all">All (Applies to all employees)</option>
                    <option value="condition">Condition (Conditional eligibility)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {formData.eligibility === 'all'
                      ? 'This component will be applicable to all employees'
                      : 'Define a condition to determine employee eligibility'}
                  </p>
                </div>

                {/* Rounding Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Rounding Type
                  </label>
                  <select
                    value={formData.rounding_type || 'none'}
                    onChange={(e) => setFormData({ ...formData, rounding_type: e.target.value as any })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="none">None (No Rounding)</option>
                    <option value="round">Standard Rounding (Normal Rounding)</option>
                    <option value="floor">Round Down (Floor)</option>
                    <option value="ceil">Round Up (Ceil)</option>
                    {/* <option value="decimal2">Fixed Decimal Rounding (2 Decimal Places)</option> */}
                  </select>
                  <div className="mt-1 bg-gray-50 p-2 rounded border border-gray-100">
                    <p className="text-xs text-gray-600 font-medium">
                      {formData.rounding_type === 'round' && 'Standard Rounding: 100.49 → 100, 100.50 → 101'}
                      {formData.rounding_type === 'floor' && 'Round Down: 2.9 → 2'}
                      {formData.rounding_type === 'ceil' && 'Round Up: 2.1 → 3'}
                      {formData.rounding_type === 'decimal2' && 'Fixed Decimal: 1250.456 → 1250.46'}
                      {(formData.rounding_type === 'none' || !formData.rounding_type) && 'Values will be kept exactly as calculated.'}
                    </p>
                  </div>
                </div>

                {/* Eligibility Expression - Only when Condition is selected */}
                {formData.eligibility === 'condition' && (
                  <div className="border border-blue-200 rounded-md p-4 bg-blue-50">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex-1">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Eligibility Expression
                        </label>
                        <textarea
                          value={formData.eligibility_expression}
                          readOnly
                          placeholder="No expression defined. Click 'fx' to create one."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white h-20 resize-none"
                        />
                      </div>
                      {/* BUTTON CAPTION CHANGED: "Build Expression" → "fx" */}
                      <button
                        type="button"
                        onClick={() => setShowFormulaBuilder(true)}
                        className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-lg font-bold rounded-md text-white bg-blue-600 hover:bg-blue-700 mt-7"
                        title="Build Expression"
                      >
                        fx
                      </button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Create a conditional expression to determine which employees are eligible for this component
                    </p>
                  </div>
                )}

                {/* REMOVED: Attendance Linked and Always Treat as Full Day fields */}

                {/* Row 7: Description + Status (combined for space efficiency) */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Description (takes 3 columns) */}
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md h-20"
                      placeholder="Optional description"
                    />
                  </div>

                  {/* Status (takes 1 column) */}
                  <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                        className="rounded h-4 w-4"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                >
                  {editingComponent ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
