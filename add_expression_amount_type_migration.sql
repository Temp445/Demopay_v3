/*
  # Add Expression Amount Type

  This migration adds 'expression' as a valid value for the amount_type column
  in the payroll_components table.

  Run this manually in your Supabase SQL Editor or via CLI:
  psql $DATABASE_URL < add_expression_amount_type_migration.sql

  1. Changes
    - Updates the CHECK constraint on amount_type to include 'expression'
    - Existing values ('value', 'percentage') remain unchanged
    - No data migration needed - backward compatible

  2. Purpose
    - Allows components to use expressions/formulas for amount calculation
    - When 'expression' is selected, value_set is automatically set to 'at_structure'
    - Supports advanced payroll calculation scenarios

  3. Security
    - No changes to RLS policies required
    - All existing security remains intact
*/

-- Drop the existing CHECK constraint on amount_type
ALTER TABLE public.payroll_components
DROP CONSTRAINT IF EXISTS payroll_components_amount_type_check;

-- Add new CHECK constraint that includes 'expression'
ALTER TABLE public.payroll_components
ADD CONSTRAINT payroll_components_amount_type_check
CHECK (amount_type IN ('value', 'percentage', 'expression'));

-- Update comment to reflect the new option
COMMENT ON COLUMN public.payroll_components.amount_type IS 'Specifies if component uses value (fixed amount), percentage, or expression (formula-based)';
