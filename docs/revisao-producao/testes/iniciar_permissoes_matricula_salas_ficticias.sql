-- Banco PostgreSQL fictício do GitHub Actions, jamais Supabase oficial.
CREATE TABLE auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
('11111111-1111-4111-8111-111111111111'),
('22222222-2222-4222-8222-222222222222'),
('33333333-3333-4333-8333-333333333333'),
('99999999-9999-4999-8999-999999999999');
INSERT INTO public.profiles(id,role,access_status) VALUES
('22222222-2222-4222-8222-222222222222','admin','active'),
('33333333-3333-4333-8333-333333333333','teacher','active');
CREATE SCHEMA IF NOT EXISTS app_private;
CREATE TABLE app_private.eavra_admin_allowlist (
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id),
 added_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_private.eavra_admin_allowlist(auth_user_id)
VALUES ('11111111-1111-4111-8111-111111111111');
ALTER TABLE app_private.eavra_admin_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.eavra_admin_allowlist FROM PUBLIC,anon,authenticated;
