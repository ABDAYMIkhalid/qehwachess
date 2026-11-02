CREATE OR REPLACE FUNCTION public.get_tournament_registration_count(p_tournament_id uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::bigint
  FROM public.registrations r
  WHERE r.tournament_id = p_tournament_id
    AND r.status <> 'cancelled'
    AND EXISTS (
      SELECT 1
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
        )
    );
$$;

REVOKE ALL ON FUNCTION public.get_tournament_registration_count(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tournament_registration_count(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
