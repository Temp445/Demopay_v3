ALTER TABLE public.outside_office_approvals
ADD COLUMN IF NOT EXISTS distance_meters numeric,
ADD COLUMN IF NOT EXISTS travel_allowance_amount numeric,
ADD COLUMN IF NOT EXISTS travel_allowance_unit text;