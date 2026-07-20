/*
  # Add Expression Fields to Payroll Structure Components

  1. Changes
    - Add `expression` column to `payroll_structure_components` table
      - Type: text (stores the expression string)
      - Nullable (only used for expression-type components)
    - Add `expression_ast` column to `payroll_structure_components` table
      - Type: jsonb (stores the parsed expression AST)
      - Nullable (only used for expression-type components)

  2. Purpose
    - Support expression-based components in salary structures
    - Store formula expressions for automatic calculation
    - Store parsed AST for efficient evaluation
    - Only populated when component's amount_type is 'expression'

  3. Security
    - No RLS changes needed (inherits from table RLS)
    - Fields are nullable for backward compatibility

  4. Backward Compatibility
    - Existing components will have NULL values
    - Only expression-type components will populate these fields
    - No impact on existing functionality
*/

-- Add expression column to payroll_structure_components
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_structure_components'
    AND column_name = 'expression'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE payroll_structure_components
    ADD COLUMN expression text;
  END IF;
END $$;

-- Add expression_ast column to payroll_structure_components
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payroll_structure_components'
    AND column_name = 'expression_ast'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE payroll_structure_components
    ADD COLUMN expression_ast jsonb;
  END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN payroll_structure_components.expression IS
'Formula expression for expression-type components. Only populated when the component amount_type is expression.';

COMMENT ON COLUMN payroll_structure_components.expression_ast IS
'Parsed Abstract Syntax Tree (AST) of the expression for efficient evaluation. Only populated when the component amount_type is expression.';