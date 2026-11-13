-- Atomic Garage: public bookings + staff management backend
-- Security model
--   * Customers (anon) can ONLY call 3 functions: submit_booking, track_booking, customer_action.
--     They have no table access at all. Bookings are found by reference + secret token (hashed in DB).
--   * Staff authenticate with Supabase Auth. Authorisation comes from public.staff_profiles
--     (a signed-up user with no profile can read nothing). Managers see everything; mechanics see only
--     bookings assigned to them. All writes go through SECURITY DEFINER functions that re-check the role.
--   * token_hash / idempotency_key columns are never granted to any API role.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists ag_private;
revoke all on schema ag_private from public, anon, authenticated;

----------------------------------------------------------------------------------------------------
-- tables
----------------------------------------------------------------------------------------------------
create table public.site_settings (
  id int primary key check (id = 1),
  location_text text check (char_length(location_text) <= 300),
  map_url       text check (map_url is null or (map_url ~ '^https://' and char_length(map_url) <= 500)),
  hours_text    text check (char_length(hours_text) <= 500),
  contact_text  text check (char_length(contact_text) <= 500),
  discord_url   text check (discord_url is null or (discord_url ~ '^https://' and char_length(discord_url) <= 300)),
  updated_at timestamptz not null default now()
);
insert into public.site_settings (id) values (1);   -- all empty: nothing is invented

create table public.staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 60),
  role text not null check (role in ('manager','mechanic')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  role text not null check (role in ('manager','mechanic')),
  label text check (char_length(label) <= 60),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  token_hash text not null,
  idempotency_key text not null unique,
  character_name text not null,
  contact text not null,
  vehicle text not null,
  vehicle_reg text,
  service_type text not null check (service_type in ('repairs','tuning','custom_builds','towing','other')),
  preferred_at timestamptz not null,
  description text not null,
  status text not null default 'pending' check (status in
    ('pending','approved','declined','alternative_proposed','alternative_accepted','in_progress','completed','cancelled')),
  proposed_at timestamptz,
  scheduled_at timestamptz,
  assigned_to uuid references public.staff_profiles(user_id) on delete set null,
  customer_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_status_idx on public.bookings (status, created_at desc);
create index bookings_assigned_idx on public.bookings (assigned_to);

create table public.booking_events (
  id bigint generated always as identity primary key,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  action text not null,
  actor_type text not null check (actor_type in ('customer','staff','system')),
  actor_id uuid,
  actor_name text,
  message text,
  internal boolean not null default false,   -- internal events are never shown to customers
  at timestamptz not null default now()
);
create index booking_events_booking_idx on public.booking_events (booking_id, at);

create table ag_private.throttle (
  id bigint generated always as identity primary key,
  bucket text not null,
  at timestamptz not null default now()
);
create index throttle_idx on ag_private.throttle (bucket, at);

alter table public.site_settings  enable row level security;
alter table public.staff_profiles enable row level security;
alter table public.staff_invites  enable row level security;
alter table public.bookings       enable row level security;
alter table public.booking_events enable row level security;

----------------------------------------------------------------------------------------------------
-- private helpers
----------------------------------------------------------------------------------------------------
create function ag_private.err(p_code text, p_msg text) returns jsonb
language sql immutable set search_path = '' as
$$ select jsonb_build_object('ok', false, 'error', p_code, 'message', p_msg) $$;

create function ag_private.one_line(t text) returns text
language sql immutable set search_path = '' as
$$ select btrim(regexp_replace(regexp_replace(coalesce(t,''), '[\x01-\x1f\x7f]', ' ', 'g'), '\s+', ' ', 'g')) $$;

create function ag_private.multi_line(t text) returns text
language sql immutable set search_path = '' as
$$ select btrim(regexp_replace(coalesce(t,''), '[\x01-\x08\x0b\x0c\x0e-\x1f\x7f]', '', 'g')) $$;

create function ag_private.parse_ts(t text) returns timestamptz
language plpgsql immutable set search_path = '' as
$$
begin
  if t is null or t !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?)$' then return null; end if;
  return t::timestamptz;
