-- Migration: Add status column to groups table
-- Única fonte de verdade para status do grupo (active / inactive)

ALTER TABLE IF EXISTS public.groups 
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Garantir que todos os grupos existentes iniciem como 'active'
UPDATE public.groups 
SET status = 'active' 
WHERE status IS NULL;
