-- Add ot_structure_id to overtime_policies

ALTER TABLE public.overtime_policies
ADD COLUMN IF NOT EXISTS ot_structure_id uuid;

ALTER TABLE public.overtime_policies
ADD CONSTRAINT overtime_policies_ot_structure_id_fkey 
FOREIGN KEY (ot_structure_id) 
REFERENCES public.ot_structures(id) 
ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_overtime_policies_ot_structure_id 
ON public.overtime_policies(ot_structure_id);
