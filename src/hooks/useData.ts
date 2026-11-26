// P1 DRAFT — full corrected file. Base: src/hooks/useData.ts on main @
// 75c3541a309811fb8f7ef1a6b0577955ed7f200d (SHA 01ce25c7396334ad13e43ac1ad94eac4b0fdab6d).
// UNTESTED — see PART-SUMMARY.md and TEST-CHECKLIST.md. Do not ship
// without `npm run typecheck` and the checklist.
//
// What changed vs main (Scope D — errors, pagination, Realtime-ready
// data; Scope C — club-rating hooks):
//   1. EVERY hook now surfaces Supabase errors instead of silently
//      setting loading=false with empty data. Each hook returns
//      `error: string | null` (usePlayerCount keeps its P0 behaviour
//      of returning playerCount=null on error, and now also exposes
//      the error so the UI can say so instead of rendering '…').
//      Hooks also return a `refresh()` callback (additive).
//   2. Pagination on the three main list hooks — useTournaments,
//      useClubs, useClubRatings — via an optional second argument
//      `{ page, pageSize }` and PostgREST `.range()` + exact counts.
//      They return totalCount / page / pageSize / totalPages /
//      hasNextPage / hasPreviousPage. *** BREAKING-ISH CHANGE ***:
//      the default page is 1 with pageSize 20, so a caller that used
//      to receive the whole list now receives the first 20 rows.
//      Old call sites still compile (the argument is optional), but
//      TournamentsPage and ClubsPage MUST adopt the pager UI in
//      patches/PATCH-TournamentsPage-ClubsPage-pagination.md, and
//      HomePage's useTournaments() call now shows at most 20
//      tournaments (previously unbounded). useCities / useTournament /
//      useClub / useCityTournaments are unchanged in shape except for
//      the additive `error` (+ `refresh`) fields.
//   3. New Scope C hooks: useClubRatings(clubId, pagination?),
//      useTopClubRatings(limit?) and usePlayerClubRating() read the
//      club_ratings table created by
//      20261126000002_p1_club_ratings.sql. Without that migration
//      these three hooks fail with a table-not-found error (surfaced
//      through `error`, per point 1).
//   4. Realtime itself lives in the pages, not here: MessagesPage and
//      TournamentPairingsPanel get channel subscriptions in their
//      patch files. Nothing in this file subscribes (cities /
//      tournaments / clubs change rarely enough that refetch-on-
//      navigate is the right call; see PART-SUMMARY.md).
//
// P1 MERGED — category filter added on top of this data-auth-rating file
// (see PATCH-useData-seed-card.md §A, organiser-format):
//   5. useTournaments accepts timeControlCategory and filters on
//      time_control_category when set; it is also in the deps arrays.
//      Independent of `format`: a Blitz Swiss is format='swiss' +
//      timeControlCategory='blitz'. Null-category rows are not matched
//      by any category value.
//
// What was PRESERVED from P0, byte-for-byte in behaviour:
//   * usePlayerCount(): counts real rows in `profiles` with role
//     'player' (head-only count), returns null on error so the UI
//     renders '…' instead of inventing a number.
//   * useTournament(): registrationCount counts CONFIRMED
//     registrations only (not waitlisted / pending) — see the P0
//     comment kept below.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { City, Club, ClubRating, Tournament, TournamentWithRelations } from '@/types';

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult {
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

function normalizePagination(pagination?: PaginationParams): { page: number; pageSize: number } {
  const page = Math.max(1, Math.floor(pagination?.page ?? 1) || 1);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(pagination?.pageSize ?? DEFAULT_PAGE_SIZE) || DEFAULT_PAGE_SIZE),
  );
  return { page, pageSize };
}

function toErrorMessage(error: unknown): string | null {
  if (!error) return null;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return error instanceof Error ? error.message : 'Could not load data. Please try again.';
}

