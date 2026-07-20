/*
  # Employee Salary Structure Assignment System

  1. New Tables
    - `employee_salary_structure_assignments`
      - `id` (uuid, primary key) - Unique identifier for each assignment
      - `tenant_id` (uuid, not null) - Multi-tenant isolation
      - `employee_id` (uuid, not null) - Reference to employee
      - `salary_structure_id` (uuid, not null) - Reference to salary structure
      - `individual_component_values` (jsonb) - Stores values for individual components
      - `assigned_by` (uuid) - User who made the assignment
      - `assigned_at` (timestamptz) - Assignment timestamp
      - `created_at` (timestamptz) - Record creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp

  2. Constraints
    - Unique constraint on (tenant_id, employee_id) - One structure per employee
    - Foreign keys to employees and salary_structures tables

  3. Security
    - Enable RLS on assignments table
    - Policies for authenticated users to read/write assignments in their tenant

  4. Functions
    - `assign_employee_to_structure` - Atomically reassign employee to new structure
    - `get_employees_by_structure` - Get all employees assigned to a structure
    - `get_employee_assignment` - Get current assignment for an employee
*/

-- Create employee_salary_structure_assignments table
CREATE TABLE IF NOT EXISTS employee_salary_structure_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  salary_structure_id uuid NOT NULL,
  individual_component_values jsonb DEFAULT '{}'::jsonb,
  assigned_by uuid,
  assigned_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Foreign key constraints
  CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  CONSTRAINT fk_salary_structure FOREIGN KEY (salary_structure_id) REFERENCES salary_structures(id) ON DELETE CASCADE,
  CONSTRAINT fk_assigned_by FOREIGN KEY (assigned_by) REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Unique constraint: one structure per employee per tenant
  CONSTRAINT unique_employee_structure UNIQUE (tenant_id, employee_id)
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON employee_salary_structure_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_assignments_employee ON employee_salary_structure_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_assignments_structure ON employee_salary_structure_assignments(salary_structure_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_structure ON employee_salary_structure_assignments(tenant_id, salary_structure_id);

-- Enable Row Level Security
ALTER TABLE employee_salary_structure_assignments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view assignments in their tenant"
  ON employee_salary_structure_assignments
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can create assignments in their tenant"
  ON employee_salary_structure_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can update assignments in their tenant"
  ON employee_salary_structure_assignments
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  )
  WITH CHECK (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

CREATE POLICY "Users can delete assignments in their tenant"
  ON employee_salary_structure_assignments
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (SELECT get_user_tenant_ids())
  );

-- Function to atomically assign/reassign employee to structure
CREATE OR REPLACE FUNCTION assign_employee_to_structure(
  p_tenant_id uuid,
  p_employee_id uuid,
  p_salary_structure_id uuid,
  p_assigned_by uuid,
  p_individual_values jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_assignment record;
  v_new_assignment record;
  v_result jsonb;
BEGIN
  -- Check if employee already has an assignment
  SELECT * INTO v_existing_assignment
  FROM employee_salary_structure_assignments
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id;

  -- If exists, update it (reassignment)
  IF FOUND THEN
    UPDATE employee_salary_structure_assignments
    SET
      salary_structure_id = p_salary_structure_id,
      individual_component_values = p_individual_values,
      assigned_by = p_assigned_by,
      assigned_at = now(),
      updated_at = now()
    WHERE tenant_id = p_tenant_id
      AND employee_id = p_employee_id
    RETURNING * INTO v_new_assignment;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'reassigned',
      'previous_structure_id', v_existing_assignment.salary_structure_id,
      'new_structure_id', p_salary_structure_id,
      'assignment', row_to_json(v_new_assignment)
    );
  ELSE
    -- Create new assignment
    INSERT INTO employee_salary_structure_assignments (
      tenant_id,
      employee_id,
      salary_structure_id,
      individual_component_values,
      assigned_by
    ) VALUES (
      p_tenant_id,
      p_employee_id,
      p_salary_structure_id,
      p_individual_values,
      p_assigned_by
    )
    RETURNING * INTO v_new_assignment;

    v_result := jsonb_build_object(
      'success', true,
      'action', 'assigned',
      'assignment', row_to_json(v_new_assignment)
    );
  END IF;

  RETURN v_result;
END;
$$;

-- Function to get all employees assigned to a specific structure
CREATE OR REPLACE FUNCTION get_employees_by_structure(
  p_tenant_id uuid,
  p_salary_structure_id uuid
)
RETURNS TABLE (
  assignment_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  department text,
  emp_position text,
  individual_component_values jsonb,
  assigned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    esa.id as assignment_id,
    e.id as employee_id,
    e.employee_code,
    e.full_name as employee_name,
    d.name as department,
    e.position as emp_position,
    esa.individual_component_values,
    esa.assigned_at
  FROM employee_salary_structure_assignments esa
  INNER JOIN employees e ON e.id = esa.employee_id AND e.tenant_id = esa.tenant_id
  LEFT JOIN departments d ON d.id = e.department_id AND d.tenant_id = e.tenant_id
  WHERE esa.tenant_id = p_tenant_id
    AND esa.salary_structure_id = p_salary_structure_id
    AND e.is_active = true
  ORDER BY e.employee_code, e.full_name;
END;
$$;

-- Function to get employee's current assignment
CREATE OR REPLACE FUNCTION get_employee_assignment(
  p_tenant_id uuid,
  p_employee_id uuid
)
RETURNS TABLE (
  assignment_id uuid,
  salary_structure_id uuid,
  salary_structure_name text,
  individual_component_values jsonb,
  assigned_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    esa.id as assignment_id,
    ss.id as salary_structure_id,
    ss.name as salary_structure_name,
    esa.individual_component_values,
    esa.assigned_at
  FROM employee_salary_structure_assignments esa
  INNER JOIN salary_structures ss ON ss.id = esa.salary_structure_id AND ss.tenant_id = esa.tenant_id
  WHERE esa.tenant_id = p_tenant_id
    AND esa.employee_id = p_employee_id;
END;
$$;

-- Function to bulk assign employees to structure
CREATE OR REPLACE FUNCTION bulk_assign_employees_to_structure(
  p_tenant_id uuid,
  p_employee_ids uuid[],
  p_salary_structure_id uuid,
  p_assigned_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_employee_id uuid;
  v_success_count integer := 0;
  v_reassign_count integer := 0;
  v_error_count integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  FOREACH v_employee_id IN ARRAY p_employee_ids
  LOOP
    BEGIN
      v_result := assign_employee_to_structure(
        p_tenant_id,
        v_employee_id,
        p_salary_structure_id,
        p_assigned_by,
        '{}'::jsonb
      );

      IF (v_result->>'action') = 'assigned' THEN
        v_success_count := v_success_count + 1;
      ELSIF (v_result->>'action') = 'reassigned' THEN
        v_reassign_count := v_reassign_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_error_count := v_error_count + 1;
      v_errors := v_errors || jsonb_build_object(
        'employee_id', v_employee_id,
        'error', SQLERRM
      );
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'total', array_length(p_employee_ids, 1),
    'assigned', v_success_count,
    'reassigned', v_reassign_count,
    'errors', v_error_count,
    'error_details', v_errors
  );
END;
$$;

-- Function to remove employee assignment
CREATE OR REPLACE FUNCTION remove_employee_assignment(
  p_tenant_id uuid,
  p_employee_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted_count integer;
BEGIN
  DELETE FROM employee_salary_structure_assignments
  WHERE tenant_id = p_tenant_id
    AND employee_id = p_employee_id;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'success', true,
    'deleted', v_deleted_count > 0
  );
END;
$$;