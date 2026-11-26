-- P1 — Club ratings from completed OTB (over-the-board) tournament results only.
--
-- DRAFT — UNTESTED. Do not apply to production before running TEST-CHECKLIST.md
-- (Scope C). Requires main @ 75c3541a309811fb8f7ef1a6b0577955ed7f200d, including:
--   * supabase/migrations/20261004230000_tournament_pairings.sql
--     (tournament_rounds / tournament_pairings, results pending|white_win|
--     black_win|draw|bye)
--   * supabase/migrations/20261126000000_p0_registration_checkin.sql (P0)
--     (register_for_tournament() player-only check; tournaments.status
--     includes 'completed')
--
-- DESIGN DECISIONS (read before changing a constant)
--   1. Starting rating = 1200, K-factor = 32 (both in SQL and in
--      src/lib/clubRating.ts — keep the two in sync; SQL is the source
--      of truth, the TS helper is a preview only and never writes).
--      Why 1200 and not 1500: 1500 is a FIDE-style provisional mark that
--      over-rates a complete beginner with no OTB history. 1200 is the
--      new-player default on Chess.com and sits below the level a
--      regularly-playing club member reaches after a few events, so new
--      players enter at the bottom of their club ladder and earn their
--      way up. Either value is defensible; the important part is that it
--      is ONE value, documented here, not tuned per player.
--   2. Ratings are per (profile, club). The club is the tournament's
--      club_id. A tournament with club_id IS NULL rates nobody.
--      Every confirmed entrant of a completed club tournament is rated,
--      whether or not they hold a club_memberships row for that club —
--      they played in that club's event. (If Khalid later wants
--      members-only ratings, add `AND EXISTS (club_memberships …)` to
--      the game query in recompute_club_ratings_for_tournament().)
--   3. FULL RECOMPUTE, not incremental deltas. On every trigger,
--      recompute_club_ratings_for_tournament() deletes that club's
--      rows and replays every completed tournament of the club in
--      chronological order (end_date, start_date, id; then
--      round_number; then pairing created_at, id). This makes the
--      result deterministic and self-healing: a corrected result, a
--      tournament moved out of 'completed', or a deleted round all
--      converge to the same ratings. Club scale (tens of players,
--      tens of events) makes this cheap; revisit if a club ever has
--      thousands of rated games.
--   4. Only DECIDED games count. result 'pending' is skipped (no
--      rating change, no game counted). result 'bye' is skipped too:
--      a bye is 1 point in the Swiss standings but it is not a game
--      against an opponent, so it must not move a rating.
--   5. NEVER from Lichess / Chess.com / FIDE. There is no import from
--      any online rating anywhere in this migration. Profiles'
--      lichess_username / chesscom_username remain unverified
--      reference-only strings (see the P0 'Unverified' badges on
--      PlayersPage). Do not "seed" club_ratings from an online rating.
--   6. Writes go through the SECURITY DEFINER function only. RLS
--      grants SELECT to anon/authenticated and NO direct write policy,
--      so no client can insert/update/delete ratings by hand.
--
-- TRIGGERS (when ratings change)
--   * tournaments status -> 'completed'  : recompute that club.
--   * tournaments status away from 'completed' (e.g. a completed
--     tournament is re-opened/cancelled) : recompute that club, which
--     drops the tournament's games from the replay.
--   * tournament_pairings result INSERT/UPDATE/DELETE while its
--     tournament is 'completed' : recompute (covers result
--     corrections after completion). Pairing changes while the
--     tournament is still open do NOT touch ratings.

-- ============ TABLE ============
CREATE TABLE IF NOT EXISTS public.club_ratings (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  rating integer NOT NULL DEFAULT 1200 CHECK (rating BETWEEN 100 AND 3000),
  games integer NOT NULL DEFAULT 0 CHECK (games >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, club_id)
);

