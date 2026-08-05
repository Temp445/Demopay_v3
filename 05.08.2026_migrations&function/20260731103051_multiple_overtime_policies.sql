-- Create overtime_policies table
CREATE TABLE IF NOT EXISTS public.overtime_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    location_status_match text NOT NULL,
    is_default boolean DEFAULT false,
    overtime_enabled boolean DEFAULT false,
    calculation_timing text DEFAULT 'both' CHECK (calculation_timing IN ('before', 'after', 'both')),
    threshold_minutes integer DEFAULT 30 CHECK (threshold_minutes >= 0 AND threshold_minutes <= 480),
    rounding_interval integer DEFAULT 30 CHECK (rounding_interval IN (10, 15, 30, 60)),
    rounding_method text DEFAULT 'nearest' CHECK (rounding_method IN ('nearest', 'midpoint', 'start')),
    rounding_mode text DEFAULT 'combined' CHECK (rounding_mode IN ('separate', 'combined')),
    monthly_hours_type text DEFAULT 'fixed' CHECK (monthly_hours_type IN ('fixed', 'calendar_days')),
    fixed_days numeric(5,2) DEFAULT 26.00,
    working_hours_per_day numeric(5,2) DEFAULT 8.00,
    global_multiplier numeric(5,2) DEFAULT 1.00,
    link_with_payroll boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT overtime_policies_pkey PRIMARY KEY (id),
    CONSTRAINT overtime_policies_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT overtime_policies_tenant_location_key UNIQUE (tenant_id, location_status_match)
);

-- RLS policies
ALTER TABLE public.overtime_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their tenant overtime policies"
  ON public.overtime_policies
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant admins can insert overtime policies"
  ON public.overtime_policies
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users
      WHERE user_id = auth.uid() AND role IN ('tenant_admin', 'owner')
    )
  );

CREATE POLICY "Tenant admins can update overtime policies"
  ON public.overtime_policies
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND role IN ('tenant_admin', 'owner')
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND role IN ('tenant_admin', 'owner')
    )
  );

CREATE POLICY "Tenant admins can delete overtime policies"
  ON public.overtime_policies
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid() AND role IN ('tenant_admin', 'owner')
    )
  );

-- Migrate existing company_settings to overtime_policies
DO $$
DECLARE
    cs RECORD;
BEGIN
    FOR cs IN SELECT * FROM public.company_settings LOOP
        INSERT INTO public.overtime_policies (
            tenant_id,
            name,
            location_status_match,
            is_default,
            overtime_enabled,
            calculation_timing,
            threshold_minutes,
            rounding_interval,
            rounding_method,
            rounding_mode,
            monthly_hours_type,
            fixed_days,
            working_hours_per_day,
            global_multiplier,
            link_with_payroll
        ) VALUES (
            cs.tenant_id,
            'Standard OT',
            'normal',
            true,
            COALESCE(cs.overtime_enabled, false),
            COALESCE(cs.overtime_calculation_timing, 'both'),
            COALESCE(cs.overtime_threshold_minutes, 30),
            COALESCE(cs.overtime_rounding_interval, 30),
            COALESCE(cs.overtime_rounding_method, 'nearest'),
            COALESCE(cs.overtime_rounding_mode, 'combined'),
            COALESCE(cs.ot_monthly_hours_type, 'fixed'),
            COALESCE(cs.ot_fixed_days, 26.00),
            COALESCE(cs.ot_working_hours_per_day, 8.00),
            COALESCE(cs.ot_global_multiplier, 1.00),
            COALESCE(cs.ot_link_with_payroll, false)
        ) ON CONFLICT (tenant_id, location_status_match) DO NOTHING;
    END LOOP;
END;
$$;

-- Drop and recreate functions with new parameter
DROP FUNCTION IF EXISTS public.calculate_overtime(uuid, uuid, time, time, time, time);
DROP FUNCTION IF EXISTS public.get_overtime_config(uuid, uuid);

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
    rounding_mode text
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
    -- Normalize location_status: attendance_logs stores 'Outside Office',
    -- but overtime_policies.location_status_match uses 'outside_office'.
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
    
    -- If shift not found, return disabled
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 'both'::text, 0, 30, 'nearest'::text, 'combined'::text;
        RETURN;
    END IF;
    
    -- Get specific policy by location_status_match (normalized)
    SELECT 
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
        COALESCE(v_policy_config.rounding_mode, 'combined');
