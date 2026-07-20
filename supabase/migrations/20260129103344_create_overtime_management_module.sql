/*
  # Overtime Management Module
  
  ## Description
  Complete overtime management system with employee eligibility, approval workflows,
  OT structures, processing, and reporting capabilities.
  
  ## New Tables
  
  1. **employee_ot_eligibility**
     - Tracks which employees are eligible for overtime
     - Toggle system for enable/disable
     
  2. **ot_structures**
     - Overtime structure definitions (similar to salary structures)
     - Template-based system
     
  3. **ot_structure_components**
     - Components within OT structures
     - Types: Fixed, Editable, Enter Later
     - Earnings only (no deductions)
     
  4. **ot_approvals**
     - Approval records for overtime hours
     - Tracks original vs corrected hours
     - Mandatory reason for modifications
     
  5. **ot_processing**
     - Overtime processing records
     - Standalone or linked to payroll
     - Processing status tracking
     
  6. **ot_processed_data**
     - Individual employee OT processed records
     - Component-wise breakdown
     - Links to payroll if applicable
  
  ## Security
  - RLS enabled on all tables
  - Tenant isolation enforced
  - Proper access controls
*/

-- ============================================================================
-- PART 1: Employee OT Eligibility Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.employee_ot_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  is_ot_eligible boolean DEFAULT true,
  effective_from date DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(tenant_id, employee_id)
);

ALTER TABLE public.employee_ot_eligibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view employee OT eligibility in their tenant"
  ON public.employee_ot_eligibility FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert employee OT eligibility in their tenant"
  ON public.employee_ot_eligibility FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update employee OT eligibility in their tenant"
  ON public.employee_ot_eligibility FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete employee OT eligibility in their tenant"
  ON public.employee_ot_eligibility FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_employee_ot_eligibility_tenant ON public.employee_ot_eligibility(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_ot_eligibility_employee ON public.employee_ot_eligibility(employee_id);

-- ============================================================================
-- PART 2: OT Structures Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ot_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  structure_name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  is_default boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  UNIQUE(tenant_id, structure_name)
);

ALTER TABLE public.ot_structures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view OT structures in their tenant"
  ON public.ot_structures FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert OT structures in their tenant"
  ON public.ot_structures FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update OT structures in their tenant"
  ON public.ot_structures FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete OT structures in their tenant"
  ON public.ot_structures FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ot_structures_tenant ON public.ot_structures(tenant_id);

