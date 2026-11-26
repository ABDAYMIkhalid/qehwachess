-- ============================================================================
-- Qehwa Chess — P1: organiser day-of tools + format / time-control split
-- ============================================================================
-- STATUS: UNTESTED DRAFT. Do NOT apply to production. Test first in a
-- dev Supabase project (npx supabase db push) and exercise every
-- section below end-to-end before pushing. See PART-SUMMARY.md.
--
-- Applies AFTER the P0 migration 20261126000000_p0_registration_checkin.sql
-- (same 20261126 timestamp series, +1 second). It assumes the P0 file
-- has run; it does not re-create anything P0 created.
--
-- What this migration does
--   §A  Day-of tools (tournaments table):
--       start_time time, round_schedule jsonb, payment_link text,
--       fee_payment_mode text (pay_at_venue | online_link | free).
--       start_date / end_date are NOT touched: they stay DATE
--       columns. Nothing here converts them to timestamptz and
--       there is no backfill for them, because a date has no
--       time to backfill from — inventing one (e.g. 09:00) would
--       be wrong for existing tournaments. start_time is NULL
--       for pre-P1 rows until the organiser sets it.
--   §B  Format / time-control split (NOTES.md §1):
--       time_control_category text, backfill of format
--       'blitz'/'rapid'/'classical' -> format='swiss' +
--       time_control_category=<that value>, then the format
--       CHECK is tightened to system-only.
--   §C  tournament_announcements table (bulk message to
--       confirmed players — one row per announcement, NOT one
--       DM per player; see the RLS notes in §C).
--
-- What it deliberately does NOT do
--   * No payment-provider integration. payment_link is a URL
--     the organiser pastes in; the app never charges anyone.
--   * No round-robin / knockout / simultaneous generator.
--     Those formats remain un-pairable (the pairings panel
--     still only generates Swiss). The form only offers Swiss
--     as an enabled system; see PATCH-OrganizerDashboard.md.
--   * No change to the check-in expiry (still end_date, see
--     NOTES.md §5). start_time is display/scheduling only in
--     this bundle; wiring check-in expiry to start_time +
--     round_schedule is a separate, tested change.
--   * No change to registrations RLS (NOTES.md §2 — separate
--     follow-up, needs the real policy names).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §A. Day-of columns on tournaments
-- ----------------------------------------------------------------------------

-- Start time of the first day, venue-local wall time (HH:MM).
-- time (not timestamptz): it pairs with the DATE columns, which
-- are also wall dates with no timezone. A timestamptz here
-- would imply a timezone the app does not store.
alter table public.tournaments
  add column if not exists start_time time;

-- Per-round schedule. jsonb array of
--   {"round_number": 1, "day": "2026-12-02", "start_time": "09:30", "label": "Round 1"}
-- Validated by the trigger below (not by a CHECK on jsonb, which
-- cannot express "round_number unique" cleanly). The app also
-- validates client-side; the trigger is the backstop so a bad
-- row cannot be written by any client.
alter table public.tournaments
  add column if not exists round_schedule jsonb;

