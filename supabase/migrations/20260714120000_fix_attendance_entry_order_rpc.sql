/*
  # Add RPC: fix_attendance_entry_order
  
  Recalculates and corrects IN/OUT entry for attendance_timestamp rows
  within a given date range for specific employees.
  Used by the sync-events edge function to auto-repair data on manual fetch.
  
  Alternating logic per employee per IST day:
    - 1st punch  = IN
    - 2nd punch  = OUT
    - 3rd punch  = IN  ... etc.
  
  Only rows where entry is actually WRONG are updated.
  Returns the count of updated rows.
*/

CREATE OR REPLACE FUNCTION fix_attendance_entry_order(
  p_employee_ids UUID[],
  p_start_date   TIMESTAMPTZ,
  p_end_date     TIMESTAMPTZ,
  p_tenant_id    UUID
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated INT;
BEGIN
  WITH ranked AS (
    SELECT
      at.id,
      ROW_NUMBER() OVER (
        PARTITION BY at.employee_id, (at."timestamp" AT TIME ZONE 'Asia/Kolkata')::DATE
        ORDER BY at."timestamp" ASC
      ) AS rn
    FROM public.attendance_timestamp at
    WHERE at.employee_id = ANY(p_employee_ids)
      AND at.tenant_id   = p_tenant_id
      AND at."timestamp" >= p_start_date
      AND at."timestamp" <= p_end_date
  ),
  corrected AS (
    SELECT
      id,
      CASE WHEN rn % 2 = 1 THEN 'IN' ELSE 'OUT' END AS correct_entry
    FROM ranked
  )
  UPDATE public.attendance_timestamp t
  SET entry = c.correct_entry
  FROM corrected c
  WHERE t.id = c.id
    AND t.entry <> c.correct_entry;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;
