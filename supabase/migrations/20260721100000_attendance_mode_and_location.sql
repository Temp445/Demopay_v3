-- Migration: attendance_mode_and_location

-- 1. Add new columns to attendance_timestamp
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS attendance_mode TEXT;
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS manual_reason TEXT;
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS distance_from_branch NUMERIC(10, 2);
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS office_location_status TEXT;
ALTER TABLE public.attendance_timestamp ADD COLUMN IF NOT EXISTS office_arrival_processed BOOLEAN DEFAULT false;

-- 2. Add require_location to attendance_validation_config
ALTER TABLE public.attendance_validation_config ADD COLUMN IF NOT EXISTS require_location BOOLEAN DEFAULT false;

-- 3. Replace the process_hik_event_to_attendance trigger function
CREATE OR REPLACE FUNCTION process_hik_event_to_attendance()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_uuid UUID;
    v_cooldown_minutes INT;
    v_last_punch TIMESTAMP WITH TIME ZONE;
    v_last_entry TEXT;
    v_last_office_status TEXT;
    v_last_office_processed BOOLEAN;
    v_new_entry TEXT;
    
    v_last_event_date DATE;
    v_last_shift_id UUID;
    v_last_shift_type TEXT;
    v_last_shift_start TIME;
    v_last_shift_end TIME;
    v_expected_end TIMESTAMP WITH TIME ZONE;
    v_max_shift_duration NUMERIC;
    v_timegap NUMERIC;
    
    v_event_date DATE;
    v_shift_id UUID; 
    v_shift_start TIME;
    v_shift_end TIME;
    v_shift_type TEXT;
    v_expected_start TIMESTAMP WITH TIME ZONE;
    v_timing_status TEXT;
    
    -- New Variables for Branch Location lookup
    v_branch_location_id TEXT;
    v_latitude NUMERIC(10, 8);
    v_longitude NUMERIC(10, 8);
    v_branch_radius NUMERIC;
