/*
  # Update insert_pay_structure_component Function to Include Expression Fields

  1. Changes
    - Add p_expression parameter to function signature
    - Add p_expression_ast parameter to function signature
    - Update INSERT statement to include expression and expression_ast fields
    - Default values are NULL for backward compatibility

  2. Purpose
    - Allow saving expression and expression_ast when creating/updating salary structures
    - Support expression-type payroll components
    - Enable formula-based component calculations

  3. Backward Compatibility
    - Parameters are optional (have NULL defaults)
    - Existing calls without these parameters will continue to work
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS insert_pay_structure_component(
  numeric, text, text, uuid, text, text, boolean, numeric, text[], uuid, uuid, boolean, boolean, boolean, boolean
);

-- Recreate the function with expression parameters
CREATE OR REPLACE FUNCTION public.insert_pay_structure_component(p_amount numeric DEFAULT 0, p_calculation_type text DEFAULT 'value'::text, p_editability text DEFAULT 'fixed'::text, p_component_id uuid DEFAULT NULL::uuid, p_component_name text DEFAULT ''::text, p_component_type text DEFAULT 'earning'::text, p_iscustom boolean DEFAULT false, p_percentage numeric DEFAULT 0, p_reference_components text[] DEFAULT ARRAY[]::text[], p_structure_id uuid DEFAULT NULL::uuid, p_tenant_id uuid DEFAULT NULL::uuid, p_is_attendance_linked boolean DEFAULT true, p_always_treat_as_full_day boolean DEFAULT false, p_is_locked boolean DEFAULT false, p_is_applied_in_calculation boolean DEFAULT true, p_expression text DEFAULT NULL::text, p_expression_ast jsonb DEFAULT NULL::jsonb, p_display_order integer DEFAULT 0)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
new_component_id uuid;
reference_component_ids uuid[];

BEGIN
-- create component if passed component is custom
if p_isCustom = true and p_component_id is null then
if exists (
select 1 
from payroll_components pc
where pc.name = p_component_name 
and pc.tenant_id = p_tenant_id
) then
-- raise error
RAISE EXCEPTION USING MESSAGE = p_component_name || ' Component already exists.', ERRCODE = 'P0001';
else
-- insert and return new component id
insert into payroll_components ( name, description, component_type, tenant_id )
values ( p_component_name, p_component_name, p_component_type, p_tenant_id )
returning id into new_component_id;
end if;
elsif p_component_id is not null then
new_component_id = p_component_id;
end if;

-- Convert reference component names to UUIDs
SELECT ARRAY(
SELECT id 
FROM payroll_components pc
WHERE name = ANY(p_reference_components)
AND pc.tenant_id = p_tenant_id
)
INTO reference_component_ids;

insert into payroll_structure_components (
structure_id,
component_id,
calculation_type,
editability,
amount,
percentage,
reference_components,
display_order,
tenant_id,
is_attendance_linked,
always_treat_as_full_day,
is_locked,
is_applied_in_calculation,
expression,
expression_ast
) values (
p_structure_id,
new_component_id,
p_calculation_type,
p_editability,
p_amount,
p_percentage,
reference_component_ids,
p_display_order,
p_tenant_id,
p_is_attendance_linked,
p_always_treat_as_full_day,
p_is_locked,
p_is_applied_in_calculation,
p_expression,
p_expression_ast
);    

return true;
END;
$function$
