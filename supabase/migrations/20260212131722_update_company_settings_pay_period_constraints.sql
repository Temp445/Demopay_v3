/*
  # Update Company Settings Pay Period Constraints

  ## Description
  This migration modifies the company_settings table to enforce new pay period constraints:
  - Restricts pay_period_type to only 'weekly' and 'monthly' (removes 'biweekly' and 'semimonthly')
  - Removes the payment_day column as it's no longer needed

  ## Changes

  1. Table Modifications
    - Drop existing CHECK constraint on pay_period_type
    - Add new CHECK constraint allowing only 'weekly' and 'monthly'
    - Drop payment_day column

  ## Notes
  - Existing data with 'biweekly' or 'semimonthly' pay period types should be migrated to 'monthly' before applying this migration
  - payment_day field is removed completely from the schema
  - Period end day will be auto-calculated in the application based on period start day

  ## Impact
  - Any existing company settings with biweekly or semimonthly periods will need to be updated manually
  - Payment day logic will need to be handled differently in the application
*/

-- Drop existing CHECK constraint on pay_period_type
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'company_settings_pay_period_type_check'
  ) THEN
    ALTER TABLE public.company_settings DROP CONSTRAINT company_settings_pay_period_type_check;
  END IF;
END $$;

-- Add new CHECK constraint for pay_period_type (only weekly and monthly)
ALTER TABLE public.company_settings 
  ADD CONSTRAINT company_settings_pay_period_type_check 
  CHECK (pay_period_type IN ('weekly', 'monthly'));

-- Drop payment_day column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' 
    AND column_name = 'payment_day'
  ) THEN
    ALTER TABLE public.company_settings DROP COLUMN payment_day;
  END IF;
END $$;

-- Update any existing records with biweekly or semimonthly to monthly
UPDATE public.company_settings 
SET pay_period_type = 'monthly' 
WHERE pay_period_type IN ('biweekly', 'semimonthly');

-- Add helpful comment
COMMENT ON COLUMN public.company_settings.pay_period_type IS 'Pay period frequency - weekly or monthly only';
