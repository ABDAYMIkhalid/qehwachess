-- Run after migrations in a test database. All fixtures roll back.
BEGIN;
DO $$
DECLARE
  p1 uuid := gen_random_uuid();
  p2 uuid := gen_random_uuid();
  organizer uuid := gen_random_uuid();
  tournament uuid := gen_random_uuid();
  draft_tournament uuid := gen_random_uuid();
  city uuid;
  actual_status text;
BEGIN
  SELECT id INTO city FROM public.cities LIMIT 1;
  INSERT INTO public.profiles(id, full_name, email, role) VALUES
    (p1, 'Registration test player 1', 'player1@example.invalid', 'player'),
    (p2, 'Registration test player 2', 'player2@example.invalid', 'player'),
    (organizer, 'Registration test organizer', 'organizer@example.invalid', 'organizer');
  INSERT INTO public.tournaments(id, title, description, city_id, organizer_id, start_date, end_date, venue, format, max_participants, status) VALUES
    (tournament, 'Capacity regression test', '', city, organizer, current_date + 7, current_date + 7, 'Test venue', 'rapid', 1, 'published'),
    (draft_tournament, 'Private capacity test', '', city, organizer, current_date + 7, current_date + 7, 'Test venue', 'rapid', 1, 'draft');

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', p1::text, true);
  INSERT INTO public.registrations(tournament_id, player_id, status) VALUES(tournament, p1, 'confirmed');

  PERFORM set_config('request.jwt.claim.sub', p2::text, true);
  INSERT INTO public.registrations(tournament_id, player_id, status) VALUES(tournament, p2, 'confirmed') RETURNING status INTO actual_status;
  IF actual_status <> 'waitlisted' THEN RAISE EXCEPTION 'A full tournament must waitlist the next player'; END IF;
  IF (SELECT count(*) FROM public.registrations WHERE tournament_id = tournament) <> 1 THEN
    RAISE EXCEPTION 'Players must only see their own registration';
  END IF;
  IF public.get_tournament_registration_count(tournament) <> 1 THEN RAISE EXCEPTION 'Waitlisted players must not consume a seat'; END IF;

  PERFORM set_config('request.jwt.claim.sub', p1::text, true);
  UPDATE public.registrations SET status = 'cancelled' WHERE tournament_id = tournament AND player_id = p1;
  IF public.get_tournament_registration_count(tournament) <> 0 THEN RAISE EXCEPTION 'Cancellation must free a seat'; END IF;
  UPDATE public.registrations SET status = 'confirmed', checked_in_at = NULL WHERE tournament_id = tournament AND player_id = p1;
  IF public.get_tournament_registration_count(tournament) <> 1 THEN RAISE EXCEPTION 'Re-registration must reuse the cancelled row'; END IF;

  PERFORM set_config('role', 'postgres', true);
  INSERT INTO public.registrations(tournament_id, player_id, status) VALUES(draft_tournament, p1, 'confirmed');
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  IF public.get_tournament_registration_count(tournament) <> 1 THEN RAISE EXCEPTION 'Public count must include hidden registrations'; END IF;
  IF public.get_tournament_registration_count(draft_tournament) <> 0 THEN RAISE EXCEPTION 'Private tournament counts must stay private'; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations WHERE tournament_id = tournament) THEN RAISE EXCEPTION 'Public aggregate must not expose registration records'; END IF;

  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claim.sub', organizer::text, true);
  IF public.get_tournament_registration_count(draft_tournament) <> 1 THEN RAISE EXCEPTION 'Organizer must see their own private count'; END IF;
  PERFORM set_config('role', 'postgres', true);
END;
$$;
SELECT 'registration capacity, cancellation, re-registration, and RLS checks passed' AS result;
ROLLBACK;
