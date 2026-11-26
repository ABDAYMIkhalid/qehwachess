-- ============================================================================
-- Qehwa Chess — P0: atomic registration, waitlist promotion, single-use
-- check-in with expiry
-- ============================================================================
-- STATUS: UNTESTED. Do NOT apply to production.
-- v2 (2026-11-26 review fixes): registered_at (not created_at),
-- re-register resets registered_at, player-only register check,
-- generic check-in error until organizer check passes,
-- missing-tournament check, NOTIFY pgrst reload.
-- Test first in a dev Supabase project:
--   npx supabase db push
-- and exercise register / cancel / check-in end-to-end (including two
-- simultaneous registrations for the last spot) before pushing.
--
-- What this migration does
--   1. register_for_tournament() — one RPC that registers the caller
--      atomically: locks the tournament row, counts CONFIRMED
--      registrations, returns 'confirmed' or 'waitlisted'.
--   2. cancel_tournament_registration() — cancels and promotes the
--      earliest waitlisted player to 'confirmed' in the same
--      transaction.
--   3. A BEFORE INSERT OR UPDATE trigger that refuses a 'confirmed'
--      registration over max_participants, so even a direct client
--      insert cannot overfill a tournament (defence in depth).
--   4. A tournament_checkins log table (one row per registration)
--      and an EXTENDED check_in_tournament_registration() that
--      rejects a second check-in AND rejects check-in after the
--      tournament end_date.
--
-- What it deliberately does NOT do
--   * It does not change the registrations UPDATE RLS policy.
--     After this migration the frontend must use the RPCs (see
--     PATCH-TournamentDetail.md). A direct client-side
--     `.update({ status: 'cancelled' })` will still cancel the row
--     but will NOT promote anyone from the waitlist, because
--     promotion lives in cancel_tournament_registration().
--     Tightening the RLS policy so status can only change via
--     these RPCs is a follow-up — see NOTES.md. Do not claim
--     capacity is enforced for every possible client until that
--     follow-up lands.
--   * It does not add a rating snapshot to registrations. The old
--     client code inserted a `rating` value; the RPC leaves it
--     NULL. If a rating snapshot is needed, add a parameter to
--     register_for_tournament() in a later migration.
--   * check_in_tournament_registration() below is a
--     CREATE OR REPLACE of the function created in
--     20261004210000_tournament_checkin.sql. Before pushing,
--     diff it against that file: the name, argument name
--     (p_token uuid), return type (jsonb) and return shape
--     {registration_id, player_name, checked_in_at} are kept
--     identical on purpose. If the original differs in any of
--     those, adjust this file instead of shipping a second
--     function with a different name.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Safety nets: columns / tables this migration assumes exist
-- ----------------------------------------------------------------------------

-- checked_in_at already exists on registrations in the check-in
-- migration; add it only if a dev database is missing it.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

-- check_in_token already exists (the QR code is the raw UUID).
-- Add it only if missing, so a fresh dev DB still works.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS check_in_token uuid DEFAULT gen_random_uuid();

-- The functions below set updated_at on registrations. Add the
-- column only if a dev database is missing it, so the migration
-- cannot fail on a column that was never created.
ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- ----------------------------------------------------------------------------
-- 1. register_for_tournament(p_tournament_id uuid) -> jsonb
-- ----------------------------------------------------------------------------
-- Atomicity: the function locks the tournament row FOR UPDATE
-- first. Every concurrent call for the same tournament waits on
-- that lock, so the confirmed-count check and the insert cannot
-- interleave — two people racing for the last spot cannot both
-- get 'confirmed'. Locking per tournament (not the whole table)
-- keeps different tournaments independent.
--
-- Returns: {"registration_id": uuid, "status": "confirmed"|"waitlisted"}
-- Raises:  'Tournament not found', 'Tournament is not open for
--          registration' (status is not 'published'),
--          'Registration is closed' (past registration_deadline),
--          or the caller's auth error.
-- Idempotent: if the caller already has a non-cancelled
-- registration, the existing one is returned unchanged.
-- If they previously cancelled, the old row is re-used and
-- re-evaluated against capacity (new token, new timestamp).
-- ----------------------------------------------------------------------------

