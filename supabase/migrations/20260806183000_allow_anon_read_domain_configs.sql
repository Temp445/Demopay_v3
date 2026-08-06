-- Allow public read access to domain configurations for the initial page redirect logic
CREATE POLICY "Allow read access to anon users"
    ON public.domain_configurations
    FOR SELECT
    TO anon
    USING (is_active = true);
