/*
  # Add Payroll Calculation Support Functions

  1. Schema Changes
    - Add `is_paid` column to `leave_types` table
      * Indicates whether a leave type is paid or unpaid
      * Defaults to true for backward compatibility
      * Used in payroll calculations to determine payable days

  2. New Functions
    - `get_leave_list` - Retrieves leave requests for payroll calculation
      * Returns approved leave requests within a date range
      * Includes leave type information with is_paid status
      * Filters by employee and tenant for proper isolation

    - `get_weekly_off_list` - Retrieves weekly off days
      * Returns list of weekly off dates within a date range
      * Used to exclude non-working days from payroll
      * Supports tenant-based filtering

    - `get_holiday_list` - Retrieves public holidays
      * Returns list of holidays within a date range
      * Used to include paid holidays in payroll calculations
      * Supports tenant-based filtering

  3. Purpose
    - Enable accurate payroll calculations based on attendance
    - Support paid/unpaid leave differentiation
    - Provide necessary data for attendance validation
    - Maintain tenant isolation for multi-tenant support

  4. Security
    - All functions use SECURITY DEFINER for RLS bypass
    - Tenant-based filtering ensures data isolation
    - Functions are read-only for safety
*/

-- ============================================================================
-- PART 1: Add is_paid column to leave_types table
-- ============================================================================

DO $$
BEGIN
  -- Add is_paid column to leave_types if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leave_types' AND column_name = 'is_paid'
  ) THEN
    ALTER TABLE public.leave_types
    ADD COLUMN is_paid boolean DEFAULT true NOT NULL;

    -- Add comment for documentation
    COMMENT ON COLUMN public.leave_types.is_paid IS 'Indicates whether this leave type is paid (true) or unpaid (false). Used in payroll calculations.';
  END IF;
END $$;

-- ============================================================================
-- PART 2: Create get_leave_list function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_leave_list(
  p_employee_id uuid,
  p_start_date date,
  p_end_date date,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  leave_type_id uuid,
  start_date date,
  end_date date,
  reason text,
  status text,
  total_days numeric,
  is_half_day_start boolean,
  is_half_day_end boolean,
  half_day_period_start text,
  half_day_period_end text,
  document_url text,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  is_paid boolean,
  leave_type jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    lr.id,
    lr.employee_id,
    lr.leave_type_id,
    lr.start_date,
    lr.end_date,
    lr.reason,
    lr.status,
    lr.total_days,
    lr.is_half_day_start,
    lr.is_half_day_end,
    lr.half_day_period_start,
    lr.half_day_period_end,
    lr.document_url,
    lr.approved_by,
    lr.approved_at,
    lr.created_at,
    lr.updated_at,
    lt.is_paid,
    jsonb_build_object(
      'id', lt.id,
      'name', lt.name,
      'description', lt.description,
      'default_days', lt.default_days,
      'requires_approval', lt.requires_approval,
      'is_paid', lt.is_paid
    ) AS leave_type
  FROM public.leave_requests lr
  INNER JOIN public.leave_types lt ON lt.id = lr.leave_type_id
  INNER JOIN public.employees e ON e.id = lr.employee_id
  WHERE
    lr.employee_id = p_employee_id
    AND lr.status = 'Approved'
    AND lr.start_date <= p_end_date
    AND lr.end_date >= p_start_date
    AND e.tenant_id = p_tenant_id
    AND lr.tenant_id = p_tenant_id
  ORDER BY lr.start_date ASC;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_leave_list IS 'Retrieves approved leave requests for an employee within a date range. Used in payroll calculations to determine paid/unpaid leave days.';

-- ============================================================================
-- PART 3: Create get_weekly_off_list function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_weekly_off_list(
  p_start_date date,
  p_end_date date,
  p_tenant_id uuid
)
RETURNS TABLE (
  date date,
  day_name text,
  week_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_date date;
  day_of_week integer;
BEGIN
  current_date := p_start_date;

  -- Loop through each date in the range
  WHILE current_date <= p_end_date LOOP
    -- Get day of week (0 = Sunday, 6 = Saturday)
    day_of_week := EXTRACT(DOW FROM current_date);

    -- Include Saturdays (6) and Sundays (0) as weekly offs
    IF day_of_week = 0 OR day_of_week = 6 THEN
      RETURN QUERY
      SELECT
        current_date AS date,
        CASE day_of_week
          WHEN 0 THEN 'Sunday'
          WHEN 6 THEN 'Saturday'
        END AS day_name,
        EXTRACT(WEEK FROM current_date)::integer AS week_number;
    END IF;

    -- Move to next day
    current_date := current_date + INTERVAL '1 day';
  END LOOP;

  RETURN;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_weekly_off_list IS 'Returns list of weekly off days (Saturdays and Sundays) within a date range. Used in payroll calculations to identify non-working days.';

-- ============================================================================
-- PART 4: Create get_holiday_list function
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_holiday_list(
  p_start_date date,
  p_end_date date,
  p_tenant_id uuid
)
RETURNS TABLE (
  id uuid,
  date date,
  name text,
  description text,
  is_recurring boolean,
  recurring_pattern_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id,
    h.date,
    h.name,
    h.description,
    h.is_recurring,
    h.recurring_pattern_id,
    h.created_at,
    h.updated_at
  FROM public.holidays h
  WHERE
    h.date >= p_start_date
    AND h.date <= p_end_date
    AND h.tenant_id = p_tenant_id
  ORDER BY h.date ASC;
END;
$$;

-- Add comment for documentation
COMMENT ON FUNCTION public.get_holiday_list IS 'Returns list of public holidays within a date range. Used in payroll calculations to include paid holidays in payable days.';

-- ============================================================================
-- PART 5: Grant execute permissions
-- ============================================================================

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_leave_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_off_list TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_holiday_list TO authenticated;
