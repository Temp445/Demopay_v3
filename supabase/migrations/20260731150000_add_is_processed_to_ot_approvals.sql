-- Migration: Add is_processed flag to ot_approvals

ALTER TABLE public.ot_approvals 
ADD COLUMN IF NOT EXISTS is_processed boolean DEFAULT false;

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS idx_ot_approvals_is_processed ON public.ot_approvals(is_processed);
