/*
  # Fix Leave Balance Seeding for Credit Policy Leave Types

  Problem:
    ensure_leave_balance() always seeds with default_days.
    auto_apply_leave_credit() then adds on top → double-counting.

  Fix:
    1. Update ensure_leave_balance to seed with 0 when credit_policy_type is configured.
    2. Correct existing wrong balances by subtracting the wrongly-seeded default_days.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Update ensure_leave_balance to seed with 0 for credit-policy leave types
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ensure_leave_balance(p_employee_id uuid, p_leave_type_id uuid, p_year integer, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_default_days        integer;
  v_credit_policy_type  text;
  v_initial_days        integer;
  v_created_by          uuid;
BEGIN

  -- get current user
  v_created_by := auth.uid();

  -- if auth.uid() is null get admin user
  IF v_created_by IS NULL THEN
    SELECT id INTO v_created_by
    FROM user_profiles
    WHERE tenant_id = p_tenant_id AND lower(user_role) = 'admin'
    LIMIT 1;
  END IF;

  -- Get leave type configuration
  SELECT default_days, credit_policy_type
  INTO v_default_days, v_credit_policy_type
  FROM public.leave_types
  WHERE id = p_leave_type_id AND tenant_id = p_tenant_id;

  -- If a credit policy is configured, start at 0 (credits will be added by auto_apply_leave_credit)
  -- If no credit policy, seed with default_days as before (backward compat)
  IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
    v_initial_days := 0;
  ELSE
    v_initial_days := COALESCE(v_default_days, 0);
  END IF;

  -- Insert balance row only if it doesn't exist yet
  IF NOT EXISTS (
    SELECT 1
    FROM public.leave_balances
    WHERE employee_id   = p_employee_id
      AND leave_type_id = p_leave_type_id
      AND year          = p_year
  ) THEN
    INSERT INTO public.leave_balances (
      employee_id,
      leave_type_id,
      year,
      total_days,
      used_days,
      created_by,
    tenant_id
    ) VALUES (
      p_employee_id,
      p_leave_type_id,
      p_year,
      v_initial_days,
      0,
      v_created_by,
      p_tenant_id
    )
    ON CONFLICT (employee_id, leave_type_id, year) DO NOTHING;
  END IF;
END;
$function$;
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Correct existing wrong balances (subtract the wrongly-seeded default_days)
--
--    For each leave_balance row where:
--      - the leave_type has a credit_policy_type set
--      - total_days > used_days  (safe to reduce without going below what's used)
--    subtract default_days from total_days, flooring at used_days.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.leave_balances lb
SET
  total_days = GREATEST(
    lb.used_days,                              -- never go below used
    lb.total_days - COALESCE(lt.default_days, 0)
  ),
  updated_at = now()
FROM public.leave_types lt
WHERE lb.leave_type_id = lt.id
  AND lt.credit_policy_type IS NOT NULL
  AND lt.credit_policy_type <> ''
  AND lb.total_days > COALESCE(lt.default_days, 0) -- only rows that were double-counted
  AND lb.total_days > lb.used_days;                 -- safety: only if reducing is safe

COMMENT ON FUNCTION ensure_leave_balance IS 'Seeds leave balance on first access. Seeds 0 for credit-policy types (credits applied separately). Seeds default_days for non-policy types.';