-- Optional payment URL, shown on the tournament page only when
-- fee_payment_mode = 'online_link'. Validated by the trigger
-- below (must start with https://). http:// is rejected on
-- purpose: a payment link must not be plain-http.
alter table public.tournaments
  add column if not exists payment_link text;

alter table public.tournaments
  add column if not exists fee_payment_mode text
  check (fee_payment_mode in ('pay_at_venue', 'online_link', 'free'));

-- Backfill for §A: pre-P1 rows keep their existing behaviour.
--   * fee_payment_mode: 'free' where entry_fee = 0, otherwise
--     'pay_at_venue' (the only mode the app supported before:
--     the fee was always collected at the venue, because there
--     was no payment link field at all). This is a behaviour-
--     preserving default, not a guess about the organiser.
--   * start_time / round_schedule / payment_link: left NULL.
--     Do NOT backfill start_time with a guessed hour.
update public.tournaments
   set fee_payment_mode = case when coalesce(entry_fee, 0) = 0 then 'free' else 'pay_at_venue' end
 where fee_payment_mode is null;

-- §A validation trigger (round_schedule shape + payment_link).
-- Runs on INSERT and UPDATE; raises on bad data instead of
-- silently storing it.
create or replace function public.validate_tournament_p1_fields()
returns trigger
language plpgsql
as $$
declare
  v_entry jsonb;
  v_seen int[];
  v_round int;
  v_day text;
  v_time text;
begin
  -- payment_link: only meaningful with online_link; a link with
  -- any other mode is a data error, not something to display.
  if new.payment_link is not null then
    if new.fee_payment_mode <> 'online_link' then
      raise exception 'payment_link requires fee_payment_mode = online_link';
    end if;
    if new.payment_link !~ '^https://[^[:space:]]+$' then
      raise exception 'payment_link must be an https:// URL';
    end if;
  end if;

  -- round_schedule: null = no schedule (allowed). Otherwise it
  -- must be a JSON array of objects with a unique 1-based
  -- round_number, a YYYY-MM-DD day inside [start_date, end_date],
  -- and an HH:MM start_time.
  if new.round_schedule is not null then
    if not jsonb_typeof(new.round_schedule) = 'array' then
      raise exception 'round_schedule must be a JSON array';
    end if;
    v_seen := '{}';
    for v_entry in select * from jsonb_array_elements(new.round_schedule) loop
      if not jsonb_typeof(v_entry) = 'object' then
        raise exception 'each round_schedule entry must be an object';
      end if;
      v_round := (v_entry ->> 'round_number')::int;
      if v_round is null or v_round < 1 then
        raise exception 'round_schedule round_number must be >= 1';
      end if;
      if v_round = any (v_seen) then
        raise exception 'round_schedule round_number must be unique';
      end if;
      v_seen := v_seen || v_round;
      v_day := v_entry ->> 'day';
      if v_day !~ '^\d{4}-\d{2}-\d{2}$'
         or v_day::date < new.start_date
         or v_day::date > new.end_date then
        raise exception 'round_schedule day must be a date within start_date..end_date';
      end if;
      v_time := v_entry ->> 'start_time';
      if v_time !~ '^([01]\d|2[0-3]):[0-5]\d$' then
        raise exception 'round_schedule start_time must be HH:MM';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_validate_p1_fields on public.tournaments;
create trigger tournaments_validate_p1_fields
  before insert or update of start_time, round_schedule, payment_link,
    fee_payment_mode, start_date, end_date
  on public.tournaments
  for each row execute function public.validate_tournament_p1_fields();

-- ----------------------------------------------------------------------------
-- §B. Format / time-control split (NOTES.md §1)
-- ----------------------------------------------------------------------------

-- 1. New column, nullable so existing rows stay valid.
alter table public.tournaments
  add column if not exists time_control_category text
  check (time_control_category in ('blitz', 'rapid', 'classical'));

-- 2. Backfill: a tournament whose format was a time control
--    becomes a Swiss tournament with that time control.
--    (Swiss is the only system with a generator today, so it
--    is the honest default. Flag any tournament this touches
--    for the organiser to confirm — see the verification query
--    at the end of this file.)
update public.tournaments
   set time_control_category = 'blitz', format = 'swiss'
 where format = 'blitz';
update public.tournaments
   set time_control_category = 'rapid', format = 'swiss'
 where format = 'rapid';
update public.tournaments
   set time_control_category = 'classical', format = 'swiss'
 where format = 'classical';

-- 3. Tighten the format CHECK to system-only. The constraint
--    name differs per database, so find it instead of guessing.
--    VERIFY THIS IN DEV FIRST (NOTES.md §1): the DO block below
--    only drops a constraint whose definition mentions both
--    'format' and 'blitz'. If the v2 migration named the
--    constraint explicitly, use that name directly instead.
--    After the backfill, no row may have format in
--    ('blitz', 'rapid', 'classical') — the guard below raises
--    before adding the new CHECK, so a missed row fails the
--    migration loudly instead of failing the CHECK halfway.
do $$
declare
  v_constraint text;
  v_leftover int;
begin
  select count(*) into v_leftover
    from public.tournaments
   where format in ('blitz', 'rapid', 'classical');
  if v_leftover > 0 then
    raise exception 'P1 format split: % tournament(s) still have a time-control format; backfill did not cover them', v_leftover;
  end if;

  select conname into v_constraint
    from pg_constraint
   where conrelid = 'public.tournaments'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) like '%format%'
     and pg_get_constraintdef(oid) like '%blitz%';
  if v_constraint is not null then
    execute format(
      'alter table public.tournaments drop constraint %I',
      v_constraint
    );
  end if;
