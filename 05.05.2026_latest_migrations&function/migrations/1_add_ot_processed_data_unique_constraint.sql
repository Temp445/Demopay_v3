-- Step 1: Clean up existing duplicates before applying the unique constraint
-- This keeps only the most recent entry for each (process, employee) pair
DELETE FROM public.ot_processed_data
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY ot_processing_id, employee_id
                   ORDER BY created_at DESC, id DESC
               ) as row_num
        FROM public.ot_processed_data
    ) t
    WHERE t.row_num > 1
);

-- Step 2: Add unique constraint to support upsert logic
-- This prevents the "no unique or exclusion constraint matching the ON CONFLICT specification" error
ALTER TABLE public.ot_processed_data 
ADD CONSTRAINT unique_ot_process_employee UNIQUE (ot_processing_id, employee_id);


-- Add an individual status column to ot_processed_data so employees can be approved/revoked independently
ALTER TABLE public.ot_processed_data 
ADD COLUMN IF NOT EXISTS processing_status character varying DEFAULT 'completed';

-- Migrate existing statuses from the parent batch object
UPDATE public.ot_processed_data pd
SET processing_status = p.processing_status
FROM public.ot_processing p
WHERE pd.ot_processing_id = p.id;
