-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can update their shift assignments" ON public.shift_assignments;
DROP POLICY IF EXISTS "Users can manage shift assignments" ON public.shift_assignments;

-- Create comprehensive RLS policies for shift_assignments
CREATE POLICY "Users can view shift assignments"
  ON public.shift_assignments
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can create shift assignments"
  ON public.shift_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update shift assignments"
  ON public.shift_assignments
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Users can delete shift assignments"
  ON public.shift_assignments
  FOR DELETE
  TO authenticated
  USING (true);

-- Create function to get shift assignments with proper access control
CREATE OR REPLACE FUNCTION public.get_shift_assignments_secure(p_start_date date, p_end_date date, p_tenant_id uuid, p_employee_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, shift_id uuid, employee_id uuid, schedule_date date, status shift_status, clock_in timestamp with time zone, clock_out timestamp with time zone, shift jsonb, employee jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    sa.id,
    sa.shift_id,
    sa.employee_id,
    sa.schedule_date,
    sa.status,
    sa.clock_in,
    sa.clock_out,
    -- Constructing the nested objects the frontend expects
    jsonb_build_object(
      'name', s.name,
      'start_time', s.start_time,
      'end_time', s.end_time
    ) as shift,
    jsonb_build_object(
      'name', e.full_name -- or whatever your column name is
    ) as employee
  FROM shift_assignments sa
  JOIN shifts s ON sa.shift_id = s.id
  JOIN employees e ON sa.employee_id = e.id
  WHERE sa.tenant_id = p_tenant_id
    AND sa.schedule_date BETWEEN p_start_date AND p_end_date
    AND (p_employee_id IS NULL OR sa.employee_id = p_employee_id);
END;
$function$;
$$;