exception when others then return null;
end
$$;

create function ag_private.client_key() returns text
language plpgsql stable set search_path = '' as
$$
declare h json; ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::json; exception when others then h := null; end;
  if h is null then return null; end if;
  ip := coalesce(nullif(h->>'cf-connecting-ip',''), nullif(h->>'x-real-ip',''),
                 nullif(btrim(split_part(coalesce(h->>'x-forwarded-for',''), ',', 1)),''));
  if ip is null then return null; end if;
  return encode(extensions.digest(ip, 'sha256'), 'hex');
end
$$;

create function ag_private.hits(p_bucket text, p_window interval) returns int
language sql stable set search_path = '' as
$$ select count(*)::int from ag_private.throttle where bucket = p_bucket and at > now() - p_window $$;

create function ag_private.hit(p_bucket text) returns void
language plpgsql set search_path = '' as
$$
begin
  insert into ag_private.throttle (bucket) values (p_bucket);
  if random() < 0.02 then delete from ag_private.throttle where at < now() - interval '2 days'; end if;
end
$$;

create function ag_private.log_event(p_booking uuid, p_action text, p_actor_type text, p_actor uuid,
                                     p_actor_name text, p_message text, p_internal boolean) returns void
language sql set search_path = '' as
$$ insert into public.booking_events (booking_id, action, actor_type, actor_id, actor_name, message, internal)
   values (p_booking, p_action, p_actor_type, p_actor, p_actor_name, p_message, p_internal) $$;

create function ag_private.hash_token(t text) returns text
language sql immutable set search_path = '' as
$$ select encode(extensions.digest(t, 'sha256'), 'hex') $$;

----------------------------------------------------------------------------------------------------
-- staff identity helpers (used by RLS policies)
----------------------------------------------------------------------------------------------------
create function public.is_active_staff() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.staff_profiles where user_id = auth.uid() and active) $$;

create function public.is_manager() returns boolean
language sql stable security definer set search_path = '' as
$$ select exists (select 1 from public.staff_profiles where user_id = auth.uid() and active and role = 'manager') $$;

----------------------------------------------------------------------------------------------------
-- RLS policies + column-level grants
----------------------------------------------------------------------------------------------------
revoke all on public.site_settings, public.staff_profiles, public.staff_invites, public.bookings, public.booking_events
  from public, anon, authenticated;

-- public contact details (only what is configured)
grant select (id, location_text, map_url, hours_text, contact_text, discord_url) on public.site_settings to anon;
grant select on public.site_settings to authenticated;
grant update (location_text, map_url, hours_text, contact_text, discord_url, updated_at) on public.site_settings to authenticated;
create policy settings_read   on public.site_settings for select to anon, authenticated using (true);
create policy settings_update on public.site_settings for update to authenticated
  using (public.is_manager()) with check (public.is_manager());

-- staff profiles: own row, or everything for managers. Writes only via functions.
grant select on public.staff_profiles to authenticated;
create policy profiles_read on public.staff_profiles for select to authenticated
  using (user_id = (select auth.uid()) or public.is_manager());

-- invites: managers can list (never the hash)
grant select (id, role, label, created_at, expires_at, used_at, used_by) on public.staff_invites to authenticated;
create policy invites_read on public.staff_invites for select to authenticated using (public.is_manager());

-- bookings: managers see all; mechanics only bookings assigned to them. token_hash / idempotency_key not granted.
grant select (id, reference, character_name, contact, vehicle, vehicle_reg, service_type, preferred_at, description,
              status, proposed_at, scheduled_at, assigned_to, customer_message, created_at, updated_at)
  on public.bookings to authenticated;
create policy bookings_staff_read on public.bookings for select to authenticated
  using (public.is_manager() or (public.is_active_staff() and assigned_to = (select auth.uid())));

-- events follow booking visibility (the subquery is itself subject to bookings RLS)
grant select on public.booking_events to authenticated;
create policy events_staff_read on public.booking_events for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_events.booking_id));

