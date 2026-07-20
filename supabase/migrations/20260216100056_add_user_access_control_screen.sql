/*
  # Add User Access Control Screen to Application Screens

  1. Purpose
    - Add the User Access Control screen to all existing tenants
    - Ensure consistency across all tenant databases

  2. Changes
    - Insert User Access Control screen record for all tenants
    - Set appropriate display order
*/

DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    INSERT INTO application_screens (tenant_id, screen_name, screen_route, screen_group, display_order)
    VALUES (tenant_record.id, 'User Access Control', '/dashboard/access-control', 'Settings', 33)
    ON CONFLICT (tenant_id, screen_route) DO NOTHING;
  END LOOP;
END $$;