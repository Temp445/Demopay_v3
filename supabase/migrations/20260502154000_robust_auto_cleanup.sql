-- Migration: Robust auto cleanup of expired trials with logging
-- Ensures pg_cron is enabled and runs more frequently (every hour)

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a log table to track cleanup activity
CREATE TABLE IF NOT EXISTS public.trial_cleanup_logs (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid NOT NULL,
    action_taken text NOT NULL,
    status text NOT NULL,
    error_message text,
    created_at timestamp with time zone DEFAULT now()
);

-- Update the cleanup function with better logging and schema safety
CREATE OR REPLACE FUNCTION public.auto_cleanup_expired_trials()
RETURNS void AS $$
DECLARE
  v_tenant_id uuid;
  v_count integer := 0;
BEGIN
  -- Loop over tenants whose free trial expired > 3 days ago
  FOR v_tenant_id IN
    SELECT DISTINCT s.tenant_id
    FROM public.subscriptions s
    WHERE s.plan_name = 'Elite Trial'
      AND s.expires_at < (now() - interval '3 days')
      -- No paid subscription has EVER existed for this tenant (even expired)
      -- This ensures we only clean up pure 'Trial-Only' users
      AND NOT EXISTS (
        SELECT 1
        FROM public.subscriptions paid
        WHERE paid.tenant_id = s.tenant_id
          AND paid.plan_name <> 'Elite Trial'
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
      -- Perform the cleanup
      PERFORM public.clear_tenant_data(v_tenant_id);
      
      -- Log success
      INSERT INTO public.trial_cleanup_logs (tenant_id, action_taken, status)
      VALUES (v_tenant_id, 'auto_delete_expired_trial', 'success');
      
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log failure
      INSERT INTO public.trial_cleanup_logs (tenant_id, action_taken, status, error_message)
      VALUES (v_tenant_id, 'auto_delete_expired_trial', 'failed', SQLERRM);
      
      RAISE WARNING 'auto_cleanup_expired_trials: failed for tenant %: %', v_tenant_id, SQLERRM;
    END;
  END LOOP;
  
  IF v_count > 0 THEN
    RAISE NOTICE 'auto_cleanup_expired_trials: cleaned up % tenants', v_count;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execution to service role
GRANT EXECUTE ON FUNCTION public.auto_cleanup_expired_trials() TO service_role;

-- Schedule the cleanup to run EVERY 2 MINUTES for testing
-- Using cron.schedule with the same name replaces any previous schedule
SELECT cron.schedule(
  'auto-cleanup-expired-trials',
  '*/2 * * * *', -- Run every 2 minutes
  $$SELECT public.auto_cleanup_expired_trials();$$
);

-- Optimization: Also run it once immediately after migration is applied
-- SELECT public.auto_cleanup_expired_trials();
