-- Fix for sync_tenant_subscription to use domains_management instead of domain_configurations

CREATE OR REPLACE FUNCTION public.sync_tenant_subscription()
RETURNS TRIGGER AS $$
DECLARE
    v_domain_sub_enabled boolean;
BEGIN
    -- Only check if tenant is trying to enable subscription
    IF NEW.subscription_enabled = true THEN
        -- Find the associated domain config by joining domains_management
        SELECT dm.subscription_enabled INTO v_domain_sub_enabled
        FROM public.domain_configurations dc
        JOIN public.domains_management dm ON dc.domain_id = dm.id
        WHERE dc.tenant_id = NEW.id
        LIMIT 1;

        -- If it's an UPDATE, and the domain doesn't have it enabled, force tenant to false
        IF TG_OP = 'UPDATE' THEN
            IF v_domain_sub_enabled IS NOT TRUE THEN
                NEW.subscription_enabled = false;
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Add trigger to cascade domains_management subscription to tenants
CREATE OR REPLACE FUNCTION public.cascade_domain_subscription_to_tenants()
RETURNS TRIGGER AS $$
BEGIN
    -- If domain subscription is being disabled
    IF OLD.subscription_enabled = true AND NEW.subscription_enabled = false THEN
        -- Disable it for all linked tenants
        UPDATE public.tenants
        SET subscription_enabled = false
        WHERE id IN (
            SELECT tenant_id 
            FROM public.domain_configurations 
            WHERE domain_id = NEW.id AND tenant_id IS NOT NULL
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS cascade_domain_subscription ON public.domains_management;
CREATE TRIGGER cascade_domain_subscription
    AFTER UPDATE OF subscription_enabled
    ON public.domains_management
    FOR EACH ROW
    EXECUTE FUNCTION public.cascade_domain_subscription_to_tenants();



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

