-- Create domain_configurations table
CREATE TABLE IF NOT EXISTS public.domain_configurations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    domain_name text NOT NULL,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT domain_configurations_domain_name_tenant_id_key UNIQUE (domain_name, tenant_id)
);

-- Create an index for faster lookups by tenant
CREATE INDEX IF NOT EXISTS idx_domain_configurations_tenant ON public.domain_configurations USING btree (tenant_id);

-- Enable RLS
ALTER TABLE public.domain_configurations ENABLE ROW LEVEL SECURITY;

-- Allow read access to all authenticated users
CREATE POLICY "Allow read access to all authenticated users"
    ON public.domain_configurations
    FOR SELECT
    TO authenticated
    USING (is_active = true);

-- Allow insert access to authenticated users
CREATE POLICY "Allow insert access to authenticated users"
    ON public.domain_configurations
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow update access to authenticated users
CREATE POLICY "Allow update access to authenticated users"
    ON public.domain_configurations
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- Allow delete access to authenticated users
CREATE POLICY "Allow delete access to authenticated users"
    ON public.domain_configurations
    FOR DELETE
    TO authenticated
    USING (true);

-- Create a trigger to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_domain_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_domain_configurations_updated_at ON public.domain_configurations;
CREATE TRIGGER update_domain_configurations_updated_at
    BEFORE UPDATE ON public.domain_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_domain_configurations_updated_at();
