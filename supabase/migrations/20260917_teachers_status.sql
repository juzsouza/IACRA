-- Migration: Inativação e Reativação Lógica de Professores (teachers.status)
-- Adiciona a coluna status com valor padrão 'active' e restrição de integridade

ALTER TABLE public.teachers
ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_teachers_status
ON public.teachers(status);