CREATE INDEX IF NOT EXISTS club_ratings_club_rating_idx
  ON public.club_ratings (club_id, rating DESC);
CREATE INDEX IF NOT EXISTS club_ratings_profile_idx
  ON public.club_ratings (profile_id);

ALTER TABLE public.club_ratings ENABLE ROW LEVEL SECURITY;

-- Leaderboard is public (same visibility as the player directory).
DROP POLICY IF EXISTS "Public can view club ratings" ON public.club_ratings;
CREATE POLICY "Public can view club ratings" ON public.club_ratings
  FOR SELECT TO anon, authenticated USING (true);
-- No INSERT / UPDATE / DELETE policy on purpose: only the
-- SECURITY DEFINER function below writes this table.

-- Reuse the v2 updated_at trigger function (defined in
-- 20261002170804_chess_morocco_schema_v2.sql).
DROP TRIGGER IF EXISTS club_ratings_updated_at ON public.club_ratings;
CREATE TRIGGER club_ratings_updated_at
  BEFORE UPDATE ON public.club_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============ ELO MATH ============
CREATE OR REPLACE FUNCTION public.elo_expected_score(p_rating_a integer, p_rating_b integer)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 1.0 / (1.0 + power(10.0, (p_rating_b - p_rating_a)::numeric / 400.0));
$$;

