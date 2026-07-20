/*
  # Add EPS (Employee Pension Scheme) Value to Statutory Configurations

  1. Changes
    - Add `eps_value` column to `statutory_configurations` table
    - Stores the EPS (Employee Pension Scheme) contribution value
    - Applicable only to Provident Fund Employer Contribution
    - Nullable: true (only used for PF employer configuration)

  2. Purpose
    - Enable separate EPS tracking for Provident Fund employer contributions
    - Support both percentage and fixed value EPS contributions
    - Maintain flexibility in PF+EPS statutory configuration

  3. Use Case
    - When employer contributes to PF, a portion goes to EPS
    - EPS value can be set as percentage or fixed amount based on calculation_method
    - Example: 12% employer PF contribution might split into 8.33% EPS + 3.67% EPF
*/

-- Add eps_value column to statutory_configurations table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'statutory_configurations'
    AND column_name = 'eps_value'
    AND table_schema = 'public'
  ) THEN
    ALTER TABLE statutory_configurations
    ADD COLUMN eps_value numeric(10, 2);
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN statutory_configurations.eps_value IS
'EPS (Employee Pension Scheme) value for Provident Fund employer contributions. Can be percentage or fixed value based on calculation_method.';
