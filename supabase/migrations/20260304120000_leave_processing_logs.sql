/*
  # Leave Processing Logs Table

  Audit trail for all leave processing runs:
  - Leave Credit (Fixed/Earned)
  - Carry Forward
  - Encashment
*/

CREATE TABLE IF NOT EXISTS leave_processing_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  process_type text NOT NULL CHECK (process_type IN ('credit', 'carry_forward', 'encashment')),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  leave_type_id uuid NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
  period text NOT NULL, -- e.g. '2026-03' for monthly, '2026' for yearly
  days_affected numeric NOT NULL DEFAULT 0,
  notes text,
  processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_leave_processing_logs_tenant ON leave_processing_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leave_processing_logs_employee ON leave_processing_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_processing_logs_type_period ON leave_processing_logs(process_type, period, employee_id, leave_type_id, tenant_id);

-- Enable RLS
ALTER TABLE leave_processing_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Tenant members can view own logs"
  ON leave_processing_logs FOR SELECT
  USING (tenant_id IN (
    SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
  ));

CREATE POLICY "Tenant members can insert logs"
  ON leave_processing_logs FOR INSERT
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM user_profiles WHERE id = auth.uid()
  ));

COMMENT ON TABLE leave_processing_logs IS 'Audit trail for all automated leave processing runs (credit, carry forward, encashment)';
COMMENT ON COLUMN leave_processing_logs.period IS 'Period identifier: YYYY-MM for monthly, YYYY for yearly, YYYY-FROYM→YYYY-TO for carry forward';