export function useCities() {
  const [cities, setCities] = useState<City[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.from('cities').select('*').order('name');
    setCities(data ?? []);
    setError(toErrorMessage(queryError));
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: queryError } = await supabase.from('cities').select('*').order('name');
      if (!active) return;
      setCities(data ?? []);
      setError(toErrorMessage(queryError));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { cities, loading, error, refresh };
}

export function useTournaments(
  filters?: {
    cityId?: string;
    format?: string;
    // P1 — second filter axis (NOTES.md §1). Independent of
    // `format`: a Blitz Swiss is format='swiss' +
    // timeControlCategory='blitz'. Null category rows (pre-P1 /
    // casual) are NOT matched by any category value — that is
    // correct, they have no category to match.
    timeControlCategory?: string;
    search?: string;
    featuredOnly?: boolean;
    organizerId?: string;
    status?: string;
  },
  pagination?: PaginationParams,
) {
  const [tournaments, setTournaments] = useState<TournamentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const { page, pageSize } = normalizePagination(pagination);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { page: currentPage, pageSize: currentSize } = normalizePagination(pagination);
    let query = supabase
      .from('tournaments')
      .select('*, city:cities(*), club:clubs(*), organizer:profiles(*)', { count: 'exact' })
      .order('start_date', { ascending: true })
      .range((currentPage - 1) * currentSize, currentPage * currentSize - 1);

    if (filters?.cityId) query = query.eq('city_id', filters.cityId);
    if (filters?.format) query = query.eq('format', filters.format);
    if (filters?.timeControlCategory) query = query.eq('time_control_category', filters.timeControlCategory);
    if (filters?.featuredOnly) query = query.eq('featured', true);
    if (filters?.organizerId) query = query.eq('organizer_id', filters.organizerId);
    if (filters?.status) query = query.eq('status', filters.status);
    else query = query.eq('status', 'published');

    if (filters?.search) {
      query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,venue.ilike.%${filters.search}%`);
    }

    const { data, count, error: queryError } = await query;
    setTournaments((data ?? []) as TournamentWithRelations[]);
    setTotalCount(count ?? 0);
    setError(toErrorMessage(queryError));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters?.cityId, filters?.format, filters?.timeControlCategory, filters?.search, filters?.featuredOnly, filters?.organizerId, filters?.status, page, pageSize]);

  useEffect(() => {
    let active = true;
    (async () => {
      let query = supabase
        .from('tournaments')
        .select('*, city:cities(*), club:clubs(*), organizer:profiles(*)', { count: 'exact' })
        .order('start_date', { ascending: true })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (filters?.cityId) query = query.eq('city_id', filters.cityId);
      if (filters?.format) query = query.eq('format', filters.format);
    if (filters?.timeControlCategory) query = query.eq('time_control_category', filters.timeControlCategory);
      if (filters?.featuredOnly) query = query.eq('featured', true);
      if (filters?.organizerId) query = query.eq('organizer_id', filters.organizerId);
      if (filters?.status) query = query.eq('status', filters.status);
      else query = query.eq('status', 'published');

      if (filters?.search) {
        query = query.or(`title.ilike.%${filters.search}%,description.ilike.%${filters.search}%,venue.ilike.%${filters.search}%`);
      }

      const { data, count, error: queryError } = await query;
      if (!active) return;
      setTournaments((data ?? []) as TournamentWithRelations[]);
      setTotalCount(count ?? 0);
      setError(toErrorMessage(queryError));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [filters?.cityId, filters?.format, filters?.timeControlCategory, filters?.search, filters?.featuredOnly, filters?.organizerId, filters?.status, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return {
    tournaments,
    loading,
    error,
    refresh,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function useTournament(id: string | undefined) {
  const [tournament, setTournament] = useState<TournamentWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registrationCount, setRegistrationCount] = useState(0);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data, error: queryError } = await supabase
        .from('tournaments')
        .select('*, city:cities(*), club:clubs(*), organizer:profiles(*)')
        .eq('id', id)
        .maybeSingle();

      if (!active) return;
      if (queryError) {
        setError(queryError.message);
        setTournament(null);
        setLoading(false);
        return;
      }
      setTournament(data as TournamentWithRelations | null);

      if (data) {
        // P0 fix: count CONFIRMED registrations only.
        // The old code counted every non-cancelled registration
        // (including waitlisted / pending), which inflated
        // "spots taken" and made a full tournament look fuller
        // than it was. See PATCH-TournamentDetail.md.
        const { count, error: countError } = await supabase
          .from('registrations')
          .select('id', { count: 'exact', head: true })
          .eq('tournament_id', id)
          .eq('status', 'confirmed');
        if (!active) return;
        if (countError) setError(countError.message);
        setRegistrationCount(count ?? 0);
      }

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return { tournament, loading, error, registrationCount, setRegistrationCount };
}

export function useClubs(pagination?: PaginationParams) {
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const { page, pageSize } = normalizePagination(pagination);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { page: currentPage, pageSize: currentSize } = normalizePagination(pagination);
    const { data, count, error: queryError } = await supabase
      .from('clubs')
      .select('*, city:cities(*), organizer:profiles(*)', { count: 'exact' })
      .order('name')
      .range((currentPage - 1) * currentSize, currentPage * currentSize - 1);
    setClubs(data ?? []);
    setTotalCount(count ?? 0);
    setError(toErrorMessage(queryError));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, count, error: queryError } = await supabase
        .from('clubs')
        .select('*, city:cities(*), organizer:profiles(*)', { count: 'exact' })
        .order('name')
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (!active) return;
      setClubs(data ?? []);
      setTotalCount(count ?? 0);
      setError(toErrorMessage(queryError));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return {
    clubs,
    loading,
    error,
    refresh,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

export function useClub(id: string | undefined) {
  const [club, setClub] = useState<Club | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data, error: clubError } = await supabase
        .from('clubs')
        .select('*, city:cities(*), organizer:profiles(*)')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (clubError) {
        setError(clubError.message);
        setClub(null);
        setLoading(false);
        return;
      }
      setClub(data as Club | null);

      const { data: tData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*, city:cities(*)')
        .eq('club_id', id)
        .eq('status', 'published')
        .order('start_date', { ascending: true });
      if (!active) return;
      if (tournamentError) setError(tournamentError.message);
      setTournaments(tData ?? []);

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return { club, tournaments, loading, error };
}

export function useCityTournaments(id: string | undefined) {
  const [city, setCity] = useState<City | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data: cityData, error: cityError } = await supabase
        .from('cities')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (!active) return;
      if (cityError) {
        setError(cityError.message);
        setLoading(false);
        return;
      }
      setCity(cityData as City | null);

      const { data: tData, error: tournamentError } = await supabase
        .from('tournaments')
        .select('*, city:cities(*)')
        .eq('city_id', id)
        .eq('status', 'published')
        .order('start_date', { ascending: true });
      if (!active) return;
      if (tournamentError) setError(tournamentError.message);
      setTournaments(tData ?? []);

      const { data: cData, error: clubError } = await supabase
        .from('clubs')
        .select('*, city:cities(*)')
        .eq('city_id', id)
        .order('name');
      if (!active) return;
      if (clubError) setError(clubError.message);
      setClubs(cData ?? []);

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [id]);

  return { city, tournaments, clubs, loading, error };
}

// P0 — real player count for the home page.
// Replaces the hardcoded `players: 1250` that used to live in
// HomePage.tsx. This counts real rows in `profiles` with role
// 'player' (head-only count, no rows are fetched).
// Returns null while loading / on error, so the UI can show
// an ellipsis instead of inventing a number.
// P1: also returns `error` (previously the failure was silent apart
// from the null count) and a `refresh()` callback. The null-on-error
// behaviour itself is unchanged.
export function usePlayerCount() {
  const [playerCount, setPlayerCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { count, error: queryError } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'player');
    if (queryError) {
      // Do not invent a number on failure — leave it null
      // and let the caller render '…'.
      setPlayerCount(null);
      setError(queryError.message);
    } else {
      setPlayerCount(count ?? 0);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { count, error: queryError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'player');
      if (!active) return;
      if (queryError) {
        // Do not invent a number on failure — leave it null
        // and let the caller render '…'.
        setPlayerCount(null);
        setError(queryError.message);
      } else {
        setPlayerCount(count ?? 0);
        setError(null);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  return { playerCount, loading, error, refresh };
}

// ---- P1 (Scope C) — club ratings -------------------------------------
// Reads public.club_ratings (migration 20261126000002). Ratings come
// ONLY from decided games of completed OTB tournaments run by the
// club; Lichess/Chess.com usernames are never an input. If the
// migration has not been applied these hooks return error
// 'relation "public.club_ratings" does not exist' (surfaced, not
// swallowed) and empty data.

export function useClubRatings(clubId: string | undefined, pagination?: PaginationParams) {
  const [ratings, setRatings] = useState<ClubRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const { page, pageSize } = normalizePagination(pagination);

  const refresh = useCallback(async () => {
    if (!clubId) return;
    setLoading(true);
    setError(null);
    const { page: currentPage, pageSize: currentSize } = normalizePagination(pagination);
    const { data, count, error: queryError } = await supabase
      .from('club_ratings')
      .select('*, profile:profiles!club_ratings_profile_id_fkey(id, full_name, avatar_url, username)', { count: 'exact' })
      .eq('club_id', clubId)
      .order('rating', { ascending: false })
      .range((currentPage - 1) * currentSize, currentPage * currentSize - 1);
    setRatings((data ?? []) as unknown as ClubRating[]);
    setTotalCount(count ?? 0);
    setError(toErrorMessage(queryError));
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, page, pageSize]);

  useEffect(() => {
    if (!clubId) {
      setRatings([]);
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data, count, error: queryError } = await supabase
        .from('club_ratings')
        .select('*, profile:profiles!club_ratings_profile_id_fkey(id, full_name, avatar_url, username)', { count: 'exact' })
        .eq('club_id', clubId)
        .order('rating', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);
      if (!active) return;
      setRatings((data ?? []) as unknown as ClubRating[]);
      setTotalCount(count ?? 0);
      setError(toErrorMessage(queryError));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [clubId, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  return {
    ratings,
    loading,
    error,
    refresh,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasNextPage: page < totalPages,
    hasPreviousPage: page > 1,
  };
}

/** Top-rated players across all clubs, for the PlayersPage leaderboard. */
export function useTopClubRatings(limit = 10) {
  const [ratings, setRatings] = useState<ClubRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 10));

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase
      .from('club_ratings')
      .select(
        '*, profile:profiles!club_ratings_profile_id_fkey(id, full_name, avatar_url, username), club:clubs!club_ratings_club_id_fkey(id, name)',
      )
      .order('rating', { ascending: false })
      .limit(safeLimit);
    setRatings((data ?? []) as unknown as ClubRating[]);
    setError(toErrorMessage(queryError));
    setLoading(false);
  }, [safeLimit]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error: queryError } = await supabase
        .from('club_ratings')
        .select(
          '*, profile:profiles!club_ratings_profile_id_fkey(id, full_name, avatar_url, username), club:clubs!club_ratings_club_id_fkey(id, name)',
        )
        .order('rating', { ascending: false })
        .limit(safeLimit);
      if (!active) return;
      setRatings((data ?? []) as unknown as ClubRating[]);
      setError(toErrorMessage(queryError));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [safeLimit]);

  return { ratings, loading, error, refresh };
}

/** One player's rating in one club, or null when they have no rated games there. */
export function usePlayerClubRating(profileId: string | undefined, clubId: string | undefined) {
  const [rating, setRating] = useState<ClubRating | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!profileId || !clubId) {
      setRating(null);
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      const { data, error: queryError } = await supabase
        .from('club_ratings')
        .select('*')
        .eq('profile_id', profileId)
        .eq('club_id', clubId)
        .maybeSingle();
      if (!active) return;
      setRating((data ?? null) as ClubRating | null);
      setError(toErrorMessage(queryError));
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [profileId, clubId]);

  return { rating, loading, error };
}