-- ============================================================================
-- PART 3: OT Structure Components Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ot_structure_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ot_structure_id uuid NOT NULL REFERENCES public.ot_structures(id) ON DELETE CASCADE,
  component_name text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('fixed', 'editable', 'enter_later')),
  calculation_type text NOT NULL DEFAULT 'flat' CHECK (calculation_type IN ('flat', 'hourly_rate', 'percentage')),
  value numeric(15,2) DEFAULT 0,
  percentage_of text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ot_structure_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view OT structure components in their tenant"
  ON public.ot_structure_components FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert OT structure components in their tenant"
  ON public.ot_structure_components FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update OT structure components in their tenant"
  ON public.ot_structure_components FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete OT structure components in their tenant"
  ON public.ot_structure_components FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ot_structure_components_tenant ON public.ot_structure_components(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ot_structure_components_structure ON public.ot_structure_components(ot_structure_id);

-- ============================================================================
-- PART 4: OT Approvals Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ot_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  attendance_log_id uuid REFERENCES public.attendance_logs(id) ON DELETE CASCADE,
  attendance_date date NOT NULL,
  original_ot_hours numeric(8,2) DEFAULT 0,
  corrected_ot_hours numeric(8,2),
  modification_reason text,
  approval_status text DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ot_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view OT approvals in their tenant"
  ON public.ot_approvals FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert OT approvals in their tenant"
  ON public.ot_approvals FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update OT approvals in their tenant"
  ON public.ot_approvals FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete OT approvals in their tenant"
  ON public.ot_approvals FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ot_approvals_tenant ON public.ot_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_employee ON public.ot_approvals(employee_id);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_date ON public.ot_approvals(attendance_date);
CREATE INDEX IF NOT EXISTS idx_ot_approvals_status ON public.ot_approvals(approval_status);

-- ============================================================================
-- PART 5: OT Processing Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ot_processing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  process_name text NOT NULL,
  processing_period_start date NOT NULL,
  processing_period_end date NOT NULL,
  processing_mode text NOT NULL CHECK (processing_mode IN ('standalone', 'linked')),
  linked_payroll_id uuid,
  ot_structure_id uuid REFERENCES public.ot_structures(id),
  processing_status text DEFAULT 'draft' CHECK (processing_status IN ('draft', 'processing', 'completed', 'finalized', 'cancelled')),
  total_employees integer DEFAULT 0,
  total_ot_amount numeric(15,2) DEFAULT 0,
  processed_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.ot_processing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view OT processing in their tenant"
  ON public.ot_processing FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert OT processing in their tenant"
  ON public.ot_processing FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update OT processing in their tenant"
  ON public.ot_processing FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete OT processing in their tenant"
  ON public.ot_processing FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ot_processing_tenant ON public.ot_processing(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ot_processing_period ON public.ot_processing(processing_period_start, processing_period_end);
CREATE INDEX IF NOT EXISTS idx_ot_processing_status ON public.ot_processing(processing_status);

-- ============================================================================
-- PART 6: OT Processed Data Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ot_processed_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ot_processing_id uuid NOT NULL REFERENCES public.ot_processing(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  ot_structure_id uuid REFERENCES public.ot_structures(id),
  total_ot_hours numeric(8,2) DEFAULT 0,
  total_ot_amount numeric(15,2) DEFAULT 0,
  components jsonb DEFAULT '[]'::jsonb,
  attendance_records jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.ot_processed_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view OT processed data in their tenant"
  ON public.ot_processed_data FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert OT processed data in their tenant"
  ON public.ot_processed_data FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update OT processed data in their tenant"
  ON public.ot_processed_data FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete OT processed data in their tenant"
  ON public.ot_processed_data FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_ot_processed_data_tenant ON public.ot_processed_data(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ot_processed_data_processing ON public.ot_processed_data(ot_processing_id);
CREATE INDEX IF NOT EXISTS idx_ot_processed_data_employee ON public.ot_processed_data(employee_id);

-- ============================================================================
-- PART 7: Helper Functions
-- ============================================================================
-- Function to check if employee is OT eligible
CREATE OR REPLACE FUNCTION is_employee_ot_eligible(
  p_employee_id uuid,
  p_tenant_id uuid,
  p_check_date date DEFAULT CURRENT_DATE
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_eligible boolean;
BEGIN
  SELECT is_ot_eligible
  INTO v_eligible
  FROM public.employee_ot_eligibility
  WHERE employee_id = p_employee_id
    AND tenant_id = p_tenant_id
    AND (effective_from IS NULL OR effective_from <= p_check_date)
  ORDER BY effective_from DESC
  LIMIT 1;
  
  -- If no record applies to p_check_date, it might be because the only record 
  -- is in the future. In that case, we should check what the earliest record says.
  IF v_eligible IS NULL THEN
    SELECT is_ot_eligible
    INTO v_eligible
    FROM public.employee_ot_eligibility
    WHERE employee_id = p_employee_id
      AND tenant_id = p_tenant_id
    ORDER BY effective_from ASC
    LIMIT 1;
  END IF;

  -- Default to true if no record exists at all
  RETURN COALESCE(v_eligible, true);
END;
$$;

-- Function to get eligible employees for OT processing
CREATE OR REPLACE FUNCTION get_ot_eligible_employees(
  p_tenant_id uuid,
  p_period_start date,
  p_period_end date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  employee_code text,
  department text,
  total_ot_hours numeric,
  ot_structure_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.name,
    e.employee_code,
    d.name as department,
    COALESCE(SUM(
      CASE 
        WHEN al.overtime_minutes IS NOT NULL THEN al.overtime_minutes / 60.0
        ELSE 0
      END
    ), 0)::numeric(8,2) as total_ot_hours,
    NULL::uuid as ot_structure_id
  FROM public.employees e
  LEFT JOIN public.departments d ON e.department_id = d.id
  LEFT JOIN public.attendance_logs al ON al.employee_id = e.id 
    AND al.date BETWEEN p_period_start AND p_period_end
    AND al.tenant_id = p_tenant_id
  WHERE e.tenant_id = p_tenant_id
    AND e.is_active = true
    AND is_employee_ot_eligible(e.id, p_tenant_id, p_period_start)
  GROUP BY e.id, e.name, e.employee_code, d.name
  HAVING COALESCE(SUM(
    CASE 
      WHEN al.overtime_minutes IS NOT NULL THEN al.overtime_minutes / 60.0
      ELSE 0
    END
  ), 0) > 0
  ORDER BY e.employee_code;
END;
$$;

-- Function to clone OT structure
CREATE OR REPLACE FUNCTION clone_ot_structure(
  p_source_structure_id uuid,
  p_new_structure_name text,
  p_tenant_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_structure_id uuid;
  v_component record;
BEGIN
  -- Create new structure
  INSERT INTO public.ot_structures (
    tenant_id,
    structure_name,
    description,
    is_active,
    is_default,
    created_by,
    updated_by
  )
  SELECT 
    p_tenant_id,
    p_new_structure_name,
    description || ' (Copy)',
    false,
    false,
    p_user_id,
    p_user_id
  FROM public.ot_structures
  WHERE id = p_source_structure_id
    AND tenant_id = p_tenant_id
  RETURNING id INTO v_new_structure_id;
  
  -- Clone components
  FOR v_component IN 
    SELECT * FROM public.ot_structure_components
    WHERE ot_structure_id = p_source_structure_id
      AND tenant_id = p_tenant_id
  LOOP
    INSERT INTO public.ot_structure_components (
      tenant_id,
      ot_structure_id,
      component_name,
      component_type,
      calculation_type,
      value,
      percentage_of,
      display_order,
      is_active
    ) VALUES (
      p_tenant_id,
      v_new_structure_id,
      v_component.component_name,
      v_component.component_type,
      v_component.calculation_type,
      v_component.value,
      v_component.percentage_of,
      v_component.display_order,
      v_component.is_active
    );
  END LOOP;
  
  RETURN v_new_structure_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION is_employee_ot_eligible TO authenticated;
GRANT EXECUTE ON FUNCTION get_ot_eligible_employees TO authenticated;
GRANT EXECUTE ON FUNCTION clone_ot_structure TO authenticated;

-- ============================================================================
-- PART 8: Comments
-- ============================================================================

COMMENT ON TABLE public.employee_ot_eligibility IS 
'Tracks which employees are eligible for overtime calculation';

COMMENT ON TABLE public.ot_structures IS 
'Overtime structure definitions with components';

COMMENT ON TABLE public.ot_structure_components IS 
'Components within OT structures - earnings only, types: fixed, editable, enter_later';

COMMENT ON TABLE public.ot_approvals IS 
'Approval records for overtime with original vs corrected hours and mandatory reasons';

COMMENT ON TABLE public.ot_processing IS 
'Overtime processing records - standalone or linked to payroll';

COMMENT ON TABLE public.ot_processed_data IS 
'Individual employee OT processed records with component breakdown';

COMMENT ON FUNCTION is_employee_ot_eligible IS 
'Checks if an employee is eligible for overtime on a given date';

COMMENT ON FUNCTION get_ot_eligible_employees IS 
'Gets all OT-eligible employees with their hours for a period';

COMMENT ON FUNCTION clone_ot_structure IS 
'Clones an existing OT structure with all its components';
