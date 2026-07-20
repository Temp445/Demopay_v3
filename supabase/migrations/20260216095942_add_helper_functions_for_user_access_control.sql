/*
  # Add Helper Functions for User Access Control

  1. New Functions
    - `get_users_for_access_control` - Returns users with their permissions for the access control UI
    - Handles the complex join between employees, roles, auth.users, and permissions

  2. Purpose
    - Simplify fetching user data for the access control interface
    - Avoid complex client-side joins
    - Handle auth.users access properly through RPC
*/

-- Function to get users for access control management
CREATE OR REPLACE FUNCTION get_users_for_access_control(
  p_tenant_id uuid
)
RETURNS TABLE (
  user_id uuid,
  user_email text,
  employee_id uuid,
  employee_name text,
  role_id uuid,
  role_name text,
  is_admin boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    au.id as user_id,
    au.email as user_email,
    e.id as employee_id,
    e.name as employee_name,
    r.id as role_id,
    r.name as role_name,
    CASE 
      WHEN LOWER(r.name) LIKE '%admin%' THEN true
      ELSE false
    END as is_admin
  FROM employees e
  INNER JOIN roles r ON e.role_id = r.id
  INNER JOIN auth.users au ON au.email = e.email
  WHERE e.tenant_id = p_tenant_id
  AND e.status = 'active'
  AND LOWER(r.name) NOT LIKE '%admin%'  -- Exclude admin users
  ORDER BY e.name;
END;
$$;