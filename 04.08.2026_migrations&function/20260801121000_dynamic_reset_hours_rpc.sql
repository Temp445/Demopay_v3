-- Migration: dynamic_reset_hours_rpc
-- Description: Update fix_attendance_entry_order to use dynamic missed punch reset hours from config instead of hardcoded 16

CREATE OR REPLACE FUNCTION fix_attendance_entry_order(p_employee_ids UUID[], p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ, p_tenant_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT := 0; 
  v_emp_id UUID; 
  v_record RECORD; 
  v_last_entry TEXT; 
  v_last_time TIMESTAMPTZ; 
  v_correct_entry TEXT;
  v_timegap NUMERIC; 
  v_last_event_date DATE; 
  v_last_shift_id UUID; 
  v_last_shift_type TEXT; 
  v_last_shift_start TIME; 
  v_last_shift_end TIME; 
  v_expected_end TIMESTAMPTZ; 
  v_max_shift_duration NUMERIC;
  v_cooldown_minutes INT;
  v_last_office_status TEXT;
  
  v_applicability TEXT;
  v_reset_hours NUMERIC;
BEGIN
  SELECT COALESCE(biometric_cooldown_minutes, 5) INTO v_cooldown_minutes FROM public.company_settings WHERE tenant_id = p_tenant_id LIMIT 1;
  IF v_cooldown_minutes IS NULL THEN v_cooldown_minutes := 5; END IF;

  SELECT device_tracking_applicability INTO v_applicability 
  FROM public.attendance_validation_config 
  WHERE tenant_id = p_tenant_id AND is_active = true LIMIT 1;

  FOREACH v_emp_id IN ARRAY p_employee_ids LOOP
    v_last_entry := NULL; 
    v_last_time := NULL;
    v_last_office_status := NULL;
    
    IF v_applicability = 'specific' THEN
        SELECT COALESCE(
            (SELECT missed_punch_reset_hours FROM public.employee_attendance_settings WHERE employee_id = v_emp_id AND tenant_id = p_tenant_id),
            (SELECT missed_punch_reset_hours FROM public.attendance_validation_config WHERE tenant_id = p_tenant_id AND is_active = true LIMIT 1),
            14
        ) INTO v_reset_hours;
    ELSE
        SELECT COALESCE(
            (SELECT missed_punch_reset_hours FROM public.attendance_validation_config WHERE tenant_id = p_tenant_id AND is_active = true LIMIT 1),
            14
        ) INTO v_reset_hours;
    END IF;
    
    SELECT entry, "timestamp", office_location_status 
    INTO v_last_entry, v_last_time, v_last_office_status 
    FROM public.attendance_timestamp 
    WHERE employee_id = v_emp_id AND tenant_id = p_tenant_id AND "timestamp" < p_start_date 
    ORDER BY "timestamp" DESC LIMIT 1;
    
    FOR v_record IN 
      SELECT id, entry, "timestamp", office_location_status 
      FROM public.attendance_timestamp 
      WHERE employee_id = v_emp_id AND tenant_id = p_tenant_id AND "timestamp" >= p_start_date AND "timestamp" <= p_end_date 
      ORDER BY "timestamp" ASC 
    LOOP
        
        -- Ignore and delete if punch is within the cooldown period
        IF v_last_time IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (v_record."timestamp" - v_last_time))) <= (v_cooldown_minutes * 60) THEN
            DELETE FROM public.attendance_timestamp WHERE id = v_record.id;
            CONTINUE;
        END IF;

        IF v_last_entry = 'IN' AND v_last_time IS NOT NULL THEN
            -- If the previous punch was IN Outside Office and current punch is IN Office (Office Arrival), preserve it as IN
            IF v_last_office_status = 'Outside Office' AND v_record.office_location_status = 'Office' AND v_record.entry = 'IN' THEN
                v_correct_entry := 'IN';
            ELSE
                v_timegap := ABS(EXTRACT(EPOCH FROM (v_record."timestamp" - v_last_time)));
                v_last_event_date := (v_last_time AT TIME ZONE 'Asia/Kolkata')::DATE;
                
                SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT 
                INTO v_last_shift_id, v_last_shift_start, v_last_shift_end, v_last_shift_type 
                FROM public.shift_assignments sa 
                LEFT JOIN public.shifts s ON sa.shift_id = s.id 
                WHERE sa.employee_id = v_emp_id AND sa.tenant_id = p_tenant_id AND sa.schedule_date = v_last_event_date 
                LIMIT 1;
                
                IF v_last_shift_id IS NOT NULL THEN
                    IF v_last_shift_type = 'night' OR v_last_shift_end < v_last_shift_start THEN 
                        v_expected_end := (v_last_event_date + v_last_shift_end + INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata'; 
                    ELSE 
                        v_expected_end := (v_last_event_date + v_last_shift_end) AT TIME ZONE 'Asia/Kolkata'; 
                    END IF;
                    
                    IF v_record."timestamp" >= (v_expected_end - INTERVAL '8 hours') AND v_record."timestamp" <= (v_expected_end + INTERVAL '8 hours') THEN 
                        v_correct_entry := 'OUT'; 
                    ELSE 
                        v_correct_entry := 'IN'; 
                    END IF;
                ELSE
                    SELECT LEAST(COALESCE(MAX(EXTRACT(EPOCH FROM (CASE WHEN shift_type = 'night' OR end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time ELSE end_time - start_time END))), 12 * 3600), 14 * 3600) 
                    INTO v_max_shift_duration 
                    FROM public.shifts WHERE tenant_id = p_tenant_id;
                    
                    IF v_timegap <= LEAST(v_max_shift_duration + (4 * 3600), v_reset_hours * 3600) THEN 
                        v_correct_entry := 'OUT'; 
                    ELSE 
                        v_correct_entry := 'IN'; 
                    END IF;
                END IF;
            END IF;
        ELSE
            v_correct_entry := 'IN';
        END IF;
        
        IF v_record.entry <> v_correct_entry THEN 
            UPDATE public.attendance_timestamp SET entry = v_correct_entry WHERE id = v_record.id; 
            v_updated := v_updated + 1; 
        END IF;
        
        v_last_entry := v_correct_entry; 
        v_last_time := v_record."timestamp"; 
        v_last_office_status := v_record.office_location_status;
    END LOOP;
  END LOOP;
  RETURN v_updated;
END;
$$;
