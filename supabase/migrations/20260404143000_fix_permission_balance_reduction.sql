-- Final corrected function for permission approval using direct employee_id
-- This matches how get_employee_permission_balance and initialize_tenant_permission_balances work
CREATE OR REPLACE FUNCTION public.handle_permission_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_duration_minutes integer;
BEGIN
  -- 1. Deduct minutes when status changes from 'pending' to 'approved'
  IF (OLD.status = 'pending' AND NEW.status = 'approved') THEN
    v_duration_minutes := EXTRACT(EPOCH FROM (
      (NEW.end_date + NEW.end_time) - (NEW.start_date + NEW.start_time)
    )) / 60;

    IF v_duration_minutes > 0 THEN
      -- Passing NEW.employee_id directly. This ensures we update the exact record 
      -- displaying the balance on the dashboard.
      PERFORM public.update_employee_permission_balance(
        NEW.tenant_id,
        NEW.employee_id,
        NEW.start_date,
        v_duration_minutes
      );
    END IF;
  END IF;

  -- 2. Refund minutes when an 'approved' permission is 'cancelled' or 'rejected'
  IF (OLD.status = 'approved' AND (NEW.status = 'cancelled' OR NEW.status = 'rejected')) THEN
    v_duration_minutes := EXTRACT(EPOCH FROM (
      (OLD.end_date + OLD.end_time) - (OLD.start_date + OLD.start_time)
    )) / 60;

    IF v_duration_minutes > 0 THEN
      PERFORM public.update_employee_permission_balance(
        NEW.tenant_id,
        NEW.employee_id,
        OLD.start_date,
        -v_duration_minutes -- Negative minutes to refund
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach the trigger
DROP TRIGGER IF EXISTS on_permission_status_change ON public.employee_permissions;
CREATE TRIGGER on_permission_status_change
  AFTER UPDATE ON public.employee_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_permission_approval();