create or replace function public.register_for_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tournament record;
  v_confirmed_count integer;
  v_registration record;
  v_has_registration boolean := false;
  v_status text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Only player accounts can register (matches the old frontend
  -- check in TournamentDetailPage.handleRegister). Organizers /
  -- admins cannot register as players, including for their own
  -- tournament.
  if not exists (
    select 1 from public.profiles p
     where p.id = v_user_id and p.role = 'player'
  ) then
    raise exception 'Only player accounts can register for tournaments';
  end if;

  -- Lock the tournament row: this serialises registrations
  -- for this tournament (see header comment).
  select id, status, max_participants, registration_deadline
    into v_tournament
    from public.tournaments
   where id = p_tournament_id
     for update;

  if not found then
    raise exception 'Tournament not found';
  end if;

  if v_tournament.status <> 'published' then
    raise exception 'Tournament is not open for registration';
  end if;

  if v_tournament.registration_deadline is not null
     and v_tournament.registration_deadline < current_date then
    raise exception 'Registration is closed';
  end if;

  -- Existing registration? Return it (idempotent re-register).
  -- NOTE: capture the result in v_has_registration immediately.
  -- FOUND is clobbered by the count(*) query below (an aggregate
  -- always returns a row), so it must not be relied on later.
  select id, status
    into v_registration
    from public.registrations
   where tournament_id = p_tournament_id
     and player_id = v_user_id
     for update;
  v_has_registration := found;

  if v_has_registration and v_registration.status <> 'cancelled' then
    return jsonb_build_object(
      'registration_id', v_registration.id,
      'status', v_registration.status
    );
  end if;

  -- Confirmed only — waitlisted / pending do NOT take a spot.
  select count(*)
    into v_confirmed_count
    from public.registrations
   where tournament_id = p_tournament_id
     and status = 'confirmed';

  if v_tournament.max_participants is null
     or v_confirmed_count < v_tournament.max_participants then
    v_status := 'confirmed';
  else
    v_status := 'waitlisted';
  end if;

  if v_has_registration then
    -- Re-register after a previous cancellation: re-use the row,
    -- fresh token, cleared check-in.
    update public.registrations
       set status = v_status,
           check_in_token = gen_random_uuid(),
           checked_in_at = null,
           registered_at = now(),
           updated_at = now()
     where id = v_registration.id
     returning id, status into v_registration;
  else
    insert into public.registrations
      (tournament_id, player_id, status, check_in_token)
    values
      (p_tournament_id, v_user_id, v_status, gen_random_uuid())
    returning id, status into v_registration;
  end if;

  return jsonb_build_object(
    'registration_id', v_registration.id,
    'status', v_registration.status
  );
end;
$$;

revoke all on function public.register_for_tournament(uuid) from public;
grant execute on function public.register_for_tournament(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. cancel_tournament_registration(p_registration_id uuid) -> jsonb
-- ----------------------------------------------------------------------------
-- Cancels the caller's registration (or an organiser/admin's
-- cancellation of any registration for their tournament) and
-- promotes the earliest waitlisted player in the same
-- transaction, so a freed spot is never lost and never
-- double-filled.
--
-- Returns: {"registration_id": uuid, "status": "cancelled",
--           "promoted_registration_id": uuid | null}
-- "Earliest" = oldest registered_at, tie-broken by id.
-- Idempotent: cancelling an already-cancelled registration
-- returns it without promoting anyone again.
-- ----------------------------------------------------------------------------

