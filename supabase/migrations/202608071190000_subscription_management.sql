-- Add subscription_enabled to domain_configurations
ALTER TABLE public.domain_configurations 
ADD COLUMN IF NOT EXISTS subscription_enabled boolean DEFAULT false;

-- Add subscription_enabled to tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS subscription_enabled boolean DEFAULT false;

-- Function to handle tenant subscription based on domain config
CREATE OR REPLACE FUNCTION public.sync_tenant_subscription()
RETURNS TRIGGER AS $$
DECLARE
    v_domain_sub_enabled boolean;
BEGIN
    -- Only check if tenant is trying to enable subscription
    IF NEW.subscription_enabled = true THEN
        -- Find the associated domain config (assuming 1 domain per tenant for now, or just check if any domain allows it)
        -- Based on the structure, domain_configurations has a tenant_id
        SELECT subscription_enabled INTO v_domain_sub_enabled
        FROM public.domain_configurations
        WHERE tenant_id = NEW.id
        LIMIT 1;

        -- If domain doesn't have it enabled, force tenant to false
        IF v_domain_sub_enabled IS NOT TRUE THEN
            NEW.subscription_enabled = false;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on tenants table
DROP TRIGGER IF EXISTS enforce_tenant_subscription ON public.tenants;
CREATE TRIGGER enforce_tenant_subscription
    BEFORE INSERT OR UPDATE OF subscription_enabled
    ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.sync_tenant_subscription();

-- Function to cascade domain subscription disabled to tenants
CREATE OR REPLACE FUNCTION public.cascade_domain_subscription_disabled()
RETURNS TRIGGER AS $$
BEGIN
    -- If domain subscription is being disabled
    IF OLD.subscription_enabled = true AND NEW.subscription_enabled = false THEN
        -- Disable it for the linked tenant
        UPDATE public.tenants
        SET subscription_enabled = false
        WHERE id = NEW.tenant_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on domain_configurations
DROP TRIGGER IF EXISTS cascade_domain_subscription ON public.domain_configurations;
CREATE TRIGGER cascade_domain_subscription
    AFTER UPDATE OF subscription_enabled
    ON public.domain_configurations
    FOR EACH ROW
    EXECUTE FUNCTION public.cascade_domain_subscription_disabled();
