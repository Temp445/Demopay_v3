ALTER TABLE public.domain_configurations 
ADD COLUMN IF NOT EXISTS allow_to_landing_page boolean DEFAULT true;
