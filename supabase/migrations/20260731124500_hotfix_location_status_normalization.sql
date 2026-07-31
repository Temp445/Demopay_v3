-- Hotfix: Normalize location_status before matching overtime_policies.
-- The attendance_logs table stores 'Outside Office' (human-readable) but
-- overtime_policies.location_status_match stores 'outside_office' (snake_case).
-- This mismatch caused the trigger to always fall back to the default policy
-- for employees clocking out from 'Outside Office' locations.

-- Drop and recreate get_overtime_config with normalization logic.
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

    -- Get matching policy for the normalized location status
    SELECT 
        op.id AS policy_id,
        op.name AS policy_name,
        op.overtime_enabled,
        op.calculation_timing,
        op.threshold_minutes,
        op.rounding_interval,
        op.rounding_method,
        op.rounding_mode
    INTO v_policy_config
    FROM public.overtime_policies op
    WHERE op.tenant_id = p_tenant_id 
      AND op.location_status_match = v_normalized_location;
    
    -- If not found, try to get the default policy
    IF NOT FOUND THEN
        SELECT 
            op.id AS policy_id,
            op.name AS policy_name,
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

    -- If still no policy config, use system defaults
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

GRANT EXECUTE ON FUNCTION public.get_overtime_config TO authenticated;
