-- Add integration columns for field work/travel allowance component to location_settings
ALTER TABLE public.location_settings 
ADD COLUMN IF NOT EXISTS field_work_integration_enabled boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS field_work_component_id uuid REFERENCES public.payroll_components(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.location_settings.field_work_integration_enabled IS 'Indicates if the dynamic travel/field work allowance integration is enabled';
COMMENT ON COLUMN public.location_settings.field_work_component_id IS 'References the payroll component used for dynamic travel/field work allowance payouts';
