-- Migration: Add active column to choir_collaborators
-- Ensures existing rows default to active = true and never deletes historical collaborator rows

ALTER TABLE IF EXISTS public.choir_collaborators 
ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Update any existing records where active might be null to true
UPDATE public.choir_collaborators 
SET active = true 
WHERE active IS NULL;
