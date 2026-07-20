-- Enable RLS
ALTER TABLE public.salary_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_structure_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_salary_structures ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view salary structures"
  ON public.salary_structures
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage salary structures"
  ON public.salary_structures
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can view salary structure components"
  ON public.salary_structure_components
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage salary structure components"
  ON public.salary_structure_components
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can view employee salary structures"
  ON public.employee_salary_structures
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage employee salary structures"
  ON public.employee_salary_structures
  FOR ALL
  TO authenticated
  USING (true);

-- Add updated_at triggers
CREATE TRIGGER salary_structures_updated_at
  BEFORE UPDATE ON public.salary_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER salary_structure_components_updated_at
  BEFORE UPDATE ON public.salary_structure_components
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER employee_salary_structures_updated_at
  BEFORE UPDATE ON public.employee_salary_structures
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();