/*
  # Employee Gate Pass System

  1. New Tables
    - `gate_pass_requests`
      - Stores all gate pass requests with timing and reason
      - Tracks status (pending, approved, rejected, cancelled)
      - Links to employees and tenant

    - `gate_pass_approvals`
      - Records approval/rejection decisions
      - Stores approver information and comments
      - Tracks modifications made during approval

    - `gate_pass_change_logs`
      - Comprehensive audit trail
      - Records all modifications to gate passes
      - Tracks who changed what and when

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users based on tenant
    - Secure access to own tenant data only
*/

-- Gate Pass Requests Table
CREATE TABLE IF NOT EXISTS public.gate_pass_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Request Details
  start_date date NOT NULL,
  start_time time NOT NULL,
  end_date date NOT NULL,
  end_time time NOT NULL,
  reason text NOT NULL,

  -- Status Management
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),

  -- Approved Details (may differ from requested)
  approved_start_date date,
  approved_start_time time,
  approved_end_date date,
  approved_end_time time,

  -- Metadata
  requested_by uuid REFERENCES auth.users(id),
  requested_at timestamptz DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id),
  cancellation_reason text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  CONSTRAINT valid_date_range CHECK (end_date >= start_date),
  CONSTRAINT valid_time_range CHECK (
    end_date > start_date OR (end_date = start_date AND end_time > start_time)
  )
);

-- Gate Pass Approvals Table
CREATE TABLE IF NOT EXISTS public.gate_pass_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_pass_id uuid NOT NULL REFERENCES public.gate_pass_requests(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Approval Details
  action text NOT NULL CHECK (action IN ('approved', 'rejected')),
  approver_id uuid NOT NULL REFERENCES auth.users(id),
  approver_name text,
  approved_at timestamptz DEFAULT now(),

  -- Approval Comments
  comments text,
  rejection_reason text,

  -- Modifications Made
  original_start_date date,
  original_start_time time,
  original_end_date date,
  original_end_time time,
  modified_start_date date,
  modified_start_time time,
  modified_end_date date,
  modified_end_time time,
  has_modifications boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),

  UNIQUE(gate_pass_id)
);

-- Gate Pass Change Logs Table
CREATE TABLE IF NOT EXISTS public.gate_pass_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gate_pass_id uuid NOT NULL REFERENCES public.gate_pass_requests(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

  -- Change Details
  change_type text NOT NULL CHECK (change_type IN ('created', 'updated', 'approved', 'rejected', 'cancelled')),
  changed_by uuid REFERENCES auth.users(id),
  changed_by_name text,
  changed_at timestamptz DEFAULT now(),

  -- Change Data
  field_name text,
  old_value text,
  new_value text,
  description text,

  created_at timestamptz DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gate_pass_requests_tenant_id ON public.gate_pass_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_requests_employee_id ON public.gate_pass_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_requests_status ON public.gate_pass_requests(status);
CREATE INDEX IF NOT EXISTS idx_gate_pass_requests_start_date ON public.gate_pass_requests(start_date);
CREATE INDEX IF NOT EXISTS idx_gate_pass_requests_requested_by ON public.gate_pass_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_gate_pass_approvals_gate_pass_id ON public.gate_pass_approvals(gate_pass_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_approvals_tenant_id ON public.gate_pass_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_approvals_approver_id ON public.gate_pass_approvals(approver_id);

CREATE INDEX IF NOT EXISTS idx_gate_pass_change_logs_gate_pass_id ON public.gate_pass_change_logs(gate_pass_id);
CREATE INDEX IF NOT EXISTS idx_gate_pass_change_logs_tenant_id ON public.gate_pass_change_logs(tenant_id);

-- Enable Row Level Security
ALTER TABLE public.gate_pass_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_pass_change_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for gate_pass_requests

-- Policy: Users can view gate passes in their tenant
CREATE POLICY "Users can view gate passes in their tenant"
  ON public.gate_pass_requests
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can create gate pass requests in their tenant
CREATE POLICY "Users can create gate pass requests"
  ON public.gate_pass_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can update pending gate passes in their tenant
CREATE POLICY "Users can update pending gate passes"
  ON public.gate_pass_requests
  FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()) AND status = 'pending')
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can delete gate passes in their tenant
CREATE POLICY "Users can delete gate passes in their tenant"
  ON public.gate_pass_requests
  FOR DELETE
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- RLS Policies for gate_pass_approvals

