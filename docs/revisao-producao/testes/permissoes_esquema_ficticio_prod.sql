-- Exclusivamente PostgreSQL temporário de CI, sem conexão com Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
 id text PRIMARY KEY, email text NOT NULL,
 role text NOT NULL CHECK (role IN ('super_admin','admin','teacher')),
 teacher_id text, created_at timestamptz NOT NULL DEFAULT now(),
 temp_password text, access_status text NOT NULL DEFAULT 'active'
 CHECK (access_status IN ('active','blocked'))
);
INSERT INTO auth.users(id) VALUES
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333'),
('44444444-4444-4444-8444-444444444444');
INSERT INTO public.profiles(id,email,role,access_status) VALUES
('11111111-1111-4111-8111-111111111111','super@example.test','super_admin','active'),
('22222222-2222-4222-8222-222222222222','admin@example.test','admin','active'),
('33333333-3333-4333-8333-333333333333','teacher@example.test','teacher','active'),
('44444444-4444-4444-8444-444444444444','blocked@example.test','super_admin','blocked');