BEGIN
    SELECT id INTO v_employee_uuid FROM public.employees WHERE employee_code = NEW.employee_id AND tenant_id = NEW.tenant_id LIMIT 1;
    IF v_employee_uuid IS NULL THEN RETURN NEW; END IF;

    -- Lookup Branch Location ID from Device Settings
    IF NEW.device_ip IS NOT NULL THEN
        SELECT branch_location_id INTO v_branch_location_id 
        FROM public.hik_device_settings 
        WHERE device_ip = NEW.device_ip AND tenant_id = NEW.tenant_id 
        LIMIT 1;

        -- If linked, fetch latitude and longitude from company_settings.branch_locations
        IF v_branch_location_id IS NOT NULL THEN
            SELECT CAST(elem->>'latitude' AS NUMERIC), CAST(elem->>'longitude' AS NUMERIC), CAST(elem->>'radius' AS NUMERIC)
            INTO v_latitude, v_longitude, v_branch_radius
            FROM public.company_settings cs,
                 jsonb_array_elements(cs.branch_locations) elem
            WHERE cs.tenant_id = NEW.tenant_id
              AND elem->>'id' = v_branch_location_id
            LIMIT 1;
        END IF;
    END IF;

    SELECT COALESCE(biometric_cooldown_minutes, 5) INTO v_cooldown_minutes FROM public.company_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
    IF v_cooldown_minutes IS NULL THEN v_cooldown_minutes := 5; END IF;

    SELECT "timestamp", entry, office_location_status, office_arrival_processed INTO v_last_punch, v_last_entry, v_last_office_status, v_last_office_processed
    FROM public.attendance_timestamp
    WHERE employee_id = v_employee_uuid ORDER BY "timestamp" DESC LIMIT 1;

    IF v_last_punch IS NOT NULL THEN
        IF ABS(EXTRACT(EPOCH FROM (NEW.event_time - v_last_punch))) <= (v_cooldown_minutes * 60) THEN RETURN NEW; END IF;
    END IF;
    
    -- Office Arrival Logic: Outside Office -> Office
    -- If the open attendance was 'Outside Office' and this device punch is considered 'Office' (device punch implies office presence)
    IF v_last_punch IS NOT NULL AND v_last_entry = 'IN' AND v_last_office_status = 'Outside Office' AND COALESCE(v_last_office_processed, false) = false THEN
        UPDATE public.attendance_timestamp
        SET 
            office_location_status = 'Office',
            office_arrival_processed = true,
            distance_from_branch = 0,
            latitude = v_latitude,
            longitude = v_longitude
        WHERE employee_id = v_employee_uuid AND "timestamp" = v_last_punch;
        
        RETURN NEW;
    END IF;

    IF v_last_punch IS NOT NULL AND v_last_entry = 'IN' THEN
        v_timegap := ABS(EXTRACT(EPOCH FROM (NEW.event_time - v_last_punch)));
        v_last_event_date := (v_last_punch AT TIME ZONE 'Asia/Kolkata')::DATE;
        
        SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT
        INTO v_last_shift_id, v_last_shift_start, v_last_shift_end, v_last_shift_type
        FROM public.shift_assignments sa
        LEFT JOIN public.shifts s ON sa.shift_id = s.id
        WHERE sa.employee_id = v_employee_uuid AND sa.tenant_id = NEW.tenant_id AND sa.schedule_date = v_last_event_date
        LIMIT 1;

        IF v_last_shift_id IS NOT NULL THEN
            IF v_last_shift_type = 'night' OR v_last_shift_end < v_last_shift_start THEN
                v_expected_end := (v_last_event_date + v_last_shift_end + INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata';
            ELSE
                v_expected_end := (v_last_event_date + v_last_shift_end) AT TIME ZONE 'Asia/Kolkata';
            END IF;
            
            IF NEW.event_time >= (v_expected_end - INTERVAL '8 hours') AND NEW.event_time <= (v_expected_end + INTERVAL '8 hours') THEN
                v_new_entry := 'OUT';
            ELSE
                v_new_entry := 'IN';
            END IF;
        ELSE
            SELECT LEAST(COALESCE(MAX(EXTRACT(EPOCH FROM (
              CASE WHEN shift_type = 'night' OR end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time
              ELSE end_time - start_time END
            ))), 12 * 3600), 14 * 3600) INTO v_max_shift_duration
            FROM public.shifts WHERE tenant_id = NEW.tenant_id;
            
            IF v_timegap <= LEAST(v_max_shift_duration + (4 * 3600), 16 * 3600) THEN
                v_new_entry := 'OUT';
            ELSE
                v_new_entry := 'IN';
            END IF;
        END IF;
    ELSE
        v_new_entry := 'IN';
    END IF;

    v_event_date := (NEW.event_time AT TIME ZONE 'Asia/Kolkata')::DATE;

    SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT
    INTO v_shift_id, v_shift_start, v_shift_end, v_shift_type
    FROM public.shift_assignments sa
    LEFT JOIN public.shifts s ON sa.shift_id = s.id
    WHERE sa.employee_id = v_employee_uuid AND sa.tenant_id = NEW.tenant_id AND sa.schedule_date = v_event_date
    LIMIT 1;

    IF v_shift_id IS NULL AND v_new_entry = 'OUT' THEN
        SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT
        INTO v_shift_id, v_shift_start, v_shift_end, v_shift_type
        FROM public.shift_assignments sa
        LEFT JOIN public.shifts s ON sa.shift_id = s.id
        WHERE sa.employee_id = v_employee_uuid AND sa.tenant_id = NEW.tenant_id AND sa.schedule_date = v_event_date - INTERVAL '1 day'
        LIMIT 1;
        IF v_shift_id IS NOT NULL THEN v_event_date := v_event_date - INTERVAL '1 day'; END IF;
    END IF;

    IF v_shift_id IS NULL THEN
        v_timing_status := 'NO_SHIFT_ASSIGNED';
    ELSE
        v_expected_start := (v_event_date + v_shift_start) AT TIME ZONE 'Asia/Kolkata';
        IF v_shift_type = 'night' OR v_shift_end < v_shift_start THEN
            v_expected_end := (v_event_date + v_shift_end + INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata';
        ELSE
            v_expected_end := (v_event_date + v_shift_end) AT TIME ZONE 'Asia/Kolkata';
        END IF;

        IF NEW.event_time >= (v_expected_start - INTERVAL '3 hours') AND NEW.event_time <= (v_expected_end + INTERVAL '4 hours') THEN
            v_timing_status := 'OK';
        ELSE
            v_timing_status := 'OUTSIDE_SHIFT';
        END IF;
    END IF;

    INSERT INTO public.attendance_timestamp (
        employee_id, entry, "timestamp", timing_status, tenant_id, shift_id, 
        latitude, longitude, attendance_mode, distance_from_branch, office_location_status
    ) 
    VALUES (
        v_employee_uuid, v_new_entry, NEW.event_time, v_timing_status, NEW.tenant_id, v_shift_id, 
        v_latitude, v_longitude, 'Device', 0, 'Office'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
