-- Optimization: Bulk Overtime Synchronization
-- This migration adds a high-performance RPC function to process OT records in batch.

-- 1. Ensure a unique constraint exists on ot_approvals to support ON CONFLICT logic
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'ot_approvals_employee_date_unique'
    ) THEN
        ALTER TABLE public.ot_approvals 
        ADD CONSTRAINT ot_approvals_employee_date_unique UNIQUE (employee_id, attendance_date);
    END IF;
END $$;

-- 2. Create the bulk sync function
CREATE OR REPLACE FUNCTION public.sync_ot_from_attendance_bulk(
  p_start_date date,
  p_end_date date,
  p_tenant_id uuid,
  p_shift_ids uuid[] DEFAULT NULL,
  p_employee_ids uuid[] DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stats jsonb;
  v_processed int := 0;
  v_created int := 0;
  v_updated int := 0;
  v_removed int := 0;
  v_errors int := 0;
BEGIN
  -- 1. Check if global OT is enabled
  IF NOT EXISTS (SELECT 1 FROM public.company_settings WHERE tenant_id = p_tenant_id AND overtime_enabled = true) THEN
    RETURN jsonb_build_object('processed', 0, 'created', 0, 'updated', 0, 'skipped', 0, 'removed', 0, 'errors', 0);
  END IF;

  -- 2. Gather all relevant logs (broad initial search for diagnostics)
  WITH base_logs AS (
    SELECT 
      al.id as log_id,
      al.employee_id,
      al.date as attendance_date,
      al.clock_in,
      al.clock_out
    FROM public.attendance_logs al
    WHERE al.tenant_id = p_tenant_id
      AND al.date BETWEEN p_start_date AND p_end_date
      AND (p_employee_ids IS NULL OR al.employee_id = ANY(p_employee_ids))
      AND al.clock_in IS NOT NULL 
      AND al.clock_out IS NOT NULL
  ),
  eligible_logs AS (
    SELECT bl.* 
    FROM base_logs bl
    WHERE public.is_employee_ot_eligible(bl.employee_id, p_tenant_id, bl.attendance_date)
  ),
  logs_with_shifts AS (
    SELECT 
      el.*,
      s.id as shift_id,
      s.start_time as shift_start,
      s.end_time as shift_end,
      -- Convert clock_in/out to local time accurately for calculation
      (el.clock_in AT TIME ZONE 'Asia/Kolkata')::time as actual_in,
      (el.clock_out AT TIME ZONE 'Asia/Kolkata')::time as actual_out
    FROM eligible_logs el
    JOIN public.shift_assignments sa ON el.employee_id = sa.employee_id AND el.attendance_date = sa.schedule_date
    JOIN public.shifts s ON sa.shift_id = s.id
    WHERE (p_shift_ids IS NULL OR s.id = ANY(p_shift_ids))
  ),
  calculated AS (
    SELECT 
      ls.*,
      cal.total_overtime_minutes,
      cal.is_overtime_applicable
    FROM logs_with_shifts ls
    CROSS JOIN LATERAL public.calculate_overtime(
      ls.shift_id,
      p_tenant_id,
      ls.shift_start,
      ls.shift_end,
      ls.actual_in,
      ls.actual_out
    ) cal
  ),
  -- 3. Perform the bulk UPSERT
  upsert_results AS (
    INSERT INTO public.ot_approvals (
      tenant_id,
      employee_id,
      attendance_log_id,
      attendance_date,
      original_ot_hours,
      approval_status,
      created_at,
      updated_at
    )
    SELECT 
      p_tenant_id,
      employee_id,
      log_id,
      attendance_date,
      ROUND((total_overtime_minutes::numeric / 60.0), 4),
      'pending',
      now(),
      now()
    FROM calculated
    WHERE is_overtime_applicable = true AND total_overtime_minutes > 0
    ON CONFLICT (employee_id, attendance_date) DO UPDATE
    SET 
      original_ot_hours = EXCLUDED.original_ot_hours,
      attendance_log_id = EXCLUDED.attendance_log_id,
      updated_at = EXCLUDED.updated_at
    WHERE ot_approvals.approval_status = 'pending'
    RETURNING (xmax = 0) as was_inserted
  ),
  -- 4. Clean up pending records that no longer meet thresholds
  deleted_results AS (
    DELETE FROM public.ot_approvals
    WHERE tenant_id = p_tenant_id
      AND approval_status = 'pending'
      AND (employee_id, attendance_date) IN (
        SELECT employee_id, attendance_date FROM calculated WHERE is_overtime_applicable = false OR total_overtime_minutes = 0
      )
    RETURNING 1
  )
  -- 5. Aggregate final statistics
  SELECT 
    (SELECT count(*) FROM base_logs),
    (SELECT count(*) FROM upsert_results WHERE was_inserted = true),
    (SELECT count(*) FROM upsert_results WHERE was_inserted = false),
    (SELECT count(*) FROM deleted_results)
  INTO v_processed, v_created, v_updated, v_removed;

  RETURN jsonb_build_object(
    'processed', v_processed,
    'created', v_created,
    'updated', v_updated,
    'skipped', v_processed - (v_created + v_updated + v_removed),
    'removed', v_removed,
    'errors', 0
  );
EXCEPTION WHEN OTHERS THEN
  -- Log error or at least return error count
  RETURN jsonb_build_object(
    'processed', 0,
    'created', 0,
    'updated', 0,
    'skipped', 0,
    'removed', 0,
    'errors', 1,
    'message', SQLERRM
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.sync_ot_from_attendance_bulk TO authenticated;
