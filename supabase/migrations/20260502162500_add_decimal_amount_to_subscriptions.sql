-- Migration: Convert amount_paid_paise to decimal amount_paid (Idempotent version)
-- Handles cases where both columns might already exist from previous failed runs.

DO $$ 
BEGIN
    -- 1. If BOTH columns exist, migrate data from the old one to the new one
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='amount_paid_paise') 
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='amount_paid') THEN
        
        UPDATE public.subscriptions 
        SET amount_paid = CAST(amount_paid_paise AS numeric) / 100.0
        WHERE amount_paid_paise IS NOT NULL;
        
        ALTER TABLE public.subscriptions DROP COLUMN amount_paid_paise;

    -- 2. If ONLY the old column exists, rename and convert it
    ELSIF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='subscriptions' AND column_name='amount_paid_paise') THEN
        
        ALTER TABLE public.subscriptions RENAME COLUMN amount_paid_paise TO amount_paid;
        ALTER TABLE public.subscriptions ALTER COLUMN amount_paid TYPE numeric(15, 2);
        
        UPDATE public.subscriptions 
        SET amount_paid = amount_paid / 100.0
        WHERE amount_paid > 10000; -- Heuristic to avoid double division

    -- 3. If ONLY the new column exists, just ensure it's decimal and values are converted
    ELSE
        ALTER TABLE public.subscriptions ALTER COLUMN amount_paid TYPE numeric(15, 2);
        
        UPDATE public.subscriptions 
        SET amount_paid = amount_paid / 100.0
        WHERE amount_paid > 10000;
    END IF;

END $$;
