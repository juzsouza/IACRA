-- ==============================================================================
-- MIGRATION: Correção definitiva de null em public.teachers.specialties
-- Data: 2026-10-06
-- ==============================================================================

-- 1. Corrigir registros existentes que estejam com specialties NULL
UPDATE public.teachers
SET specialties = '{}'::text[]
WHERE specialties IS NULL;

-- 2. Configurar valor padrão vazio '{}'::text[] para novas inserções
ALTER TABLE public.teachers
ALTER COLUMN specialties SET DEFAULT '{}'::text[];

-- 3. Garantir restrição NOT NULL (verificando antes se não existem mais registros NULL)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.teachers WHERE specialties IS NULL
  ) THEN
    ALTER TABLE public.teachers
    ALTER COLUMN specialties SET NOT NULL;
  END IF;
END $$;
