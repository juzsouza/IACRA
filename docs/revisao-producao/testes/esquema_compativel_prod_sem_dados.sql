-- Esquema fictício de homologação, baseado SOMENTE nos nomes/tipos/NOT NULL/
-- CHECK e FKs essenciais consultados no Supabase PROD em 09/11/2026.
-- NÃO há dados reais, senhas, credenciais, CPF verdadeiro ou acesso de rede à produção.
-- Execução exclusiva em PostgreSQL efêmero do GitHub Actions.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

CREATE TABLE public.profiles (
 id text PRIMARY KEY,
 email text NOT NULL,
 role text NOT NULL CHECK (role IN ('super_admin','admin','teacher')),
 teacher_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 temp_password text,
 access_status text NOT NULL DEFAULT 'active' CHECK (access_status IN ('active','blocked'))
);
CREATE TABLE public.teachers (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 name text NOT NULL,
 email text, phone text, specialties text[],
 created_at timestamptz NOT NULL DEFAULT now(),
 cpf text, birth_date date, schedule jsonb,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE public.financial_plans (
 id text PRIMARY KEY,
 name text NOT NULL,
 category text NOT NULL CHECK (category IN ('individual','group','coral','mentoria','mev')),
 modality text NOT NULL CHECK (modality IN ('semanal','quinzenal','avulso','mensal')),
 base_price numeric NOT NULL, duration_minutes integer NOT NULL,
 max_students integer NOT NULL, is_active boolean DEFAULT true,
 exclusive_teacher_id text, allow_early_discount boolean,
 early_discount_value numeric, early_discount_deadline_day integer,
 secretary_fee_type text NOT NULL CHECK (secretary_fee_type IN ('fixed','per_student')),
 secretary_fee_value numeric NOT NULL,
 school_fee_type text NOT NULL CHECK (school_fee_type IN ('fixed','per_student')),
 school_fee_value numeric NOT NULL,
 teacher_fee_type text NOT NULL CHECK (teacher_fee_type IN ('fixed','per_student','percentage')),
 teacher_fee_value numeric NOT NULL,
 margin_value numeric NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.groups (
 id text PRIMARY KEY, name text NOT NULL, teacher_id text,
 schedule text, max_students integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive'))
);
CREATE TABLE public.students (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 name text NOT NULL, email text, phone text, instrument text,
 status text CHECK (status IN ('active','inactive')),
 enrollment_date date,
 created_at timestamptz NOT NULL DEFAULT now(),
 cpf text, birth_date date
);
CREATE TABLE public.enrollments (
 id text PRIMARY KEY,
 student_id text,
 plan_id text REFERENCES public.financial_plans(id),
 start_date date NOT NULL,
 status text CHECK (status IN ('active','inactive','cancelled')),
 due_day integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 teacher_id text, group_id text, custom_price numeric,
 enrollment_date date, due_date_day integer, affiliate_id text
);
CREATE TABLE public.classes (
 id text PRIMARY KEY, title text NOT NULL, teacher_id text,
 date date NOT NULL, start_time time NOT NULL,end_time time NOT NULL,
 status text CHECK (status IN ('scheduled','completed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 allow_makeup boolean,makeup_scheduled boolean,report text,group_id text
);
CREATE TABLE public.transactions (
 id text PRIMARY KEY, type text CHECK (type IN ('income','expense')),
 amount numeric NOT NULL, description text NOT NULL,
 date date NOT NULL,
 status text CHECK (status IN ('pending','completed')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.competence_billings (
 id text PRIMARY KEY,
 competence varchar NOT NULL CHECK (competence ~ '^[0-9]{4}-[0-9]{2}$'),
 category text NOT NULL CHECK (category IN ('individual','group','choir')),
 enrollment_id text REFERENCES public.enrollments(id) ON DELETE RESTRICT,
 choir_registration_id text,
 group_id text REFERENCES public.groups(id) ON DELETE RESTRICT,
 student_id uuid REFERENCES public.students(id) ON DELETE RESTRICT,
 teacher_id uuid REFERENCES public.teachers(id) ON DELETE RESTRICT,
 is_paying boolean NOT NULL,
 base_price numeric NOT NULL, discount numeric NOT NULL, final_price numeric NOT NULL,
 teacher_fee_type text,teacher_fee_value numeric,
 teacher_share numeric NOT NULL,school_share numeric NOT NULL,
 status text NOT NULL CHECK (status IN ('pending','paid','waived','closed')),
 transaction_id text REFERENCES public.transactions(id) ON DELETE SET NULL,
 is_frozen boolean NOT NULL DEFAULT false, frozen_at timestamptz,
 frozen_by text REFERENCES public.profiles(id) ON DELETE SET NULL,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT billing_origin CHECK (
 (category='individual' AND enrollment_id IS NOT NULL AND group_id IS NULL AND choir_registration_id IS NULL)
 OR (category='group' AND group_id IS NOT NULL AND enrollment_id IS NULL AND choir_registration_id IS NULL)
 OR (category='choir' AND choir_registration_id IS NOT NULL AND enrollment_id IS NULL AND group_id IS NULL))
);

INSERT INTO public.profiles(id,email,role,access_status)
VALUES ('11111111-1111-4111-8111-111111111111','superadmin@example.test','super_admin','active'),
       ('99999999-9999-4999-8999-999999999999','professor@example.test','teacher','active');
INSERT INTO public.teachers(id,name,status)
VALUES ('22222222-2222-4222-8222-222222222222','Professor Fictício','active');
INSERT INTO public.financial_plans(
 id,name,category,modality,base_price,duration_minutes,max_students,is_active,
 secretary_fee_type,secretary_fee_value,school_fee_type,school_fee_value,
 teacher_fee_type,teacher_fee_value,margin_value)
VALUES ('plano-individual','Plano de Teste','individual','semanal',350,50,1,true,
'fixed',20,'fixed',120,'fixed',180,30);
INSERT INTO public.groups(id,name,teacher_id,status)
VALUES ('grupo-exemplo','Grupo Fictício','22222222-2222-4222-8222-222222222222','active');
INSERT INTO public.students
(id,name,email,phone,cpf,instrument,status,enrollment_date,birth_date)
VALUES ('33333333-3333-4333-8333-333333333333','Aluno Existente','antigo@example.test',
'11987654321','12345678901','Piano','active',CURRENT_DATE,'2010-05-05');
INSERT INTO public.enrollments
(id,student_id,plan_id,teacher_id,group_id,custom_price,status,start_date,enrollment_date,due_day,due_date_day)
VALUES ('matricula-antiga','33333333-3333-4333-8333-333333333333',
'plano-individual','22222222-2222-4222-8222-222222222222',NULL,350,'active',
CURRENT_DATE,CURRENT_DATE,10,10);
INSERT INTO public.classes(id,title,teacher_id,date,start_time,end_time,status)
VALUES ('aula-1','Aula Fictícia 1','22222222-2222-4222-8222-222222222222',CURRENT_DATE,'10:00','10:50','scheduled'),
       ('aula-2','Aula Fictícia 2','22222222-2222-4222-8222-222222222222',CURRENT_DATE,'10:30','11:20','scheduled');
INSERT INTO public.transactions(id,type,amount,description,date,status)
VALUES ('pagamento-antigo','income',350,'Pagamento fictício',CURRENT_DATE,'completed');
INSERT INTO public.competence_billings(
id,competence,category,enrollment_id,student_id,teacher_id,is_paying,
base_price,discount,final_price,teacher_share,school_share,
status,transaction_id,is_frozen)
VALUES (
'cobranca-antiga',to_char(CURRENT_DATE,'YYYY-MM'),'individual',
'matricula-antiga','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222',true,
350,0,350,180,170,
'paid','pagamento-antigo',false);
