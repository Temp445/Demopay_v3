-- Add extended overtime configuration columns to company_settings
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS ot_monthly_hours_type text DEFAULT 'fixed' CHECK (ot_monthly_hours_type IN ('fixed', 'calendar_days')),
ADD COLUMN IF NOT EXISTS ot_fixed_days numeric(5,2) DEFAULT 26.00,
ADD COLUMN IF NOT EXISTS ot_working_hours_per_day numeric(5,2) DEFAULT 8.00;

-- Add global overtime multiplier to company_settings
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS ot_global_multiplier numeric(5,2) DEFAULT 1.00;


ALTER TABLE company_settings ADD COLUMN ot_link_with_payroll BOOLEAN DEFAULT FALSE;
