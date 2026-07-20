-- Add the column if it doesn't exist
ALTER TABLE public.payroll_structure_components
ADD COLUMN IF NOT EXISTS is_attendance_linked boolean DEFAULT false;

-- If the column already exists but has a different default (like true), alter the default value
ALTER TABLE public.payroll_structure_components
ALTER COLUMN is_attendance_linked SET DEFAULT false;



-- 2. Recreate the function with the new parameter
CREATE OR REPLACE FUNCTION public.insert_pay_structure_component(
  p_amount numeric DEFAULT 0, 
  p_amount_type text DEFAULT 'value'::text, 
  p_editability text DEFAULT 'fixed'::text, 
  p_component_id uuid DEFAULT NULL::uuid, 
  p_component_name text DEFAULT ''::text, 
  p_component_type text DEFAULT 'earning'::text, 
  p_iscustom boolean DEFAULT false, 
  p_percentage numeric DEFAULT 0, 
  p_reference_components text[] DEFAULT ARRAY[]::text[], 
  p_structure_id uuid DEFAULT NULL::uuid, 
  p_tenant_id uuid DEFAULT NULL::uuid, 
  p_is_locked boolean DEFAULT false, 
  p_is_applied_in_calculation boolean DEFAULT true, 
  p_expression text DEFAULT NULL::text, 
  p_expression_ast jsonb DEFAULT NULL::jsonb, 
  p_display_order integer DEFAULT 0,
  p_is_attendance_linked boolean DEFAULT false -- NEW PARAMETER ADDED HERE
)
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
amount_type,
editability,
amount,
percentage,
reference_components,
display_order,
tenant_id,
is_locked,
is_applied_in_calculation,
expression,
expression_ast,
is_attendance_linked -- NEW COLUMN INCLUDED HERE
) values (
p_structure_id,
new_component_id,
p_amount_type,
p_editability,
p_amount,
p_percentage,
reference_component_ids,
p_display_order,
p_tenant_id,
p_is_locked,
p_is_applied_in_calculation,
p_expression,
p_expression_ast,
p_is_attendance_linked -- NEW VALUE INCLUDED HERE
);    

return true;
END;
$function$;



CREATE OR REPLACE FUNCTION public.get_payroll_structure_details(p_structure_id uuid, p_tenant_id uuid)
 RETURNS TABLE(id uuid, name text, description text, is_active boolean, components jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
RETURN QUERY
SELECT
ps.id,
ps.name,
ps.description,
ps.is_active,
COALESCE(
jsonb_agg(
jsonb_build_object(
'id', pc.id,
'name', pc.name,
'component_type', pc.component_type,
'type_selection', COALESCE(pc.type_selection, 'common'),
'amount_type',pc.amount_type,
'value_set', pc.value_set,
'amount_type', psc.amount_type,
'calculation_type', pc.calculation_type,
'editability', psc.editability,
'amount', psc.amount,
'percentage_value', psc.percentage,
'reference_components',
COALESCE(ref_components.ref_names, '[]'::jsonb),
'isCustom', false,
'description', pc.description,
'display_order', psc.display_order,
'is_locked', COALESCE(psc.is_locked, false),
'statutory_component_id', statutory_component_id,
'is_applied_in_calculation', COALESCE(psc.is_applied_in_calculation, true),
'expression', expression,
'expression_ast', expression_ast,
'is_attendance_linked', COALESCE(psc.is_attendance_linked, false) -- NEW FIELD ADDED HERE
) ORDER BY psc.display_order
) FILTER (WHERE psc.id IS NOT NULL),
'[]'::jsonb
) as components
FROM public.payroll_structures ps
LEFT JOIN public.payroll_structure_components psc ON psc.structure_id = ps.id AND psc.tenant_id = ps.tenant_id
LEFT JOIN public.payroll_components pc ON psc.component_id = pc.id AND pc.tenant_id = psc.tenant_id
LEFT JOIN LATERAL (
SELECT jsonb_agg(prc.name) AS ref_names
FROM public.payroll_components prc
WHERE prc.id = ANY (psc.reference_components)
AND prc.tenant_id = p_tenant_id
) ref_components ON TRUE
WHERE ps.id = p_structure_id
AND ps.tenant_id = p_tenant_id
GROUP BY ps.id;
END;
$function$;
