-- RPC to reconstruct the leave balance for an employee as of a specific past month.
-- Used by Payslip Report to show historical balances, not the current live balance.
--
-- Formula (mirrors sync_leave_balances logic to avoid double-counting):
--   base_days:
--     - opening_balance  → effective_days  (the opening balance is the base)
--     - has credit policy → 0              (credits come from logs only, avoids double-count)
--     - no credit policy  → effective_days (flat allocation, all-at-once)
--   total_days = base_days + credits_up_to_month + carry_forwards_into_year
--   used_days  = approved leave_requests up to end of month
--   balance    = total_days - used_days
--
CREATE OR REPLACE FUNCTION public.get_historical_leave_balance(
  p_employee_id uuid,
  p_year        integer,
  p_month       integer,   -- 1-12, the payslip month
  p_tenant_id   uuid
)
RETURNS TABLE (
  leave_type_id uuid,
  leave_name    text,
  total_days    numeric,
  used_days     numeric,
  balance       numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_year_text     text;
  v_period_prefix text;
BEGIN
  v_year_text     := p_year::text;
  v_period_prefix := p_year::text || '-' || lpad(p_month::text, 2, '0');

  RETURN QUERY
  SELECT
    lt.id   AS leave_type_id,
    lt.name AS leave_name,

    -- ── TOTAL credited up to end of this month ───────────────────────────────
    (
      -- Base: respect credit policy to avoid double-counting
      CASE
        WHEN settings.priority_source = 'opening_balance' THEN
          COALESCE(settings.effective_days, 0)   -- use the opening balance as base
        WHEN lt.credit_policy_type IS NOT NULL AND lt.credit_policy_type <> '' THEN
          0                                       -- credits come from logs; base = 0
        ELSE
          COALESCE(settings.effective_days, 0)   -- flat allocation (no credit policy)
      END

      -- + credits logged up to this month
      + COALESCE((
          SELECT SUM(lpl.days_affected)
          FROM public.leave_processing_logs lpl
          WHERE lpl.employee_id   = p_employee_id
            AND lpl.leave_type_id = lt.id
            AND lpl.tenant_id     = p_tenant_id
            AND lpl.process_type  = 'credit'
            AND (
              lpl.period = v_year_text   -- yearly credit stored as 'YYYY'
              OR (lpl.period LIKE (v_year_text || '-%') AND lpl.period <= v_period_prefix)
            )
        ), 0)

      -- + carry-forwards INTO this year (e.g. period = '2025->2026')
      + COALESCE((
          SELECT SUM(lpl.days_affected)
          FROM public.leave_processing_logs lpl
          WHERE lpl.employee_id   = p_employee_id
            AND lpl.leave_type_id = lt.id
            AND lpl.tenant_id     = p_tenant_id
            AND lpl.process_type  = 'carry_forward'
            AND lpl.period        LIKE ('%->' || v_year_text)
        ), 0)
    ) AS total_days,

    -- ── USED leave taken up to end of this month ────────────────────────────
    COALESCE((
      SELECT SUM(lr.total_days)
      FROM public.leave_requests lr
      WHERE lr.employee_id   = p_employee_id
        AND lr.leave_type_id = lt.id
        AND lr.tenant_id     = p_tenant_id
        AND lr.status        = 'Approved'
        AND EXTRACT(YEAR  FROM lr.end_date) = p_year
        AND EXTRACT(MONTH FROM lr.end_date) <= p_month
    ), 0) AS used_days,

    -- ── BALANCE = total - used ───────────────────────────────────────────────
    (
      CASE
        WHEN settings.priority_source = 'opening_balance' THEN
          COALESCE(settings.effective_days, 0)
        WHEN lt.credit_policy_type IS NOT NULL AND lt.credit_policy_type <> '' THEN
          0
        ELSE
          COALESCE(settings.effective_days, 0)
      END
      + COALESCE((
          SELECT SUM(lpl.days_affected)
          FROM public.leave_processing_logs lpl
          WHERE lpl.employee_id   = p_employee_id
            AND lpl.leave_type_id = lt.id
            AND lpl.tenant_id     = p_tenant_id
            AND lpl.process_type  = 'credit'
            AND (
              lpl.period = v_year_text
              OR (lpl.period LIKE (v_year_text || '-%') AND lpl.period <= v_period_prefix)
            )
        ), 0)
      + COALESCE((
          SELECT SUM(lpl.days_affected)
          FROM public.leave_processing_logs lpl
          WHERE lpl.employee_id   = p_employee_id
            AND lpl.leave_type_id = lt.id
            AND lpl.tenant_id     = p_tenant_id
            AND lpl.process_type  = 'carry_forward'
            AND lpl.period        LIKE ('%->' || v_year_text)
        ), 0)
      - COALESCE((
          SELECT SUM(lr.total_days)
          FROM public.leave_requests lr
          WHERE lr.employee_id   = p_employee_id
            AND lr.leave_type_id = lt.id
            AND lr.tenant_id     = p_tenant_id
            AND lr.status        = 'Approved'
            AND EXTRACT(YEAR  FROM lr.end_date) = p_year
            AND EXTRACT(MONTH FROM lr.end_date) <= p_month
        ), 0)
    ) AS balance

  FROM public.leave_types lt
  CROSS JOIN LATERAL public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id) settings
  WHERE lt.tenant_id  = p_tenant_id
    AND lt.is_active  = true
    AND settings.leave_type_id = lt.id
    AND settings.priority_source <> 'not_applicable'
  ORDER BY lt.name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_historical_leave_balance(uuid, integer, integer, uuid) TO authenticated;

