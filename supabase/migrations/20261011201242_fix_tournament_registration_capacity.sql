-- Publish only an aggregate. Registration rows and check-in tokens stay under RLS.
CREATE OR REPLACE FUNCTION public.get_tournament_registration_count(p_tournament_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)::integer
  FROM public.registrations r
  WHERE r.tournament_id = p_tournament_id AND r.status = 'confirmed'
    AND EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = p_tournament_id
        AND (t.status = 'published' OR t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
    );
$$;

REVOKE ALL ON FUNCTION public.get_tournament_registration_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_registration_count(uuid) TO anon, authenticated;

-- Serialize admissions to the same tournament, including stale client requests.
-- Waitlisted and cancelled records do not consume confirmed seats.
CREATE OR REPLACE FUNCTION public.enforce_tournament_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  capacity integer;
  confirmed_count integer;
BEGIN
  SELECT t.max_participants INTO capacity
  FROM public.tournaments t WHERE t.id = NEW.tournament_id
  FOR UPDATE;

  IF NEW.status = 'confirmed' THEN
    SELECT count(*) INTO confirmed_count FROM public.registrations r
    WHERE r.tournament_id = NEW.tournament_id AND r.status = 'confirmed' AND r.id <> NEW.id;
    IF confirmed_count >= capacity THEN
      NEW.status := 'waitlisted';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_tournament_capacity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER enforce_tournament_capacity
BEFORE INSERT OR UPDATE OF status, tournament_id ON public.registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_tournament_capacity();

CREATE INDEX registrations_confirmed_tournament_idx ON public.registrations(tournament_id)
WHERE status = 'confirmed';

NOTIFY pgrst, 'reload schema';
