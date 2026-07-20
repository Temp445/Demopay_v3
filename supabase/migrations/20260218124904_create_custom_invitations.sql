/*
  # Create Custom Invitation System

  1. New Tables
    - `user_invitations`
      - `id` (uuid, primary key)
      - `email` (text, unique per tenant)
      - `name` (text)
      - `role` (text - 'Employee' or 'HR Team')
      - `token` (text, unique)
      - `tenant_id` (uuid)
      - `invited_by` (uuid)
      - `status` (text - 'pending', 'accepted', 'expired')
      - `expires_at` (timestamp)
      - `accepted_at` (timestamp, nullable)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on `user_invitations` table
    - Add policies for authenticated users to manage invitations
*/

-- Create user_invitations table
CREATE TABLE IF NOT EXISTS user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('Employee', 'HR Team')),
  token text UNIQUE NOT NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(email, tenant_id, status)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_invitations_token ON user_invitations(token);
CREATE INDEX IF NOT EXISTS idx_user_invitations_email ON user_invitations(email);
CREATE INDEX IF NOT EXISTS idx_user_invitations_tenant ON user_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_invitations_status ON user_invitations(status);

-- Enable RLS
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view invitations for their tenant
CREATE POLICY "Users can view invitations for their tenant"
  ON user_invitations
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Authenticated users can insert invitations for their tenant
CREATE POLICY "Users can create invitations for their tenant"
  ON user_invitations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Users can update invitations for their tenant
CREATE POLICY "Users can update invitations for their tenant"
  ON user_invitations
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Policy: Allow public access to accept invitations (via token)
CREATE POLICY "Anyone can update invitation status with valid token"
  ON user_invitations
  FOR UPDATE
  TO anon
  USING (status = 'pending' AND expires_at > now());

-- Function to generate secure random token
CREATE OR REPLACE FUNCTION generate_invite_token()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  token text;
  token_exists boolean;
BEGIN
  LOOP
    -- Generate a random token (32 characters)
    token := encode(gen_random_bytes(24), 'base64');
    token := replace(token, '/', '_');
    token := replace(token, '+', '-');
    token := replace(token, '=', '');

    -- Check if token already exists
    SELECT EXISTS(SELECT 1 FROM user_invitations WHERE user_invitations.token = token) INTO token_exists;

    -- Exit loop if token is unique
    EXIT WHEN NOT token_exists;
  END LOOP;

  RETURN token;
END;
$$;

-- Function to cleanup expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at < now();
END;
$$;

-- Function to get invitation details by token
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token text)
 RETURNS TABLE(id uuid, email text, name text, role text, tenant_id uuid, organization_name text, status text, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
-- First cleanup expired invitations
PERFORM cleanup_expired_invitations();

-- Return invitation details
RETURN QUERY
SELECT
ui.id,
ui.email,
ui.name,
ui.role,
ui.tenant_id,
t.company_name as organization_name,
ui.status,
ui.expires_at
FROM user_invitations ui
LEFT OUTER JOIN company_settings t
  ON ui.tenant_id=t.tenant_id
WHERE ui.token = invite_token
AND ui.status = 'pending'
AND ui.expires_at > now();
END;
$function$;
$$;

-- Function to accept invitation and create user profile
CREATE OR REPLACE FUNCTION accept_invitation(invite_token text, user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  invitation_record record;
  result json;
BEGIN
  -- Get invitation details
  SELECT * INTO invitation_record
  FROM user_invitations
  WHERE token = invite_token
    AND status = 'pending'
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Invalid or expired invitation'
    );
  END IF;

  -- Check if user already has a profile
  IF EXISTS (SELECT 1 FROM profiles WHERE id = user_id) THEN
    RETURN json_build_object(
      'success', false,
      'error', 'User profile already exists'
    );
  END IF;

  -- Create user profile
  INSERT INTO profiles (id, email, user_role, tenant_id, created_at)
  VALUES (
    user_id,
    invitation_record.email,
    invitation_record.role,
    invitation_record.tenant_id,
    now()
  );

  -- Mark invitation as accepted
  UPDATE user_invitations
  SET
    status = 'accepted',
    accepted_at = now()
  WHERE id = invitation_record.id;

  -- Return success
  RETURN json_build_object(
    'success', true,
    'role', invitation_record.role,
    'tenant_id', invitation_record.tenant_id
  );
END;
$$;