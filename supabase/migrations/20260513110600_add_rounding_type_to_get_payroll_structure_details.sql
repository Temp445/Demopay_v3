-- Update get_payroll_structure_details function to include rounding_type
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
'amount_type', pc.amount_type,
'value_set', pc.value_set,
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
'statutory_component_id', pc.statutory_component_id,
'is_applied_in_calculation', COALESCE(psc.is_applied_in_calculation, true),
'expression', pc.expression,
'expression_ast', pc.expression_ast,
'rounding_type', pc.rounding_type
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
