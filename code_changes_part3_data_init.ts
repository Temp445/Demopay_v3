/**
 * PART 3: Data Initialization Updates
 *
 * Update all places where SalaryStructureComponent objects are created
 * to include the new is_applied_in_calculation field
 */

// ============================================================
// LOCATION 1: getStatutoryDeductions function
// Around line 128-147
// ============================================================

// FIND this block in the getStatutoryDeductions function:
components.push({
  key: `SD${components.length + 1}`,
  id: payrollComponent.id,
  name: componentName,
  component_type: 'deduction',
  isCustom: false,
  isStatutory: true,
  calculation_type:
    config.calculation_method === 'percentage'
      ? 'percentage'
      : 'value',
  editability: editability,
  amount: amount,
  percentage_value: percentage_value,
  reference_components: [],
  is_taxable: false,
  description: `Statutory ${componentName}`,
  display_order: components.length,
  // ✅ ADD THIS LINE:
  is_applied_in_calculation: true,
});

// This applies to ALL three places where components.push() is called in getStatutoryDeductions:
// 1. Inside the isPFOrESI block (around line 128)
// 2. Inside the else block for other statutory types (around line 178)
// Make sure to add is_applied_in_calculation: true to BOTH locations


// ============================================================
// LOCATION 2: addComponent function
// Around line 369-386
// ============================================================

// FIND this block in the addComponent function:
let newComponent = {
  key: newKey,
  id: '',
  name: '',
  component_type: type,
  isCustom: false,
  calculation_type: 'value' as 'value' | 'percentage',
  editability: 'fixed' as 'fixed' | 'editable' | 'enter_later',
  is_taxable: type === 'earning',
  reference_components: [],
  display_order: prev.earnings.length + prev.deductions.length,
  is_attendance_linked: true,
  always_treat_as_full_day: false,
  is_locked: false,
  // ✅ ADD THIS LINE:
  is_applied_in_calculation: true,
};


// ============================================================
// LOCATION 3: Loading existing structure data
// Around line 264-286 in the useEffect for selectedStructure
// ============================================================

// FIND this block where deductions are loaded:
const updatedDeductions = fetchedStructureDetails[0].components
  .filter((c) => c.component_type === 'deduction')
  .map((comp) => {
    const isStatutory = comp.id
      ? statutoryComponentIds.has(comp.id)
      : false;

    return {
      ...comp,
      key: isStatutory
        ? `SD${++maxKeyNumber}`
        : `D${++maxKeyNumber}`,
      isStatutory: isStatutory,
      calculation_type:
        comp.calculation_type ||
        (comp.calculation_method === 'percentage'
          ? 'percentage'
          : 'value'),
      editability: comp.editability || 'fixed',
      // ✅ ADD THIS LINE:
      is_applied_in_calculation: comp.is_applied_in_calculation ?? true,
    };
  });

// Note: Using nullish coalescing operator (??) ensures:
// - If the field exists and is false, it stays false
// - If the field doesn't exist (legacy data), it defaults to true
// - If the field is true, it stays true


// ============================================================
// LOCATION 4: addStatutoryDeduction function
// Around line 333-336
// ============================================================

// FIND this block in addStatutoryDeduction where new components are created:
const newStatutoryDeduction: SalaryStructureComponent = {
  ...statutoryConfig,
  key: newKey,
  display_order: formData.earnings.length + formData.deductions.length,
  // ✅ ADD THIS LINE:
  is_applied_in_calculation: true,
};

// Also for the isPFOrESI block (around line 325):
newComponents.push({
  ...config,
  key: newKey,
  display_order: formData.earnings.length + formData.deductions.length + newComponents.length,
  // ✅ ADD THIS LINE:
  is_applied_in_calculation: true,
});


// ============================================================
// SUMMARY OF LOCATIONS TO UPDATE:
// ============================================================
// 1. ✅ getStatutoryDeductions - Two push() calls (PF/ESI block and other statutory block)
// 2. ✅ addComponent - newComponent object creation
// 3. ✅ useEffect (selectedStructure) - updatedDeductions mapping
// 4. ✅ addStatutoryDeduction - Two component creation locations

// All instances should default to TRUE (applied by default)
