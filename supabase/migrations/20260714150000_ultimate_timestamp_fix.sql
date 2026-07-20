

-- 1. UPDATE TRIGGER 
CREATE OR REPLACE FUNCTION process_hik_event_to_attendance()
RETURNS TRIGGER AS $$
DECLARE
    v_employee_uuid UUID;
    v_cooldown_minutes INT;
    v_last_punch TIMESTAMP WITH TIME ZONE;
    v_last_entry TEXT;
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
BEGIN
    SELECT id INTO v_employee_uuid FROM public.employees WHERE employee_code = NEW.employee_id AND tenant_id = NEW.tenant_id LIMIT 1;
    IF v_employee_uuid IS NULL THEN RETURN NEW; END IF;

    SELECT COALESCE(biometric_cooldown_minutes, 5) INTO v_cooldown_minutes FROM public.company_settings WHERE tenant_id = NEW.tenant_id LIMIT 1;
    IF v_cooldown_minutes IS NULL THEN v_cooldown_minutes := 5; END IF;

    SELECT "timestamp", entry INTO v_last_punch, v_last_entry
    FROM public.attendance_timestamp
    WHERE employee_id = v_employee_uuid ORDER BY "timestamp" DESC LIMIT 1;

    IF v_last_punch IS NOT NULL THEN
        IF ABS(EXTRACT(EPOCH FROM (NEW.event_time - v_last_punch))) <= (v_cooldown_minutes * 60) THEN RETURN NEW; END IF;
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

    INSERT INTO public.attendance_timestamp (employee_id, entry, "timestamp", timing_status, tenant_id, shift_id) 
    VALUES (v_employee_uuid, v_new_entry, NEW.event_time, v_timing_status, NEW.tenant_id, v_shift_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. UPDATE RPC AUTO-REPAIR FUNCTION WITH SAME 16-HOUR RULE
CREATE OR REPLACE FUNCTION fix_attendance_entry_order(p_employee_ids UUID[], p_start_date TIMESTAMPTZ, p_end_date TIMESTAMPTZ, p_tenant_id UUID)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT := 0; v_emp_id UUID; v_record RECORD; v_last_entry TEXT; v_last_time TIMESTAMPTZ; v_correct_entry TEXT;
  v_timegap NUMERIC; v_last_event_date DATE; v_last_shift_id UUID; v_last_shift_type TEXT; v_last_shift_start TIME; v_last_shift_end TIME; v_expected_end TIMESTAMPTZ; v_max_shift_duration NUMERIC;
  v_cooldown_minutes INT;
BEGIN
  SELECT COALESCE(biometric_cooldown_minutes, 5) INTO v_cooldown_minutes FROM public.company_settings WHERE tenant_id = p_tenant_id LIMIT 1;
  IF v_cooldown_minutes IS NULL THEN v_cooldown_minutes := 5; END IF;

  FOREACH v_emp_id IN ARRAY p_employee_ids LOOP
    v_last_entry := NULL; v_last_time := NULL;
    SELECT entry, "timestamp" INTO v_last_entry, v_last_time FROM public.attendance_timestamp WHERE employee_id = v_emp_id AND tenant_id = p_tenant_id AND "timestamp" < p_start_date ORDER BY "timestamp" DESC LIMIT 1;
    FOR v_record IN SELECT id, entry, "timestamp" FROM public.attendance_timestamp WHERE employee_id = v_emp_id AND tenant_id = p_tenant_id AND "timestamp" >= p_start_date AND "timestamp" <= p_end_date ORDER BY "timestamp" ASC LOOP
        
        -- Ignore and delete if punch is within the cooldown period
        IF v_last_time IS NOT NULL AND ABS(EXTRACT(EPOCH FROM (v_record."timestamp" - v_last_time))) <= (v_cooldown_minutes * 60) THEN
            DELETE FROM public.attendance_timestamp WHERE id = v_record.id;
            CONTINUE;
        END IF;

        IF v_last_entry = 'IN' AND v_last_time IS NOT NULL THEN
            v_timegap := ABS(EXTRACT(EPOCH FROM (v_record."timestamp" - v_last_time)));
            v_last_event_date := (v_last_time AT TIME ZONE 'Asia/Kolkata')::DATE;
            SELECT sa.shift_id, s.start_time, s.end_time, s.shift_type::TEXT INTO v_last_shift_id, v_last_shift_start, v_last_shift_end, v_last_shift_type FROM public.shift_assignments sa LEFT JOIN public.shifts s ON sa.shift_id = s.id WHERE sa.employee_id = v_emp_id AND sa.tenant_id = p_tenant_id AND sa.schedule_date = v_last_event_date LIMIT 1;
            IF v_last_shift_id IS NOT NULL THEN
                IF v_last_shift_type = 'night' OR v_last_shift_end < v_last_shift_start THEN v_expected_end := (v_last_event_date + v_last_shift_end + INTERVAL '1 day') AT TIME ZONE 'Asia/Kolkata'; ELSE v_expected_end := (v_last_event_date + v_last_shift_end) AT TIME ZONE 'Asia/Kolkata'; END IF;
                IF v_record."timestamp" >= (v_expected_end - INTERVAL '8 hours') AND v_record."timestamp" <= (v_expected_end + INTERVAL '8 hours') THEN v_correct_entry := 'OUT'; ELSE v_correct_entry := 'IN'; END IF;
            ELSE
                SELECT LEAST(COALESCE(MAX(EXTRACT(EPOCH FROM (CASE WHEN shift_type = 'night' OR end_time < start_time THEN (end_time + INTERVAL '1 day') - start_time ELSE end_time - start_time END))), 12 * 3600), 14 * 3600) INTO v_max_shift_duration FROM public.shifts WHERE tenant_id = p_tenant_id;
                IF v_timegap <= LEAST(v_max_shift_duration + (4 * 3600), 16 * 3600) THEN v_correct_entry := 'OUT'; ELSE v_correct_entry := 'IN'; END IF;
            END IF;
        ELSE
            v_correct_entry := 'IN';
        END IF;
        IF v_record.entry <> v_correct_entry THEN UPDATE public.attendance_timestamp SET entry = v_correct_entry WHERE id = v_record.id; v_updated := v_updated + 1; END IF;
        v_last_entry := v_correct_entry; v_last_time := v_record."timestamp";
    END LOOP;
  END LOOP;
  RETURN v_updated;
END;
$$;

-- 4. RUN GLOBAL REPAIR INSTANTLY
DO $$
DECLARE 
    v_emp_id UUID;
BEGIN
    FOR v_emp_id IN SELECT id FROM public.employees LOOP
        -- Auto repair all history from start of month
        PERFORM fix_attendance_entry_order(ARRAY[v_emp_id], '2026-07-01 00:00:00+00'::TIMESTAMPTZ, '2026-07-31 23:59:59+00'::TIMESTAMPTZ, (SELECT tenant_id FROM public.employees WHERE id = v_emp_id LIMIT 1));
    END LOOP;
END;
$$;
