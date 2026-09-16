-- ============================================================================
-- myHR — Supabase schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It is idempotent: re-running it upgrades functions/policies in place.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

do $$ begin
  create type public.org_role as enum ('owner', 'admin', 'manager', 'employee');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 80),
  slug        text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  industry    text,
  size        text,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  full_name    text,
  preferences  jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

-- One row per person in an organization. A row with user_id set is a member
-- who can sign in; user_id null + status 'invited' is a pending invite.
create table if not exists public.employees (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid references auth.users(id) on delete set null,
  full_name        text not null check (char_length(full_name) between 1 and 120),
  email            citext not null,
  title            text,
  department       text,
  role             public.org_role not null default 'employee',
  manager_id       uuid references public.employees(id) on delete set null,
  employment_type  text not null default 'full_time'
                   check (employment_type in ('full_time', 'part_time', 'contractor', 'intern')),
  location         text,
  phone            text,
  start_date       date,
  status           text not null default 'invited'
                   check (status in ('invited', 'active', 'on_leave', 'offboarded')),
  created_at       timestamptz not null default now(),
  unique (org_id, email),
  unique (org_id, user_id)
);
create index if not exists employees_user_idx on public.employees(user_id);

create table if not exists public.boards (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  description  text,
  color        text,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now()
);

create table if not exists public.board_columns (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null references public.boards(id) on delete cascade,
  org_id    uuid not null references public.organizations(id) on delete cascade,
  name      text not null check (char_length(name) between 1 and 60),
  position  double precision not null default 0,
  is_done   boolean not null default false
);
create index if not exists board_columns_board_idx on public.board_columns(board_id);

create table if not exists public.automations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  name         text not null,
  trigger      text not null check (trigger in ('employee_added', 'employee_offboarded')),
  department   text,                        -- null = every department
  board_id     uuid references public.boards(id) on delete set null,
  steps        jsonb not null default '[]'::jsonb,
                -- [{ "title": "...", "offset_days": 0, "assign_to": "employee|manager|creator|none", "priority": "medium" }]
  enabled      boolean not null default true,
  run_count    integer not null default 0,
  last_run_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table if not exists public.tasks (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.organizations(id) on delete cascade,
  board_id             uuid not null references public.boards(id) on delete cascade,
  column_id            uuid not null references public.board_columns(id) on delete cascade,
  title                text not null check (char_length(title) between 1 and 200),
  description          text,
  assignee_id          uuid references public.employees(id) on delete set null,
  due_date             date,
  priority             text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  labels               text[] not null default '{}',
  checklist            jsonb not null default '[]'::jsonb,
  position             double precision not null default 0,
  source               text not null default 'manual' check (source in ('manual', 'automation', 'slack')),
  automation_id        uuid references public.automations(id) on delete set null,
  subject_employee_id  uuid references public.employees(id) on delete set null,
  completed_at         timestamptz,
  created_by           uuid references auth.users(id) on delete set null default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists tasks_org_idx on public.tasks(org_id);
create index if not exists tasks_column_idx on public.tasks(column_id, position);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);

-- Admin-only: holds the Slack webhook secret.
create table if not exists public.org_integrations (
  org_id             uuid primary key references public.organizations(id) on delete cascade,
  slack_webhook_url  text,
  slack_channel      text,
  events             jsonb not null default
    '{"task_created":true,"task_completed":true,"employee_added":true,"employee_offboarded":true}'::jsonb,
  updated_at         timestamptz not null default now()
);

create table if not exists public.files (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  name              text not null,
  size              bigint,
  mime              text,
  path              text not null unique,
  uploaded_by       uuid references auth.users(id) on delete set null default auth.uid(),
  uploaded_by_name  text,
  created_at        timestamptz not null default now()
);

