CREATE TABLE IF NOT EXISTS public.club_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, name)
);

CREATE TABLE IF NOT EXISTS public.club_team_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.club_teams(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT club_team_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE (team_id, profile_id)
);

CREATE INDEX IF NOT EXISTS club_teams_club_idx ON public.club_teams (club_id);
CREATE INDEX IF NOT EXISTS club_team_memberships_profile_idx ON public.club_team_memberships (profile_id);
CREATE INDEX IF NOT EXISTS club_team_memberships_team_idx ON public.club_team_memberships (team_id);

ALTER TABLE public.club_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_team_memberships ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.club_teams TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.club_teams TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.club_team_memberships TO authenticated;

DROP POLICY IF EXISTS "Anyone can view club teams" ON public.club_teams;
CREATE POLICY "Anyone can view club teams"
  ON public.club_teams FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Club managers can create teams" ON public.club_teams;
CREATE POLICY "Club managers can create teams"
  ON public.club_teams FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_teams.club_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Club managers can update teams" ON public.club_teams;
CREATE POLICY "Club managers can update teams"
  ON public.club_teams FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_teams.club_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_teams.club_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Club managers can delete teams" ON public.club_teams;
CREATE POLICY "Club managers can delete teams"
  ON public.club_teams FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_teams.club_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Club managers and active members can view team rosters" ON public.club_team_memberships;
CREATE POLICY "Club managers and active members can view team rosters"
  ON public.club_team_memberships FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.club_teams t
      JOIN public.clubs c ON c.id = t.club_id
      WHERE t.id = club_team_memberships.team_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
          OR EXISTS (
            SELECT 1 FROM public.club_memberships cm
            WHERE cm.club_id = c.id AND cm.profile_id = auth.uid() AND cm.status = 'active'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Club managers can assign active members to teams" ON public.club_team_memberships;
CREATE POLICY "Club managers can assign active members to teams"
  ON public.club_team_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.club_teams t
      JOIN public.clubs c ON c.id = t.club_id
      WHERE t.id = club_team_memberships.team_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
        AND EXISTS (
          SELECT 1 FROM public.club_memberships cm
          WHERE cm.club_id = c.id
            AND cm.profile_id = club_team_memberships.profile_id
            AND cm.status = 'active'
        )
    )
  );

DROP POLICY IF EXISTS "Club managers can remove team members" ON public.club_team_memberships;
CREATE POLICY "Club managers can remove team members"
  ON public.club_team_memberships FOR DELETE
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_teams t
      JOIN public.clubs c ON c.id = t.club_id
      WHERE t.id = club_team_memberships.team_id
        AND (
          c.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.remove_inactive_club_team_members()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.club_team_memberships ctm
    USING public.club_teams ct
    WHERE ctm.team_id = ct.id
      AND ct.club_id = OLD.club_id
      AND ctm.profile_id = OLD.profile_id;
    RETURN OLD;
  END IF;

  IF NEW.status <> 'active' THEN
    DELETE FROM public.club_team_memberships ctm
    USING public.club_teams ct
    WHERE ctm.team_id = ct.id
      AND ct.club_id = NEW.club_id
      AND ctm.profile_id = NEW.profile_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_membership_team_cleanup ON public.club_memberships;
CREATE TRIGGER club_membership_team_cleanup
  AFTER UPDATE OF status OR DELETE ON public.club_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_inactive_club_team_members();

NOTIFY pgrst, 'reload schema';
