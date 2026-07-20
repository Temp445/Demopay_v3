/*
  # Refactor Employees Table - Department and Role Foreign Keys (v4)

  1. Changes
    - Add department_id (uuid, FK to departments table)
    - Add role_id (uuid, FK to roles table)
    - Migrate existing department/role text data to FK relationships
    - Create missing departments/roles if needed
    - Drop dependent views, remove old columns, recreate views
    - Remove old department and role text columns

  2. Migration Steps
    - Add FK columns as nullable initially
    - Create missing departments/roles from employee records
    - Migrate existing data by matching department/role names to IDs
    - Drop dependent views
    - Make FK columns NOT NULL
    - Drop old text columns
    - Recreate views with new schema

  3. Security
    - All existing RLS policies remain unchanged

  4. Note
    - father_name, uan_number, contact_number, created_by already exist from previous migration
*/

-- Step 1: Add department_id and role_id columns (nullable initially)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'department_id') THEN
    ALTER TABLE public.employees ADD COLUMN department_id uuid REFERENCES public.departments(id) ON DELETE RESTRICT;
    CREATE INDEX IF NOT EXISTS idx_employees_department_id ON public.employees(department_id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'employees' AND column_name = 'role_id') THEN
    ALTER TABLE public.employees ADD COLUMN role_id uuid REFERENCES public.roles(id) ON DELETE RESTRICT;
    CREATE INDEX IF NOT EXISTS idx_employees_role_id ON public.employees(role_id);
  END IF;
END $$;

-- Step 2: Create missing departments (insert departments that exist in employees but not in departments table)
INSERT INTO public.departments (name, tenant_id)
SELECT DISTINCT e.department, e.tenant_id
FROM public.employees e
WHERE e.department IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.departments d
    WHERE d.name = e.department AND d.tenant_id = e.tenant_id
  )
ON CONFLICT DO NOTHING;

-- Step 3: Create missing roles (insert roles that exist in employees but not in roles table)
INSERT INTO public.roles (name, tenant_id)
SELECT DISTINCT e.role, e.tenant_id
FROM public.employees e
WHERE e.role IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.roles r
    WHERE r.name = e.role AND r.tenant_id = e.tenant_id
  )
ON CONFLICT DO NOTHING;

-- Step 4: Migrate existing data - Match department names to department IDs
UPDATE public.employees e
SET department_id = d.id
FROM public.departments d
WHERE e.department = d.name
  AND e.tenant_id = d.tenant_id
  AND e.department_id IS NULL
  AND e.department IS NOT NULL;

-- Step 5: Migrate existing data - Match role names to role IDs
UPDATE public.employees e
SET role_id = r.id
FROM public.roles r
WHERE e.role = r.name
  AND e.tenant_id = r.tenant_id
  AND e.role_id IS NULL
  AND e.role IS NOT NULL;

-- Step 6: Drop dependent views before dropping columns
DROP VIEW IF EXISTS public.user_profiles CASCADE;
DROP VIEW IF EXISTS public.employee_profiles CASCADE;
DROP VIEW IF EXISTS public.employee_details CASCADE;

-- Step 7: Make department_id and role_id NOT NULL (only if all employees have been migrated)
DO $$
BEGIN
  -- Only set NOT NULL if there are no NULL values
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE department_id IS NULL) THEN
    ALTER TABLE public.employees ALTER COLUMN department_id SET NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM public.employees WHERE role_id IS NULL) THEN
    ALTER TABLE public.employees ALTER COLUMN role_id SET NOT NULL;
  END IF;
END $$;

-- Step 8: Drop old department and role text columns
ALTER TABLE public.employees DROP COLUMN IF EXISTS department;
ALTER TABLE public.employees DROP COLUMN IF EXISTS role;

-- Step 9: Recreate employee_details view with new schema
CREATE OR REPLACE VIEW public.employee_details AS
SELECT 
  e.id,
  e.name,
  e.email,
  d.name as department,
  r.name as role,
  e.department_id,
  e.role_id,
  e.status,
  e.start_date,
  e.employee_code,
  e.address,
  e.date_of_birth,
  e.father_name,
  e.uan_number,
  e.contact_number,
  e.created_by,
  e.tenant_id,
  e.created_at,
  e.updated_at
FROM public.employees e
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.roles r ON r.id = e.role_id;

-- Step 10: Recreate employee_profiles view with new schema
CREATE OR REPLACE VIEW public.employee_profiles AS
SELECT 
  e.id,
  e.email,
  p.id AS profile_id,
  COALESCE(e.name, split_part(e.email, '@', 1)) AS name,
  d.name as department,
  r.name as role,
  e.department_id,
  e.role_id,
  e.tenant_id
FROM public.employees e
LEFT JOIN public.profiles p ON p.email = e.email
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.roles r ON r.id = e.role_id;

-- Step 11: Recreate user_profiles view with new schema
CREATE OR REPLACE VIEW public.user_profiles AS
SELECT 
  u.id,
  u.email,
  p.id AS profile_id,
  COALESCE(e.name, split_part(u.email::text, '@', 1)) AS name,
  d.name as department,
  r.name as role,
  e.department_id,
  e.role_id,
  p.tenant_id
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
LEFT JOIN public.employees e ON e.email = u.email::text
LEFT JOIN public.departments d ON d.id = e.department_id
LEFT JOIN public.roles r ON r.id = e.role_id;