-- ============ FULL RECOMPUTE ============
-- Replays every decided OTB game of every completed tournament of one
-- club, in chronological order, starting everyone at 1200 / K=32.
-- Returns jsonb { recomputed, club_id, games, players }.
CREATE OR REPLACE FUNCTION public.recompute_club_ratings_for_tournament(p_tournament_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_games integer := 0;
  v_players integer := 0;
  r record;
  v_white_rating integer;
  v_black_rating integer;
  v_white_expected numeric;
  v_black_expected numeric;
  v_white_score numeric;
BEGIN
  SELECT * INTO v_tournament FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('recomputed', false, 'reason', 'tournament not found');
  END IF;
  IF v_tournament.club_id IS NULL THEN
    RETURN jsonb_build_object('recomputed', false, 'reason', 'tournament has no club');
  END IF;

  -- Recompute the whole club, not just this tournament, so a
  -- tournament leaving 'completed' (or a corrected old result)
  -- cannot leave stale ratings behind.
  DELETE FROM public.club_ratings WHERE club_id = v_tournament.club_id;

  -- Working table: one row per player, starting at 1200 / 0 games.
  -- DROP first: this function can run twice in one transaction
  -- (e.g. two pairing rows updated by one statement fire the
  -- trigger twice), and ON COMMIT DROP alone would leave the second
  -- CREATE failing with "already exists".
  DROP TABLE IF EXISTS tmp_club_ratings;
  CREATE TEMP TABLE tmp_club_ratings (
    profile_id uuid PRIMARY KEY,
    rating integer NOT NULL DEFAULT 1200,
    games integer NOT NULL DEFAULT 0
  ) ON COMMIT DROP;

  FOR r IN
    SELECT p.white_player_id, p.black_player_id, p.result
    FROM public.tournament_pairings p
    JOIN public.tournament_rounds r ON r.id = p.round_id
    JOIN public.tournaments t ON t.id = r.tournament_id
    WHERE t.club_id = v_tournament.club_id
      AND t.status = 'completed'
      AND p.black_player_id IS NOT NULL
      AND p.result IN ('white_win', 'black_win', 'draw')
    ORDER BY t.end_date ASC, t.start_date ASC, t.id ASC,
             r.round_number ASC, p.created_at ASC, p.id ASC
  LOOP
    INSERT INTO tmp_club_ratings (profile_id)
      VALUES (r.white_player_id), (r.black_player_id)
      ON CONFLICT (profile_id) DO NOTHING;

    SELECT rating INTO v_white_rating FROM tmp_club_ratings WHERE profile_id = r.white_player_id;
    SELECT rating INTO v_black_rating FROM tmp_club_ratings WHERE profile_id = r.black_player_id;

    v_white_expected := public.elo_expected_score(v_white_rating, v_black_rating);
    v_black_expected := 1.0 - v_white_expected;
    v_white_score := CASE r.result WHEN 'white_win' THEN 1.0 WHEN 'draw' THEN 0.5 ELSE 0.0 END;

    UPDATE tmp_club_ratings SET
      rating = GREATEST(100, LEAST(3000,
        ROUND(rating + 32 * (v_white_score - v_white_expected))::integer)),
      games = games + 1
    WHERE profile_id = r.white_player_id;

    UPDATE tmp_club_ratings SET
      rating = GREATEST(100, LEAST(3000,
        ROUND(rating + 32 * ((1.0 - v_white_score) - v_black_expected))::integer)),
      games = games + 1
    WHERE profile_id = r.black_player_id;

    v_games := v_games + 1;
  END LOOP;

  INSERT INTO public.club_ratings (profile_id, club_id, rating, games, updated_at)
    SELECT profile_id, v_tournament.club_id, rating, games, now()
    FROM tmp_club_ratings WHERE games > 0;

  GET DIAGNOSTICS v_players = ROW_COUNT;
  DROP TABLE IF EXISTS tmp_club_ratings;

  RETURN jsonb_build_object(
    'recomputed', true,
    'club_id', v_tournament.club_id,
    'games', v_games,
    'players', v_players
  );
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_club_ratings_for_tournament(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recompute_club_ratings_for_tournament(uuid) TO authenticated;
-- NOTE: the triggers below run as the table owner, so recompute works
-- even for callers who only have SELECT on club_ratings.

COMMENT ON FUNCTION public.recompute_club_ratings_for_tournament(uuid) IS
  'P1: recompute a club''s ratings from decided games of its completed OTB tournaments only (Elo K=32, start 1200). Never uses Lichess/Chess.com.';

-- ============ TRIGGERS ============
CREATE OR REPLACE FUNCTION public.trigger_recompute_club_ratings_on_tournament()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Recompute on entering AND on leaving 'completed'. club_id cannot
  -- change meaningfully here, but use OLD when NEW has none.
  IF NEW.status = 'completed' OR OLD.status = 'completed' THEN
    PERFORM public.recompute_club_ratings_for_tournament(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tournaments_recompute_club_ratings ON public.tournaments;
CREATE TRIGGER tournaments_recompute_club_ratings
  AFTER UPDATE OF status ON public.tournaments
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_club_ratings_on_tournament();

CREATE OR REPLACE FUNCTION public.trigger_recompute_club_ratings_on_pairing()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tournament_id uuid;
  v_status text;
BEGIN
  SELECT r.tournament_id INTO v_tournament_id
  FROM public.tournament_rounds r
  WHERE r.id = COALESCE(NEW.round_id, OLD.round_id);
  IF v_tournament_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT status INTO v_status FROM public.tournaments WHERE id = v_tournament_id;
  -- Only completed tournaments feed ratings. Mid-tournament result
  -- entry must not move any rating.
  IF v_status = 'completed' THEN
    PERFORM public.recompute_club_ratings_for_tournament(v_tournament_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tournament_pairings_recompute_club_ratings ON public.tournament_pairings;
CREATE TRIGGER tournament_pairings_recompute_club_ratings
  AFTER INSERT OR UPDATE OF result OR DELETE ON public.tournament_pairings
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_recompute_club_ratings_on_pairing();

-- ============ REALTIME (leaderboard live-updates) ============
-- Adds club_ratings to the Realtime publication so the leaderboard
-- hooks can subscribe. No-op when already present. If Realtime is
-- not enabled for this project in the Supabase dashboard, this block
-- still succeeds and the subscription simply never fires — the
-- leaderboard then updates on navigation / refresh (see useData.ts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'club_ratings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.club_ratings;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
