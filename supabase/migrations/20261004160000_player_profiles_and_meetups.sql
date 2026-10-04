ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS lichess_username text,
  ADD COLUMN IF NOT EXISTS chesscom_username text,
  ADD COLUMN IF NOT EXISTS fide_id text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_username_format_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_username_format_check
      CHECK (username IS NULL OR username ~ '^[A-Za-z0-9_]{3,24}$');
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.casual_meetups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 100),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  city_id uuid NOT NULL REFERENCES public.cities(id),
  venue text NOT NULL CHECK (char_length(venue) BETWEEN 2 AND 120),
  address text CHECK (address IS NULL OR char_length(address) <= 200),
  starts_at timestamptz NOT NULL,
  time_control text NOT NULL,
  skill_level text NOT NULL DEFAULT 'Any level'
    CHECK (skill_level IN ('Any level', 'Beginner', 'Intermediate', 'Advanced')),
  status text NOT NULL DEFAULT 'published'
    CHECK (status IN ('published', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS casual_meetups_city_start_idx
  ON public.casual_meetups (city_id, starts_at)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS casual_meetups_creator_idx
  ON public.casual_meetups (creator_id);

ALTER TABLE public.casual_meetups ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.casual_meetups TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.casual_meetups TO authenticated;

DROP POLICY IF EXISTS "Anyone can view published meetups" ON public.casual_meetups;
CREATE POLICY "Anyone can view published meetups"
  ON public.casual_meetups FOR SELECT
  TO anon, authenticated
  USING (
    status = 'published'
    OR creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Users can create their own meetups" ON public.casual_meetups;
CREATE POLICY "Users can create their own meetups"
  ON public.casual_meetups FOR INSERT
  TO authenticated
  WITH CHECK (creator_id = auth.uid());

DROP POLICY IF EXISTS "Creators and admins can update meetups" ON public.casual_meetups;
CREATE POLICY "Creators and admins can update meetups"
  ON public.casual_meetups FOR UPDATE
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Creators and admins can delete meetups" ON public.casual_meetups;
CREATE POLICY "Creators and admins can delete meetups"
  ON public.casual_meetups FOR DELETE
  TO authenticated
  USING (
    creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.meetup_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meetup_id uuid NOT NULL REFERENCES public.casual_meetups(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'cancelled')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meetup_id, player_id)
);

CREATE INDEX IF NOT EXISTS meetup_attendees_player_idx
  ON public.meetup_attendees (player_id, status);

ALTER TABLE public.meetup_attendees ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.meetup_attendees TO authenticated;

DROP POLICY IF EXISTS "Players and meetup creators can view attendance" ON public.meetup_attendees;
CREATE POLICY "Players and meetup creators can view attendance"
  ON public.meetup_attendees FOR SELECT
  TO authenticated
  USING (
    player_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.casual_meetups
      WHERE casual_meetups.id = meetup_attendees.meetup_id
        AND casual_meetups.creator_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Players can join published meetups" ON public.meetup_attendees;
CREATE POLICY "Players can join published meetups"
  ON public.meetup_attendees FOR INSERT
  TO authenticated
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.casual_meetups
      WHERE casual_meetups.id = meetup_attendees.meetup_id
        AND casual_meetups.status = 'published'
        AND casual_meetups.creator_id <> auth.uid()
    )
  );

DROP POLICY IF EXISTS "Players can update their attendance" ON public.meetup_attendees;
CREATE POLICY "Players can update their attendance"
  ON public.meetup_attendees FOR UPDATE
  TO authenticated
  USING (player_id = auth.uid())
  WITH CHECK (
    player_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.casual_meetups
      WHERE casual_meetups.id = meetup_attendees.meetup_id
        AND casual_meetups.status = 'published'
        AND casual_meetups.creator_id <> auth.uid()
    )
  );

NOTIFY pgrst, 'reload schema';
