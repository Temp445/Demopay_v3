-- supabase/migrations/20260307134000_fix_apply_leave_settings_to_balance.sql

CREATE OR REPLACE FUNCTION public.apply_leave_settings_to_balance(p_employee_id uuid, p_year int, p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    rec record;
    v_credit_policy_type text;
    v_fixed_credit_frequency text;
    v_new_total numeric;
    v_credits_already_applied numeric;
BEGIN
    -- Loop through all leave types for this employee for the given year
    FOR rec IN 
        SELECT * FROM public.get_employee_leave_settings(p_employee_id, p_year, p_tenant_id)
    LOOP
        SELECT credit_policy_type, fixed_credit_frequency 
        INTO v_credit_policy_type, v_fixed_credit_frequency
        FROM public.leave_types 
        WHERE id = rec.leave_type_id AND tenant_id = p_tenant_id;

        -- Check how many credits have been applied historically by auto_apply_leave_credit
        -- We extract this from the logs so we don't lose credits when resetting the base balance
        SELECT COALESCE(SUM(days_affected), 0) INTO v_credits_already_applied
        FROM leave_processing_logs
        WHERE employee_id = p_employee_id 
          AND leave_type_id = rec.leave_type_id 
          AND tenant_id = p_tenant_id
          AND process_type = 'credit'
          AND period LIKE (p_year::text || '%');

        -- Determine the base total days
        IF rec.priority_source = 'not_applicable' THEN
            v_new_total := 0;
            -- If we are marking it as not applicable, we should also delete from processing logs 
            -- so it doesn't leave bad historical data, but the total overrides it anyway.
        ELSIF rec.priority_source = 'opening_balance' THEN
             -- If it's yearly, opening balance is the entire allocated amount.
             IF v_credit_policy_type = 'fixed' AND v_fixed_credit_frequency = 'yearly' THEN
                 v_new_total := rec.effective_days;
             ELSE
                 -- For monthly/earned, opening balance acts as the initial carry forward, plus any monthly increments accrued
                 v_new_total := rec.effective_days + v_credits_already_applied;
             END IF;
        ELSE
            IF v_credit_policy_type IS NOT NULL AND v_credit_policy_type <> '' THEN
                IF v_credit_policy_type = 'fixed' AND v_fixed_credit_frequency = 'yearly' THEN
                    -- For Yearly, the settings (effective_days) is exactly the total. Historical logs are irrelevant.
                    v_new_total := rec.effective_days;
                ELSE
                    -- For monthly/earned, it starts at 0, plus whatever has actively accrued
                    v_new_total := 0 + v_credits_already_applied;
                END IF;
            ELSE
                -- Full amount granted at once (no credit policy, e.g. legacy fallback)
                v_new_total := rec.effective_days;
            END IF;
        END IF;

        -- Update existing balance or do nothing if it doesn't exist yet (will be handled by ensure_balance later)
        UPDATE public.leave_balances
        SET total_days = v_new_total,
            updated_at = now()
        WHERE employee_id = p_employee_id 
          AND leave_type_id = rec.leave_type_id 
          AND year = p_year
          AND tenant_id = p_tenant_id;

    END LOOP;
END;
$$;