-- Policy: Users can view approvals in their tenant
CREATE POLICY "Users can view approvals in their tenant"
  ON public.gate_pass_approvals
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can create approvals in their tenant
CREATE POLICY "Users can create approvals in their tenant"
  ON public.gate_pass_approvals
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can update approvals in their tenant
CREATE POLICY "Users can update approvals in their tenant"
  ON public.gate_pass_approvals
  FOR UPDATE
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- RLS Policies for gate_pass_change_logs

-- Policy: Users can view change logs in their tenant
CREATE POLICY "Users can view change logs in their tenant"
  ON public.gate_pass_change_logs
  FOR SELECT
  TO authenticated
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Policy: Users can create change logs in their tenant
CREATE POLICY "Users can create change logs in their tenant"
  ON public.gate_pass_change_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gate_pass_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_gate_pass_requests_updated_at
  BEFORE UPDATE ON public.gate_pass_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_gate_pass_updated_at();

-- Function to log gate pass changes
CREATE OR REPLACE FUNCTION log_gate_pass_change()
RETURNS TRIGGER AS $$
DECLARE
  v_tenant_id uuid;
  v_user_name text;
BEGIN
  -- Get tenant_id
  IF TG_OP = 'INSERT' THEN
    v_tenant_id := NEW.tenant_id;
  ELSE
    v_tenant_id := OLD.tenant_id;
  END IF;

  -- Get user name (attempt to fetch from employees)
  SELECT name INTO v_user_name
  FROM public.employees
  WHERE email = auth.jwt()->>'email'
  LIMIT 1;

  -- Log the change
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.gate_pass_change_logs (
      gate_pass_id, tenant_id, change_type, changed_by, changed_by_name, description
    ) VALUES (
      NEW.id,
      v_tenant_id,
      'created',
      auth.uid(),
      COALESCE(v_user_name, 'System'),
      'Gate pass request created'
    );
  ELSIF TG_OP = 'UPDATE' THEN
    -- Log status changes
    IF OLD.status != NEW.status THEN
      INSERT INTO public.gate_pass_change_logs (
        gate_pass_id, tenant_id, change_type, changed_by, changed_by_name,
        field_name, old_value, new_value, description
      ) VALUES (
        NEW.id,
        v_tenant_id,
        CASE
          WHEN NEW.status = 'approved' THEN 'approved'
          WHEN NEW.status = 'rejected' THEN 'rejected'
          WHEN NEW.status = 'cancelled' THEN 'cancelled'
          ELSE 'updated'
        END,
        auth.uid(),
        COALESCE(v_user_name, 'System'),
        'status',
        OLD.status,
        NEW.status,
        'Status changed from ' || OLD.status || ' to ' || NEW.status
      );
    END IF;

    -- Log date/time changes
    IF OLD.start_date != NEW.start_date OR OLD.start_time != NEW.start_time OR
       OLD.end_date != NEW.end_date OR OLD.end_time != NEW.end_time THEN
      INSERT INTO public.gate_pass_change_logs (
        gate_pass_id, tenant_id, change_type, changed_by, changed_by_name, description
      ) VALUES (
        NEW.id,
        v_tenant_id,
        'updated',
        auth.uid(),
        COALESCE(v_user_name, 'System'),
        'Date/time details modified'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to log all gate pass changes
CREATE TRIGGER log_gate_pass_changes
  AFTER INSERT OR UPDATE ON public.gate_pass_requests
  FOR EACH ROW
  EXECUTE FUNCTION log_gate_pass_change();