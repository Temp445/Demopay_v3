-- Drop existing function if it exists
DROP FUNCTION IF EXISTS create_bulk_assignments;

-- Create bulk assignment function with built-in transaction handling
CREATE OR REPLACE FUNCTION create_bulk_assignments(
  p_shift_id uuid,
  p_employee_ids uuid[],
  p_start_date date,
  p_end_date date DEFAULT NULL,
  p_department text DEFAULT NULL
)
RETURNS TABLE (
  success boolean,
  assignments jsonb,
  errors jsonb[]
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assignment record;
  v_errors jsonb[] := array[]::jsonb[];
  v_assignments jsonb := '[]'::jsonb;
  v_current_date date;
  v_end_date date;
  v_employee_id uuid;
BEGIN
  -- Begin transaction
  BEGIN
    -- Set end date if not provided
    v_end_date := COALESCE(p_end_date, p_start_date);
    
    -- Loop through dates
    v_current_date := p_start_date;
    WHILE v_current_date <= v_end_date LOOP
      -- Loop through employees
      FOREACH v_employee_id IN ARRAY p_employee_ids
      LOOP
        -- Validate department rules if department is provided
        IF p_department IS NOT NULL THEN
          -- Validate rest period
          IF EXISTS (
            SELECT 1
            FROM public.shift_assignments sa
            JOIN public.shifts s ON s.id = sa.shift_id
            WHERE sa.employee_id = v_employee_id
            AND sa.schedule_date = v_current_date
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
        END IF;

        -- Create assignment
        INSERT INTO public.shift_assignments (
          shift_id,
          employee_id,
          schedule_date,
          status
        )
        VALUES (
          p_shift_id,
          v_employee_id,
          v_current_date,
          'scheduled'
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

    -- Check if there were any errors
    IF array_length(v_errors, 1) > 0 THEN
      RAISE EXCEPTION 'Bulk assignment failed with errors: %', v_errors;
    END IF;

    -- If we get here, commit the transaction
    RETURN QUERY SELECT true, v_assignments, array[]::jsonb[];
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
      )];
END;
$$;