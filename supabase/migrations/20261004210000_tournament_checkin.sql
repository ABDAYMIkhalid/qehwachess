ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS check_in_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS registrations_check_in_token_uidx
  ON public.registrations (check_in_token);

CREATE OR REPLACE FUNCTION public.check_in_tournament_registration(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_registration public.registrations%ROWTYPE;
  target_name text;
  check_in_time timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT r.*
  INTO target_registration
  FROM public.registrations r
  JOIN public.tournaments t ON t.id = r.tournament_id
  WHERE r.check_in_token = p_token
    AND r.status = 'confirmed'
    AND (
      t.organizer_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role = 'admin'
      )
    )
  FOR UPDATE OF r;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No confirmed registration found for this check-in code';
  END IF;

  IF target_registration.checked_in_at IS NOT NULL THEN
    RAISE EXCEPTION 'This participant has already checked in';
  END IF;

  UPDATE public.registrations
  SET checked_in_at = now()
  WHERE id = target_registration.id
  RETURNING checked_in_at INTO check_in_time;

  SELECT p.full_name
  INTO target_name
  FROM public.profiles p
  WHERE p.id = target_registration.player_id;

  RETURN jsonb_build_object(
    'registration_id', target_registration.id,
    'player_name', target_name,
    'checked_in_at', check_in_time
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_in_tournament_registration(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_in_tournament_registration(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
