/*
  # Create Expression Engine System

  1. New Tables
    - `expression_templates`
      - Stores reusable expression formulas
      - Includes AST (Abstract Syntax Tree) JSON
      - Supports eligibility and value calculations
    
    - `expression_variables`
      - Available variables/parameters for expressions
      - Categorized (salary components, leave, shifts, etc.)
    
    - `expression_execution_logs`
      - Audit trail for expression executions
      - Helps debugging and compliance

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Expression Templates Table
CREATE TABLE IF NOT EXISTS expression_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category text NOT NULL, -- 'eligibility', 'value_calculation', 'validation'
  expression_text text NOT NULL, -- Original expression string
  expression_ast jsonb NOT NULL, -- Parsed Abstract Syntax Tree
  variables_used text[] DEFAULT '{}', -- List of variable names used
  dependencies text[] DEFAULT '{}', -- Component dependencies
  is_valid boolean DEFAULT true,
  validation_errors jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Expression Variables Table (Metadata for available variables)
CREATE TABLE IF NOT EXISTS expression_variables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  variable_name text NOT NULL,
  display_name text NOT NULL,
  category text NOT NULL, -- 'salary_component', 'leave_parameter', 'shift_parameter', 'calculation_parameter', 'system'
  data_type text NOT NULL, -- 'number', 'boolean', 'string', 'date'
  description text,
  source_table text, -- Table where value comes from
  source_column text, -- Column name
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, variable_name)
);

-- Expression Execution Logs Table
CREATE TABLE IF NOT EXISTS expression_execution_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  expression_id uuid REFERENCES expression_templates(id) ON DELETE CASCADE,
  execution_context jsonb NOT NULL, -- Runtime variable values
  result_value jsonb,
  execution_time_ms integer,
  success boolean DEFAULT true,
  error_message text,
  executed_at timestamptz DEFAULT now(),
  executed_by uuid REFERENCES auth.users(id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_expression_templates_tenant ON expression_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expression_templates_category ON expression_templates(category);
CREATE INDEX IF NOT EXISTS idx_expression_variables_tenant ON expression_variables(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expression_variables_category ON expression_variables(category);
CREATE INDEX IF NOT EXISTS idx_expression_logs_tenant ON expression_execution_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_expression_logs_expression ON expression_execution_logs(expression_id);

-- Enable Row Level Security
ALTER TABLE expression_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE expression_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE expression_execution_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for expression_templates
CREATE POLICY "Users can view own tenant expression templates"
  ON expression_templates FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant expression templates"
  ON expression_templates FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant expression templates"
  ON expression_templates FOR UPDATE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own tenant expression templates"
  ON expression_templates FOR DELETE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

-- RLS Policies for expression_variables
CREATE POLICY "Users can view own tenant expression variables"
  ON expression_variables FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant expression variables"
  ON expression_variables FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can update own tenant expression variables"
  ON expression_variables FOR UPDATE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ))
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can delete own tenant expression variables"
  ON expression_variables FOR DELETE
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

-- RLS Policies for expression_execution_logs
CREATE POLICY "Users can view own tenant expression logs"
  ON expression_execution_logs FOR SELECT
  TO authenticated
  USING (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

CREATE POLICY "Users can insert own tenant expression logs"
  ON expression_execution_logs FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id IN (
    SELECT tenant_id FROM auth.users WHERE id = auth.uid()
  ));

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_expression_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER expression_templates_updated_at
  BEFORE UPDATE ON expression_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_expression_template_updated_at();

-- Function to initialize default expression variables for a tenant
CREATE OR REPLACE FUNCTION initialize_expression_variables(p_tenant_id uuid)
RETURNS void AS $$
BEGIN
  -- Salary Component Variables
  INSERT INTO expression_variables (tenant_id, variable_name, display_name, category, data_type, description)
  VALUES
    (p_tenant_id, 'BASIC', 'Basic Salary', 'salary_component', 'number', 'Basic salary component'),
    (p_tenant_id, 'HRA', 'House Rent Allowance', 'salary_component', 'number', 'House rent allowance'),
    (p_tenant_id, 'DA', 'Dearness Allowance', 'salary_component', 'number', 'Dearness allowance'),
    (p_tenant_id, 'CONVEYANCE', 'Conveyance Allowance', 'salary_component', 'number', 'Conveyance allowance'),
    (p_tenant_id, 'MEDICAL', 'Medical Allowance', 'salary_component', 'number', 'Medical allowance'),
    
    -- Calculation Parameters
    (p_tenant_id, 'PD', 'Paid Days', 'calculation_parameter', 'number', 'Number of paid days in the period'),
    (p_tenant_id, 'AbsentDays', 'Absent Days', 'calculation_parameter', 'number', 'Number of absent days'),
    (p_tenant_id, 'LOP', 'Loss of Pay Days', 'calculation_parameter', 'number', 'Loss of pay days'),
    (p_tenant_id, 'TotalDays', 'Total Days', 'calculation_parameter', 'number', 'Total days in the period'),
    (p_tenant_id, 'OTHours', 'Overtime Hours', 'calculation_parameter', 'number', 'Overtime hours worked'),
    
    -- Leave Parameters
    (p_tenant_id, 'CL', 'Casual Leave', 'leave_parameter', 'number', 'Casual leave balance'),
    (p_tenant_id, 'SL', 'Sick Leave', 'leave_parameter', 'number', 'Sick leave balance'),
    (p_tenant_id, 'EL', 'Earned Leave', 'leave_parameter', 'number', 'Earned leave balance'),
    
    -- Boolean Flags
    (p_tenant_id, 'PFApplicable', 'PF Applicable', 'system', 'boolean', 'Whether PF is applicable'),
    (p_tenant_id, 'ESIApplicable', 'ESI Applicable', 'system', 'boolean', 'Whether ESI is applicable'),
    (p_tenant_id, 'IsActive', 'Is Active Employee', 'system', 'boolean', 'Employee active status')
  ON CONFLICT (tenant_id, variable_name) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
