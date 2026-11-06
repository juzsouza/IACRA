-- DADOS FICTÍCIOS. Banco PostgreSQL temporário; nunca produção.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE SCHEMA auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;

CREATE TABLE public.profiles (
 id text PRIMARY KEY,
 role text NOT NULL,
 access_status text NOT NULL
);
CREATE TABLE public.teachers (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 name text NOT NULL,
 status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.financial_plans (
 id text PRIMARY KEY,
 name text NOT NULL,
 is_active boolean DEFAULT true,
 exclusive_teacher_id text
);
CREATE TABLE public.groups (
 id text PRIMARY KEY,
 name text NOT NULL,
 teacher_id text,
 status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.students (
 id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
 name text NOT NULL,
 email text,
 phone text,
 cpf text,
 instrument text,
 status text,
 enrollment_date date,
 birth_date date
);
CREATE TABLE public.enrollments (
 id text PRIMARY KEY,
 student_id text,
 plan_id text,
 teacher_id text,
 group_id text,
 custom_price numeric,
 status text,
 start_date date NOT NULL,
 enrollment_date date,
 due_day integer NOT NULL,
 due_date_day integer
);
CREATE TABLE public.classes (
 id text PRIMARY KEY,
 title text NOT NULL,
 teacher_id text,
 date date NOT NULL,
 start_time time NOT NULL,
 end_time time NOT NULL,
 status text
);
CREATE TABLE public.transactions (
 id text PRIMARY KEY,
 amount numeric NOT NULL
);

INSERT INTO public.profiles(id,role,access_status)
VALUES ('11111111-1111-4111-8111-111111111111','super_admin','active'),
       ('99999999-9999-4999-8999-999999999999','teacher','active');
INSERT INTO public.teachers(id,name,status)
VALUES ('22222222-2222-4222-8222-222222222222','Professor Exemplo','active');
INSERT INTO public.financial_plans(id,name,is_active,exclusive_teacher_id)
VALUES ('plano-individual','Aula Individual',true,NULL);
INSERT INTO public.groups(id,name,teacher_id,status)
VALUES ('grupo-exemplo','Grupo Exemplo','22222222-2222-4222-8222-222222222222','active');
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
VALUES
('aula-1','Aula 1','22222222-2222-4222-8222-222222222222',CURRENT_DATE,'10:00','10:50','scheduled'),
('aula-2','Aula 2','22222222-2222-4222-8222-222222222222',CURRENT_DATE,'10:30','11:20','scheduled');
INSERT INTO public.transactions(id,amount) VALUES ('pagamento-antigo',350);
