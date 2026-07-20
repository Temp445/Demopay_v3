-- Create payroll calculation methods table
CREATE TABLE IF NOT EXISTS public.payroll_calculation_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  salary_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  deduction_components jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payroll_calculation_methods ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view calculation methods"
  ON public.payroll_calculation_methods
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage calculation methods"
  ON public.payroll_calculation_methods
  FOR ALL
  TO authenticated
  USING (true);

-- Add updated_at trigger
CREATE TRIGGER payroll_calculation_methods_updated_at
  BEFORE UPDATE ON public.payroll_calculation_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();