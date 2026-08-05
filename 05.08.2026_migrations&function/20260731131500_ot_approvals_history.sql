-- Migration: Add history table and triggers for ot_approvals

ALTER TABLE public.ot_approvals 
ADD COLUMN IF NOT EXISTS is_processed boolean DEFAULT false;

-- Create index for faster querying
CREATE INDEX IF NOT EXISTS idx_ot_approvals_is_processed ON public.ot_approvals(is_processed);

-- 1. Create the history table
CREATE TABLE IF NOT EXISTS public.ot_approvals_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ot_approval_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    employee_id uuid NOT NULL,
    action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
    changed_by uuid NULL,
    changed_at timestamp with time zone NOT NULL DEFAULT now(),
    old_data jsonb NULL,
    new_data jsonb NULL,
    CONSTRAINT ot_approvals_history_pkey PRIMARY KEY (id)
) TABLESPACE pg_default;

-- Add indexes for common queries on the history table
CREATE INDEX IF NOT EXISTS idx_ot_approvals_history_approval_id ON public.ot_approvals_history USING btree (ot_approval_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_history_tenant ON public.ot_approvals_history USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_history_employee ON public.ot_approvals_history USING btree (employee_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_history_date ON public.ot_approvals_history USING btree (changed_at);

-- 2. Create the trigger function
CREATE OR REPLACE FUNCTION public.process_ot_approval_audit()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_changed_by uuid;
    v_tenant_id uuid;
    v_employee_id uuid;
BEGIN
    -- Try to get the user ID who made the change from the JWT token (if called from API)
    BEGIN
        v_changed_by := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_changed_by := NULL;
    END;

    IF (TG_OP = 'DELETE') THEN
        v_tenant_id := OLD.tenant_id;
        v_employee_id := OLD.employee_id;
        
        INSERT INTO public.ot_approvals_history (
            ot_approval_id, tenant_id, employee_id, action, changed_by, old_data
        ) VALUES (
            OLD.id, v_tenant_id, v_employee_id, 'DELETE', v_changed_by, row_to_json(OLD)::jsonb
        );
        RETURN OLD;
        
    ELSIF (TG_OP = 'UPDATE') THEN
        v_tenant_id := NEW.tenant_id;
        v_employee_id := NEW.employee_id;
        
        -- Fallback: If it's an approval/rejection and we couldn't get auth.uid(), 
        -- use the approved_by from the record itself if it changed
        IF v_changed_by IS NULL AND NEW.approved_by IS NOT NULL AND (OLD.approved_by IS NULL OR OLD.approved_by != NEW.approved_by) THEN
            v_changed_by := NEW.approved_by;
        END IF;

        INSERT INTO public.ot_approvals_history (
            ot_approval_id, tenant_id, employee_id, action, changed_by, old_data, new_data
        ) VALUES (
            NEW.id, v_tenant_id, v_employee_id, 'UPDATE', v_changed_by, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb
        );
        RETURN NEW;
        
    ELSIF (TG_OP = 'INSERT') THEN
        v_tenant_id := NEW.tenant_id;
        v_employee_id := NEW.employee_id;
        
        INSERT INTO public.ot_approvals_history (
            ot_approval_id, tenant_id, employee_id, action, changed_by, new_data
        ) VALUES (
            NEW.id, v_tenant_id, v_employee_id, 'INSERT', v_changed_by, row_to_json(NEW)::jsonb
        );
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$;

-- 3. Attach the trigger to the ot_approvals table
DROP TRIGGER IF EXISTS trg_ot_approvals_audit ON public.ot_approvals;
CREATE TRIGGER trg_ot_approvals_audit
AFTER INSERT OR UPDATE OR DELETE ON public.ot_approvals
FOR EACH ROW EXECUTE FUNCTION public.process_ot_approval_audit();

-- 4. Set RLS on the history table
ALTER TABLE public.ot_approvals_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view history in their tenant" ON public.ot_approvals_history
    FOR SELECT USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
        )
    );