----------------------------------------------------------------------------------------------------
-- PUBLIC: submit_booking
----------------------------------------------------------------------------------------------------
create function public.submit_booking(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare
  v_name text; v_contact text; v_vehicle text; v_reg text; v_service text; v_desc text;
  v_when timestamptz; v_key text; v_ip text; v_ref text; v_token text; v_id uuid; v_ex public.bookings;
  v_try int := 0; v_alpha constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return ag_private.err('invalid', 'Invalid request.');
  end if;
  if coalesce(p->>'website','') <> '' then   -- honeypot
    return ag_private.err('rejected', 'We couldn''t send your request.');
  end if;

  v_key := p->>'idempotency_key';
  if v_key is null or v_key !~ '^[0-9a-f]{16,64}$' then
    return ag_private.err('invalid', 'Invalid request. Please reload the page and try again.');
  end if;
  select * into v_ex from public.bookings where idempotency_key = v_key;
  if found then   -- same form submitted again: never create a second booking
    return jsonb_build_object('ok', true, 'duplicate', true, 'reference', v_ex.reference, 'status', v_ex.status);
  end if;

  v_name    := ag_private.one_line(p->>'character_name');
  v_contact := ag_private.one_line(p->>'contact');
  v_vehicle := ag_private.one_line(p->>'vehicle');
  v_reg     := ag_private.one_line(p->>'vehicle_reg');
  v_service := ag_private.one_line(p->>'service_type');
  v_desc    := ag_private.multi_line(p->>'description');
  v_when    := ag_private.parse_ts(p->>'preferred_at');

  if char_length(v_name) not between 2 and 60 then return ag_private.err('invalid_name','Enter your character name (2 to 60 characters).'); end if;
  if char_length(v_contact) not between 3 and 120 then return ag_private.err('invalid_contact','Enter in-character contact details (3 to 120 characters).'); end if;
  if char_length(v_vehicle) not between 2 and 80 then return ag_private.err('invalid_vehicle','Enter the vehicle make and model (2 to 80 characters).'); end if;
  if char_length(v_reg) > 16 then return ag_private.err('invalid_reg','Registration is too long (16 characters maximum).'); end if;
  if v_service not in ('repairs','tuning','custom_builds','towing','other') then return ag_private.err('invalid_service','Choose a type of service.'); end if;
  if char_length(v_desc) not between 10 and 2000 then return ag_private.err('invalid_description','Describe the work required (10 to 2000 characters).'); end if;
  if v_when is null or v_when <= now() or v_when > now() + interval '366 days' then
    return ag_private.err('invalid_date','Choose a future date and time within the next year.');
  end if;

  -- flood protection (best effort per client, plus a global backstop)
  v_ip := ag_private.client_key();
  if v_ip is not null and ag_private.hits('sub:' || v_ip, interval '1 hour') >= 6 then
    return ag_private.err('rate_limited','Too many requests from your connection. Please try again later.');
  end if;
  if ag_private.hits('sub:all', interval '1 hour') >= 300 then
    return ag_private.err('rate_limited','The booking service is busy. Please try again later.');
  end if;

  -- identical request already waiting? (no reference is revealed)
  if exists (select 1 from public.bookings
             where lower(character_name) = lower(v_name) and lower(vehicle) = lower(v_vehicle)
               and service_type = v_service and preferred_at = v_when
               and status in ('pending','alternative_proposed','alternative_accepted')
               and created_at > now() - interval '24 hours') then
    return ag_private.err('duplicate','A matching request is already awaiting review. If you saved your access code you can track it on the Track Booking page.');
  end if;

  v_token := encode(extensions.gen_random_bytes(20), 'hex');   -- 160 bits
  loop
    v_try := v_try + 1;
    v_ref := 'AG-' || (select string_agg(substr(v_alpha, 1 + (get_byte(b, i) % 31), 1), '' order by i)
                       from (select extensions.gen_random_bytes(6) as b) x, generate_series(0, 5) i);
    begin
      insert into public.bookings (reference, token_hash, idempotency_key, character_name, contact, vehicle,
                                   vehicle_reg, service_type, preferred_at, description)
      values (v_ref, ag_private.hash_token(v_token), v_key, v_name, v_contact, v_vehicle,
              nullif(v_reg,''), v_service, v_when, v_desc)
      returning id into v_id;
      exit;
    exception when unique_violation then
      select * into v_ex from public.bookings where idempotency_key = v_key;
      if found then
        return jsonb_build_object('ok', true, 'duplicate', true, 'reference', v_ex.reference, 'status', v_ex.status);
      end if;
      if v_try >= 6 then return ag_private.err('busy','We couldn''t create your booking. Please try again.'); end if;
    end;
  end loop;

  ag_private.log_event(v_id, 'submitted', 'customer', null, v_name, null, false);
  if v_ip is not null then perform ag_private.hit('sub:' || v_ip); end if;
  perform ag_private.hit('sub:all');

  return jsonb_build_object('ok', true, 'reference', v_ref, 'token', v_token, 'status', 'pending');
end
$$;

----------------------------------------------------------------------------------------------------
-- PUBLIC: track_booking / customer_action  (reference + secret token)
----------------------------------------------------------------------------------------------------
create function public.track_booking(p_ref text, p_token text) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare v_b public.bookings; v_ip text := ag_private.client_key(); v_ref text := upper(btrim(coalesce(p_ref,'')));
begin
  if v_ip is not null and ag_private.hits('fail:' || v_ip, interval '15 minutes') >= 20 then
    return ag_private.err('rate_limited','Too many attempts. Please wait a few minutes and try again.');
  end if;
  select * into v_b from public.bookings
   where reference = v_ref and token_hash = ag_private.hash_token(btrim(coalesce(p_token,'')));
  if not found then
    if v_ip is not null then perform ag_private.hit('fail:' || v_ip); end if;
    return ag_private.err('not_found','No booking matches that reference and access code.');
  end if;
  return jsonb_build_object(
    'ok', true, 'reference', v_b.reference, 'status', v_b.status,
    'character_name', v_b.character_name, 'service_type', v_b.service_type, 'vehicle', v_b.vehicle,
    'vehicle_reg', v_b.vehicle_reg, 'preferred_at', v_b.preferred_at, 'description', v_b.description,
    'proposed_at', case when v_b.status in ('alternative_proposed','alternative_accepted') then v_b.proposed_at end,
    -- an appointment time is only shown as scheduled once management has approved it
    'scheduled_at', case when v_b.status in ('approved','in_progress','completed') then v_b.scheduled_at end,
    'customer_message', v_b.customer_message, 'updated_at', v_b.updated_at,
    'timeline', (select coalesce(jsonb_agg(jsonb_build_object('action', e.action, 'at', e.at, 'message', e.message)
                                           order by e.at, e.id), '[]'::jsonb)
                 from public.booking_events e where e.booking_id = v_b.id and not e.internal));
end
$$;

create function public.customer_action(p_ref text, p_token text, p_action text, p_note text default null) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare v_b public.bookings; v_ip text := ag_private.client_key(); v_note text;
begin
  if v_ip is not null and ag_private.hits('fail:' || v_ip, interval '15 minutes') >= 20 then
    return ag_private.err('rate_limited','Too many attempts. Please wait a few minutes and try again.');
  end if;
  select * into v_b from public.bookings
   where reference = upper(btrim(coalesce(p_ref,''))) and token_hash = ag_private.hash_token(btrim(coalesce(p_token,'')))
   for update;
  if not found then
    if v_ip is not null then perform ag_private.hit('fail:' || v_ip); end if;
    return ag_private.err('not_found','No booking matches that reference and access code.');
  end if;
  v_note := nullif(left(ag_private.multi_line(p_note), 500), '');

  if p_action = 'accept_alternative' then
    if v_b.status <> 'alternative_proposed' or v_b.proposed_at is null then
      return ag_private.err('bad_state','There is no proposed time to accept.');
    end if;
    update public.bookings set status = 'alternative_accepted', updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, 'alternative_accepted', 'customer', null, v_b.character_name, v_note, false);
  elsif p_action = 'decline_alternative' then
    if v_b.status <> 'alternative_proposed' then return ag_private.err('bad_state','There is no proposed time to decline.'); end if;
    update public.bookings set status = 'pending', proposed_at = null, updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, 'alternative_declined', 'customer', null, v_b.character_name, v_note, false);
  elsif p_action = 'cancel' then
    if v_b.status not in ('pending','alternative_proposed','alternative_accepted','approved') then
      return ag_private.err('bad_state','This booking can no longer be cancelled here.');
    end if;
    update public.bookings set status = 'cancelled', updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, 'cancelled', 'customer', null, v_b.character_name, v_note, false);
  else
    return ag_private.err('invalid','Unknown action.');
  end if;
  return jsonb_build_object('ok', true);
