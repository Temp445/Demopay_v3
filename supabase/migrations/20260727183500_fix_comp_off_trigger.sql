-- Fix the comp_off_approval_trigger to include tenant_id when creating new leave_balances

CREATE OR REPLACE FUNCTION public.process_comp_off_approval()
RETURNS TRIGGER AS $$
DECLARE
  v_year integer;
BEGIN
  -- Only trigger when status changes to 'Approved'
  IF NEW.status = 'Approved' AND OLD.status != 'Approved' THEN
    v_year := extract(year from NEW.worked_date);
    
    -- Update leave_balances
    UPDATE public.leave_balances
    SET 
      total_days = total_days + 1,
      updated_at = now()
    WHERE employee_id = NEW.employee_id 
      AND leave_type_id = NEW.leave_type_id
      AND year = v_year;
      
    -- If no balance record exists for this year, insert one
    IF NOT FOUND THEN
      INSERT INTO public.leave_balances (
        employee_id,
        leave_type_id,
        year,
        total_days,
        used_days,
        tenant_id,
        created_by
      ) VALUES (
        NEW.employee_id,
        NEW.leave_type_id,
        v_year,
        1,
        0,
        NEW.tenant_id,
        NEW.approved_by
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
