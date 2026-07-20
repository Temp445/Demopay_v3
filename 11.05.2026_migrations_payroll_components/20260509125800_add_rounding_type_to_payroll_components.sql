ALTER TABLE public.payroll_components 
ADD COLUMN rounding_type text DEFAULT 'none',
ADD CONSTRAINT payroll_components_rounding_type_check 
CHECK (rounding_type = ANY (ARRAY['none'::text, 'round'::text, 'floor'::text, 'ceil'::text, 'decimal2'::text]));