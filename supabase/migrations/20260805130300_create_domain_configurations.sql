-- Create domain_configurations table
CREATE TABLE IF NOT EXISTS public.domain_configurations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    domain_name text NOT NULL UNIQUE,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.domain_configurations ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to all authenticated users"
    ON public.domain_configurations
    FOR SELECT
    TO authenticated
    USING (is_active = true);

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_domain_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_domain_configurations_updated_at
    BEFORE UPDATE ON public.domain_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_domain_configurations_updated_at();

-- Insert some default mock data for localhost testing if it doesn't exist
INSERT INTO public.domain_configurations (domain_name, config)
VALUES (
    'localhost',
    '{
        "screens": {
            "/dashboard": true,
            "/dashboard/employees": true,
            "/dashboard/attendance": true,
            "/dashboard/leave": true,
            "/dashboard/advances": true,
            "/dashboard/payroll": true,
            "/dashboard/settings": true
        },
        "features": {
            "live_tracking": true,
            "face_enrollment": true
        }
    }'
) ON CONFLICT (domain_name) DO NOTHING;