END;
$$;

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
    is_overtime_applicable boolean
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
        RETURN QUERY SELECT 0, 0, 0, false;
        RETURN;
    END IF;
    
    -- Calculate before-shift overtime (if applicable)
    IF v_config.calculation_timing IN ('before', 'both') AND 
       p_actual_clock_in IS NOT NULL AND 
       p_actual_clock_in < p_shift_start_time THEN
        -- Calculate minutes difference
        v_before_minutes := EXTRACT(EPOCH FROM (p_shift_start_time - p_actual_clock_in)) / 60;
        v_before_minutes := GREATEST(0, v_before_minutes);
    END IF;
    
    -- Calculate after-shift overtime (if applicable)
    IF v_config.calculation_timing IN ('after', 'both') AND 
       p_actual_clock_out IS NOT NULL AND 
       p_actual_clock_out > p_shift_end_time THEN
        -- Calculate minutes difference
        v_after_minutes := EXTRACT(EPOCH FROM (p_actual_clock_out - p_shift_end_time)) / 60;
        v_after_minutes := GREATEST(0, v_after_minutes);
    END IF;
    
    -- Apply threshold validation and rounding
    IF v_config.rounding_mode = 'separate' THEN
        -- Apply rounding first, then threshold check
        
        -- Before-shift OT
        v_before_rounded := apply_overtime_rounding(
            v_before_minutes, 
            v_config.rounding_interval, 
            v_config.rounding_method
        );
        IF v_before_rounded < v_config.threshold_minutes THEN
            v_before_rounded := 0;
        END IF;
        
        -- After-shift OT
        v_after_rounded := apply_overtime_rounding(
            v_after_minutes, 
            v_config.rounding_interval, 
            v_config.rounding_method
        );
        IF v_after_rounded < v_config.threshold_minutes THEN
            v_after_rounded := 0;
        END IF;
        
        v_total_rounded := v_before_rounded + v_after_rounded;
        
    ELSE
        -- Combined mode: Apply rounding and threshold to total
        v_total_minutes := v_before_minutes + v_after_minutes;
        v_total_rounded := apply_overtime_rounding(
            v_total_minutes, 
            v_config.rounding_interval, 
            v_config.rounding_method
        );
        
        IF v_total_rounded >= v_config.threshold_minutes THEN
            -- Proportionally distribute rounded total back to before/after logically snapping to intervals
            IF v_total_minutes > 0 THEN
                DECLARE
                    raw_before_share numeric := (v_before_minutes::numeric / v_total_minutes::numeric) * v_total_rounded;
                    intervals integer := ROUND(raw_before_share / v_config.rounding_interval);
                BEGIN
                    v_before_rounded := intervals * v_config.rounding_interval;
                    v_before_rounded := LEAST(GREATEST(0, v_before_rounded), v_total_rounded);
                    v_after_rounded := v_total_rounded - v_before_rounded;
                END;
            END IF;
        ELSE
            v_total_rounded := 0;
            v_before_rounded := 0;
            v_after_rounded := 0;
        END IF;
    END IF;
    
    -- Return calculated overtime
    RETURN QUERY SELECT
        v_before_rounded,
        v_after_rounded,
        v_total_rounded,
        (v_total_rounded > 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_overtime_config TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_overtime TO authenticated;

-- We need to update auto_generate_ot_approval_on_clockout and bulk_sync_overtime_for_period
-- so they pass location_status.

CREATE OR REPLACE FUNCTION public.auto_generate_ot_approval_on_clockout()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_shift_id uuid;
  v_tenant_id uuid;
  v_shift_start_time time;
  v_shift_end_time time;
  v_clock_in_time time;
  v_clock_out_time time;
  v_ot_result record;
  v_should_cleanup boolean := false;
BEGIN
  IF NEW.clock_out IS NULL THEN
    RETURN NEW;
  END IF;

  v_tenant_id := NEW.tenant_id;
  v_shift_id := NEW.shift_id;

  -- Verify tracking is needed
  IF v_shift_id IS NULL THEN
    v_should_cleanup := true;
  END IF;

  -- ----------------------------------------------------------------
  -- Retrieve Shift Times (only if not cleaning up)
  -- ----------------------------------------------------------------
  IF NOT v_should_cleanup THEN
    SELECT start_time, end_time INTO v_shift_start_time, v_shift_end_time
    FROM public.shifts
    WHERE id = v_shift_id;

    IF v_shift_start_time IS NULL OR v_shift_end_time IS NULL THEN
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

    -- Call calculation with location_status
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
      original_ot_hours, corrected_ot_hours, modification_reason, approval_status, created_at, updated_at
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
      now()
    )
    ON CONFLICT (tenant_id, employee_id, attendance_date)
    DO UPDATE SET
      original_ot_hours = EXCLUDED.original_ot_hours,
      -- Don't overwrite corrected_ot_hours if it was already modified
      corrected_ot_hours = CASE 
        WHEN ot_approvals.approval_status = 'pending' THEN EXCLUDED.corrected_ot_hours 
        ELSE ot_approvals.corrected_ot_hours 
      END,
      updated_at = now();
      
  ELSE
    -- CLEANUP Record: delete if no longer applicable but was created before
    DELETE FROM public.ot_approvals 
    WHERE attendance_log_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


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
  -- 1. Determine eligible vs ineligible logs
  WITH target_logs AS (
    SELECT 
      al.id as log_id,
      al.employee_id,
      al.date as attendance_date,
      al.clock_in,
      al.clock_out,
      al.tenant_id,
      al.shift_id,
      al.location_status,
      -- Valid logic: must have out time, shift
      (al.clock_in IS NOT NULL AND al.clock_out IS NOT NULL AND al.shift_id IS NOT NULL) as is_valid
    FROM public.attendance_logs al
    WHERE al.date >= p_start_date AND al.date <= p_end_date
      AND al.tenant_id = p_tenant_id
      AND (p_employee_ids IS NULL OR al.employee_id = ANY(p_employee_ids))
  ),
  eligible_logs AS (
    SELECT * FROM target_logs WHERE is_valid = true
  ),
  ineligible_logs AS (
    SELECT * FROM target_logs WHERE is_valid = false
  ),
  -- 2. Calculate OT for eligible logs
  logs_with_shifts AS (
    SELECT 
      el.*,
      s.start_time as shift_start,
      s.end_time as shift_end,
      -- Convert clock_in/out to local time accurately for calculation
      (el.clock_in AT TIME ZONE 'Asia/Kolkata')::time as actual_in,
      (el.clock_out AT TIME ZONE 'Asia/Kolkata')::time as actual_out
    FROM eligible_logs el
    JOIN public.shifts s ON el.shift_id = s.id
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
      ls.actual_out,
      ls.location_status
    ) cal
  ),
  -- 3. Perform the bulk UPSERT
  upsert_results AS (
    INSERT INTO public.ot_approvals (
      tenant_id, employee_id, attendance_log_id, attendance_date,
      original_ot_hours, corrected_ot_hours, modification_reason, approval_status, created_at, updated_at
    )
    SELECT 
      c.tenant_id, c.employee_id, c.log_id, c.attendance_date,
      c.total_overtime_minutes, c.total_overtime_minutes, 
      'Bulk sync recalculation', 'pending', now(), now()
    FROM calculated c
    WHERE c.is_overtime_applicable = true AND c.total_overtime_minutes > 0
    ON CONFLICT (tenant_id, employee_id, attendance_date)
    DO UPDATE SET
      original_ot_hours = EXCLUDED.original_ot_hours,
      corrected_ot_hours = CASE 
        WHEN ot_approvals.approval_status = 'pending' THEN EXCLUDED.corrected_ot_hours 
        ELSE ot_approvals.corrected_ot_hours 
      END,
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
    AND attendance_date >= p_start_date AND attendance_date <= p_end_date
    AND tenant_id = p_tenant_id
    RETURNING 1
  )
  SELECT 
    (SELECT count(*) FROM upsert_results) as s_count,
    (SELECT count(*) FROM delete_results) as d_count
  INTO v_synced, v_deleted;

  RETURN QUERY SELECT v_synced, v_deleted;
END;
$$;

-- Add ot_structure_id to overtime_policies

ALTER TABLE public.overtime_policies
ADD COLUMN IF NOT EXISTS ot_structure_id uuid;

ALTER TABLE public.overtime_policies
ADD CONSTRAINT overtime_policies_ot_structure_id_fkey 
FOREIGN KEY (ot_structure_id) 
REFERENCES public.ot_structures(id) 
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_overtime_policies_ot_structure_id 
ON public.overtime_policies(ot_structure_id);
