-- Atomic Garage: recruitment portal (stage 2)
-- Additive only: existing applications, statuses, roles and staff functions keep working.
--
-- Security model
--   * Applicants (anon) can only call submit_application, track_application and list_recruitment.
--     An application is found by reference + secret access code (stored only as a SHA-256 hash).
--   * Managers read applications / application_events through Row Level Security (public.is_manager()).
--     Nobody except the SECURITY DEFINER functions below can INSERT/UPDATE/DELETE: RLS is on and no write
--     policy or write grant exists for anon or authenticated.
--   * token_hash is never granted to any API role (column-level SELECT grant below).
--   * Status values stay new/reviewing/interview/accepted/rejected in the database. The website shows them as
--     Pending / Under Review / Interview / Accepted / Rejected.

----------------------------------------------------------------------------------------------------
-- columns
----------------------------------------------------------------------------------------------------
alter table public.applications
  add column if not exists token_hash text,
  add column if not exists details jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.applications
    add constraint applications_details_chk
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) < 2000);
exception when duplicate_object then null; end $$;

-- API roles may read every column except token_hash
revoke select on public.applications from authenticated;
grant select (id, reference, character_name, contact, role, experience, motivation, availability, status,
              manager_note, created_at, answers, details, updated_at)
  on public.applications to authenticated;

----------------------------------------------------------------------------------------------------
-- history / private notes
----------------------------------------------------------------------------------------------------
create table if not exists public.application_events (
  id             bigint generated always as identity primary key,
  application_id uuid not null references public.applications(id),
  action         text not null check (action in ('submitted','status_changed','note','token_reset')),
  actor_type     text not null check (actor_type in ('applicant','staff','system')),
  actor_id       uuid,
  actor_name     text,
  from_status    text,
  to_status      text,
  message        text check (char_length(message) <= 1000),
  internal       boolean not null default false,
  at             timestamptz not null default now()
);
create index if not exists application_events_app_idx on public.application_events (application_id, at, id);

alter table public.application_events enable row level security;
drop policy if exists app_events_read on public.application_events;
create policy app_events_read on public.application_events
  for select to authenticated using ((select public.is_manager()));
revoke all on public.application_events from anon, authenticated;
grant select on public.application_events to authenticated;

-- back-fill history for applications that already exist (once)
insert into public.application_events (application_id, action, actor_type, actor_name, to_status, at)
select a.id, 'submitted', 'applicant', a.character_name, 'new', a.created_at
from public.applications a
where not exists (select 1 from public.application_events e where e.application_id = a.id);

insert into public.application_events (application_id, action, actor_type, actor_name, message, internal, at)
select a.id, 'note', 'staff', 'Earlier note', a.manager_note, true, a.created_at
from public.applications a
where a.manager_note is not null and a.manager_note <> ''
  and not exists (select 1 from public.application_events e where e.application_id = a.id and e.action = 'note');

