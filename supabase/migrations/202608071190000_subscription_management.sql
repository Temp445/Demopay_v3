

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
