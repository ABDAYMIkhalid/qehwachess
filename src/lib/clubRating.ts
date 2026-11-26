// P1 (Scope C) — Elo helpers for club ratings.
//
// DRAFT — UNTESTED. Pure functions, no Supabase calls.
//
// SOURCE OF TRUTH: supabase/migrations/20261126000002_p1_club_ratings.sql.
// The database recomputes ratings with the SAME constants (start 1200,
// K=32) and is the only writer of the club_ratings table. These helpers
// exist only so the UI can *preview* what a result would do
// ("beating a 1400 gains ~+8") — never use them to write a rating.
//
// Why 1200 / K=32: 1200 is the new-player default on Chess.com and
// keeps unrated beginners at the bottom of their club ladder instead
// of over-rating them at a FIDE-style 1500 provisional mark. K=32 is
// the standard fast-adjustment factor for new / low-volume players,
// which is exactly what club ladders are. Both constants live here
// AND in the migration; if one changes, change the other and note it
// in PART-SUMMARY.md.

export const CLUB_RATING_START = 1200;
export const CLUB_RATING_K = 32;
export const CLUB_RATING_MIN = 100;
export const CLUB_RATING_MAX = 3000;

/** Expected score of player A against player B (0..1). */
export function expectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

/**
 * Rating after one decided game. `score` is 1 (win), 0.5 (draw) or 0
 * (loss). Result is rounded to an integer and clamped to 100..3000,
 * exactly like the SQL function.
 */
export function ratingAfterGame(
  rating: number,
  opponentRating: number,
  score: 0 | 0.5 | 1,
): number {
  const next = Math.round(rating + CLUB_RATING_K * (score - expectedScore(rating, opponentRating)));
  return Math.max(CLUB_RATING_MIN, Math.min(CLUB_RATING_MAX, next));
}

/** Rating change (signed) from one decided game — for preview text. */
export function ratingDelta(
  rating: number,
  opponentRating: number,
  score: 0 | 0.5 | 1,
): number {
  return ratingAfterGame(rating, opponentRating, score) - rating;
}