create or replace function public.cancel_tournament_registration(p_registration_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration record;
  v_tournament record;
  v_is_manager boolean := false;
  v_promoted_id uuid := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Read the registration without a lock first, only to learn
  -- which tournament it belongs to.
  select r.id, r.tournament_id, r.player_id, r.status
    into v_registration
    from public.registrations r
   where r.id = p_registration_id;

  if not found then
    raise exception 'Registration not found';
  end if;

  -- Lock the tournament row FIRST (same lock order as
  -- register_for_tournament: tournament, then registration)
  -- to avoid deadlocks between the two functions.
  select t.id, t.organizer_id
    into v_tournament
    from public.tournaments t
   where t.id = v_registration.tournament_id
     for update;

  -- Now lock the registration row itself.
  select r.id, r.tournament_id, r.player_id, r.status
    into v_registration
    from public.registrations r
   where r.id = p_registration_id
     for update of r;

  -- Who may cancel: the player themselves, the tournament
  -- organiser, or an admin.
  v_is_manager :=
    v_registration.player_id = v_user_id
    or v_tournament.organizer_id = v_user_id
    or exists (
      select 1 from public.profiles p
       where p.id = v_user_id and p.role = 'admin'
    );

  if not v_is_manager then
    raise exception 'Not allowed to cancel this registration';
  end if;

  if v_registration.status = 'cancelled' then
    return jsonb_build_object(
      'registration_id', v_registration.id,
      'status', 'cancelled',
      'promoted_registration_id', null
    );
  end if;

  update public.registrations
     set status = 'cancelled',
         updated_at = now()
   where id = v_registration.id;

  -- Promote the earliest waitlisted player, if the cancelled
  -- registration was taking a confirmed spot. (If it was
  -- waitlisted itself, no spot was freed — but promoting the
  -- next waitlisted player would overfill, so only promote
  -- when a confirmed spot was freed.)
  if v_registration.status = 'confirmed' then
    -- Two steps on purpose: FOR UPDATE is not allowed inside
    -- a subquery of an UPDATE, so pick the row first, then
    -- update it.
    select id
      into v_promoted_id
      from public.registrations
     where tournament_id = v_registration.tournament_id
       and status = 'waitlisted'
     order by registered_at asc, id asc
     limit 1
       for update skip locked;

    if v_promoted_id is not null then
      update public.registrations
         set status = 'confirmed',
             updated_at = now()
       where id = v_promoted_id;
    end if;
  end if;

  return jsonb_build_object(
    'registration_id', v_registration.id,
    'status', 'cancelled',
    'promoted_registration_id', v_promoted_id
  );
end;
$$;

revoke all on function public.cancel_tournament_registration(uuid) from public;
grant execute on function public.cancel_tournament_registration(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Defence in depth: refuse a 'confirmed' registration over capacity
-- ----------------------------------------------------------------------------
-- This trigger fires on direct inserts / updates as well as on
-- the RPCs above, so a client that still inserts directly (or a
-- future bug) cannot silently overfill a tournament — it gets
-- an error instead. It only blocks 'confirmed'; 'waitlisted'
-- rows are always allowed. Promotion in (2) runs after the
-- cancellation, so the confirmed count is already back under
-- capacity when the promoted row is updated.
-- ----------------------------------------------------------------------------

create or replace function public.enforce_registration_capacity()
returns trigger
language plpgsql
as $$
declare
  v_max integer;
  v_confirmed integer;
begin
  if new.status <> 'confirmed' then
    return new;
  end if;

  -- Lock the tournament row so two concurrent inserts cannot
  -- both pass the count check (same pattern as the RPC).
  select max_participants
    into v_max
    from public.tournaments
   where id = new.tournament_id
     for update;

  if v_max is null then
    return new;
  end if;

  select count(*)
    into v_confirmed
    from public.registrations
   where tournament_id = new.tournament_id
     and status = 'confirmed'
     and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if v_confirmed >= v_max then
    raise exception 'Tournament is full';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_registration_capacity on public.registrations;
create trigger trg_enforce_registration_capacity
  before insert or update of status on public.registrations
  for each row
  execute function public.enforce_registration_capacity();

-- ----------------------------------------------------------------------------
-- 4. Check-in log table (single-use, auditable)
-- ----------------------------------------------------------------------------
-- One row per registration, enforced by the UNIQUE constraint.
-- The log records WHO scanned the code and WHEN, so a disputed
-- check-in can be investigated. The RPC in (5) is the only
-- writer the app uses; RLS is enabled and no permissive
-- policy is added here — add a read policy for organisers/
-- admins in a follow-up if the UI needs to list check-ins.
-- ----------------------------------------------------------------------------

create table if not exists public.tournament_checkins (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null
    references public.registrations (id) on delete cascade,
  checked_in_at timestamptz not null default now(),
  checked_in_by uuid references auth.users (id),
  unique (registration_id)
);

alter table public.tournament_checkins enable row level security;

create index if not exists tournament_checkins_registration_id_idx
  on public.tournament_checkins (registration_id);

-- Backfill: any registration already marked checked_in_at in
-- the old flow gets a log row, so the UNIQUE constraint and
-- the new RPC agree about what "already checked in" means.
-- checked_in_by is unknown for those rows — leave it NULL.
insert into public.tournament_checkins (registration_id, checked_in_at)
select id, checked_in_at
  from public.registrations
 where checked_in_at is not null
    on conflict (registration_id) do nothing;

-- ----------------------------------------------------------------------------
-- 5. Extend check_in_tournament_registration(p_token uuid) -> jsonb
-- ----------------------------------------------------------------------------
-- SAME name, SAME argument, SAME return shape as the original
-- (20261004210000_tournament_checkin.sql):
--   {"registration_id": uuid, "player_name": text,
--    "checked_in_at": timestamptz}
-- Kept behaviour: caller must be the tournament organiser or
-- an admin; a second check-in is rejected; the registration
-- row is locked FOR UPDATE.
--
-- NEW behaviour:
--   * Check-in is rejected after the tournament end_date
--     (end_date is a date, so the token is valid through the
--     end of that day: end_date < current_date means expired).
--   * A row is written to tournament_checkins. The UNIQUE
--     constraint on registration_id is a second, DB-level
--     guard against a double check-in racing the
--     checked_in_at check.
-- ----------------------------------------------------------------------------

create or replace function public.check_in_tournament_registration(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_registration record;
  v_tournament record;
  v_player_name text;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Lock the registration row first, as the original did.
  select r.id, r.tournament_id, r.player_id, r.status, r.checked_in_at
    into v_registration
    from public.registrations r
   where r.check_in_token = p_token
     for update of r;

  if not found then
    raise exception 'No confirmed registration found for this check-in code';
  end if;

  select t.id, t.organizer_id, t.end_date
    into v_tournament
    from public.tournaments t
   where t.id = v_registration.tournament_id;

  if not found then
    raise exception 'No confirmed registration found for this check-in code';
  end if;

  -- Only the organiser of this tournament, or an admin,
  -- may check people in. Until this check passes, use the same
  -- generic error as for an invalid token, so a non-organizer
  -- cannot probe whether a token exists or what its status is.
  -- Specific errors below are only seen by the organiser/admin.
  if v_tournament.organizer_id is null
     or (v_tournament.organizer_id <> v_user_id
     and not exists (
       select 1 from public.profiles p
        where p.id = v_user_id and p.role = 'admin'
     )) then
    raise exception 'No confirmed registration found for this check-in code';
  end if;

  if v_registration.status <> 'confirmed' then
    raise exception 'Only confirmed registrations can be checked in';
  end if;

  -- NEW: token expires after the tournament end date.
  if v_tournament.end_date is not null
     and v_tournament.end_date < current_date then
    raise exception 'Check-in has closed for this tournament';
  end if;

  -- Existing single-use guard, kept verbatim in meaning.
  if v_registration.checked_in_at is not null then
    raise exception 'This participant has already checked in';
  end if;

  select full_name into v_player_name
    from public.profiles
   where id = v_registration.player_id;

  update public.registrations
     set checked_in_at = v_now,
         updated_at = v_now
   where id = v_registration.id;

  -- Log row: UNIQUE(registration_id) makes a racing second
  -- check-in fail here even if it slipped past the check above.
  insert into public.tournament_checkins (registration_id, checked_in_at, checked_in_by)
  values (v_registration.id, v_now, v_user_id);

  return jsonb_build_object(
    'registration_id', v_registration.id,
    'player_name', coalesce(v_player_name, 'Player'),
    'checked_in_at', v_now
  );
end;
$$;

revoke all on function public.check_in_tournament_registration(uuid) from public;
grant execute on function public.check_in_tournament_registration(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- Manual test checklist (dev project only — see SUMMARY.md):
--   1. Two accounts race for the last spot: exactly one 'confirmed',
--      the other 'waitlisted'.
--   2. Cancel the confirmed registration: earliest waitlisted
--      becomes 'confirmed'; promoted_registration_id is returned.
--   3. Cancel a waitlisted registration: nobody is promoted.
--   4. Check in once: succeeds. Check in again with the same
--      token: 'already checked in'. A row exists in
--      tournament_checkins.
--   5. Check in for a tournament whose end_date is yesterday:
--      'Check-in has closed'.
--   6. A player (not organiser/admin) calling the check-in RPC:
--      rejected.
-- ============================================================================
