-- Enable Realtime (add to supabase_realtime publication) safely
DO $$ 
DECLARE 
    t text;
    tables_to_add text[] := ARRAY[
        'attendance_timestamp', 
        'attendance_travel_logs', 
        'company_settings', 
        'employee_attendance_settings', 
        'hik_attendance_events', 
        'journey_tracking_logs', 
        'location_settings', 
        'user_notifications', 
        'work_location_tracking'
    ];
BEGIN 
    FOREACH t IN ARRAY tables_to_add 
    LOOP
        -- Check if the table is already in the publication
        IF NOT EXISTS (
            SELECT 1 
            FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', t);
        END IF;
    END LOOP; 
END $$;
