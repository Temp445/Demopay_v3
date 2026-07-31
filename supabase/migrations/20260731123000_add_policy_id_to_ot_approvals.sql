-- Add applied_policy_id and applied_policy_name to ot_approvals table
ALTER TABLE public.ot_approvals
ADD COLUMN IF NOT EXISTS applied_policy_id uuid REFERENCES public.overtime_policies(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS applied_policy_name text;

-- Update get_overtime_config to return policy_id and policy_name
DROP FUNCTION IF EXISTS public.get_overtime_config(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.get_overtime_config(
    p_shift_id uuid,
    p_tenant_id uuid,
    p_location_status text DEFAULT 'normal'
)
RETURNS TABLE (
    enabled boolean,
    calculation_timing text,
    threshold_minutes integer,
    rounding_interval integer,
    rounding_method text,
    rounding_mode text,
    policy_id uuid,
    policy_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift_overtime_enabled boolean;
    v_shift_config_override boolean;
    v_shift_timing text;
    v_policy_config record;
    v_normalized_location text;
BEGIN
    -- Normalize location_status to match the snake_case format used in overtime_policies.
    -- attendance_logs stores 'Outside Office', but overtime_policies stores 'outside_office'.
    v_normalized_location := CASE
        WHEN p_location_status ILIKE 'outside%' THEN 'outside_office'
        ELSE 'normal'
    END;

    -- Get shift-level configuration
    SELECT 
        s.overtime_enabled,
        s.overtime_config_override,
        s.overtime_calculation_timing
    INTO 
        v_shift_overtime_enabled,
        v_shift_config_override,
        v_shift_timing
    FROM public.shifts s
    WHERE s.id = p_shift_id AND s.tenant_id = p_tenant_id;

    -- Get matching policy for the location status (using normalized value)
    SELECT 
        op.id as policy_id,
        op.name as policy_name,
        op.overtime_enabled,
        op.calculation_timing,
        op.threshold_minutes,
        op.rounding_interval,
        op.rounding_method,
        op.rounding_mode
    INTO v_policy_config
    FROM public.overtime_policies op
    WHERE op.tenant_id = p_tenant_id AND op.location_status_match = v_normalized_location;
    
    -- If not found, try to get the default policy
    IF NOT FOUND THEN
        SELECT 
            op.id as policy_id,
            op.name as policy_name,
            op.overtime_enabled,
            op.calculation_timing,
            op.threshold_minutes,
            op.rounding_interval,
            op.rounding_method,
            op.rounding_mode
        INTO v_policy_config
        FROM public.overtime_policies op
        WHERE op.tenant_id = p_tenant_id AND op.is_default = true
        LIMIT 1;
    END IF;

    -- If still no policy config, use defaults
    IF NOT FOUND THEN
        v_policy_config.policy_id := NULL;
        v_policy_config.policy_name := 'System Default';
        v_policy_config.overtime_enabled := false;
        v_policy_config.calculation_timing := 'both';
        v_policy_config.threshold_minutes := 30;
        v_policy_config.rounding_interval := 30;
        v_policy_config.rounding_method := 'nearest';
        v_policy_config.rounding_mode := 'combined';
    END IF;
    
    -- Return effective configuration
    RETURN QUERY SELECT
        -- Enabled: Both policy and shift must be enabled
        COALESCE(v_policy_config.overtime_enabled, false) AND COALESCE(v_shift_overtime_enabled, true),
        -- Timing: Use shift override if configured, otherwise policy
        CASE 
            WHEN v_shift_config_override AND v_shift_timing IS NOT NULL THEN v_shift_timing
            ELSE COALESCE(v_policy_config.calculation_timing, 'both')
        END,
        -- All other settings come from policy config
        COALESCE(v_policy_config.threshold_minutes, 30),
        COALESCE(v_policy_config.rounding_interval, 30),
        COALESCE(v_policy_config.rounding_method, 'nearest'),
        COALESCE(v_policy_config.rounding_mode, 'combined'),
        v_policy_config.policy_id,
        v_policy_config.policy_name;
END;
$$;


-- Drop and recreate calculate_overtime to return policy info
DROP FUNCTION IF EXISTS public.calculate_overtime(uuid, uuid, time, time, time, time, text);

CREATE OR REPLACE FUNCTION public.calculate_overtime(
    p_shift_id uuid,
    p_tenant_id uuid,
    p_shift_start_time time without time zone,
    p_shift_end_time time without time zone,
    p_actual_clock_in time without time zone,
    p_actual_clock_out time without time zone,
    p_location_status text DEFAULT 'normal'
)
RETURNS TABLE (
    before_shift_minutes integer,
    after_shift_minutes integer,
    total_overtime_minutes integer,
    is_overtime_applicable boolean,
    applied_policy_id uuid,
    applied_policy_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_config record;
    v_before_minutes integer := 0;
    v_after_minutes integer := 0;
    v_before_rounded integer := 0;
    v_after_rounded integer := 0;
    v_total_minutes integer := 0;
    v_total_rounded integer := 0;
BEGIN
    -- Get effective overtime configuration
    SELECT * INTO v_config FROM get_overtime_config(p_shift_id, p_tenant_id, p_location_status);
    
    -- If overtime is not enabled, return zeros
    IF NOT v_config.enabled THEN
        RETURN QUERY SELECT 0, 0, 0, false, v_config.policy_id, v_config.policy_name;
        RETURN;
    END IF;

    -- Calculate Before Shift OT
    IF v_config.calculation_timing IN ('before', 'both') AND p_actual_clock_in < p_shift_start_time THEN
        v_before_minutes := EXTRACT(EPOCH FROM (p_shift_start_time - p_actual_clock_in)) / 60;
        IF v_before_minutes >= v_config.threshold_minutes THEN
            IF v_config.rounding_mode = 'separate' THEN
                v_before_rounded := public.apply_overtime_rounding(v_before_minutes, v_config.rounding_interval, v_config.rounding_method);
            ELSE
                v_before_rounded := v_before_minutes;
            END IF;
        ELSE
            v_before_rounded := 0;
        END IF;
    END IF;

    -- Calculate After Shift OT
    IF v_config.calculation_timing IN ('after', 'both') AND p_actual_clock_out > p_shift_end_time THEN
        v_after_minutes := EXTRACT(EPOCH FROM (p_actual_clock_out - p_shift_end_time)) / 60;
        IF v_after_minutes >= v_config.threshold_minutes THEN
            IF v_config.rounding_mode = 'separate' THEN
                v_after_rounded := public.apply_overtime_rounding(v_after_minutes, v_config.rounding_interval, v_config.rounding_method);
            ELSE
                v_after_rounded := v_after_minutes;
            END IF;
        ELSE
            v_after_rounded := 0;
        END IF;
    END IF;

    -- Total calculation based on rounding mode
    IF v_config.rounding_mode = 'separate' THEN
        v_total_rounded := v_before_rounded + v_after_rounded;
    ELSE
        -- Combined mode: sum first, then round
        v_total_minutes := v_before_rounded + v_after_rounded;
        IF v_total_minutes > 0 THEN
            v_total_rounded := public.apply_overtime_rounding(v_total_minutes, v_config.rounding_interval, v_config.rounding_method);
        END IF;
    END IF;

    -- Final Return
    RETURN QUERY SELECT 
        v_before_rounded, 
        v_after_rounded, 
        v_total_rounded, 
        (v_total_rounded > 0),
        v_config.policy_id,
        v_config.policy_name;
END;
$$;


-- Update the trigger function to save applied policy
CREATE OR REPLACE FUNCTION public.auto_calculate_ot_on_clock_out()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tenant_id uuid;
  v_shift_id uuid;
  v_shift_start_time time without time zone;
  v_shift_end_time time without time zone;
  v_shift_ot_enabled boolean;
  v_clock_in_time time without time zone;
  v_clock_out_time time without time zone;
  v_ot_result record;
  v_should_cleanup boolean := false;
BEGIN
  -- ----------------------------------------------------------------
  -- Early Exits
  -- ----------------------------------------------------------------
  IF NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;
  IF OLD.clock_out IS NOT NULL AND OLD.clock_out = NEW.clock_out THEN
    RETURN NEW; 
  END IF;
  IF NEW.status IN ('Absent', 'Leave', 'Holiday', 'Weekly Off') THEN
    v_should_cleanup := true;
  END IF;

  -- ----------------------------------------------------------------
  -- Determine Shift & Config if not cleaning up
  -- ----------------------------------------------------------------
  IF NOT v_should_cleanup THEN
    v_tenant_id := NEW.tenant_id;

    SELECT sa.shift_id, s.start_time, s.end_time, s.overtime_enabled
    INTO v_shift_id, v_shift_start_time, v_shift_end_time, v_shift_ot_enabled
    FROM public.structure_assignments sa
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
      v_shift_id, v_tenant_id, v_shift_start_time, v_shift_end_time, v_clock_in_time, v_clock_out_time, NEW.location_status
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
      original_ot_hours, corrected_ot_hours, modification_reason, approval_status, created_at, updated_at,
      applied_policy_id, applied_policy_name
    )
    VALUES (
      v_tenant_id,
      NEW.employee_id,
      NEW.id,
      NEW.date,
      v_ot_result.total_overtime_minutes,
      v_ot_result.total_overtime_minutes, -- auto approve initial amount
      'Auto-calculated on clock out',
      'pending',
      now(),
      now(),
      v_ot_result.applied_policy_id,
      v_ot_result.applied_policy_name
    )
    ON CONFLICT (tenant_id, employee_id, attendance_date)
    DO UPDATE SET
      original_ot_hours = EXCLUDED.original_ot_hours,
      -- Don't overwrite corrected_ot_hours if it was already modified
      corrected_ot_hours = CASE 
        WHEN ot_approvals.approval_status = 'pending' THEN EXCLUDED.corrected_ot_hours 
        ELSE ot_approvals.corrected_ot_hours 
      END,
      applied_policy_id = EXCLUDED.applied_policy_id,
      applied_policy_name = EXCLUDED.applied_policy_name,
      updated_at = now();
      
  ELSE
    -- CLEANUP Record: delete if no longer applicable but was created before
    DELETE FROM public.ot_approvals 
    WHERE attendance_log_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


-- Update bulk_sync_overtime_for_period to save applied policy
CREATE OR REPLACE FUNCTION public.bulk_sync_overtime_for_period(
  p_start_date date,
  p_end_date date,
  p_tenant_id uuid,
  p_employee_ids uuid[] DEFAULT NULL::uuid[],
  p_shift_ids uuid[] DEFAULT NULL::uuid[]
)
RETURNS TABLE(synced_count integer, deleted_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_synced integer := 0;
  v_deleted integer := 0;
BEGIN
  -- 1. Identify valid shift/attendance pairs
  WITH log_source AS (
    SELECT 
      al.id as log_id,
      al.tenant_id,
      al.employee_id,
      al.date as attendance_date,
      al.location_status,
      (al.clock_in AT TIME ZONE 'Asia/Kolkata')::time as actual_in,
      (al.clock_out AT TIME ZONE 'Asia/Kolkata')::time as actual_out,
      sa.shift_id,
      s.start_time as shift_start,
      s.end_time as shift_end,
      s.overtime_enabled as shift_ot_enabled
    FROM public.attendance_logs al
    LEFT JOIN public.structure_assignments sa 
      ON sa.employee_id = al.employee_id 
      AND sa.schedule_date IN (al.date, al.date - INTERVAL '1 day')
      AND sa.tenant_id = al.tenant_id
    LEFT JOIN public.shifts s ON s.id = sa.shift_id
    WHERE al.tenant_id = p_tenant_id
      AND al.date BETWEEN p_start_date AND p_end_date
      AND (p_employee_ids IS NULL OR array_length(p_employee_ids, 1) IS NULL OR al.employee_id = ANY(p_employee_ids))
      AND (p_shift_ids IS NULL OR array_length(p_shift_ids, 1) IS NULL OR sa.shift_id = ANY(p_shift_ids))
  ),
  ineligible_logs AS (
    SELECT log_id FROM log_source
    WHERE actual_in IS NULL 
       OR actual_out IS NULL 
       OR shift_id IS NULL 
       OR shift_ot_enabled = false
  ),
  eligible_logs AS (
    SELECT * FROM log_source 
    WHERE log_id NOT IN (SELECT log_id FROM ineligible_logs)
  ),
  -- 2. Calculate OT using CROSS JOIN LATERAL
  calculated AS (
    SELECT 
      ls.*,
      cal.total_overtime_minutes,
      cal.is_overtime_applicable,
      cal.applied_policy_id,
      cal.applied_policy_name
    FROM eligible_logs ls
    CROSS JOIN LATERAL public.calculate_overtime(
      ls.shift_id,
      p_tenant_id,
      ls.shift_start,
      ls.shift_end,
      ls.actual_in,
      ls.actual_out,
      ls.location_status
    ) cal
  ),
  -- 3. Perform the bulk UPSERT
  upsert_results AS (
    INSERT INTO public.ot_approvals (
      tenant_id, employee_id, attendance_log_id, attendance_date,
      original_ot_hours, corrected_ot_hours, modification_reason, approval_status, created_at, updated_at,
      applied_policy_id, applied_policy_name
    )
    SELECT 
      c.tenant_id, c.employee_id, c.log_id, c.attendance_date,
      c.total_overtime_minutes, c.total_overtime_minutes, 
      'Bulk sync recalculation', 'pending', now(), now(),
      c.applied_policy_id, c.applied_policy_name
    FROM calculated c
    WHERE c.is_overtime_applicable = true AND c.total_overtime_minutes > 0
    ON CONFLICT (tenant_id, employee_id, attendance_date)
    DO UPDATE SET
      original_ot_hours = EXCLUDED.original_ot_hours,
      corrected_ot_hours = CASE 
        WHEN ot_approvals.approval_status = 'pending' THEN EXCLUDED.corrected_ot_hours 
        ELSE ot_approvals.corrected_ot_hours 
      END,
      applied_policy_id = EXCLUDED.applied_policy_id,
      applied_policy_name = EXCLUDED.applied_policy_name,
      updated_at = now()
    RETURNING 1
  ),
  -- 4. Delete unneeded entries (those that are now ineligible or have 0 OT)
  delete_results AS (
    DELETE FROM public.ot_approvals
    WHERE attendance_log_id IN (
      -- Ineligible (e.g. missing clock out)
      SELECT log_id FROM ineligible_logs
      UNION
      -- Calculated but resulted in 0 OT
      SELECT log_id FROM calculated WHERE is_overtime_applicable = false OR total_overtime_minutes <= 0
    )
    RETURNING 1
  )
  SELECT 
    (SELECT COUNT(*) FROM upsert_results) as synced,
    (SELECT COUNT(*) FROM delete_results) as deleted
  INTO v_synced, v_deleted;

  RETURN QUERY SELECT v_synced, v_deleted;
END;
$$;
