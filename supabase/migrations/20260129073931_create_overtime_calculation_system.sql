/*
  # Create Overtime Calculation System
  
  ## Description
  Implements a two-tier overtime calculation system with global (company-level) and 
  shift-level configuration controls. Supports threshold-based overtime, flexible 
  rounding rules, and before/after shift overtime calculation.
  
  ## Changes
  
  1. Company Settings Updates (Global Configuration)
    - `overtime_enabled` (boolean) - Master toggle for overtime system
    - `overtime_calculation_timing` (text) - before, after, or both
    - `overtime_threshold_minutes` (integer) - Minimum minutes to qualify for overtime
    - `overtime_rounding_interval` (integer) - 10, 15, 30, or 60 minutes
    - `overtime_rounding_method` (text) - nearest, midpoint, or start
    - `overtime_rounding_mode` (text) - separate or combined (for both timing)
  
  2. Shifts Table Updates (Shift-Level Configuration)
    - `overtime_enabled` (boolean) - Per-shift overtime toggle
    - `overtime_calculation_timing` (text) - before, after, or both (overrides global)
    - `overtime_config_override` (boolean) - Whether to use shift-specific config
  
  3. New Functions
    - `calculate_overtime` - Core overtime calculation function
    - `apply_overtime_rounding` - Rounding logic implementation
    - `get_overtime_config` - Retrieves effective overtime configuration
  
  ## Calculation Logic
  - Before-shift OT = Shift Start Time - Actual Clock-in Time (if early)
  - After-shift OT = Actual Clock-out Time - Shift End Time (if late)
  - Threshold validation: OT counted only if exceeds threshold
  - When threshold exceeded, full duration counts (threshold not deducted)
  - Rounding applied per configuration (separate or combined)
  
  ## Security
  - All RLS policies preserved
  - Functions use SECURITY DEFINER for proper access
  - Tenant isolation maintained
*/

-- ============================================================================
-- PART 1: Update company_settings table with overtime configuration
-- ============================================================================

DO $$
BEGIN
  -- Add overtime_enabled column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'overtime_enabled'
  ) THEN
    ALTER TABLE public.company_settings 
    ADD COLUMN overtime_enabled boolean DEFAULT false;
  END IF;
  
  -- Add overtime_calculation_timing column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'overtime_calculation_timing'
  ) THEN
    ALTER TABLE public.company_settings 
    ADD COLUMN overtime_calculation_timing text DEFAULT 'both' 
    CHECK (overtime_calculation_timing IN ('before', 'after', 'both'));
  END IF;
  
  -- Add overtime_threshold_minutes column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'overtime_threshold_minutes'
  ) THEN
    ALTER TABLE public.company_settings 
    ADD COLUMN overtime_threshold_minutes integer DEFAULT 30 
    CHECK (overtime_threshold_minutes >= 0 AND overtime_threshold_minutes <= 480);
  END IF;
  
  -- Add overtime_rounding_interval column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'overtime_rounding_interval'
  ) THEN
    ALTER TABLE public.company_settings 
    ADD COLUMN overtime_rounding_interval integer DEFAULT 30 
    CHECK (overtime_rounding_interval IN (10, 15, 30, 60));
  END IF;
  
  -- Add overtime_rounding_method column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'overtime_rounding_method'
  ) THEN
    ALTER TABLE public.company_settings 
    ADD COLUMN overtime_rounding_method text DEFAULT 'nearest' 
    CHECK (overtime_rounding_method IN ('nearest', 'midpoint', 'start'));
  END IF;
  
  -- Add overtime_rounding_mode column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'company_settings' AND column_name = 'overtime_rounding_mode'
  ) THEN
    ALTER TABLE public.company_settings 
    ADD COLUMN overtime_rounding_mode text DEFAULT 'combined' 
    CHECK (overtime_rounding_mode IN ('separate', 'combined'));
  END IF;
END $$;

-- ============================================================================
-- PART 2: Update shifts table with per-shift overtime configuration
-- ============================================================================

DO $$
BEGIN
  -- Add overtime_enabled column to shifts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shifts' AND column_name = 'overtime_enabled'
  ) THEN
    ALTER TABLE public.shifts 
    ADD COLUMN overtime_enabled boolean DEFAULT true;
  END IF;
  
  -- Add overtime_calculation_timing column to shifts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shifts' AND column_name = 'overtime_calculation_timing'
  ) THEN
    ALTER TABLE public.shifts 
    ADD COLUMN overtime_calculation_timing text DEFAULT NULL 
    CHECK (overtime_calculation_timing IS NULL OR overtime_calculation_timing IN ('before', 'after', 'both'));
  END IF;
  
  -- Add overtime_config_override column to shifts
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'shifts' AND column_name = 'overtime_config_override'
  ) THEN
    ALTER TABLE public.shifts 
    ADD COLUMN overtime_config_override boolean DEFAULT false;
  END IF;
END $$;

-- ============================================================================
-- PART 3: Create overtime rounding function
-- ============================================================================

CREATE OR REPLACE FUNCTION apply_overtime_rounding(
  p_minutes integer,
  p_interval integer,
  p_method text
)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_quotient integer;
  v_remainder integer;
  v_rounded integer;
