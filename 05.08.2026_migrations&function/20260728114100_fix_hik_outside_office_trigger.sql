CREATE OR REPLACE FUNCTION process_hik_event_to_attendance()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_uuid UUID;
    v_cooldown_minutes INT;
    v_last_punch_id UUID;
    v_last_punch TIMESTAMP WITH TIME ZONE;
    v_last_entry TEXT;
    v_last_location TEXT;
    v_last_arrival_processed BOOLEAN;
    v_new_entry TEXT;
    v_update_previous_punch BOOLEAN := false;
    
    -- Variables for Shift Tracking
    v_shift_id UUID; 
    v_shift_start TIME;
    v_shift_end TIME;
    v_shift_type TEXT;
    
    -- Variables for Timing Logic
    v_event_date DATE;
    v_expected_start TIMESTAMP WITH TIME ZONE;
    v_expected_end TIMESTAMP WITH TIME ZONE;
    v_timing_status TEXT;
BEGIN
    -- Step 1: Get employee UUID
    SELECT id INTO v_employee_uuid
    FROM public.employees
    WHERE employee_code = NEW.employee_id AND tenant_id = NEW.tenant_id
    LIMIT 1;

    IF v_employee_uuid IS NULL THEN
        RETURN NEW; 
    END IF;

    -- Step 2: Get Cooldown Setting
    SELECT COALESCE(biometric_cooldown_minutes, 5) INTO v_cooldown_minutes
    FROM public.company_settings
    WHERE tenant_id = NEW.tenant_id
    LIMIT 1;

    -- Step 3 & 4: Cooldown Check & Fetch Last Punch
    SELECT id, "timestamp", entry, office_location_status, office_arrival_processed 
    INTO v_last_punch_id, v_last_punch, v_last_entry, v_last_location, v_last_arrival_processed
    FROM public.attendance_timestamp
    WHERE employee_id = v_employee_uuid AND tenant_id = NEW.tenant_id
    ORDER BY "timestamp" DESC
    LIMIT 1;

    IF v_last_punch IS NOT NULL THEN
        IF ABS(EXTRACT(EPOCH FROM (NEW.event_time - v_last_punch))) <= (v_cooldown_minutes * 60) THEN
            RETURN NEW; -- Skip within cooldown
        END IF;
    END IF;

    -- Step 5: Determine IN/OUT status using IST Timezone
    -- IMPORTANT: We check if it's the same day in IST, not UTC.
    IF v_last_punch IS NOT NULL AND 
       (v_last_punch AT TIME ZONE 'Asia/Kolkata')::DATE = (NEW.event_time AT TIME ZONE 'Asia/Kolkata')::DATE THEN
        
        -- NEW LOGIC: Check if arriving from outside office
        IF v_last_entry = 'IN' AND v_last_location = 'Outside Office' AND COALESCE(v_last_arrival_processed, false) = false THEN
            v_new_entry := 'IN';
            v_update_previous_punch := true;
        ELSE
            v_new_entry := CASE WHEN v_last_entry = 'IN' THEN 'OUT' ELSE 'IN' END;
            v_update_previous_punch := false;
        END IF;
    ELSE
        v_new_entry := 'IN'; -- First punch of the day in IST
        v_update_previous_punch := false;
    END IF;

    -- Step 5.5: Fetch assigned shift for the IST Date
    v_event_date := (NEW.event_time AT TIME ZONE 'Asia/Kolkata')::DATE;

    SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT
    INTO v_shift_id, v_shift_start, v_shift_end, v_shift_type
    FROM public.shift_assignments sa
    LEFT JOIN public.shifts s ON sa.shift_id = s.id
    WHERE sa.employee_id = v_employee_uuid 
      AND sa.tenant_id = NEW.tenant_id
      AND sa.schedule_date = v_event_date
    LIMIT 1;

    -- Step 5.6: Evaluate timing_status
    IF v_shift_id IS NULL THEN
        v_timing_status := 'NO_SHIFT_ASSIGNED';
    ELSE
        -- Construct expected timestamps (Assumes start_time/end_time are local)
        v_expected_start := (v_event_date + v_shift_start) AT TIME ZONE 'Asia/Kolkata';
        
        IF v_shift_type = 'night' THEN
            v_expected_end := (v_event_date + v_shift_end + INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata';
        ELSE
            v_expected_end := (v_event_date + v_shift_end) AT TIME ZONE 'Asia/Kolkata';
        END IF;

        IF NEW.event_time >= (v_expected_start - INTERVAL '2 hours') AND 
           NEW.event_time <= (v_expected_end + INTERVAL '4 hours') THEN
            v_timing_status := 'OK';
        ELSE
            v_timing_status := 'OUTSIDE_SHIFT';
        END IF;
    END IF;

    -- Step 6: Insert into Final Attendance table
    INSERT INTO public.attendance_timestamp (
        employee_id, entry, "timestamp", timing_status, tenant_id, shift_id,
        attendance_mode, office_location_status
    ) VALUES (
        v_employee_uuid, v_new_entry, NEW.event_time, v_timing_status, NEW.tenant_id, v_shift_id,
        'Device', 'Office'
    );

    -- Step 7: Close the loop on the previous outside punch
    IF v_update_previous_punch THEN
        UPDATE public.attendance_timestamp
        SET office_arrival_processed = true
        WHERE id = v_last_punch_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