end
$$;

----------------------------------------------------------------------------------------------------
-- STAFF: onboarding
----------------------------------------------------------------------------------------------------
create function public.staff_me() returns jsonb
language sql stable security definer set search_path = '' as
$$ select coalesce((select jsonb_build_object('user_id', user_id, 'display_name', display_name, 'role', role, 'active', active)
                    from public.staff_profiles where user_id = auth.uid()), 'null'::jsonb) $$;

create function public.staff_redeem_invite(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare v_uid uuid := auth.uid(); v_inv public.staff_invites; v_name text := ag_private.one_line(p_name);
begin
  if v_uid is null then return ag_private.err('not_authenticated','Sign in first.'); end if;
  if exists (select 1 from public.staff_profiles where user_id = v_uid) then
    return ag_private.err('already_staff','This account already has staff access.');
  end if;
  if ag_private.hits('redeem:' || v_uid::text, interval '1 hour') >= 8 then
    return ag_private.err('rate_limited','Too many attempts. Try again later.');
  end if;
  if char_length(v_name) not between 2 and 60 then return ag_private.err('invalid_name','Enter your name (2 to 60 characters).'); end if;
  select * into v_inv from public.staff_invites
   where code_hash = ag_private.hash_token(upper(btrim(coalesce(p_code,'')))) and used_at is null and expires_at > now()
   for update;
  if not found then
    perform ag_private.hit('redeem:' || v_uid::text);
    return ag_private.err('bad_code','That access code is invalid, used or expired.');
  end if;
  insert into public.staff_profiles (user_id, display_name, role) values (v_uid, v_name, v_inv.role);
  update public.staff_invites set used_at = now(), used_by = v_uid where id = v_inv.id;
  return jsonb_build_object('ok', true, 'role', v_inv.role);
end
$$;

----------------------------------------------------------------------------------------------------
-- STAFF: management of people (managers only)
----------------------------------------------------------------------------------------------------
create function public.staff_create_invite(p_role text, p_label text default null) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare v_code text; v_exp timestamptz := now() + interval '7 days';
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  if p_role not in ('manager','mechanic') then return ag_private.err('invalid','Invalid role.'); end if;
  v_code := 'AG-' || upper(encode(extensions.gen_random_bytes(10), 'hex'));
  insert into public.staff_invites (code_hash, role, label, created_by, expires_at)
  values (ag_private.hash_token(v_code), p_role, nullif(left(ag_private.one_line(p_label), 60), ''), auth.uid(), v_exp);
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_exp);
end
$$;

