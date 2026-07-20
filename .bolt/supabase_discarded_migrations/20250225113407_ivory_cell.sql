-- Create function to get salary structure details
CREATE OR REPLACE FUNCTION get_salary_structure_details(p_structure_id uuid)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  is_active boolean,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  components jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ss.id,
    ss.name,
    ss.description,
    ss.is_active,
    ss.created_by,
    ss.created_at,
    ss.updated_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ssc.id,
          'name', ssc.name,
          'component_type', ssc.component_type,
          'calculation_method', ssc.calculation_method,
          'amount', ssc.amount,
          'percentage', ssc.percentage,
          'reference_components', ssc.reference_components,
          'is_taxable', ssc.is_taxable,
          'description', ssc.description,
          'display_order', ssc.display_order
        ) ORDER BY ssc.display_order
      ) FILTER (WHERE ssc.id IS NOT NULL),
      '[]'::jsonb
    ) as components
  FROM public.salary_structures ss
  LEFT JOIN public.salary_structure_components ssc ON ssc.structure_id = ss.id
  WHERE ss.id = p_structure_id
  GROUP BY ss.id;
END;
$$;

-- Create function to get employee salary structure history
CREATE OR REPLACE FUNCTION get_employee_salary_structure_history(p_employee_id uuid)
RETURNS TABLE (
  id uuid,
  structure_id uuid,
  structure_name text,
  effective_from date,
  effective_to date,
  created_by uuid,
  created_at timestamptz,
  components jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ess.id,
    ess.structure_id,
    ss.name as structure_name,
    ess.effective_from,
    ess.effective_to,
    ess.created_by,
    ess.created_at,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', ssc.id,
          'name', ssc.name,
          'component_type', ssc.component_type,
          'calculation_method', ssc.calculation_method,
          'amount', ssc.amount,
          'percentage', ssc.percentage,
          'reference_components', ssc.reference_components,
          'is_taxable', ssc.is_taxable,
          'description', ssc.description,
          'display_order', ssc.display_order
        ) ORDER BY ssc.display_order
      ) FILTER (WHERE ssc.id IS NOT NULL),
      '[]'::jsonb
    ) as components
  FROM public.employee_salary_structures ess
  JOIN public.salary_structures ss ON ss.id = ess.structure_id
  LEFT JOIN public.salary_structure_components ssc ON ssc.structure_id = ss.id
  WHERE ess.employee_id = p_employee_id
  GROUP BY ess.id, ess.structure_id, ss.name, ess.effective_from, ess.effective_to, ess.created_by, ess.created_at
  ORDER BY ess.effective_from DESC;
END;
$$;