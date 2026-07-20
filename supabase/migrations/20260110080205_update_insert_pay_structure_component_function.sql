/*
  # Update insert_pay_structure_component Function

  1. Changes
    - Add parameters for is_attendance_linked and always_treat_as_full_day
    - Update INSERT statement to include these new fields

  2. Purpose
    - Allow the RPC function to save attendance linking preferences
    - Maintain backward compatibility with default values
*/

-- Drop the existing function
DROP FUNCTION IF EXISTS insert_pay_structure_component(
  p_amount numeric,
  p_calculation_type text,
  p_editability text,
  p_component_id uuid,
  p_component_name text,
  p_component_type text,
  p_iscustom boolean,
  p_percentage numeric,
  p_reference_components text[],
  p_structure_id uuid,
  p_tenant_id uuid
);

-- Recreate the function with new parameters
CREATE OR REPLACE FUNCTION insert_pay_structure_component(
  p_amount numeric DEFAULT 0,
  p_calculation_type text DEFAULT 'value',
  p_editability text DEFAULT 'fixed',
  p_component_id uuid DEFAULT NULL,
  p_component_name text DEFAULT '',
  p_component_type text DEFAULT 'earning',
  p_iscustom boolean DEFAULT false,
  p_percentage numeric DEFAULT 0,
  p_reference_components text[] DEFAULT ARRAY[]::text[],
  p_structure_id uuid DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL,
  p_is_attendance_linked boolean DEFAULT true,
  p_always_treat_as_full_day boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
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
    always_treat_as_full_day
  ) values (
    p_structure_id,
    new_component_id,
    p_calculation_type,
    p_editability,
    p_amount,
    p_percentage,
    reference_component_ids,
    0,
    p_tenant_id,
    p_is_attendance_linked,
    p_always_treat_as_full_day
  );    

  return true;
END;
$$;
