-- Create payslip_email_sender_logs table
CREATE TABLE IF NOT EXISTS public.payslip_email_sender_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid null,
  subject text NOT NULL,
  body_html text NULL,
  recipients jsonb NOT NULL DEFAULT '{"to": ""}'::jsonb,
  attachment_count integer DEFAULT 1,
  status text NOT NULL DEFAULT 'sent',
  error_message text NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_payslip_email_logs_tenant_id ON public.payslip_email_sender_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payslip_email_logs_sent_at ON public.payslip_email_sender_logs(sent_at DESC);

-- Enable RLS
ALTER TABLE public.payslip_email_sender_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their tenant's logs
CREATE POLICY "Users can view their tenant payslip email logs"
  ON public.payslip_email_sender_logs
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can insert logs for their tenant
CREATE POLICY "Users can insert payslip email logs"
  ON public.payslip_email_sender_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- RLS Policy: Users can delete logs for their tenant
CREATE POLICY "Users can delete payslip email logs"
  ON public.payslip_email_sender_logs
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Add helpful comments
COMMENT ON TABLE public.payslip_email_sender_logs IS 'Stores delivery logs specifically for payslip email dispatches';
