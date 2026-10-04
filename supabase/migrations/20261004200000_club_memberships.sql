CREATE TABLE IF NOT EXISTS public.club_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'rejected')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, profile_id)
);

CREATE INDEX IF NOT EXISTS club_memberships_profile_status_idx
  ON public.club_memberships (profile_id, status);
CREATE INDEX IF NOT EXISTS club_memberships_club_status_idx
  ON public.club_memberships (club_id, status);

ALTER TABLE public.club_memberships ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_memberships TO authenticated;

DROP POLICY IF EXISTS "Members and club managers can view memberships" ON public.club_memberships;
CREATE POLICY "Members and club managers can view memberships"
  ON public.club_memberships FOR SELECT
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.clubs
      WHERE clubs.id = club_memberships.club_id
        AND (
          clubs.organizer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Players can request club membership" ON public.club_memberships;
CREATE POLICY "Players can request club membership"
  ON public.club_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND status = 'pending'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'player'
    )
  );

DROP POLICY IF EXISTS "Club managers can review membership requests" ON public.club_memberships;
CREATE POLICY "Club managers can review membership requests"
  ON public.club_memberships FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.clubs
      WHERE clubs.id = club_memberships.club_id
        AND (
          clubs.organizer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
          )
        )
    )
  )
  WITH CHECK (
    status IN ('pending', 'active', 'rejected')
    AND EXISTS (
      SELECT 1
      FROM public.clubs
      WHERE clubs.id = club_memberships.club_id
        AND (
          clubs.organizer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
          )
        )
    )
  );

DROP POLICY IF EXISTS "Members can leave and managers can remove members" ON public.club_memberships;
CREATE POLICY "Members can leave and managers can remove members"
  ON public.club_memberships FOR DELETE
  TO authenticated
  USING (
    profile_id = auth.uid()
    OR EXISTS (
      SELECT 1
      FROM public.clubs
      WHERE clubs.id = club_memberships.club_id
        AND (
          clubs.organizer_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
          )
        )
    )
  );

NOTIFY pgrst, 'reload schema';