----------------------------------------------------------------------------------------------------
-- role questions (the server decides the wording, so the form cannot be spoofed)
----------------------------------------------------------------------------------------------------
create or replace function ag_private.app_questions(p_role text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_role
    when 'mechanic_apprentice' then array[
      'Why do you want to become a mechanic?',
      'What interests you about working at Atomic Garage?',
      'Are you willing to undergo training?']
    when 'mechanic' then array[
      'What previous mechanic experience do you have?',
      'What repairs or modifications are you familiar with?',
      'How would you handle a difficult customer?']
    when 'human_resources' then array[
      'What experience do you have managing or recruiting staff?',
      'How would you handle a disagreement between employees?',
      'Why would you be suitable for an HR position?']
  end
$$;

----------------------------------------------------------------------------------------------------
-- public: submit + track
----------------------------------------------------------------------------------------------------
create or replace function public.submit_application(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_name text; v_contact text; v_role text; v_av text; v_ip text; v_ref text; v_token text; v_id uuid;
  v_qs text[]; v_ans jsonb := '[]'::jsonb; v_a text; i int; v_age text; v_disc text; v_tz text; v_det jsonb;
  v_try int := 0; v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p is null or jsonb_typeof(p) <> 'object' then return ag_private.err('invalid','Invalid request.'); end if;
  if coalesce(p->>'website','') <> '' then return ag_private.err('rejected','We couldn''t send your application.'); end if;

  v_name    := ag_private.one_line(p->>'character_name');
  v_contact := ag_private.one_line(p->>'contact');
  v_role    := coalesce(p->>'role','');
  v_av      := ag_private.one_line(p->>'availability');
  v_age     := ag_private.one_line(p->'details'->>'age');
  v_disc    := ag_private.one_line(p->'details'->>'discord');
  v_tz      := ag_private.one_line(p->'details'->>'timezone');

  if char_length(v_name) not between 2 and 60 then return ag_private.err('invalid_name','Enter your character name (2 to 60 characters).'); end if;
  if char_length(v_contact) not between 3 and 120 then return ag_private.err('invalid_contact','Enter in-character contact details (3 to 120 characters).'); end if;
  if v_role not in ('mechanic_apprentice','mechanic','human_resources') then return ag_private.err('invalid_role','Choose a role.'); end if;
  if char_length(v_av) not between 3 and 300 then return ag_private.err('invalid_availability','Tell us when you are available (3 to 300 characters).'); end if;
  if v_age <> '' and v_age !~ '^\d{1,3}$' then return ag_private.err('invalid_age','Character age must be a number.'); end if;
  if char_length(v_disc) > 60 then return ag_private.err('invalid_discord','Discord name is too long (60 characters maximum).'); end if;
  if char_length(v_tz) > 60 then return ag_private.err('invalid_timezone','Time zone is too long (60 characters maximum).'); end if;

  v_qs := ag_private.app_questions(v_role);
  if coalesce(jsonb_typeof(p->'answers'),'') <> 'array' or jsonb_array_length(p->'answers') <> 3 then
    return ag_private.err('invalid_answers','Please answer every question for this role.');
  end if;
  for i in 1..3 loop
    v_a := ag_private.multi_line(p->'answers'->(i-1)->>'a');
    if v_role = 'mechanic_apprentice' and i = 3 then
      if v_a !~* '^(yes|no)\y' or char_length(v_a) > 1000 then
        return ag_private.err('invalid_answer_3','Please choose Yes or No for question 3.');
      end if;
    elsif char_length(v_a) not between 10 and 1000 then
      return ag_private.err('invalid_answer_' || i, 'Please answer question ' || i || ' (10 to 1000 characters).');
    end if;
    v_ans := v_ans || jsonb_build_array(jsonb_build_object('q', v_qs[i], 'a', v_a));
  end loop;

  if not exists (select 1 from public.recruitment_roles where role = v_role and is_open) then
    return ag_private.err('role_closed','Recruitment for this role is currently closed.');
  end if;

  v_ip := ag_private.client_key();
  if v_ip is not null and ag_private.hits('app:' || v_ip, interval '1 day') >= 3 then
    return ag_private.err('rate_limited','Too many applications from your connection. Please try again tomorrow.');
  end if;
  if ag_private.hits('app:all', interval '1 hour') >= 100 then
    return ag_private.err('rate_limited','Applications are busy right now. Please try again later.');
  end if;

  v_det   := jsonb_strip_nulls(jsonb_build_object('age', nullif(v_age,''), 'discord', nullif(v_disc,''), 'timezone', nullif(v_tz,'')));
  v_token := encode(extensions.gen_random_bytes(20), 'hex');
  loop
    v_try := v_try + 1;
    v_ref := 'AP-' || (select string_agg(substr(v_alpha, 1 + (get_byte(b, k) % 31), 1), '' order by k)
                       from (select extensions.gen_random_bytes(6) as b) x, generate_series(0, 5) k);
    begin
      insert into public.applications (reference, token_hash, character_name, contact, role, experience, motivation,
                                       availability, answers, details)
      values (v_ref, ag_private.hash_token(v_token), v_name, v_contact, v_role,
              v_ans->0->>'a', v_ans->1->>'a', v_av, v_ans, v_det)
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_try >= 6 then return ag_private.err('busy','We couldn''t create your application. Please try again.'); end if;
    end;
  end loop;

  insert into public.application_events (application_id, action, actor_type, actor_name, to_status)
  values (v_id, 'submitted', 'applicant', v_name, 'new');
  if v_ip is not null then perform ag_private.hit('app:' || v_ip); end if;
  perform ag_private.hit('app:all');
  return jsonb_build_object('ok', true, 'reference', v_ref, 'token', v_token);
end
$$;

create or replace function public.track_application(p_ref text, p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_a public.applications; v_ip text := ag_private.client_key(); v_ref text := upper(btrim(coalesce(p_ref,'')));
begin
  if v_ip is not null and ag_private.hits('afail:' || v_ip, interval '15 minutes') >= 20 then
    return ag_private.err('rate_limited','Too many attempts. Please wait a few minutes and try again.');
  end if;
  select * into v_a from public.applications
   where reference = v_ref and token_hash is not null
     and token_hash = ag_private.hash_token(btrim(coalesce(p_token,'')));
  if not found then
    if v_ip is not null then perform ag_private.hit('afail:' || v_ip); end if;
    return ag_private.err('not_found','No application matches that reference and access code.');
  end if;
  return jsonb_build_object(
    'ok', true, 'reference', v_a.reference, 'status', v_a.status, 'role', v_a.role,
    'character_name', v_a.character_name, 'created_at', v_a.created_at, 'updated_at', v_a.updated_at,
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'to_status', e.to_status, 'at', e.at)
                                           order by e.at, e.id), '[]'::jsonb)
                 from public.application_events e
                 where e.application_id = v_a.id and not e.internal and e.action in ('submitted','status_changed')));
