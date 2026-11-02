-- Ambientes de teste IACRA-DEV: cadastro e reserva de salas por aula.
-- Não executar no projeto de produção.
create table if not exists app_private.eavra_dev_rooms (
  slug text primary key,
  name text not null unique,
  activities text[] not null default '{}'::text[],
  note text not null default '',
  raphael_only boolean not null default false,
  active boolean not null default true
);
create table if not exists app_private.eavra_dev_class_rooms (
  class_id text primary key references public.classes(id) on delete cascade,
  room_slug text not null references app_private.eavra_dev_rooms(slug),
  activity text not null,
  assigned_by text not null,
  assigned_at timestamptz not null default now()
);
create index if not exists eavra_dev_class_rooms_room_idx
  on app_private.eavra_dev_class_rooms(room_slug);
alter table app_private.eavra_dev_rooms enable row level security;
alter table app_private.eavra_dev_class_rooms enable row level security;
revoke all on table app_private.eavra_dev_rooms from public, anon, authenticated;
revoke all on table app_private.eavra_dev_class_rooms from public, anon, authenticated;

insert into app_private.eavra_dev_rooms(slug,name,activities,note,raphael_only)
values
 ('peniel','Sala Peniel',array['Teclado','Piano','Preparação vocal'],'',false),
 ('hosana','Sala Hosana',array['Preparação vocal','Teclado','Musicalização infantil'],'',false),
 ('boaz','Sala Boaz',array['Instrumentos de cordas'],'',false),
 ('joaquim','Sala Joaquim',array['Instrumentos de cordas'],'',false),
 ('sela','Sala Selá',array['Violino'],'',false),
 ('jerico','Sala Jericó',array['Bateria'],'',false),
 ('kairos','Sala Kairos',array[]::text[],'Sala Raphael; atividade definida pelo professor.',true)
on conflict (slug) do update
set name=excluded.name, activities=excluded.activities,
    note=excluded.note, raphael_only=excluded.raphael_only;

create or replace function public.eavra_dev_room_overview(p_day date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $f$
declare v_result jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.profiles p
    where p.id=auth.uid()::text and p.role='super_admin' and p.access_status='active'
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  if p_day is null then raise exception 'invalid_day' using errcode='22023'; end if;
  select pg_catalog.jsonb_build_object(
    'rooms', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'slug',r.slug,'name',r.name,'activities',r.activities,
        'note',r.note,'raphael_only',r.raphael_only
      ) order by r.name) from app_private.eavra_dev_rooms r where r.active
    ),'[]'::jsonb),
    'assignments',coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'class_id',a.class_id,'room_slug',a.room_slug,'activity',a.activity,
        'title',c.title,'teacher_name',t.name,
        'start_time',c.start_time,'end_time',c.end_time,'status',c.status
      ) order by c.start_time,r.name)
      from app_private.eavra_dev_class_rooms a
      join app_private.eavra_dev_rooms r on r.slug=a.room_slug
      join public.classes c on c.id=a.class_id
      left join public.teachers t on t.id=c.teacher_id
      where c.date=p_day
    ),'[]'::jsonb)
  ) into v_result;
  return v_result;
end $f$;

create or replace function public.eavra_dev_room_assign(
  p_class_id text, p_room_slug text, p_activity text
)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $f$
declare
  v_actor text:=auth.uid()::text;
  v_class record;
  v_room record;
  v_teacher_name text;
  v_activity text:=pg_catalog.btrim(coalesce(p_activity,''));
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id=v_actor and p.role='super_admin' and p.access_status='active'
  ) then raise exception 'access_denied' using errcode='42501'; end if;

  select c.id,c.date,c.start_time,c.end_time,c.status,c.teacher_id
  into v_class from public.classes c where c.id=p_class_id;
  if not found then raise exception 'aula_nao_sincronizada' using errcode='22023'; end if;
  if v_class.status='cancelled' or v_class.start_time is null or v_class.end_time is null or
     v_class.end_time<=v_class.start_time then
    raise exception 'horario_da_aula_invalido' using errcode='22023';
  end if;

  -- O lock da sala impede concorrência entre duas reservas simultâneas.
  select r.slug,r.name,r.activities,r.raphael_only into v_room
  from app_private.eavra_dev_rooms r
  where r.slug=p_room_slug and r.active for update;
  if not found then raise exception 'sala_nao_encontrada' using errcode='22023'; end if;
  if pg_catalog.length(v_activity)<2 or pg_catalog.length(v_activity)>100 then
    raise exception 'atividade_invalida' using errcode='22023';
  end if;
  if coalesce(pg_catalog.array_length(v_room.activities,1),0)>0
    and not exists(
      select 1 from unnest(v_room.activities) a
      where pg_catalog.lower(a)=pg_catalog.lower(v_activity)
    ) then raise exception 'atividade_nao_permitida_para_sala' using errcode='22023';
  end if;
  if v_room.raphael_only then
    select t.name into v_teacher_name from public.teachers t where t.id=v_class.teacher_id;
    if pg_catalog.lower(coalesce(v_teacher_name,'')) not like '%raphael%' then
      raise exception 'sala_kairos_reservada_ao_raphael' using errcode='22023';
    end if;
  end if;

  if exists(
    select 1 from app_private.eavra_dev_class_rooms a
    join public.classes c on c.id=a.class_id
    where a.room_slug=v_room.slug and a.class_id<>v_class.id
      and c.date=v_class.date and c.status<>'cancelled'
      and c.start_time<v_class.end_time and c.end_time>v_class.start_time
  ) then raise exception 'sala_ocupada_nesse_horario' using errcode='23505'; end if;

  insert into app_private.eavra_dev_class_rooms(class_id,room_slug,activity,assigned_by,assigned_at)
  values(v_class.id,v_room.slug,v_activity,v_actor,now())
  on conflict(class_id) do update set
    room_slug=excluded.room_slug,activity=excluded.activity,
    assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at;
  return pg_catalog.jsonb_build_object('saved',true,'room_name',v_room.name);
end $f$;

create or replace function public.eavra_dev_room_unassign(p_class_id text)
returns jsonb
language plpgsql volatile security definer set search_path = ''
as $f$
declare v_actor text:=auth.uid()::text;
begin
  if v_actor is null or not exists (
    select 1 from public.profiles p
    where p.id=v_actor and p.role='super_admin' and p.access_status='active'
  ) then raise exception 'access_denied' using errcode='42501'; end if;
  delete from app_private.eavra_dev_class_rooms where class_id=p_class_id;
  return pg_catalog.jsonb_build_object('released',true);
end $f$;

revoke all on function public.eavra_dev_room_overview(date) from public,anon,authenticated;
revoke all on function public.eavra_dev_room_assign(text,text,text) from public,anon,authenticated;
revoke all on function public.eavra_dev_room_unassign(text) from public,anon,authenticated;
grant execute on function public.eavra_dev_room_overview(date) to authenticated;
grant execute on function public.eavra_dev_room_assign(text,text,text) to authenticated;
grant execute on function public.eavra_dev_room_unassign(text) to authenticated;