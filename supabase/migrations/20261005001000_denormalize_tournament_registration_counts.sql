ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS registration_count integer NOT NULL DEFAULT 0
  CHECK (registration_count >= 0);

CREATE OR REPLACE FUNCTION public.sync_tournament_registration_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'cancelled' THEN
      UPDATE public.tournaments
      SET registration_count = registration_count + 1
      WHERE id = NEW.tournament_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'cancelled' THEN
      UPDATE public.tournaments
      SET registration_count = GREATEST(0, registration_count - 1)
      WHERE id = OLD.tournament_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.tournament_id = NEW.tournament_id THEN
    IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
      UPDATE public.tournaments
      SET registration_count = registration_count + 1
      WHERE id = NEW.tournament_id;
    ELSIF OLD.status <> 'cancelled' AND NEW.status = 'cancelled' THEN
      UPDATE public.tournaments
      SET registration_count = GREATEST(0, registration_count - 1)
      WHERE id = OLD.tournament_id;
    END IF;
  ELSE
    IF OLD.status <> 'cancelled' THEN
      UPDATE public.tournaments
      SET registration_count = GREATEST(0, registration_count - 1)
      WHERE id = OLD.tournament_id;
    END IF;
    IF NEW.status <> 'cancelled' THEN
      UPDATE public.tournaments
      SET registration_count = registration_count + 1
      WHERE id = NEW.tournament_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_tournament_registration_count ON public.registrations;
CREATE TRIGGER sync_tournament_registration_count
AFTER INSERT OR UPDATE OF tournament_id, status OR DELETE
ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.sync_tournament_registration_count();

UPDATE public.tournaments t
SET registration_count = (
  SELECT count(*)::integer
  FROM public.registrations r
  WHERE r.tournament_id = t.id
    AND r.status <> 'cancelled'
);

CREATE OR REPLACE FUNCTION public.get_tournament_registration_count(p_tournament_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
  SELECT t.registration_count::bigint
  FROM public.tournaments t
  WHERE t.id = p_tournament_id
    AND (
      t.status = 'published'
      OR t.organizer_id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
      )
    );
$$;

NOTIFY pgrst, 'reload schema';
