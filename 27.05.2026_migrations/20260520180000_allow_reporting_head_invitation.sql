-- Drop the existing role check constraint on user_invitations
ALTER TABLE public.user_invitations 
DROP CONSTRAINT IF EXISTS user_invitations_role_check;

-- Add the new updated check constraint to allow 'Reporting Head'
ALTER TABLE public.user_invitations 
ADD CONSTRAINT user_invitations_role_check 
CHECK (role = ANY (ARRAY['Employee'::text, 'HR Team'::text, 'Reporting Head'::text]));