end $$;

alter table public.tournaments
  add constraint tournaments_format_system_check
  check (format in ('swiss', 'round-robin', 'knockout', 'simultaneous'));

-- ----------------------------------------------------------------------------
-- §C. tournament_announcements — bulk message to confirmed players
-- ----------------------------------------------------------------------------
-- Design decision (see PART-SUMMARY.md): one row per announcement,
-- shown on the tournament page to confirmed players (and the
-- organiser/admin). NOT one community_messages row per player:
-- community_messages is 1-to-1 / meetup chat (sender_id,
-- recipient_id, meetup_id; no tournament_id column — verified
-- against MessagesPage.tsx on main, SHA 77e94747…), so a
-- broadcast there would be N DM inserts and N notifications.
-- There is no push/email notification in this bundle: the
-- announcement is visible on the tournament page, which is
-- where confirmed players already go for the QR code and
-- pairings. Adding notifications is a separate piece of work.
create table if not exists public.tournament_announcements (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 2000),
  created_at timestamptz not null default now()
);

create index if not exists tournament_announcements_tournament_idx
  on public.tournament_announcements (tournament_id, created_at desc);

alter table public.tournament_announcements enable row level security;

-- Read: the tournament organiser, admins, and players with a
-- CONFIRMED registration for that tournament. Anyone else
-- (including waitlisted / pending players) sees nothing.
-- NOTE: the admin check below assumes the same convention as
-- the rest of the schema (profiles.role = 'admin'). If the
-- live schema gates admin differently, adjust this policy
-- against the real profiles table before pushing — do not
-- guess, and test with a non-organiser confirmed player, a
-- waitlisted player, and a stranger.
drop policy if exists "tournament_announcements_read" on public.tournament_announcements;
create policy "tournament_announcements_read"
  on public.tournament_announcements for select
  using (
    exists (select 1 from public.tournaments t
             where t.id = tournament_id
               and t.organizer_id = auth.uid())
    or exists (select 1 from public.profiles p
                where p.id = auth.uid() and p.role = 'admin')
    or exists (select 1 from public.registrations r
                where r.tournament_id = tournament_announcements.tournament_id
                  and r.player_id = auth.uid()
                  and r.status = 'confirmed')
  );

-- Insert: only the tournament organiser (or an admin). The
-- client must NOT be able to insert as someone else: sender_id
-- is forced to the caller by the WITH CHECK below, and the
-- component also sets sender_id = user.id explicitly.
drop policy if exists "tournament_announcements_insert" on public.tournament_announcements;
create policy "tournament_announcements_insert"
  on public.tournament_announcements for insert
  with check (
    sender_id = auth.uid()
    and (
      exists (select 1 from public.tournaments t
               where t.id = tournament_id
                 and t.organizer_id = auth.uid())
      or exists (select 1 from public.profiles p
                  where p.id = auth.uid() and p.role = 'admin')
    )
  );

-- No UPDATE / DELETE policies: announcements are append-only
-- in this bundle. (An edit/delete UI would need its own
-- policies; do not add them by enabling all operations.)

-- ----------------------------------------------------------------------------
-- Verification queries (run in dev after pushing; do not ship
-- their output as a migration step)
-- ----------------------------------------------------------------------------
-- select format, time_control_category, count(*) from public.tournaments group by 1, 2;
--   -- expect: no format in ('blitz','rapid','classical'); the
--   -- backfilled rows show format='swiss' with a category set.
-- select id, title, format, time_control_category, start_time, fee_payment_mode
--   from public.tournaments where format in ('blitz','rapid','classical');
--   -- expect: 0 rows.
-- select id, title from public.tournaments
--  where time_control_category is not null and format <> 'swiss';
--   -- expect: 0 rows (backfill only ever produced swiss).
-- insert into public.tournament_announcements (tournament_id, sender_id, body)
--   values ('<tournament>', '<organiser>', 'test');
--   -- as a confirmed player: select from the table (expect 1 row);
--   -- as a waitlisted player / stranger: expect 0 rows.
--   -- as a non-organiser: insert must fail (RLS).