BEGIN
  -- If minutes is 0 or negative, return 0
  IF p_minutes <= 0 THEN
    RETURN 0;
  END IF;
  
  -- Calculate quotient and remainder
  v_quotient := p_minutes / p_interval;
  v_remainder := p_minutes % p_interval;
  
  -- Apply rounding method
  CASE p_method
    WHEN 'nearest' THEN
      -- Round to nearest interval
      IF v_remainder >= (p_interval / 2.0) THEN
        v_rounded := (v_quotient + 1) * p_interval;
      ELSE
        v_rounded := v_quotient * p_interval;
      END IF;
      
    WHEN 'midpoint' THEN
      -- Round up at midpoint, down below
      IF v_remainder > (p_interval / 2.0) THEN
        v_rounded := (v_quotient + 1) * p_interval;
      ELSE
        v_rounded := v_quotient * p_interval;
      END IF;
      
    WHEN 'start' THEN
      -- Always round down to start of interval
      v_rounded := v_quotient * p_interval;
      
    ELSE
      -- Default to nearest
      IF v_remainder >= (p_interval / 2.0) THEN
        v_rounded := (v_quotient + 1) * p_interval;
      ELSE
        v_rounded := v_quotient * p_interval;
      END IF;
  END CASE;
  
  RETURN v_rounded;
END;
$$;

-- ============================================================================
-- PART 4: Create function to get effective overtime configuration
-- ============================================================================

CREATE OR REPLACE FUNCTION get_overtime_config(
  p_shift_id uuid,
  p_tenant_id uuid
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
  v_global_config record;
BEGIN
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
  
  -- Get global configuration
  SELECT 
    cs.overtime_enabled,
    cs.overtime_calculation_timing,
    cs.overtime_threshold_minutes,
    cs.overtime_rounding_interval,
    cs.overtime_rounding_method,
    cs.overtime_rounding_mode
  INTO v_global_config
  FROM public.company_settings cs
  WHERE cs.tenant_id = p_tenant_id;
  
  -- If no global config, use defaults
  IF NOT FOUND THEN
    v_global_config.overtime_enabled := false;
    v_global_config.overtime_calculation_timing := 'both';
    v_global_config.overtime_threshold_minutes := 30;
    v_global_config.overtime_rounding_interval := 30;
    v_global_config.overtime_rounding_method := 'nearest';
    v_global_config.overtime_rounding_mode := 'combined';
  END IF;
  
  -- Return effective configuration
  RETURN QUERY SELECT
    -- Enabled: Both global and shift must be enabled
    COALESCE(v_global_config.overtime_enabled, false) AND COALESCE(v_shift_overtime_enabled, true),
    -- Timing: Use shift override if configured, otherwise global
    CASE 
      WHEN v_shift_config_override AND v_shift_timing IS NOT NULL THEN v_shift_timing
      ELSE COALESCE(v_global_config.overtime_calculation_timing, 'both')
    END,
    -- All other settings come from global config
    COALESCE(v_global_config.overtime_threshold_minutes, 30),
    COALESCE(v_global_config.overtime_rounding_interval, 30),
    COALESCE(v_global_config.overtime_rounding_method, 'nearest'),
    COALESCE(v_global_config.overtime_rounding_mode, 'combined');
END;
$$;

-- ============================================================================
-- PART 5: Create main overtime calculation function
-- ============================================================================

CREATE OR REPLACE FUNCTION calculate_overtime(
  p_shift_id uuid,
  p_tenant_id uuid,
  p_shift_start_time time,
  p_shift_end_time time,
  p_actual_clock_in time,
  p_actual_clock_out time
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
  SELECT * INTO v_config FROM get_overtime_config(p_shift_id, p_tenant_id);
  
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

-- ============================================================================
-- PART 6: Grant permissions
-- ============================================================================

GRANT EXECUTE ON FUNCTION apply_overtime_rounding TO authenticated;
GRANT EXECUTE ON FUNCTION get_overtime_config TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_overtime TO authenticated;

-- ============================================================================
-- PART 7: Add helpful comments
-- ============================================================================

COMMENT ON COLUMN public.company_settings.overtime_enabled IS 
'Master toggle to enable/disable overtime calculation system-wide';

COMMENT ON COLUMN public.company_settings.overtime_calculation_timing IS 
'When to calculate overtime: before shift start, after shift end, or both';

COMMENT ON COLUMN public.company_settings.overtime_threshold_minutes IS 
'Minimum overtime minutes required to qualify. When exceeded, full duration counts';

COMMENT ON COLUMN public.company_settings.overtime_rounding_interval IS 
'Rounding interval in minutes: 10, 15, 30, or 60';

COMMENT ON COLUMN public.company_settings.overtime_rounding_method IS 
'Rounding method: nearest (round to nearest), midpoint (up at midpoint), start (always down)';

COMMENT ON COLUMN public.company_settings.overtime_rounding_mode IS 
'For both timing: separate (round each period) or combined (round total)';

COMMENT ON COLUMN public.shifts.overtime_enabled IS 
'Per-shift overtime toggle. Both global and shift must be enabled';

COMMENT ON COLUMN public.shifts.overtime_config_override IS 
'Whether this shift uses custom timing configuration';

COMMENT ON COLUMN public.shifts.overtime_calculation_timing IS 
'Shift-specific timing override. NULL uses global setting';

COMMENT ON FUNCTION apply_overtime_rounding IS 
'Applies rounding to overtime minutes based on interval and method';

COMMENT ON FUNCTION get_overtime_config IS 
'Retrieves effective overtime configuration considering both global and shift-level settings';

COMMENT ON FUNCTION calculate_overtime IS 
'Calculates overtime for a shift considering all configuration rules and thresholds';
