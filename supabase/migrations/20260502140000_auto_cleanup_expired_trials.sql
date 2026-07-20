-- Migration: Auto cleanup of expired free trials
-- Runs daily via pg_cron. Deletes data for tenants where:
--   1. Their only subscription is 'Elite Trial'
--   2. It expired MORE than 3 days ago
--   3. They have NOT upgraded to any paid plan

-- Step 1: Function to find and clean up expired trial tenants
CREATE OR REPLACE FUNCTION public.auto_cleanup_expired_trials()
RETURNS void AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Loop over tenants whose free trial expired > 3 days ago
  -- and have no active paid subscription
  FOR v_tenant_id IN
    SELECT DISTINCT s.tenant_id
    FROM public.subscriptions s
    WHERE s.plan_name = 'Elite Trial'
      AND s.expires_at < (now() - interval '3 days')
      -- No active paid subscription exists for this tenant
      AND NOT EXISTS (
        SELECT 1
        FROM public.subscriptions paid
        WHERE paid.tenant_id = s.tenant_id
          AND paid.plan_name <> 'Elite Trial'
          AND paid.status = 'active'
          AND paid.expires_at > now()
      )
      -- Data has not already been cleared (employees still exist)
      AND EXISTS (
        SELECT 1
        FROM public.employees e
        WHERE e.tenant_id = s.tenant_id
        LIMIT 1
      )
  LOOP
    BEGIN
      PERFORM public.clear_tenant_data(v_tenant_id);
    EXCEPTION WHEN OTHERS THEN
      -- Log but don't abort the whole loop
      RAISE WARNING 'auto_cleanup_expired_trials: failed for tenant %: %', v_tenant_id, SQLERRM;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.auto_cleanup_expired_trials() TO service_role;

-- Step 2a: Schedule data cleanup daily at 02:00 UTC
SELECT cron.schedule(
  'auto-cleanup-expired-trials',
  '0 2 * * *',
  $$SELECT public.auto_cleanup_expired_trials();$$
);
