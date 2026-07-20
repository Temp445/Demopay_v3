

-- ============================================================================
-- PART 1: Add unique constraint on ot_approvals for safe upsert
-- ============================================================================

DO $$
BEGIN
  -- Add unique constraint for (tenant_id, employee_id, attendance_date)
  -- so we can UPSERT safely without creating duplicate approval records.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'ot_approvals'
      AND constraint_name = 'ot_approvals_tenant_employee_date_unique'
  ) THEN
    ALTER TABLE public.ot_approvals
    ADD CONSTRAINT ot_approvals_tenant_employee_date_unique
    UNIQUE (tenant_id, employee_id, attendance_date);
  END IF;
END $$;

-- ============================================================================
-- PART 2: Create the trigger function
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_ot_approval_on_clockout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shift_id          uuid;
  v_shift_start_time  time;
  v_shift_end_time    time;
  v_tenant_id         uuid;
  v_ot_enabled        boolean;
  v_is_eligible       boolean;
  v_clock_in_time     time;
  v_clock_out_time    time;
  v_ot_result         record;
  v_should_cleanup    boolean := false;
  v_shift_ot_enabled  boolean;
BEGIN
  -- ----------------------------------------------------------------
  -- Guard: Only proceed if clock_out is present
  -- For UPDATES, only fire if clock_out has actually changed or was NULL
  -- ----------------------------------------------------------------
  IF NEW.clock_out IS NULL THEN
    -- If clock_out was removed, clean up any pending record (handled by the end logic)
    -- but we need to proceed to the cleanup block.
  ELSIF TG_OP = 'UPDATE' AND OLD.clock_out IS NOT NULL AND OLD.clock_out = NEW.clock_out AND OLD.clock_in = NEW.clock_in THEN
    -- No relevant change to timing, skip
    RETURN NEW;
  END IF;

  -- ----------------------------------------------------------------
  -- Get the tenant_id for this attendance record
  -- ----------------------------------------------------------------
  v_tenant_id := NEW.tenant_id;

  IF v_tenant_id IS NULL THEN
    RETURN NEW; -- Cannot proceed without tenant context
  END IF;

  -- ----------------------------------------------------------------
  -- Check if global overtime is enabled AND employee is eligible
  -- ----------------------------------------------------------------
  SELECT overtime_enabled INTO v_ot_enabled FROM public.company_settings WHERE tenant_id = v_tenant_id;
  v_is_eligible := is_employee_ot_eligible(NEW.employee_id, v_tenant_id, NEW.date);

  IF NOT COALESCE(v_ot_enabled, false) OR NOT COALESCE(v_is_eligible, true) THEN
    v_should_cleanup := true;
  END IF;

  IF NOT v_should_cleanup THEN
    -- Look up the employee's assigned shift for this date
    SELECT
      sa.shift_id,
      s.start_time,
      s.end_time,
      s.overtime_enabled
    INTO
      v_shift_id,
      v_shift_start_time,
      v_shift_end_time,
      v_shift_ot_enabled
    FROM public.shift_assignments sa
    JOIN public.shifts s ON s.id = sa.shift_id
    WHERE sa.employee_id = NEW.employee_id
      AND sa.schedule_date IN (NEW.date, NEW.date - INTERVAL '1 day')
      AND sa.tenant_id = v_tenant_id
    ORDER BY sa.schedule_date DESC
    LIMIT 1;

    IF NOT FOUND OR NOT COALESCE(v_shift_ot_enabled, true) THEN
      v_should_cleanup := true;
    END IF;
  END IF;

  -- ----------------------------------------------------------------
  -- Extract time portions and calculate if not cleaning up
  -- ----------------------------------------------------------------
  IF NOT v_should_cleanup THEN
    v_clock_in_time  := (NEW.clock_in AT TIME ZONE 'Asia/Kolkata')::time;
    v_clock_out_time := (NEW.clock_out AT TIME ZONE 'Asia/Kolkata')::time;

    IF v_clock_in_time IS NULL THEN
      RETURN NEW; -- No clock_in recorded yet
    END IF;

    -- Call calculation
    SELECT * INTO v_ot_result FROM calculate_overtime(
      v_shift_id, v_tenant_id, v_shift_start_time, v_shift_end_time, v_clock_in_time, v_clock_out_time
    );

    IF NOT v_ot_result.is_overtime_applicable OR v_ot_result.total_overtime_minutes <= 0 THEN
      v_should_cleanup := true;
    END IF;
  END IF;

  -- ----------------------------------------------------------------
  -- Execution Logic
  -- ----------------------------------------------------------------
  IF NOT v_should_cleanup THEN
    -- UPSERT Record
    INSERT INTO public.ot_approvals (
      tenant_id, employee_id, attendance_log_id, attendance_date,
      original_ot_hours, corrected_ot_hours, modification_reason, approval_status, created_at, updated_at
    )
    VALUES (
      v_tenant_id, NEW.employee_id, NEW.id, NEW.date,
      ROUND((v_ot_result.total_overtime_minutes / 60.0)::numeric, 4), NULL, NULL, 'pending', now(), now()
    )
    ON CONFLICT (tenant_id, employee_id, attendance_date)
    DO UPDATE SET
      original_ot_hours = CASE
        WHEN ot_approvals.approval_status = 'pending' THEN ROUND((v_ot_result.total_overtime_minutes / 60.0)::numeric, 4)
        ELSE ot_approvals.original_ot_hours
      END,
      attendance_log_id = CASE
        WHEN ot_approvals.approval_status = 'pending' THEN NEW.id
        ELSE ot_approvals.attendance_log_id
      END,
      updated_at = CASE
        WHEN ot_approvals.approval_status = 'pending' THEN now()
        ELSE ot_approvals.updated_at
      END;
  ELSE
    -- CLEANUP logic (v_should_cleanup is true)
    DELETE FROM public.ot_approvals
    WHERE tenant_id        = v_tenant_id
      AND employee_id      = NEW.employee_id
      AND attendance_date  = NEW.date
      AND approval_status  = 'pending';
  END IF;

  RETURN NEW;

EXCEPTION
  WHEN OTHERS THEN
    -- Log the error but do NOT fail the clock-out operation
    RAISE WARNING '[OT Trigger] Error generating OT approval for employee % on %: %',
      NEW.employee_id, NEW.date, SQLERRM;
    RETURN NEW;
END;
$$;

-- ============================================================================
-- PART 3: Attach the trigger to attendance_logs
-- ============================================================================

-- Drop if it already exists to allow re-running this migration safely
DROP TRIGGER IF EXISTS trg_auto_ot_approval_on_clockout ON public.attendance_logs;

CREATE TRIGGER trg_auto_ot_approval_on_clockout
  AFTER INSERT OR UPDATE OF clock_out, clock_in ON public.attendance_logs
  FOR EACH ROW
  EXECUTE FUNCTION auto_generate_ot_approval_on_clockout();

-- ============================================================================
-- PART 4: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION auto_generate_ot_approval_on_clockout TO authenticated;

-- ============================================================================
-- PART 5: Comments
-- ============================================================================

COMMENT ON FUNCTION auto_generate_ot_approval_on_clockout IS
'Trigger function: automatically creates or updates an ot_approvals record
(status=pending) whenever an employee clocks out and calculated OT > 0.
Skips if: OT globally disabled, employee not eligible, no shift assigned.
Never overwrites already approved or rejected OT records.';

COMMENT ON TRIGGER trg_auto_ot_approval_on_clockout ON public.attendance_logs IS
'Fires after clock_out is set on attendance_logs. Calls the OT calculation
engine and generates a pending approval record if overtime qualifies.';