create table if not exists public.activity (
  id          bigint generated always as identity primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  actor_id    uuid default auth.uid(),
  actor_name  text,
  verb        text not null,
  target      text,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists activity_org_idx on public.activity(org_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Role helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create or replace function public.my_role(p_org uuid)
returns public.org_role language sql stable security definer set search_path = public as $$
  select e.role from public.employees e
  where e.org_id = p_org and e.user_id = auth.uid() and e.status <> 'offboarded'
  limit 1;
$$;

create or replace function public.is_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.my_role(p_org) is not null;
$$;

create or replace function public.is_admin(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(p_org) in ('owner', 'admin'), false);
$$;

create or replace function public.is_manager(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role(p_org) in ('owner', 'admin', 'manager'), false);
$$;

create or replace function public.my_employee_id(p_org uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from public.employees e where e.org_id = p_org and e.user_id = auth.uid() limit 1;
$$;

-- Storage paths look like "<org_id>/<file>". Returns null for anything else.
create or replace function public.storage_org(p_name text)
returns uuid language plpgsql immutable as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------------------
-- Activity log + automations (internal — not callable from the client)
-- ---------------------------------------------------------------------------

create or replace function public.log_activity(p_org uuid, p_verb text, p_target text, p_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select full_name into v_name from public.employees where org_id = p_org and user_id = auth.uid() limit 1;
  insert into public.activity (org_id, actor_id, actor_name, verb, target, meta)
  values (p_org, auth.uid(), coalesce(v_name, 'myHR'), p_verb, p_target, coalesce(p_meta, '{}'::jsonb));
end $$;

create or replace function public.run_automations(p_emp public.employees, p_trigger text)
returns void language plpgsql security definer set search_path = public as $$
declare
  a record; s jsonb; v_col uuid; v_assignee uuid; v_base date; v_pos double precision; v_count int;
begin
  for a in
    select * from public.automations
    where org_id = p_emp.org_id and enabled and trigger = p_trigger and board_id is not null
      and (coalesce(department, '') = '' or department = p_emp.department)
  loop
    select id into v_col from public.board_columns
      where board_id = a.board_id order by is_done asc, position asc limit 1;
    continue when v_col is null;

    select coalesce(max(position), 0) into v_pos from public.tasks where column_id = v_col;
    v_base := case when p_trigger = 'employee_added' then coalesce(p_emp.start_date, current_date) else current_date end;
    v_count := 0;

    for s in select value from jsonb_array_elements(a.steps) loop
      v_assignee := case s->>'assign_to'
        when 'employee' then p_emp.id
        when 'manager'  then p_emp.manager_id
        when 'creator'  then public.my_employee_id(p_emp.org_id)
        else null end;
      v_pos := v_pos + 1000;
      insert into public.tasks (org_id, board_id, column_id, title, description, assignee_id, due_date,
                                priority, labels, position, source, automation_id, subject_employee_id)
      values (p_emp.org_id, a.board_id, v_col,
              left(replace(coalesce(s->>'title', 'Untitled step'), '{name}', p_emp.full_name), 200),
              s->>'description', v_assignee,
              v_base + coalesce((s->>'offset_days')::int, 0),
              case when s->>'priority' in ('low','medium','high','urgent') then s->>'priority' else 'medium' end,
              array[case when p_trigger = 'employee_added' then 'onboarding' else 'offboarding' end],
              v_pos, 'automation', a.id, p_emp.id);
      v_count := v_count + 1;
    end loop;

    update public.automations set run_count = run_count + 1, last_run_at = now() where id = a.id;
    perform public.log_activity(p_emp.org_id, 'ran automation', a.name,
      jsonb_build_object('employee', p_emp.full_name, 'tasks', v_count));
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- Guards privileged employee fields. RLS decides *who* may update a row; this
-- decides *which columns* non-admins may touch on their own row.
create or replace function public.employees_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.org_role;
begin
  if auth.uid() is null or current_setting('myhr.bypass_guard', true) = 'on' then
    return new;
  end if;

  if new.user_id is not null and new.user_id <> auth.uid()
     and (tg_op = 'INSERT' or new.user_id is distinct from old.user_id) then
    raise exception 'An account can only be linked by its owner (via claim_invites).';
  end if;

  if tg_op = 'UPDATE' then
    r := public.my_role(old.org_id);
    if new.org_id <> old.org_id then
      raise exception 'Employees cannot move between organizations.';
    end if;
    if coalesce(r::text, '') not in ('owner', 'admin') and (
         new.role is distinct from old.role or new.status is distinct from old.status
      or new.email is distinct from old.email or new.manager_id is distinct from old.manager_id
      or new.department is distinct from old.department or new.title is distinct from old.title
      or new.start_date is distinct from old.start_date or new.employment_type is distinct from old.employment_type) then
      raise exception 'Only admins can change role, status, title, department, manager or start date.';
    end if;
    if old.role = 'owner' and (new.role <> 'owner' or new.status = 'offboarded')
       and not exists (select 1 from public.employees
                       where org_id = old.org_id and role = 'owner' and id <> old.id and status <> 'offboarded') then
      raise exception 'An organization needs at least one owner.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists employees_guard on public.employees;
create trigger employees_guard before insert or update on public.employees
  for each row execute function public.employees_guard();

create or replace function public.employees_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is null or new.user_id <> auth.uid() then
      perform public.log_activity(new.org_id, 'added', new.full_name,
        jsonb_build_object('employee_id', new.id, 'title', new.title));
      if new.status <> 'offboarded' then
        perform public.run_automations(new, 'employee_added');
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status = 'offboarded' and old.status <> 'offboarded' then
      perform public.log_activity(new.org_id, 'offboarded', new.full_name, jsonb_build_object('employee_id', new.id));
      perform public.run_automations(new, 'employee_offboarded');
    elsif new.role <> old.role then
      perform public.log_activity(new.org_id, 'changed role of', new.full_name,
        jsonb_build_object('employee_id', new.id, 'role', new.role));
    elsif old.user_id is null and new.user_id is not null then
      perform public.log_activity(new.org_id, 'joined', 'the workspace', jsonb_build_object('employee_id', new.id));
    end if;
  end if;
  return null;
end $$;

drop trigger if exists employees_after on public.employees;
create trigger employees_after after insert or update on public.employees
  for each row execute function public.employees_after();

create or replace function public.tasks_before()
returns trigger language plpgsql set search_path = public as $$
declare v_done boolean;
begin
  select is_done into v_done from public.board_columns
    where id = new.column_id and board_id = new.board_id and org_id = new.org_id;
  if not found then
    raise exception 'Column does not belong to this board.';
  end if;
  if v_done then
    new.completed_at := case when tg_op = 'UPDATE' and old.completed_at is not null then old.completed_at else now() end;
  else
    new.completed_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists tasks_before on public.tasks;
create trigger tasks_before before insert or update on public.tasks
  for each row execute function public.tasks_before();

create or replace function public.tasks_after()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.source <> 'automation' then
    perform public.log_activity(new.org_id, 'created', new.title, jsonb_build_object('task_id', new.id));
  elsif tg_op = 'UPDATE' and new.completed_at is not null and old.completed_at is null then
    perform public.log_activity(new.org_id, 'completed', new.title, jsonb_build_object('task_id', new.id));
  end if;
  return null;
end $$;

drop trigger if exists tasks_after on public.tasks;
create trigger tasks_after after insert or update on public.tasks
  for each row execute function public.tasks_after();

-- ---------------------------------------------------------------------------
-- Client RPCs
-- ---------------------------------------------------------------------------

create or replace function public.slug_available(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from public.organizations where slug = lower(p_slug));
$$;

create or replace function public.org_public(p_slug text)
returns table (id uuid, name text) language sql stable security definer set search_path = public as $$
  select o.id, o.name from public.organizations o where o.slug = lower(p_slug);
$$;

create or replace function public.create_organization(
  p_name text, p_slug text, p_industry text default null, p_size text default null,
  p_full_name text default null, p_title text default null
) returns public.organizations
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_org public.organizations;
  v_emp uuid;
  v_ops uuid; v_team uuid;
begin
  if v_uid is null then raise exception 'Sign in first.'; end if;
  select email into v_email from auth.users where id = v_uid;

  insert into public.organizations (name, slug, industry, size, created_by)
  values (trim(p_name), lower(trim(p_slug)), p_industry, p_size, v_uid)
  returning * into v_org;

  insert into public.employees (org_id, user_id, full_name, email, title, role, status, start_date)
  values (v_org.id, v_uid, coalesce(nullif(trim(p_full_name), ''), split_part(v_email, '@', 1)),
          v_email, coalesce(nullif(trim(p_title), ''), 'Founder'), 'owner', 'active', current_date)
  returning id into v_emp;

  insert into public.profiles (id, full_name) values (v_uid, p_full_name)
  on conflict (id) do update set full_name = coalesce(excluded.full_name, public.profiles.full_name);

  insert into public.boards (org_id, name, description, color, created_by)
  values (v_org.id, 'People Ops', 'Onboarding, offboarding and HR operations', '#9bd8a9', v_uid)
  returning id into v_ops;
  insert into public.board_columns (board_id, org_id, name, position, is_done) values
    (v_ops, v_org.id, 'To do', 1000, false),
    (v_ops, v_org.id, 'In progress', 2000, false),
    (v_ops, v_org.id, 'Done', 3000, true);

  insert into public.boards (org_id, name, description, color, created_by)
  values (v_org.id, 'Team Tasks', 'Day-to-day work for the whole team', '#9cc7f2', v_uid)
  returning id into v_team;
  insert into public.board_columns (board_id, org_id, name, position, is_done) values
    (v_team, v_org.id, 'Backlog', 1000, false),
    (v_team, v_org.id, 'This week', 2000, false),
    (v_team, v_org.id, 'In review', 3000, false),
    (v_team, v_org.id, 'Done', 4000, true);

  insert into public.automations (org_id, name, trigger, board_id, steps) values
  (v_org.id, 'New hire onboarding', 'employee_added', v_ops, '[
     {"title":"Send welcome email to {name}","offset_days":-3,"assign_to":"manager","priority":"medium"},
     {"title":"Provision laptop and accounts for {name}","offset_days":-2,"assign_to":"creator","priority":"high"},
     {"title":"Complete I-9, tax and payroll forms","offset_days":0,"assign_to":"employee","priority":"high"},
     {"title":"First 1:1 with {name}","offset_days":1,"assign_to":"manager","priority":"medium"},
     {"title":"Finish security & compliance training","offset_days":5,"assign_to":"employee","priority":"medium"},
     {"title":"30-day check-in with {name}","offset_days":30,"assign_to":"manager","priority":"low"}
   ]'::jsonb),
  (v_org.id, 'Offboarding checklist', 'employee_offboarded', v_ops, '[
     {"title":"Revoke system access for {name}","offset_days":0,"assign_to":"creator","priority":"urgent"},
     {"title":"Collect equipment from {name}","offset_days":1,"assign_to":"manager","priority":"high"},
     {"title":"Exit interview with {name}","offset_days":2,"assign_to":"creator","priority":"medium"},
     {"title":"Process final payroll","offset_days":5,"assign_to":"creator","priority":"high"}
   ]'::jsonb);

  insert into public.org_integrations (org_id) values (v_org.id);

  perform public.log_activity(v_org.id, 'created', v_org.name, '{"kind":"organization"}'::jsonb);
  return v_org;
end $$;

-- Links pending invites (employees rows with this user's verified email) to
-- the signed-in account. Called by the app after every sign-in.
create or replace function public.claim_invites()
returns integer language plpgsql security definer set search_path = public as $$
declare v_email text; v_confirmed timestamptz; v_count int;
begin
  if auth.uid() is null then return 0; end if;
  select email, email_confirmed_at into v_email, v_confirmed from auth.users where id = auth.uid();
  if v_confirmed is null then return 0; end if;

  perform set_config('myhr.bypass_guard', 'on', true);
  update public.employees
     set user_id = auth.uid(),
         status = case when status = 'invited' then 'active' else status end
   where email = v_email and user_id is null and status <> 'offboarded';
  get diagnostics v_count = row_count;
  perform set_config('myhr.bypass_guard', 'off', true);

  insert into public.profiles (id) values (auth.uid()) on conflict (id) do nothing;
  return v_count;
end $$;

revoke execute on function public.log_activity(uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.run_automations(public.employees, text) from public, anon, authenticated;
revoke execute on function public.create_organization(text, text, text, text, text, text) from public, anon;
revoke execute on function public.claim_invites() from public, anon;
grant execute on function public.create_organization(text, text, text, text, text, text) to authenticated;
grant execute on function public.claim_invites() to authenticated;
grant execute on function public.slug_available(text) to anon, authenticated;
grant execute on function public.org_public(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.organizations    enable row level security;
alter table public.profiles         enable row level security;
alter table public.employees        enable row level security;
alter table public.boards           enable row level security;
alter table public.board_columns    enable row level security;
alter table public.automations      enable row level security;
alter table public.tasks            enable row level security;
alter table public.org_integrations enable row level security;
alter table public.files            enable row level security;
alter table public.activity         enable row level security;

-- organizations
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations for select to authenticated using (public.is_member(id));
drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations for update to authenticated
  using (public.is_admin(id)) with check (public.is_admin(id));
drop policy if exists org_delete on public.organizations;
create policy org_delete on public.organizations for delete to authenticated using (public.my_role(id) = 'owner');

-- profiles
drop policy if exists profile_self on public.profiles;
create policy profile_self on public.profiles for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- employees
drop policy if exists emp_select on public.employees;
create policy emp_select on public.employees for select to authenticated using (public.is_member(org_id));
drop policy if exists emp_insert on public.employees;
create policy emp_insert on public.employees for insert to authenticated
  with check (public.is_admin(org_id) and (role <> 'owner' or public.my_role(org_id) = 'owner'));
drop policy if exists emp_update on public.employees;
create policy emp_update on public.employees for update to authenticated
  using (
    (public.is_admin(org_id) and (role <> 'owner' or public.my_role(org_id) = 'owner'))
    or user_id = auth.uid()
  )
  with check (
    (public.is_admin(org_id) and (role <> 'owner' or public.my_role(org_id) = 'owner'))
    or user_id = auth.uid()
  );
drop policy if exists emp_delete on public.employees;
create policy emp_delete on public.employees for delete to authenticated
  using (public.is_admin(org_id) and (role <> 'owner' or public.my_role(org_id) = 'owner') and user_id is distinct from auth.uid());

-- boards / columns: everyone reads, managers+ write
drop policy if exists boards_select on public.boards;
create policy boards_select on public.boards for select to authenticated using (public.is_member(org_id));
drop policy if exists boards_write on public.boards;
create policy boards_write on public.boards for all to authenticated
  using (public.is_manager(org_id)) with check (public.is_manager(org_id));

drop policy if exists cols_select on public.board_columns;
create policy cols_select on public.board_columns for select to authenticated using (public.is_member(org_id));
drop policy if exists cols_write on public.board_columns;
create policy cols_write on public.board_columns for all to authenticated
  using (public.is_manager(org_id))
  with check (public.is_manager(org_id) and exists (select 1 from public.boards b where b.id = board_id and b.org_id = board_columns.org_id));

-- tasks: everyone reads + creates; managers edit anything; others edit their own
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks for select to authenticated using (public.is_member(org_id));
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_member(org_id) and created_by = auth.uid() and source = 'manual');
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks for update to authenticated
  using (public.is_manager(org_id) or assignee_id = public.my_employee_id(org_id) or created_by = auth.uid())
  with check (public.is_member(org_id));
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_manager(org_id) or created_by = auth.uid());

-- automations: managers read, admins write
drop policy if exists auto_select on public.automations;
create policy auto_select on public.automations for select to authenticated using (public.is_manager(org_id));
drop policy if exists auto_write on public.automations;
create policy auto_write on public.automations for all to authenticated
  using (public.is_admin(org_id)) with check (public.is_admin(org_id));

-- integrations: admins only
drop policy if exists integ_all on public.org_integrations;
create policy integ_all on public.org_integrations for all to authenticated
  using (public.is_admin(org_id)) with check (public.is_admin(org_id));

-- files
drop policy if exists files_select on public.files;
create policy files_select on public.files for select to authenticated using (public.is_member(org_id));
drop policy if exists files_insert on public.files;
create policy files_insert on public.files for insert to authenticated
  with check (public.is_member(org_id) and uploaded_by = auth.uid() and public.storage_org(path) = org_id);
drop policy if exists files_delete on public.files;
create policy files_delete on public.files for delete to authenticated
  using (public.is_admin(org_id) or uploaded_by = auth.uid());

-- activity: read-only for members (rows are written by triggers)
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select to authenticated using (public.is_member(org_id));

-- ---------------------------------------------------------------------------
-- Storage bucket for project files
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('org-files', 'org-files', false, 52428800)
on conflict (id) do nothing;

drop policy if exists "org files read" on storage.objects;
create policy "org files read" on storage.objects for select to authenticated
  using (bucket_id = 'org-files' and public.is_member(public.storage_org(name)));
drop policy if exists "org files upload" on storage.objects;
create policy "org files upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'org-files' and public.is_member(public.storage_org(name)));
drop policy if exists "org files delete" on storage.objects;
create policy "org files delete" on storage.objects for delete to authenticated
  using (bucket_id = 'org-files' and (owner_id = auth.uid()::text or public.is_admin(public.storage_org(name))));

-- ---------------------------------------------------------------------------
-- Realtime (live boards / directory / activity)
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['tasks', 'employees', 'activity', 'board_columns', 'boards'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
