-- Add enable_send_payslip_on_mark_paid column to company_settings table
ALTER TABLE public.company_settings
ADD COLUMN IF NOT EXISTS enable_send_payslip_on_mark_paid boolean null default false;

COMMENT ON COLUMN public.company_settings.enable_send_payslip_on_mark_paid IS 'If true, automatically generate and dispatch payslips to employees when their payroll entry is marked as Paid';
