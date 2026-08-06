-- Fix read access for domain configurations to allow managing inactive domains
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON public.domain_configurations;

CREATE POLICY "Allow read access to all authenticated users"
    ON public.domain_configurations
    FOR SELECT
    TO authenticated
    USING (true);