create function public.staff_revoke_invite(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as
$$
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  delete from public.staff_invites where id = p_id and used_at is null;
  return jsonb_build_object('ok', true);
end
$$;

create function public.staff_update_member(p_user uuid, p_role text, p_active boolean) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare v_t public.staff_profiles;
begin
  if not public.is_manager() then return ag_private.err('forbidden','Managers only.'); end if;
  if p_role not in ('manager','mechanic') then return ag_private.err('invalid','Invalid role.'); end if;
  select * into v_t from public.staff_profiles where user_id = p_user for update;
  if not found then return ag_private.err('not_found','Staff member not found.'); end if;
  if v_t.role = 'manager' and v_t.active and (p_role <> 'manager' or not p_active)
     and (select count(*) from public.staff_profiles where role = 'manager' and active) <= 1 then
    return ag_private.err('last_manager','There must always be at least one active manager.');
  end if;
  update public.staff_profiles set role = p_role, active = p_active where user_id = p_user;
  return jsonb_build_object('ok', true);
end
$$;

----------------------------------------------------------------------------------------------------
-- STAFF: booking actions (the only way staff change a booking)
----------------------------------------------------------------------------------------------------
create function public.staff_booking_action(p_id uuid, p_action text, p jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = '' as
$$
declare
  v_uid uuid := auth.uid(); v_prof public.staff_profiles; v_b public.bookings;
  v_msg text; v_t timestamptz; v_new text; v_mech public.staff_profiles; v_mid text;
begin
  if v_uid is null then return ag_private.err('not_authenticated','Sign in first.'); end if;
  select * into v_prof from public.staff_profiles where user_id = v_uid and active;
  if not found then return ag_private.err('forbidden','You do not have staff access.'); end if;

  select * into v_b from public.bookings where id = p_id for update;
  -- mechanics cannot even learn that other bookings exist
  if not found or (v_prof.role <> 'manager' and v_b.assigned_to is distinct from v_uid) then
    return ag_private.err('not_found','Booking not found.');
  end if;

  p := coalesce(p, '{}'::jsonb);
  v_msg := nullif(left(ag_private.multi_line(p->>'message'), 500), '');

  if p_action = 'approve' then
    if v_prof.role <> 'manager' then return ag_private.err('forbidden','Managers only.'); end if;
    if v_b.status not in ('pending','alternative_accepted') then return ag_private.err('bad_state','Only pending or customer-accepted bookings can be approved.'); end if;
    if v_b.status = 'alternative_accepted' then v_t := v_b.proposed_at;
    elsif coalesce(p->>'scheduled_at','') <> '' then
      v_t := ag_private.parse_ts(p->>'scheduled_at');
      if v_t is null then return ag_private.err('invalid_date','Invalid appointment time.'); end if;
    else v_t := v_b.preferred_at; end if;
    if v_t is null or v_t <= now() then
      return ag_private.err('time_in_past','That appointment time has already passed. Propose a new time instead.');
    end if;
    update public.bookings set status = 'approved', scheduled_at = v_t, proposed_at = null,
           customer_message = v_msg, updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, 'approved', 'staff', v_uid, v_prof.display_name, v_msg, false);

  elsif p_action = 'decline' then
    if v_prof.role <> 'manager' then return ag_private.err('forbidden','Managers only.'); end if;
    if v_b.status not in ('pending','alternative_proposed','alternative_accepted') then return ag_private.err('bad_state','This booking can no longer be declined.'); end if;
    update public.bookings set status = 'declined', proposed_at = null, customer_message = v_msg, updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, 'declined', 'staff', v_uid, v_prof.display_name, v_msg, false);

  elsif p_action = 'propose' then
    if v_prof.role <> 'manager' then return ag_private.err('forbidden','Managers only.'); end if;
    if v_b.status not in ('pending','alternative_proposed','alternative_accepted') then return ag_private.err('bad_state','A new time can only be proposed before approval.'); end if;
    v_t := ag_private.parse_ts(p->>'proposed_at');
    if v_t is null or v_t <= now() or v_t > now() + interval '366 days' then
      return ag_private.err('invalid_date','Choose a valid future time to propose.');
    end if;
    update public.bookings set status = 'alternative_proposed', proposed_at = v_t, customer_message = v_msg, updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, 'alternative_proposed', 'staff', v_uid, v_prof.display_name, v_msg, false);

  elsif p_action = 'assign' then
    if v_prof.role <> 'manager' then return ag_private.err('forbidden','Managers only.'); end if;
    if v_b.status in ('declined','cancelled','completed') then return ag_private.err('bad_state','Closed bookings cannot be reassigned.'); end if;
    v_mid := nullif(p->>'mechanic_id','');
    if v_mid is null then
      update public.bookings set assigned_to = null, updated_at = now() where id = v_b.id;
      perform ag_private.log_event(v_b.id, 'assigned', 'staff', v_uid, v_prof.display_name, 'Unassigned', true);
    else
      if v_mid !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return ag_private.err('invalid','Invalid mechanic.'); end if;
      select * into v_mech from public.staff_profiles where user_id = v_mid::uuid and active;
      if not found then return ag_private.err('invalid','That staff member is not active.'); end if;
      update public.bookings set assigned_to = v_mech.user_id, updated_at = now() where id = v_b.id;
      perform ag_private.log_event(v_b.id, 'assigned', 'staff', v_uid, v_prof.display_name, 'Assigned to ' || v_mech.display_name, true);
    end if;

  elsif p_action = 'set_status' then
    v_new := p->>'status';
    if v_new = 'in_progress' then
      if v_b.status <> 'approved' then return ag_private.err('bad_state','Only approved bookings can be started.'); end if;
    elsif v_new = 'completed' then
      if v_b.status not in ('approved','in_progress') then return ag_private.err('bad_state','Only approved or in-progress bookings can be completed.'); end if;
    elsif v_new = 'approved' then
      if v_prof.role <> 'manager' then return ag_private.err('forbidden','Managers only.'); end if;
      if v_b.status <> 'in_progress' then return ag_private.err('bad_state','Only in-progress work can be moved back to approved.'); end if;
    elsif v_new = 'cancelled' then
      if v_prof.role <> 'manager' then return ag_private.err('forbidden','Managers only.'); end if;
      if v_b.status not in ('pending','alternative_proposed','alternative_accepted','approved','in_progress') then return ag_private.err('bad_state','This booking is already closed.'); end if;
    else
      return ag_private.err('invalid','Invalid status.');
    end if;
    update public.bookings set status = v_new, customer_message = case when v_new = 'cancelled' then v_msg else customer_message end,
           proposed_at = case when v_new = 'cancelled' then null else proposed_at end, updated_at = now() where id = v_b.id;
    perform ag_private.log_event(v_b.id, case when v_new = 'approved' then 'status_changed' else v_new end, 'staff', v_uid,
                                 v_prof.display_name, case when v_new = 'cancelled' then v_msg end, false);

  elsif p_action = 'note' then
    if v_msg is null then return ag_private.err('invalid','Write a note first.'); end if;
    perform ag_private.log_event(v_b.id, 'note', 'staff', v_uid, v_prof.display_name, v_msg, true);
    update public.bookings set updated_at = now() where id = v_b.id;

  else
    return ag_private.err('invalid','Unknown action.');
  end if;

  select status into v_new from public.bookings where id = v_b.id;
  return jsonb_build_object('ok', true, 'status', v_new);
end
$$;

----------------------------------------------------------------------------------------------------
-- function privileges: nothing is executable unless granted here
----------------------------------------------------------------------------------------------------
revoke all on function
  public.is_active_staff(), public.is_manager(), public.submit_booking(jsonb), public.track_booking(text,text),
  public.customer_action(text,text,text,text), public.staff_me(), public.staff_redeem_invite(text,text),
  public.staff_create_invite(text,text), public.staff_revoke_invite(uuid), public.staff_update_member(uuid,text,boolean),
  public.staff_booking_action(uuid,text,jsonb)
from public, anon, authenticated;

grant execute on function public.submit_booking(jsonb), public.track_booking(text,text),
  public.customer_action(text,text,text,text) to anon, authenticated;
grant execute on function public.is_active_staff(), public.is_manager(), public.staff_me(),
  public.staff_redeem_invite(text,text), public.staff_create_invite(text,text), public.staff_revoke_invite(uuid),
  public.staff_update_member(uuid,text,boolean), public.staff_booking_action(uuid,text,jsonb) to authenticated;
