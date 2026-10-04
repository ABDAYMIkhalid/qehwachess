CREATE TABLE IF NOT EXISTS public.player_availability (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  time_control text NOT NULL DEFAULT 'Casual / no clock'
    CHECK (time_control IN ('Casual / no clock', 'Blitz', 'Rapid', 'Classical')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_availability_expires_at_idx
  ON public.player_availability (expires_at);

ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.player_availability TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.player_availability TO authenticated;

DROP POLICY IF EXISTS "Players can view active availability" ON public.player_availability;
CREATE POLICY "Players can view active availability"
  ON public.player_availability FOR SELECT
  TO anon, authenticated
  USING (
    profile_id = auth.uid()
    OR expires_at > now()
  );

DROP POLICY IF EXISTS "Players can publish their availability" ON public.player_availability;
CREATE POLICY "Players can publish their availability"
  ON public.player_availability FOR INSERT
  TO authenticated
  WITH CHECK (
    profile_id = auth.uid()
    AND expires_at > now()
    AND expires_at <= now() + interval '8 hours'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'player'
    )
  );

DROP POLICY IF EXISTS "Players can update their availability" ON public.player_availability;
CREATE POLICY "Players can update their availability"
  ON public.player_availability FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (
    profile_id = auth.uid()
    AND expires_at > now()
    AND expires_at <= now() + interval '8 hours'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'player'
    )
  );

DROP POLICY IF EXISTS "Players can clear their availability" ON public.player_availability;
CREATE POLICY "Players can clear their availability"
  ON public.player_availability FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

NOTIFY pgrst, 'reload schema';
