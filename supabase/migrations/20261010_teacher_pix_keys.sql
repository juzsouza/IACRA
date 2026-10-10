-- Migration: 20261010_teacher_pix_keys.sql
-- Armazenamento seguro e isolado de chaves Pix dos professores (separado de public.teachers)
-- REQUISITO DE SEGURANÇA E PRIVACIDADE:
-- A tabela public.teachers possui leitura aberta (SELECT *) para todos os usuários autenticados da plataforma,
-- incluindo professores e alunos. Para evitar exposição indevida de dados financeiros sensíveis (chaves Pix),
-- as chaves são armazenadas em tabela isolada com Row Level Security (RLS) restrito estritamente a administradores.

CREATE TABLE IF NOT EXISTS public.teacher_pix_keys (
  teacher_id uuid PRIMARY KEY REFERENCES public.teachers(id) ON DELETE CASCADE,
  pix_key text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Comentários descritivos na tabela e colunas
COMMENT ON TABLE public.teacher_pix_keys IS 'Armazenamento protegido de chaves Pix dos professores. Acesso restrito a administradores.';
COMMENT ON COLUMN public.teacher_pix_keys.teacher_id IS 'ID do professor vinculado em public.teachers (tipo uuid).';
COMMENT ON COLUMN public.teacher_pix_keys.pix_key IS 'Chave Pix (CPF, CNPJ, telefone, e-mail ou chave aleatória). Preserva formatação textual e zeros à esquerda.';

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.teacher_pix_keys ENABLE ROW LEVEL SECURITY;

-- Revogar quaisquer privilégios públicos ou anônimos (garantia de acesso zero para PUBLIC e anon)
REVOKE ALL ON TABLE public.teacher_pix_keys FROM PUBLIC, anon;

-- Conceder operações aos usuários autenticados, estritamente sujeitas às políticas RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.teacher_pix_keys TO authenticated;

-- Garantir acesso total ao service_role para rotas administrativas do backend
GRANT ALL ON TABLE public.teacher_pix_keys TO service_role;

-- Política administrativa idempotente:
-- Apenas super_admin e admin podem consultar e manipular chaves Pix
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'teacher_pix_keys'
      AND policyname = 'Admins can manage teacher_pix_keys'
  ) THEN
    CREATE POLICY "Admins can manage teacher_pix_keys"
    ON public.teacher_pix_keys
    FOR ALL
    TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (profiles.id::text = auth.uid()::text OR profiles.email ILIKE auth.jwt()->>'email')
          AND profiles.role IN ('super_admin', 'admin')
      )
    )
    WITH CHECK (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE (profiles.id::text = auth.uid()::text OR profiles.email ILIKE auth.jwt()->>'email')
          AND profiles.role IN ('super_admin', 'admin')
      )
    );
  END IF;
END $$;
