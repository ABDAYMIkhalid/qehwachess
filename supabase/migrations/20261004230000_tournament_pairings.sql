CREATE TABLE IF NOT EXISTS public.tournament_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_number integer NOT NULL CHECK (round_number > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, round_number)
);

CREATE TABLE IF NOT EXISTS public.tournament_pairings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.tournament_rounds(id) ON DELETE CASCADE,
  white_player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  black_player_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  result text NOT NULL DEFAULT 'pending' CHECK (result IN ('pending', 'white_win', 'black_win', 'draw', 'bye')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (black_player_id IS NULL OR white_player_id <> black_player_id),
  CHECK ((black_player_id IS NULL AND result = 'bye') OR (black_player_id IS NOT NULL AND result <> 'bye')),
  UNIQUE (round_id, white_player_id),
  UNIQUE (round_id, black_player_id)
);

CREATE INDEX IF NOT EXISTS tournament_rounds_tournament_idx ON public.tournament_rounds (tournament_id, round_number);
CREATE INDEX IF NOT EXISTS tournament_pairings_round_idx ON public.tournament_pairings (round_id);

ALTER TABLE public.tournament_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_pairings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_rounds TO authenticated;
GRANT SELECT ON public.tournament_rounds TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tournament_pairings TO authenticated;
GRANT SELECT ON public.tournament_pairings TO anon;

DROP POLICY IF EXISTS "Public can view published tournament rounds" ON public.tournament_rounds;
CREATE POLICY "Public can view published tournament rounds"
  ON public.tournament_rounds FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_rounds.tournament_id AND t.status = 'published')
    OR EXISTS (SELECT 1 FROM public.tournaments t WHERE t.id = tournament_rounds.tournament_id AND t.organizer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Tournament managers can create rounds" ON public.tournament_rounds;
CREATE POLICY "Tournament managers can create rounds"
  ON public.tournament_rounds FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Tournament managers can update rounds" ON public.tournament_rounds;
CREATE POLICY "Tournament managers can update rounds"
  ON public.tournament_rounds FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Tournament managers can delete rounds" ON public.tournament_rounds;
CREATE POLICY "Tournament managers can delete rounds"
  ON public.tournament_rounds FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournaments t
      WHERE t.id = tournament_rounds.tournament_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Public can view published tournament pairings" ON public.tournament_pairings;
CREATE POLICY "Public can view published tournament pairings"
  ON public.tournament_pairings FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_rounds r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.id = tournament_pairings.round_id
        AND (
          t.status = 'published'
          OR t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Tournament managers can create pairings" ON public.tournament_pairings;
CREATE POLICY "Tournament managers can create pairings"
  ON public.tournament_pairings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_rounds r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.id = tournament_pairings.round_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Tournament managers can update pairing results" ON public.tournament_pairings;
CREATE POLICY "Tournament managers can update pairing results"
  ON public.tournament_pairings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_rounds r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.id = tournament_pairings.round_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tournament_rounds r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.id = tournament_pairings.round_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

DROP POLICY IF EXISTS "Tournament managers can delete pairings" ON public.tournament_pairings;
CREATE POLICY "Tournament managers can delete pairings"
  ON public.tournament_pairings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tournament_rounds r
      JOIN public.tournaments t ON t.id = r.tournament_id
      WHERE r.id = tournament_pairings.round_id
        AND (
          t.organizer_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
        )
    )
  );

CREATE OR REPLACE FUNCTION public.validate_tournament_pairing_players()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  target_tournament_id uuid;
BEGIN
  SELECT tournament_id
  INTO target_tournament_id
  FROM public.tournament_rounds
  WHERE id = NEW.round_id
  FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.tournament_id = target_tournament_id
      AND r.player_id = NEW.white_player_id
      AND r.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'White player must have a confirmed tournament registration';
  END IF;

  IF NEW.black_player_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.tournament_id = target_tournament_id
      AND r.player_id = NEW.black_player_id
      AND r.status = 'confirmed'
  ) THEN
    RAISE EXCEPTION 'Black player must have a confirmed tournament registration';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_pairings p
    WHERE p.round_id = NEW.round_id
      AND p.id IS DISTINCT FROM NEW.id
      AND (
        p.white_player_id IN (NEW.white_player_id, NEW.black_player_id)
        OR p.black_player_id IN (NEW.white_player_id, NEW.black_player_id)
      )
  ) THEN
    RAISE EXCEPTION 'A player can only be paired once per round';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournament_pairings_validate_players ON public.tournament_pairings;
CREATE TRIGGER tournament_pairings_validate_players
  BEFORE INSERT OR UPDATE OF round_id, white_player_id, black_player_id
  ON public.tournament_pairings
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_tournament_pairing_players();

NOTIFY pgrst, 'reload schema';
