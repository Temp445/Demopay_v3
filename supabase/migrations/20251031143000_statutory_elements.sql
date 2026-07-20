/*
  # Statutory Elements Implementation

  1. New Tables
    - `company_statutory_settings`
      - Stores which statutory elements are applicable for the company
      - Includes: PF, ESI, Professional Tax, TDS

    - `statutory_configurations`
      - Stores detailed configuration for each statutory element
      - Includes: element type, calculation method (percentage/value), application type (same to all/vary by employee)
      - Global value for "same to all" configuration

    - `employee_statutory_values`
      - Stores employee-specific statutory values when "vary employeewise" is selected
      - Links to employee and statutory configuration

  2. Security
    - Enable RLS on all new tables
    - Add policies for tenant-specific access
    - Users can only access data for their tenant
*/

-- Create company statutory settings table
CREATE TABLE IF NOT EXISTS public.company_statutory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  provident_fund boolean DEFAULT false,
  employee_state_insurance boolean DEFAULT false,
  professional_tax boolean DEFAULT false,
  tax_deducted_at_source boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id)
);

-- Create statutory configurations table
CREATE TABLE IF NOT EXISTS public.statutory_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  statutory_element text NOT NULL CHECK (statutory_element IN ('provident_fund', 'employee_state_insurance', 'professional_tax', 'tax_deducted_at_source')),
  calculation_method text NOT NULL CHECK (calculation_method IN ('percentage', 'value')),
  application_type text NOT NULL CHECK (application_type IN ('same_to_all', 'vary_employeewise')),
  global_value numeric(10, 2),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, statutory_element)
);

-- Create employee statutory values table
CREATE TABLE IF NOT EXISTS public.employee_statutory_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  configuration_id uuid REFERENCES public.statutory_configurations(id) ON DELETE CASCADE NOT NULL,
  value numeric(10, 2) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, configuration_id)
);

-- Enable Row Level Security
ALTER TABLE public.company_statutory_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statutory_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_statutory_values ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for company_statutory_settings
CREATE POLICY "Users can view their tenant's statutory settings"
  ON public.company_statutory_settings
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their tenant's statutory settings"
  ON public.company_statutory_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant's statutory settings"
  ON public.company_statutory_settings
  FOR UPDATE
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

-- Create RLS policies for statutory_configurations
CREATE POLICY "Users can view their tenant's statutory configurations"
  ON public.statutory_configurations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their tenant's statutory configurations"
  ON public.statutory_configurations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant's statutory configurations"
  ON public.statutory_configurations
  FOR UPDATE
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

CREATE POLICY "Users can delete their tenant's statutory configurations"
  ON public.statutory_configurations
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Create RLS policies for employee_statutory_values
CREATE POLICY "Users can view their tenant's employee statutory values"
  ON public.employee_statutory_values
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert their tenant's employee statutory values"
  ON public.employee_statutory_values
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their tenant's employee statutory values"
  ON public.employee_statutory_values
  FOR UPDATE
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

CREATE POLICY "Users can delete their tenant's employee statutory values"
  ON public.employee_statutory_values
  FOR DELETE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_company_statutory_settings_tenant_id
  ON public.company_statutory_settings(tenant_id);

CREATE INDEX IF NOT EXISTS idx_statutory_configurations_tenant_id
  ON public.statutory_configurations(tenant_id);

CREATE INDEX IF NOT EXISTS idx_statutory_configurations_element
  ON public.statutory_configurations(statutory_element);

CREATE INDEX IF NOT EXISTS idx_employee_statutory_values_tenant_id
  ON public.employee_statutory_values(tenant_id);

CREATE INDEX IF NOT EXISTS idx_employee_statutory_values_employee_id
  ON public.employee_statutory_values(employee_id);

CREATE INDEX IF NOT EXISTS idx_employee_statutory_values_configuration_id
  ON public.employee_statutory_values(configuration_id);

-- Create updated_at trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_company_statutory_settings_updated_at
  BEFORE UPDATE ON public.company_statutory_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_statutory_configurations_updated_at
  BEFORE UPDATE ON public.statutory_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_employee_statutory_values_updated_at
  BEFORE UPDATE ON public.employee_statutory_values
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
