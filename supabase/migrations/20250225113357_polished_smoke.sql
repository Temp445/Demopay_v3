-- Create salary structure tables
CREATE TABLE IF NOT EXISTS public.salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_active boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create salary structure components table
CREATE TABLE IF NOT EXISTS public.salary_structure_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  structure_id uuid REFERENCES public.salary_structures(id) ON DELETE CASCADE,
  name text NOT NULL,
  component_type text NOT NULL CHECK (component_type IN ('earning', 'deduction')),
  calculation_method text NOT NULL CHECK (calculation_method IN ('fixed', 'percentage')),
  amount numeric(10,2),
  percentage numeric(5,2),
  reference_components text[] DEFAULT array[]::text[],
  is_taxable boolean DEFAULT true,
  description text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(structure_id, name)
);

-- Create employee salary structure assignments table
CREATE TABLE IF NOT EXISTS public.employee_salary_structures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE,
  structure_id uuid REFERENCES public.salary_structures(id) ON DELETE CASCADE,
  effective_from date NOT NULL,
  effective_to date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(employee_id, structure_id, effective_from)
);