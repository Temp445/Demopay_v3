-- RPC to get the consolidated and prioritized leave settings for an employee for a specific year
CREATE OR REPLACE FUNCTION public.get_employee_leave_settings(p_employee_id uuid, p_year int, p_tenant_id uuid)
RETURNS TABLE (
    leave_type_id uuid,
    leave_name text,
    master_default_days numeric,
    is_applicable boolean,
    applicable_days numeric,
    opening_days numeric,
    effective_days numeric,
    priority_source text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        lt.id AS leave_type_id,
        lt.name AS leave_name,
        lt.default_days::numeric AS master_default_days,
        COALESCE(ela.is_applicable, true) AS is_applicable,
        ela.applicable_days AS applicable_days,
        elob.opening_days AS opening_days,
        -- Effective Days Logic
        CASE 
            WHEN COALESCE(ela.is_applicable, true) = false THEN 0::numeric
            WHEN elob.opening_days IS NOT NULL THEN elob.opening_days
            WHEN ela.applicable_days IS NOT NULL THEN ela.applicable_days
            ELSE lt.default_days::numeric
        END AS effective_days,
        -- Priority Source Tracker (useful for UI coloring/badges)
        CASE
            WHEN COALESCE(ela.is_applicable, true) = false THEN 'not_applicable'
            WHEN elob.opening_days IS NOT NULL THEN 'opening_balance'
            WHEN ela.applicable_days IS NOT NULL THEN 'applicable_days'
            ELSE 'master_default'
        END AS priority_source
    FROM leave_types lt
    LEFT JOIN employee_leave_applicable ela 
        ON lt.id = ela.leave_type_id 
        AND ela.employee_id = p_employee_id 
        AND ela.tenant_id = p_tenant_id
    LEFT JOIN employee_leave_opening_balance elob 
        ON lt.id = elob.leave_type_id 
        AND elob.employee_id = p_employee_id 
        AND elob.year = p_year
        AND elob.tenant_id = p_tenant_id
    WHERE lt.tenant_id = p_tenant_id OR lt.tenant_id IS NULL; -- Base types might have no tenant_id depending on existing setup
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_leave_settings(uuid, int, uuid) TO authenticated;


-- RPC to bulk save applicable days / opening balances from the new Settings Screen
-- Accepts separate JSON arrays for applicable_days and opening_balances
CREATE OR REPLACE FUNCTION public.upsert_employee_leave_settings(
    p_tenant_id uuid,
    p_applicable_settings jsonb DEFAULT NULL, -- Array of { employee_id, leave_type_id, is_applicable, applicable_days }
    p_opening_balances jsonb DEFAULT NULL     -- Array of { employee_id, leave_type_id, year, opening_days }
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_admin_id uuid;
    item jsonb;
BEGIN
    -- Get caller ID for created_by/updated_by
    v_admin_id := auth.uid();

    -- Process Applicable Settings
    IF p_applicable_settings IS NOT NULL AND jsonb_array_length(p_applicable_settings) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(p_applicable_settings)
        LOOP
            INSERT INTO public.employee_leave_applicable (
                tenant_id, employee_id, leave_type_id, is_applicable, applicable_days, created_by, updated_by
            ) VALUES (
                p_tenant_id,
                (item->>'employee_id')::uuid,
                (item->>'leave_type_id')::uuid,
                COALESCE((item->>'is_applicable')::boolean, true),
                (item->>'applicable_days')::numeric,
                v_admin_id,
                v_admin_id
            )
            ON CONFLICT (tenant_id, employee_id, leave_type_id) 
            DO UPDATE SET 
                is_applicable = EXCLUDED.is_applicable,
                applicable_days = EXCLUDED.applicable_days,
                updated_by = EXCLUDED.updated_by,
                updated_at = now();
        END LOOP;
    END IF;

    -- Process Opening Balances
    IF p_opening_balances IS NOT NULL AND jsonb_array_length(p_opening_balances) > 0 THEN
        FOR item IN SELECT * FROM jsonb_array_elements(p_opening_balances)
        LOOP
            -- If opening_days is effectively null/empty from frontend, delete the row
            IF item->>'opening_days' IS NULL OR item->>'opening_days' = '' THEN
                DELETE FROM public.employee_leave_opening_balance
                WHERE tenant_id = p_tenant_id
                  AND employee_id = (item->>'employee_id')::uuid
                  AND leave_type_id = (item->>'leave_type_id')::uuid
                  AND year = (item->>'year')::int;
            ELSE
                INSERT INTO public.employee_leave_opening_balance (
                    tenant_id, employee_id, leave_type_id, year, opening_days, created_by, updated_by
                ) VALUES (
                    p_tenant_id,
                    (item->>'employee_id')::uuid,
                    (item->>'leave_type_id')::uuid,
                    (item->>'year')::int,
                    (item->>'opening_days')::numeric,
                    v_admin_id,
                    v_admin_id
                )
                ON CONFLICT (tenant_id, employee_id, leave_type_id, year) 
                DO UPDATE SET 
                    opening_days = EXCLUDED.opening_days,
                    updated_by = EXCLUDED.updated_by,
                    updated_at = now();
            END IF;
        END LOOP;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_employee_leave_settings(uuid, jsonb, jsonb) TO authenticated;
