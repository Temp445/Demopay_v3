-- Function to initialize balances for all active employees in a tenant
CREATE OR REPLACE FUNCTION public.initialize_tenant_permission_balances(
  p_tenant_id uuid,
  p_month integer,
  p_year integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
BEGIN
  -- Iterate through all active employees for the given tenant
  FOR r IN 
    SELECT id 
    FROM public.employees 
    WHERE tenant_id = p_tenant_id 
      AND status = 'Active' 
  LOOP
    PERFORM public.initialize_employee_permission_balance(p_tenant_id, r.id, p_month, p_year);
  END LOOP;
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.initialize_tenant_permission_balances(uuid, integer, integer) TO authenticated;



-- New function for global initialization across all tenants
CREATE OR REPLACE FUNCTION public.initialize_all_tenants_permission_balances()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  t_id uuid;
  v_month integer;
  v_year integer;
BEGIN
  v_month := EXTRACT(MONTH FROM CURRENT_DATE);
  v_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  FOR t_id IN SELECT id FROM public.tenants LOOP
    PERFORM public.initialize_tenant_permission_balances(t_id, v_month, v_year);
  END LOOP;
END;
$$;

-- Schedule the job to run at 00:00 on the 1st of every month using pg_cron
-- Unscheduling first to avoid duplicates if migration is re-run
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'initialize-monthly-permissions') THEN
        PERFORM cron.unschedule('initialize-monthly-permissions');
    END IF;
END $$;

SELECT cron.schedule(
  'initialize-monthly-permissions',
  '0 0 1 * *',
  'SELECT public.initialize_all_tenants_permission_balances()'
);

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.initialize_tenant_permission_balances(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.initialize_all_tenants_permission_balances() TO authenticated;