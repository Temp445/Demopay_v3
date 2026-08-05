/*
  # Add Shift Reassignment History and update Bulk Assignments

  1. New Tables
    - `shift_reassignment_history`: Tracks when employees are reassigned from one shift to another.
  
  2. Updates
    - Modifies `create_bulk_assignments` to accept `p_reassign_reason`.
    - Handles conflict resolution, replacing the old shift assignment, and logging the change if a reason is provided.
*/

CREATE TABLE IF NOT EXISTS public.shift_reassignment_history (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
    employee_name text,
    employee_code text,
    previous_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
    previous_shift_name text,
    reassigned_shift_id uuid REFERENCES public.shifts(id) ON DELETE SET NULL,
    reassigned_shift_name text,
    schedule_date date NOT NULL,
    reason text,
    reassigned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    tenant_id uuid NOT NULL,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shift_reassignment_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view shift_reassignment_history for their tenant"
  ON public.shift_reassignment_history FOR SELECT
  USING (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

CREATE POLICY "Users can insert shift_reassignment_history for their tenant"
  ON public.shift_reassignment_history FOR INSERT
  WITH CHECK (tenant_id = (SELECT tenant_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

-- Drop all variants of the function
DROP FUNCTION IF EXISTS create_bulk_assignments(uuid, uuid[], date, date, text);
DROP FUNCTION IF EXISTS create_bulk_assignments(uuid, uuid[], date, date, text, uuid);
DROP FUNCTION IF EXISTS create_bulk_assignments(uuid, uuid[], date, date, text, uuid, text);

-- Recreate with holiday/weekly off exclusion logic AND reassign logic
CREATE OR REPLACE FUNCTION create_bulk_assignments(
  p_shift_id uuid,
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_reassign_reason text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  assignments jsonb,
  errors jsonb[],
  skipped_dates jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment record;
  v_errors jsonb[] := array[]::jsonb[];
  v_assignments jsonb := '[]'::jsonb;
  v_skipped_dates jsonb := '[]'::jsonb;
  v_current_date date;
  v_end_date date;
  v_employee_id uuid;
  v_is_holiday boolean;
  v_is_weekly_off boolean;
  v_holiday_name text;
  v_skip_reason text;
  v_existing_assignment record;
  v_new_shift_name text;
  v_emp_name text;
  v_emp_code text;
BEGIN
  -- Begin transaction
  BEGIN
    -- Set end date if not provided
    v_end_date := COALESCE(p_end_date, p_start_date);
    
    -- Get new shift name for history
    SELECT name INTO v_new_shift_name FROM public.shifts WHERE id = p_shift_id;
    
    -- Loop through dates
    v_current_date := p_start_date;
    WHILE v_current_date <= v_end_date LOOP
      -- Reset flags for each date
      v_is_holiday := false;
      v_is_weekly_off := false;
      v_holiday_name := NULL;
      v_skip_reason := NULL;
      
      -- Check if current date is a specific holiday
      IF p_tenant_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 
          FROM public.holidays h
          WHERE h.date = v_current_date
          AND h.tenant_id = p_tenant_id
          AND COALESCE(h.is_active, true) = true
        ) INTO v_is_holiday;
        
        -- Get holiday name if it's a holiday
        IF v_is_holiday THEN
          SELECT h.name INTO v_holiday_name
          FROM public.holidays h
          WHERE h.date = v_current_date
          AND h.tenant_id = p_tenant_id
          AND COALESCE(h.is_active, true) = true
          LIMIT 1;
          
          v_skip_reason := format('Holiday: %s', v_holiday_name);
        END IF;
      END IF;
      
      -- Check if current date is a weekly off (recurring pattern)
      IF NOT v_is_holiday AND p_tenant_id IS NOT NULL THEN
        SELECT EXISTS (
          SELECT 1 
          FROM public.holiday_recurring_patterns hrp
          WHERE TRIM(LOWER(hrp.week_day)) = TRIM(LOWER(to_char(v_current_date, 'Day')))
          AND hrp.tenant_id = p_tenant_id
          AND COALESCE(hrp.is_active, true) = true
          AND hrp.week_occurrence = ''
        ) INTO v_is_weekly_off;
        
        IF v_is_weekly_off THEN
          v_skip_reason := format('Weekly off: %s', INITCAP(TRIM(to_char(v_current_date, 'Day'))));
        END IF;
      END IF;
      
      -- If date is a holiday or weekly off, skip all employees for this date
      IF v_is_holiday OR v_is_weekly_off THEN
        v_skipped_dates := v_skipped_dates || jsonb_build_object(
          'date', v_current_date,
          'reason', v_skip_reason,
          'is_holiday', v_is_holiday,
          'is_weekly_off', v_is_weekly_off,
          'employee_count', array_length(p_employee_ids, 1)
        );
        
        v_current_date := v_current_date + interval '1 day';
        CONTINUE;
      END IF;
      
      -- Process employees for this working day
      FOREACH v_employee_id IN ARRAY p_employee_ids
      LOOP
        -- Check if employee exists and get name/code for history
        SELECT name, employee_code INTO v_emp_name, v_emp_code 
        FROM public.employees WHERE id = v_employee_id;
        
        -- Validate shift conflict
        SELECT sa.*, s.name as shift_name INTO v_existing_assignment
        FROM public.shift_assignments sa
        JOIN public.shifts s ON sa.shift_id = s.id
        WHERE sa.employee_id = v_employee_id
        AND sa.schedule_date = v_current_date
        AND sa.tenant_id = p_tenant_id
        LIMIT 1;
        
        IF FOUND THEN
          -- If already assigned to the SAME shift, skip without error
          IF v_existing_assignment.shift_id = p_shift_id THEN
             CONTINUE;
          END IF;
          
          -- If assigned to a DIFFERENT shift
          IF p_reassign_reason IS NULL THEN
            -- No reason provided, return error
            v_errors := array_append(v_errors, jsonb_build_object(
              'code', 'SHIFT_CONFLICT',
              'message', format('Employee already has a shift on %s', v_current_date),
              'details', jsonb_build_object(
                'employee_id', v_employee_id,
                'date', v_current_date
              )
            ));
            CONTINUE;
          ELSE
            -- Reason provided, check status
            IF v_existing_assignment.status IN ('in_progress', 'completed', 'absent') THEN
              v_errors := array_append(v_errors, jsonb_build_object(
                'code', 'SHIFT_CONFLICT_UNRESOLVABLE',
                'message', format('Cannot reassign on %s because shift is %s', v_current_date, v_existing_assignment.status),
                'details', jsonb_build_object(
                  'employee_id', v_employee_id,
                  'date', v_current_date,
                  'status', v_existing_assignment.status
                )
              ));
              CONTINUE;
            END IF;
            
            -- Reassign: record history, delete old, insert new
            INSERT INTO public.shift_reassignment_history (
              employee_id, employee_name, employee_code,
              previous_shift_id, previous_shift_name,
              reassigned_shift_id, reassigned_shift_name,
              schedule_date, reason, reassigned_by, tenant_id
            ) VALUES (
              v_employee_id, v_emp_name, v_emp_code,
              v_existing_assignment.shift_id, v_existing_assignment.shift_name,
              p_shift_id, v_new_shift_name,
              v_current_date, p_reassign_reason, auth.uid(), p_tenant_id
            );
            
            DELETE FROM public.shift_assignments WHERE id = v_existing_assignment.id;
          END IF;
        END IF;

        -- Create assignment for working day
        INSERT INTO public.shift_assignments (
          shift_id,
          employee_id,
          schedule_date,
          status,
          tenant_id
        )
        VALUES (
          p_shift_id,
          v_employee_id,
          v_current_date,
          'scheduled',
          p_tenant_id
        )
        RETURNING * INTO v_assignment;

        -- Add to assignments array
        v_assignments := v_assignments || jsonb_build_object(
          'id', v_assignment.id,
          'shift_id', v_assignment.shift_id,
          'employee_id', v_assignment.employee_id,
          'schedule_date', v_assignment.schedule_date,
          'status', v_assignment.status
        );
      END LOOP;
      
      v_current_date := v_current_date + interval '1 day';
    END LOOP;

    -- Return success with assignments, errors, and skipped dates
    RETURN QUERY SELECT 
      true, 
      v_assignments, 
      CASE 
        WHEN array_length(v_errors, 1) > 0 THEN v_errors 
        ELSE array[]::jsonb[] 
      END,
      v_skipped_dates;
      
  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback transaction on any error
      RAISE EXCEPTION '%', SQLERRM;
  END;
EXCEPTION
  WHEN OTHERS THEN
    -- Return error information
    RETURN QUERY SELECT 
      false,
      '[]'::jsonb,
      array[jsonb_build_object(
        'code', SQLSTATE,
        'message', SQLERRM,
        'details', jsonb_build_object(
          'context', 'Bulk assignment failed'
        )
      )],
      '[]'::jsonb;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_bulk_assignments TO authenticated;

COMMENT ON FUNCTION public.create_bulk_assignments IS 
'Creates bulk shift assignments for multiple employees across a date range. 
Automatically skips holidays and weekly off days based on tenant configuration. 
Supports shift reassignment tracking via p_reassign_reason.
Returns created assignments, any errors, and information about skipped dates.';
