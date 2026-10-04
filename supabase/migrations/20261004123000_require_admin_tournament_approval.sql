CREATE OR REPLACE FUNCTION public.require_admin_tournament_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT role INTO actor_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF actor_role = 'organizer' AND NEW.status = 'published' THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Tournament must be approved by an administrator before publishing.'
        USING ERRCODE = '42501';
    ELSIF OLD.status IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'Tournament must be approved by an administrator before publishing.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS require_admin_tournament_approval ON public.tournaments;
CREATE TRIGGER require_admin_tournament_approval
BEFORE INSERT OR UPDATE OF status ON public.tournaments
FOR EACH ROW
EXECUTE FUNCTION public.require_admin_tournament_approval();