end
$$;

----------------------------------------------------------------------------------------------------
-- management
----------------------------------------------------------------------------------------------------
create or replace function public.staff_set_application(p_id uuid, p_status text, p_note text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_old text; v_who text; v_n text := left(ag_private.multi_line(p_note), 1000);
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  if p_status not in ('new','reviewing','interview','accepted','rejected') then return ag_private.err('invalid','Unknown status.'); end if;
  select status into v_old from public.applications where id = p_id for update;
  if not found then return ag_private.err('not_found','Application not found.'); end if;
  select display_name into v_who from public.staff_profiles where user_id = auth.uid();
  if v_old <> p_status then
    update public.applications set status = p_status, updated_at = now() where id = p_id;
    insert into public.application_events (application_id, action, actor_type, actor_id, actor_name, from_status, to_status)
    values (p_id, 'status_changed', 'staff', auth.uid(), v_who, v_old, p_status);
  end if;
  if v_n <> '' then
    insert into public.application_events (application_id, action, actor_type, actor_id, actor_name, message, internal)
    values (p_id, 'note', 'staff', auth.uid(), v_who, v_n, true);
  end if;
  return jsonb_build_object('ok', true, 'status', p_status);
end
$$;

create or replace function public.staff_add_application_note(p_id uuid, p_note text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_who text; v_n text := ag_private.multi_line(p_note);
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  if char_length(v_n) not between 1 and 1000 then return ag_private.err('invalid','A note must be 1 to 1000 characters.'); end if;
  if not exists (select 1 from public.applications where id = p_id) then return ag_private.err('not_found','Application not found.'); end if;
  select display_name into v_who from public.staff_profiles where user_id = auth.uid();
  insert into public.application_events (application_id, action, actor_type, actor_id, actor_name, message, internal)
  values (p_id, 'note', 'staff', auth.uid(), v_who, v_n, true);
  return jsonb_build_object('ok', true);
end
$$;

-- For applications made before tracking existed, or when an applicant loses their code.
-- The new code is returned once to the manager; only its hash is stored.
create or replace function public.staff_reset_application_token(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(20), 'hex'); v_who text;
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  if not exists (select 1 from public.applications where id = p_id) then return ag_private.err('not_found','Application not found.'); end if;
  select display_name into v_who from public.staff_profiles where user_id = auth.uid();
  update public.applications set token_hash = ag_private.hash_token(v_token) where id = p_id;
  insert into public.application_events (application_id, action, actor_type, actor_id, actor_name, message, internal)
  values (p_id, 'token_reset', 'staff', auth.uid(), v_who, 'New tracking access code issued.', true);
  return jsonb_build_object('ok', true, 'token', v_token);
end
$$;

create or replace function public.staff_set_recruitment(p_role text, p_open boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  update public.recruitment_roles set is_open = coalesce(p_open, true), updated_at = now() where role = p_role;
  if not found then return ag_private.err('invalid','Unknown role.'); end if;
  return jsonb_build_object('ok', true);
end
$$;

----------------------------------------------------------------------------------------------------
-- who may call what
----------------------------------------------------------------------------------------------------
revoke execute on function public.track_application(text, text)            from public, anon, authenticated;
revoke execute on function public.staff_add_application_note(uuid, text)   from public, anon, authenticated;
revoke execute on function public.staff_reset_application_token(uuid)      from public, anon, authenticated;
grant  execute on function public.track_application(text, text)            to anon, authenticated;
grant  execute on function public.staff_add_application_note(uuid, text)   to authenticated;
grant  execute on function public.staff_reset_application_token(uuid)      to authenticated;
