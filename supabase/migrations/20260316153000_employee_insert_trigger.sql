
-- Create a centralized trigger function to handle post-employee creation logic
CREATE OR REPLACE FUNCTION public.after_employee_insert_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_year int;
    v_leave record;
    v_admin_user_id uuid;

    v_existing record;
BEGIN

    v_year := EXTRACT(YEAR FROM CURRENT_DATE)::int;

    -- get admin user
    SELECT id
    INTO v_admin_user_id
    FROM public.user_profiles
    WHERE tenant_id = NEW.tenant_id
    AND lower(user_role) = 'admin'
    LIMIT 1;


    -------------------------------------------------------
    -- LEAVE INITIALIZATION
    -------------------------------------------------------

    FOR v_leave IN
        SELECT id, default_days
        FROM public.leave_types
        WHERE (tenant_id = NEW.tenant_id OR tenant_id IS NULL) AND name!='LOP'
    LOOP

        ---------------------------------------------------
        -- get configuration from existing employees
        ---------------------------------------------------
        IF Exists (Select 1 FROM public.employee_leave_applicable ela
                        JOIN public.employees e
                            ON e.id = ela.employee_id
                        WHERE ela.leave_type_id = v_leave.id AND e.tenant_id = NEW.tenant_id) THEN


            IF Exists (SELECT 1
                        FROM public.employee_leave_applicable ela
                        JOIN public.employees e
                            ON e.id = ela.employee_id
                        WHERE ela.leave_type_id = v_leave.id AND e.tenant_id = NEW.tenant_id AND ela.is_applicable = false) THEN

                INSERT INTO public.employee_leave_applicable(
                    tenant_id,
                    employee_id,
                    leave_type_id,
                    is_applicable,
                    applicable_days,
                    created_by,
                    updated_by
                )
                VALUES (
                    NEW.tenant_id,
                    NEW.id,
                    v_leave.id,
                    false,
                    null,
                    v_admin_user_id,
                    v_admin_user_id
                )
                ON CONFLICT (tenant_id, employee_id, leave_type_id) DO NOTHING;
            ELSE
                SELECT ela.is_applicable, ela.applicable_days
                INTO v_existing
                FROM public.employee_leave_applicable ela
                JOIN public.employees e
                    ON e.id = ela.employee_id
                WHERE ela.leave_type_id = v_leave.id AND e.tenant_id = NEW.tenant_id AND ela.is_applicable = true
                LIMIT 1;
                
                INSERT INTO public.employee_leave_applicable(
                    tenant_id,
                    employee_id,
                    leave_type_id,
                    is_applicable,
                    applicable_days,
                    created_by,
                    updated_by
                )
                VALUES (
                    NEW.tenant_id,
                    NEW.id,
                    v_leave.id,
                    true,
                    coalesce(v_existing.applicable_days, v_leave.default_days),
                    v_admin_user_id,
                    v_admin_user_id
                )
                ON CONFLICT (tenant_id, employee_id, leave_type_id) DO NOTHING;

            END IF;
        END IF;
    END LOOP;

    -- Sync leave balances immediately after settings are established
    -- PERFORM public.sync_leave_balances(NEW.id, v_year, NEW.tenant_id);

    -------------------------------------------------------
    -- STATUTORY VALUES
    -------------------------------------------------------

    INSERT INTO public.employee_statutory_values (
        tenant_id,
        employee_id,
        configuration_id,
        value,
        created_at,
        updated_at
    )
    SELECT
        NEW.tenant_id,
        NEW.id,
        sc.id,
        COALESCE(sc.global_value,0),
        now(),
        now()
    FROM public.statutory_configurations sc
    WHERE sc.tenant_id = NEW.tenant_id
    AND sc.application_type = 'same_to_all'
    AND sc.is_active = true;

    RETURN NEW;

END;
$function$;

-- Attach the function to an AFTER INSERT trigger on the employees table
DROP TRIGGER IF EXISTS handle_new_employee_defaults ON public.employees;

CREATE TRIGGER handle_new_employee_defaults
AFTER INSERT ON public.employees
FOR EACH ROW
EXECUTE FUNCTION public.after_employee_insert_trigger();