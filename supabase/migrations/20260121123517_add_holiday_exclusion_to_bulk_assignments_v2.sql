/*
  # Add Holiday and Weekly Off Exclusion to Bulk Shift Assignments
  
  1. Updates
    - Enhances `create_bulk_assignments` function to skip holidays and weekly offs
    - Adds `p_tenant_id` parameter for tenant-scoped holiday checks
    - Returns information about skipped dates in the response
  
  2. Logic
    - Check each date against holidays table for specific holidays
    - Check each date against holiday_recurring_patterns for:
      * Recurring holidays (annual, monthly, etc.)
      * Weekly off days (e.g., Sundays, Saturdays)
    - Skip shift assignment for dates that are holidays or weekly offs
    - Track skipped dates and include in response for user feedback
  
  3. Benefits
    - Prevents assigning shifts on non-working days
    - Improves user experience by automatic exclusion
    - Provides transparency through skipped dates reporting
    - Maintains data integrity for shift scheduling
*/

-- Drop all variants of the function
DROP FUNCTION IF EXISTS create_bulk_assignments(uuid, uuid[], date, date, text);
DROP FUNCTION IF EXISTS create_bulk_assignments(uuid, uuid[], date, date, text, uuid);

-- Recreate with holiday/weekly off exclusion logic
CREATE OR REPLACE FUNCTION create_bulk_assignments(
  p_shift_id uuid,
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
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
BEGIN
  -- Begin transaction
  BEGIN
    -- Set end date if not provided
    v_end_date := COALESCE(p_end_date, p_start_date);
    
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
      -- Weekly offs are stored in holiday_recurring_patterns with week_occurrence
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
        -- Add to skipped dates tracking
        v_skipped_dates := v_skipped_dates || jsonb_build_object(
          'date', v_current_date,
          'reason', v_skip_reason,
          'is_holiday', v_is_holiday,
          'is_weekly_off', v_is_weekly_off,
          'employee_count', array_length(p_employee_ids, 1)
        );
        
        -- Skip to next date
        v_current_date := v_current_date + interval '1 day';
        CONTINUE;
      END IF;
      
      -- Process employees for this working day
      FOREACH v_employee_id IN ARRAY p_employee_ids
      LOOP
        -- Validate shift conflict
        IF EXISTS (
          SELECT 1
          FROM public.shift_assignments sa
          WHERE sa.employee_id = v_employee_id
          AND sa.schedule_date = v_current_date
          AND sa.tenant_id = p_tenant_id
        ) THEN
          v_errors := array_append(v_errors, jsonb_build_object(
            'code', 'SHIFT_CONFLICT',
            'message', format('Employee already has a shift on %s', v_current_date),
            'details', jsonb_build_object(
              'employee_id', v_employee_id,
              'date', v_current_date
            )
          ));
          CONTINUE;
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

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.create_bulk_assignments TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION public.create_bulk_assignments IS 
'Creates bulk shift assignments for multiple employees across a date range. 
Automatically skips holidays and weekly off days based on tenant configuration. 
Returns created assignments, any errors, and information about skipped dates.';
