create table if not exists public.registration_settings (
  id boolean primary key default true check (id),
  invite_required boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.registration_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.registration_invite_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique check (code_hash ~ '^[0-9a-f]{64}$'),
  code_hint text not null,
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.registration_invite_reservations (
  id uuid primary key default gen_random_uuid(),
  invite_code_id uuid not null references public.registration_invite_codes(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '5 minutes',
  created_at timestamptz not null default now()
);

create table if not exists public.registration_email_challenges (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(trim(email))),
  code_hash text not null check (code_hash ~ '^[0-9a-f]{64}$'),
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  verified_at timestamptz,
  verification_token_hash text unique check (verification_token_hash is null or verification_token_hash ~ '^[0-9a-f]{64}$'),
  verification_expires_at timestamptz,
  reserved_at timestamptz,
  reservation_id uuid,
  completed_at timestamptz,
  user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists registration_email_challenges_email_idx
  on public.registration_email_challenges (email, created_at desc);

create table if not exists public.auth_rate_limit_events (
  id bigint generated always as identity primary key,
  scope text not null,
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);
create index if not exists auth_rate_limit_events_lookup_idx
  on public.auth_rate_limit_events (scope, key_hash, created_at desc);

alter table public.registration_settings enable row level security;
alter table public.registration_invite_codes enable row level security;
alter table public.registration_invite_reservations enable row level security;
alter table public.registration_email_challenges enable row level security;
alter table public.auth_rate_limit_events enable row level security;
revoke all on table public.registration_settings from public, anon, authenticated;
revoke all on table public.registration_invite_codes from public, anon, authenticated;
revoke all on table public.registration_invite_reservations from public, anon, authenticated;
revoke all on table public.registration_email_challenges from public, anon, authenticated;
revoke all on table public.auth_rate_limit_events from public, anon, authenticated;

create or replace function public.verify_registration_email_code(
  p_email text,
  p_code_hash text,
  p_verification_token_hash text,
  p_verification_expires_at timestamptz
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_challenge public.registration_email_challenges%rowtype;
begin
  select * into v_challenge from public.registration_email_challenges
   where email = lower(trim(p_email)) and completed_at is null and verified_at is null
     and expires_at > now() and attempts < 5
   order by created_at desc limit 1 for update;
  if not found then return false; end if;
  update public.registration_email_challenges set attempts = attempts + 1 where id = v_challenge.id;
  if v_challenge.code_hash <> p_code_hash then return false; end if;
  update public.registration_email_challenges
     set verified_at = now(), verification_token_hash = p_verification_token_hash,
         verification_expires_at = p_verification_expires_at
   where id = v_challenge.id;
  return true;
end; $$;

create or replace function public.reserve_registration_session(p_token_hash text)
returns table (challenge_id uuid, email text, reservation_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_challenge public.registration_email_challenges%rowtype; v_reservation uuid := gen_random_uuid();
begin
  select * into v_challenge from public.registration_email_challenges
   where verification_token_hash = p_token_hash for update;
  if not found or v_challenge.verified_at is null or v_challenge.completed_at is not null
     or v_challenge.verification_expires_at <= now()
     or (v_challenge.reserved_at is not null and v_challenge.reserved_at > now() - interval '5 minutes')
  then return; end if;
  update public.registration_email_challenges
     set reserved_at = now(), reservation_id = v_reservation where id = v_challenge.id;
  return query select v_challenge.id, v_challenge.email, v_reservation;
end; $$;

create or replace function public.reserve_registration_invite(p_code_hash text)
returns table (invite_code_id uuid, reservation_id uuid)
language plpgsql security definer set search_path = public as $$
declare v_code public.registration_invite_codes%rowtype; v_reservation uuid;
begin
  delete from public.registration_invite_reservations where expires_at <= now();
  select * into v_code from public.registration_invite_codes where code_hash = p_code_hash for update;
  if not found or v_code.revoked_at is not null
     or (v_code.expires_at is not null and v_code.expires_at <= now())
     or (v_code.max_uses is not null and v_code.use_count +
       (select count(*) from public.registration_invite_reservations as r where r.invite_code_id = v_code.id) >= v_code.max_uses)
  then return; end if;
  insert into public.registration_invite_reservations (invite_code_id)
  values (v_code.id) returning id into v_reservation;
  return query select v_code.id, v_reservation;
end; $$;

create or replace function public.complete_registration(
  p_challenge_id uuid, p_challenge_reservation_id uuid, p_user_id uuid,
  p_invite_code_id uuid default null, p_invite_reservation_id uuid default null
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.registration_email_challenges
     set completed_at = now(), reservation_id = null, user_id = p_user_id
   where id = p_challenge_id and completed_at is null and reservation_id = p_challenge_reservation_id;
  if not found then return false; end if;
  if p_invite_code_id is not null then
    perform 1 from public.registration_invite_codes
     where id = p_invite_code_id and revoked_at is null
       and (expires_at is null or expires_at > now())
     for update;
    if not found then
      raise exception 'REGISTRATION_CONFLICT' using errcode = 'P0001';
    end if;
    delete from public.registration_invite_reservations
     where id = p_invite_reservation_id and invite_code_id = p_invite_code_id;
    if not found then
      raise exception 'REGISTRATION_CONFLICT' using errcode = 'P0001';
    end if;
    update public.registration_invite_codes
       set use_count = use_count + 1, updated_at = now() where id = p_invite_code_id;
  end if;
  return true;
end; $$;

create or replace function public.release_registration_reservations(
  p_challenge_id uuid, p_challenge_reservation_id uuid,
  p_invite_reservation_id uuid default null
)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.registration_email_challenges set reserved_at = null, reservation_id = null
   where id = p_challenge_id and completed_at is null and reservation_id = p_challenge_reservation_id;
  if p_invite_reservation_id is not null then
    delete from public.registration_invite_reservations where id = p_invite_reservation_id;
  end if;
end; $$;

create or replace function public.record_auth_rate_limit_event(
  p_scope text, p_key_hash text, p_limit integer, p_window_seconds integer
)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key_hash, 0));
  delete from public.auth_rate_limit_events where created_at < now() - interval '24 hours';
  select count(*) into v_count from public.auth_rate_limit_events
   where scope = p_scope and key_hash = p_key_hash
     and created_at >= now() - make_interval(secs => p_window_seconds);
  if v_count >= p_limit then return false; end if;
  insert into public.auth_rate_limit_events (scope, key_hash) values (p_scope, p_key_hash);
  return true;
end; $$;

revoke execute on function public.verify_registration_email_code(text,text,text,timestamptz) from public, anon, authenticated;
revoke execute on function public.reserve_registration_session(text) from public, anon, authenticated;
revoke execute on function public.reserve_registration_invite(text) from public, anon, authenticated;
revoke execute on function public.complete_registration(uuid,uuid,uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.release_registration_reservations(uuid,uuid,uuid) from public, anon, authenticated;
revoke execute on function public.record_auth_rate_limit_event(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.verify_registration_email_code(text,text,text,timestamptz) to service_role;
grant execute on function public.reserve_registration_session(text) to service_role;
grant execute on function public.reserve_registration_invite(text) to service_role;
grant execute on function public.complete_registration(uuid,uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.release_registration_reservations(uuid,uuid,uuid) to service_role;
grant execute on function public.record_auth_rate_limit_event(text,text,integer,integer) to service_role;
