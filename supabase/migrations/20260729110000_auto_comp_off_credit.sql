-- Auto-Credit Comp Off tracking table and function

-- Create a tracking table to ensure we don't credit comp off multiple times for the same date
CREATE TABLE IF NOT EXISTS public.attendance_comp_off_credits (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
    date date NOT NULL,
    created_at timestamptz DEFAULT now(),
    UNIQUE(employee_id, date)
);

-- Purpose: Add credited_amount tracking to allow updating comp off balances for existing records

DO $$
BEGIN
  -- Add credited_amount column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_comp_off_credits' AND column_name = 'credited_amount'
  ) THEN
    ALTER TABLE public.attendance_comp_off_credits ADD COLUMN credited_amount numeric(5,1) DEFAULT 0;
  END IF;
END $$;

-- Update the auto_credit_comp_off function to support upserts and diff calculation
CREATE OR REPLACE FUNCTION public.auto_credit_comp_off(
    p_tenant_id uuid,
    p_employee_id uuid,
    p_date date,
    p_leave_type_id uuid,
    p_credit_amount numeric DEFAULT 1.0
)
RETURNS boolean AS $$
DECLARE
    v_year integer;
    v_old_amount numeric(5,1);
    v_difference numeric(5,1);
BEGIN
    v_year := extract(year from p_date);

    -- Try to find if a credit already exists for this date
    SELECT credited_amount INTO v_old_amount 
    FROM public.attendance_comp_off_credits 
    WHERE employee_id = p_employee_id AND date = p_date;

    IF FOUND THEN
        -- If old amount is NULL because it was created before this column existed, assume 1.0 (from first migration)
        IF v_old_amount IS NULL THEN
            v_old_amount := 1.0;
        END IF;

        -- Calculate the difference (e.g. they had 0.5, now they deserve 1.0 -> difference = +0.5)
        -- Or they had 1.0, now they are Absent -> difference = -1.0
        v_difference := p_credit_amount - v_old_amount;

        IF v_difference = 0 THEN
            RETURN false; -- Nothing to update
        END IF;

        -- Update the tracking table to reflect the new amount
        UPDATE public.attendance_comp_off_credits
        SET credited_amount = p_credit_amount
        WHERE employee_id = p_employee_id AND date = p_date;

        -- Update the leave balances table
        UPDATE public.leave_balances
        SET 
            total_days = total_days + v_difference,
            updated_at = now()
        WHERE employee_id = p_employee_id 
            AND leave_type_id = p_leave_type_id
            AND year = v_year;

    ELSE
        -- No existing record, treat as a brand new credit
        IF p_credit_amount = 0 THEN
            RETURN false; -- Absent on first save, no credit needed
        END IF;

        INSERT INTO public.attendance_comp_off_credits (tenant_id, employee_id, date, credited_amount)
        VALUES (p_tenant_id, p_employee_id, p_date, p_credit_amount);

        -- Update existing leave balance
        UPDATE public.leave_balances
        SET 
            total_days = total_days + p_credit_amount,
            updated_at = now()
        WHERE employee_id = p_employee_id 
            AND leave_type_id = p_leave_type_id
            AND year = v_year;
            
        -- If no balance record exists for this year, insert one
        IF NOT FOUND THEN
            INSERT INTO public.leave_balances (
                employee_id,
                leave_type_id,
                year,
                total_days,
                used_days,
                tenant_id
            ) VALUES (
                p_employee_id,
                p_leave_type_id,
                v_year,
                p_credit_amount,
                0,
                p_tenant_id
            );
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;