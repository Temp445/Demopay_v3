/**
 * PART 1: TypeScript Interface Update
 *
 * Location: In your type definitions file (likely stores/salaryStructuresStore.ts or similar)
 *
 * Add the `is_applied_in_calculation` field to the SalaryStructureComponent interface
 */

export interface SalaryStructureComponent {
  key: string;
  id: string;
  name: string;
  component_type: 'earning' | 'deduction';
  isCustom?: boolean;
  isStatutory?: boolean;
  calculation_type: 'value' | 'percentage';
  editability: 'fixed' | 'editable' | 'enter_later';
  amount?: number;
  percentage_value?: number;
  reference_components?: string[];
  is_taxable?: boolean;
  description?: string;
  display_order: number;
  is_attendance_linked?: boolean;
  always_treat_as_full_day?: boolean;
  is_locked?: boolean;

  // ✅ NEW FIELD: Add this line
  is_applied_in_calculation?: boolean;
}
