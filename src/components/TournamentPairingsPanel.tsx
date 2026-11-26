import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Trophy } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

// P0 — Swiss only.
// This panel deliberately supports Swiss tournaments only.
// Round-robin / knockout / simultaneous are offered in the
// creation form today, but there is no generator for them —
// see NOTES.md for the format / time-control split that must
// land before those formats are offered again. Do not add
// a generator for them in this file without that split.
//
// Board numbers are DISPLAY-ONLY in this file. The
// `tournament_pairings` table has no board_number column, so
// boards are numbered 1, 2, 3… in the order pairings are
// stored for a round. If persistent board numbers are ever
// needed (e.g. after re-pairing), add a board_number column
// in a migration first — do not try to insert one here.

type PairingResult = 'pending' | 'white_win' | 'black_win' | 'draw' | 'bye';

interface Pairing {
  id: string;
  round_id: string;
  white_player_id: string;
  black_player_id: string | null;
  result: PairingResult;
}

interface Round {
  id: string;
  round_number: number;
  status: 'open' | 'completed';
  pairings: Pairing[];
}

interface Entrant {
  id: string;
  name: string;
  rating: number;
}

interface RegistrationRecord {
  player_id: string;
  rating: number | null;
  player: { full_name: string } | null;
}

interface Standing extends Entrant {
  points: number;
  buchholz: number;
  sonnebornBerger: number;
  whiteCount: number;
  blackCount: number;
}

function calculatePoints(pairings: Pairing[]) {
  const points = new Map<string, number>();
  for (const pairing of pairings) {
    if (pairing.result === 'bye') {
      points.set(pairing.white_player_id, (points.get(pairing.white_player_id) ?? 0) + 1);
    } else if (pairing.result === 'white_win') {
      points.set(pairing.white_player_id, (points.get(pairing.white_player_id) ?? 0) + 1);
    } else if (pairing.result === 'black_win' && pairing.black_player_id) {
      points.set(pairing.black_player_id, (points.get(pairing.black_player_id) ?? 0) + 1);
    } else if (pairing.result === 'draw' && pairing.black_player_id) {
      points.set(pairing.white_player_id, (points.get(pairing.white_player_id) ?? 0) + 0.5);
      points.set(pairing.black_player_id, (points.get(pairing.black_player_id) ?? 0) + 0.5);
    }
  }
  return points;
}

type Colour = 'white' | 'black';

interface PlayerTieBreak {
  buchholz: number;
  sonnebornBerger: number;
  whiteCount: number;
  blackCount: number;
  lastColour: Colour | null;
}

/**
 * Buchholz = sum of the current points of all opponents a player
 * has actually played (byes excluded, pending games count the
 * opponent's current points — so mid-tournament values are
 * provisional and will move as results come in).
 *
 * Sonneborn-Berger = sum of the points of opponents a player
 * beat, plus half the points of opponents they drew with.
 * Losses contribute 0.
 *
 * Colour counts ignore byes: a bye is not a game with White.
 */
function calculateTieBreaks(pairings: Pairing[]) {
  const points = calculatePoints(pairings);
  const result = new Map<string, PlayerTieBreak>();

  const ensure = (id: string): PlayerTieBreak => {
    const existing = result.get(id);
    if (existing) return existing;
    const fresh: PlayerTieBreak = {
      buchholz: 0,
      sonnebornBerger: 0,
      whiteCount: 0,
      blackCount: 0,
      lastColour: null,
    };
    result.set(id, fresh);
    return fresh;
  };

  // Opponents, in the order the games were played, so
  // lastColour is the colour of the most recent game.
  const opponents = new Map<
    string,
    Array<{ opponentId: string; outcome: 'win' | 'loss' | 'draw' | 'pending' }>
  >();

  for (const pairing of pairings) {
    if (!pairing.black_player_id) {
      // Bye: 1 point, no opponent, no colour.
      ensure(pairing.white_player_id);
      continue;
    }
    const white = ensure(pairing.white_player_id);
    const black = ensure(pairing.black_player_id);
    white.whiteCount += 1;
    white.lastColour = 'white';
    black.blackCount += 1;
    black.lastColour = 'black';

    const whiteOutcome: 'win' | 'loss' | 'draw' =
      pairing.result === 'white_win' ? 'win' : pairing.result === 'black_win' ? 'loss' : 'draw';
    const blackOutcome: 'win' | 'loss' | 'draw' =
      pairing.result === 'black_win' ? 'win' : pairing.result === 'white_win' ? 'loss' : 'draw';

    // Pending games contribute the opponent's points to
    // Buchholz, but 0 to Sonneborn-Berger until a result is
    // entered — that is why 'pending' is kept as its own
    // outcome below instead of being treated as a draw.
    const effectiveWhiteOutcome = pairing.result === 'pending' ? 'pending' : whiteOutcome;
    const effectiveBlackOutcome = pairing.result === 'pending' ? 'pending' : blackOutcome;

    if (!opponents.has(pairing.white_player_id)) opponents.set(pairing.white_player_id, []);
    if (!opponents.has(pairing.black_player_id)) opponents.set(pairing.black_player_id, []);
    opponents.get(pairing.white_player_id)!.push({
      opponentId: pairing.black_player_id,
      outcome: effectiveWhiteOutcome,
    });
    opponents.get(pairing.black_player_id)!.push({
      opponentId: pairing.white_player_id,
      outcome: effectiveBlackOutcome,
    });
  }

  for (const [playerId, list] of opponents) {
    const entry = ensure(playerId);
    for (const { opponentId, outcome } of list) {
      const opponentPoints = points.get(opponentId) ?? 0;
      entry.buchholz += opponentPoints;
      if (outcome === 'win') entry.sonnebornBerger += opponentPoints;
      else if (outcome === 'draw') entry.sonnebornBerger += opponentPoints / 2;
    }
  }

  return result;
}

function formatTieBreak(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function buildSwissPairs(entrants: Entrant[], pairings: Pairing[]) {
  const points = calculatePoints(pairings);
  const tieBreaks = calculateTieBreaks(pairings);
  const ranked = [...entrants].sort((a, b) =>
    (points.get(b.id) ?? 0) - (points.get(a.id) ?? 0)
    || b.rating - a.rating
    || a.name.localeCompare(b.name)
  );
  const opponents = new Map<string, Set<string>>();
  const playersWithBye = new Set<string>();
  for (const pairing of pairings) {
    if (pairing.black_player_id) {
      if (!opponents.has(pairing.white_player_id)) opponents.set(pairing.white_player_id, new Set());
      if (!opponents.has(pairing.black_player_id)) opponents.set(pairing.black_player_id, new Set());
      opponents.get(pairing.white_player_id)?.add(pairing.black_player_id);
      opponents.get(pairing.black_player_id)?.add(pairing.white_player_id);
    } else if (pairing.result === 'bye') {
      playersWithBye.add(pairing.white_player_id);
    }
  }

  const unpaired = [...ranked];
  const nextRound: Array<{ white_player_id: string; black_player_id: string | null; result: PairingResult }> = [];
  if (unpaired.length % 2 === 1) {
    let byeIndex = -1;
    for (let i = unpaired.length - 1; i >= 0; i -= 1) {
      if (!playersWithBye.has(unpaired[i].id)) {
        byeIndex = i;
        break;
      }
    }
    if (byeIndex < 0) byeIndex = unpaired.length - 1;
    const [byePlayer] = unpaired.splice(byeIndex, 1);
    nextRound.push({ white_player_id: byePlayer.id, black_player_id: null, result: 'bye' });
  }

  while (unpaired.length > 0) {
    const white = unpaired.shift()!;
    const whitePoints = points.get(white.id) ?? 0;
    const candidates = unpaired
      .map((player, index) => ({ player, index }))
      .filter(({ player }) => !opponents.get(white.id)?.has(player.id))
      .sort((a, b) =>
        Math.abs(whitePoints - (points.get(a.player.id) ?? 0)) - Math.abs(whitePoints - (points.get(b.player.id) ?? 0))
        || b.player.rating - a.player.rating
        || a.player.name.localeCompare(b.player.name)
      );
    if (candidates.length === 0) {
      return { error: 'Swiss pairings cannot avoid a repeat opponent for this round.', pairings: [] };
    }
    const [opponent] = unpaired.splice(candidates[0].index, 1);

    // Colour balancing (P0): prefer White for the player who
    // has had White fewer times, and avoid giving the same
    // player White two rounds in a row when the other player
    // just had Black. This is a simple, deterministic rule —
    // not a full FIDE Dutch system — and it is documented as
    // such in NOTES.md. Pairing avoidance above is unchanged:
    // the pair itself is chosen first, colours second.
    let whiteId = white.id;
    let blackId = opponent.id;
    const whiteStats = tieBreaks.get(white.id);
    const blackStats = tieBreaks.get(opponent.id);
    const whiteWhites = whiteStats?.whiteCount ?? 0;
    const blackWhites = blackStats?.whiteCount ?? 0;
    if (
      blackWhites < whiteWhites ||
      (blackWhites === whiteWhites &&
        whiteStats?.lastColour === 'white' &&
        blackStats?.lastColour === 'black')
    ) {
      whiteId = opponent.id;
      blackId = white.id;
    }

    nextRound.push({ white_player_id: whiteId, black_player_id: blackId, result: 'pending' });
  }
  return { error: null, pairings: nextRound };
}

export function TournamentPairingsPanel({ tournamentId, isManager, format }: { tournamentId: string; isManager: boolean; format: string }) {
  const { t } = useLanguage();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { data: roundData, error: roundError } = await supabase
      .from('tournament_rounds')
      .select('id, round_number, status')
      .eq('tournament_id', tournamentId)
      .order('round_number');
    if (roundError) throw roundError;
    const roundIds = (roundData ?? []).map((round) => round.id);
    let pairings: Pairing[] = [];
    if (roundIds.length) {
      const { data: pairingData, error: pairingError } = await supabase
        .from('tournament_pairings')
        .select('id, round_id, white_player_id, black_player_id, result')
        .in('round_id', roundIds);
      if (pairingError) throw pairingError;
      pairings = (pairingData ?? []) as Pairing[];
    }
    setRounds((roundData ?? []).map((round) => ({
      id: round.id,
      round_number: round.round_number,
      status: round.status,
      pairings: pairings.filter((pairing) => pairing.round_id === round.id),
    })));

    if (isManager) {
      const { data: registrationData, error: registrationError } = await supabase
        .from('registrations')
        .select('player_id, rating, player:profiles!registrations_player_id_fkey(full_name)')
        .eq('tournament_id', tournamentId)
        .eq('status', 'confirmed');
      if (registrationError) throw registrationError;
      setEntrants(((registrationData ?? []) as unknown as RegistrationRecord[]).map((registration) => ({
        id: registration.player_id,
        name: registration.player?.full_name ?? 'Player',
        rating: registration.rating ?? 0,
      })));
    } else {
      const ids = [...new Set(pairings.flatMap((pairing) => [pairing.white_player_id, pairing.black_player_id].filter((id): id is string => Boolean(id))))];
      if (ids.length) {
        const { data: playerData, error: playerError } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        if (playerError) throw playerError;
        setEntrants((playerData ?? []).map((player) => ({ id: player.id, name: player.full_name, rating: 0 })));
      } else {
        setEntrants([]);
      }
    }
  }, [isManager, tournamentId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadData()
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load tournament pairings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadData]);

  const entrantById = useMemo(() => new Map(entrants.map((entrant) => [entrant.id, entrant])), [entrants]);
  const allPairings = useMemo(() => rounds.flatMap((round) => round.pairings), [rounds]);
  const points = useMemo(() => calculatePoints(allPairings), [allPairings]);
  const tieBreaks = useMemo(() => calculateTieBreaks(allPairings), [allPairings]);
  const standings = useMemo<Standing[]>(() => {
    const ids = isManager ? entrants.map((entrant) => entrant.id) : [...new Set(allPairings.flatMap((pairing) => [pairing.white_player_id, pairing.black_player_id].filter((id): id is string => Boolean(id))))];
    return ids.map((id) => {
      const entrant = entrantById.get(id);
      const tb = tieBreaks.get(id);
      return {
        id,
        name: entrant?.name ?? t('Player'),
        rating: entrant?.rating ?? 0,
        points: points.get(id) ?? 0,
        buchholz: tb?.buchholz ?? 0,
        sonnebornBerger: tb?.sonnebornBerger ?? 0,
        whiteCount: tb?.whiteCount ?? 0,
        blackCount: tb?.blackCount ?? 0,
      };
    }).sort((a, b) =>
      b.points - a.points
      || b.buchholz - a.buchholz
      || b.sonnebornBerger - a.sonnebornBerger
      || b.rating - a.rating
      || a.name.localeCompare(b.name));
  }, [allPairings, entrantById, entrants, isManager, points, tieBreaks, t]);
  const lastRound = rounds[rounds.length - 1];
  const roundCreationBlockReason = loading
    ? null
    : entrants.length < 2
      ? t('Need at least two confirmed participants to create a round.')
      : lastRound && lastRound.status !== 'completed'
        ? t('Enter all results in the current round before creating the next one.')
        : null;

  async function createNextRound() {
    if (format !== 'swiss' || entrants.length < 2) return;
    setSaving(true);
    setError(null);
    if (lastRound?.status !== 'completed') {
      setError(t('Enter all results in the current round before creating the next one.'));
      setSaving(false);
      return;
    }
    const generated = buildSwissPairs(entrants, allPairings);
    if (generated.error) {
      setError(t(generated.error));
      setSaving(false);
      return;
    }
    const { data: round, error: roundError } = await supabase
      .from('tournament_rounds')
      .insert({ tournament_id: tournamentId, round_number: (lastRound?.round_number ?? 0) + 1 })
      .select('id, round_number, status')
      .single();
    if (roundError || !round) {
      setError(roundError?.message ?? t('Could not create the tournament round.'));
      setSaving(false);
      return;
    }
    const { error: pairingsError } = await supabase
      .from('tournament_pairings')
      .insert(generated.pairings.map((pairing) => ({ ...pairing, round_id: round.id })));
    if (pairingsError) {
      const { error: cleanupError } = await supabase.from('tournament_rounds').delete().eq('id', round.id);
      setError(cleanupError ? `${pairingsError.message} ${t('The incomplete round could not be removed:')} ${cleanupError.message}` : pairingsError.message);
    } else {
      await loadData().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load tournament pairings.'));
    }
    setSaving(false);
  }

  async function saveResult(round: Round, pairing: Pairing, result: PairingResult) {
    if (result === 'bye') return;
    setError(null);
    const { error: updateError } = await supabase.from('tournament_pairings').update({ result }).eq('id', pairing.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    const pending = round.pairings.filter((item) => item.id !== pairing.id && item.result === 'pending').length + (result === 'pending' ? 1 : 0);
    if (pending === 0) {
      const { error: roundError } = await supabase.from('tournament_rounds').update({ status: 'completed' }).eq('id', round.id);
      if (roundError) setError(roundError.message);
    } else if (round.status === 'completed') {
      const { error: roundError } = await supabase.from('tournament_rounds').update({ status: 'open' }).eq('id', round.id);
      if (roundError) setError(roundError.message);
    }
    await loadData().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load tournament pairings.'));
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10"><Trophy className="h-5 w-5 text-brand-400" /></div><div><h2 className="text-xl font-bold text-white">{t('Rounds and Standings')}</h2><p className="text-sm text-gray-500">{format === 'swiss' ? t('Swiss pairings with Buchholz and Sonneborn-Berger tie-breaks; organizers confirm results.') : t('Automatic pairings are currently available for Swiss tournaments only.')}</p></div></div>
        {isManager && format === 'swiss' && <Button onClick={() => void createNextRound()} disabled={saving || entrants.length < 2 || (rounds.length > 0 && rounds[rounds.length - 1].status !== 'completed')}>{saving ? t('Creating round...') : t('Create next round')}</Button>}
      </div>
      {isManager && format === 'swiss' && roundCreationBlockReason && <p className="-mt-2 mb-4 text-sm text-gray-500">{roundCreationBlockReason} {entrants.length < 2 && `${t('Confirmed participants')}: ${entrants.length}/2`}</p>}
      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-error-500/20 bg-error-500/10 p-3 text-sm text-error-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t(error)}</div>}
      {loading ? <p className="text-sm text-gray-500">{t('Loading tournament pairings...')}</p> : (
        <>
          {rounds.map((round) => (
            <section key={round.id} className="mb-6">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-white">{t('Round')} {round.round_number}</h3><span className={`text-xs ${round.status === 'completed' ? 'text-success-300' : 'text-amber-300'}`}>{t(round.status)}</span></div>
              <div className="space-y-2">
                {round.pairings.map((pairing, pairingIndex) => {
                  const white = entrantById.get(pairing.white_player_id)?.name ?? t('Player');
                  const black = pairing.black_player_id ? entrantById.get(pairing.black_player_id)?.name ?? t('Player') : t('Bye');
                  // Board numbers are display-only, numbered in
                  // pairing order within the round. Byes get no board.
                  const boardNumber = pairing.black_player_id
                    ? round.pairings.slice(0, pairingIndex).filter((p) => p.black_player_id).length + 1
                    : null;
                  return (
                    <div key={pairing.id} className="grid gap-2 rounded-lg bg-surface-800/70 p-3 sm:grid-cols-[auto_1fr_auto_1fr_auto] sm:items-center">
                      <span className="text-xs font-semibold text-gray-500">{boardNumber !== null ? `${t('Board')} ${boardNumber}` : t('Bye')}</span>
                      <span className="truncate text-sm text-white">{white}</span><span className="text-center text-xs text-gray-500">{pairing.result === 'bye' ? t('Bye') : '—'}</span><span className="truncate text-sm text-white">{black}</span>
                      {isManager && pairing.result !== 'bye' ? (
                        <select aria-label={t('Pairing result')} value={pairing.result} onChange={(event) => void saveResult(round, pairing, event.target.value as PairingResult)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-white">
                          <option value="pending">{t('Result pending')}</option><option value="white_win">{t('White wins')}</option><option value="draw">{t('Draw')}</option><option value="black_win">{t('Black wins')}</option>
                        </select>
                      ) : <span className="text-right text-xs text-gray-400">{t(pairing.result)}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="border-t border-surface-700 pt-5">
            <h3 className="mb-3 font-semibold text-white">{t('Standings')}</h3>
            <p className="mb-3 text-xs text-gray-500">{t('Tie-breaks: Buchholz (BH) is the sum of opponents’ points; Sonneborn-Berger (SB) counts points of opponents beaten, plus half the points of opponents drawn.')}</p>
            {standings.length === 0 ? <p className="text-sm text-gray-500">{t('Standings appear after the first round is paired.')}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm"><thead className="text-xs uppercase text-gray-500"><tr><th className="pb-2 pr-4">{t('Rank')}</th><th className="pb-2 pr-4">{t('Player')}</th><th className="pb-2 text-right">{t('Points')}</th><th className="pb-2 text-right">BH</th><th className="pb-2 text-right">SB</th><th className="pb-2 text-right">{t('W-B')}</th></tr></thead><tbody>{standings.map((standing, index) => <tr key={standing.id} className="border-t border-surface-800"><td className="py-2 pr-4 text-gray-500">{index + 1}</td><td className="py-2 pr-4 text-gray-200">{standing.name}</td><td className="py-2 text-right font-semibold text-brand-300">{standing.points}</td><td className="py-2 text-right text-gray-300">{formatTieBreak(standing.buchholz)}</td><td className="py-2 text-right text-gray-300">{formatTieBreak(standing.sonnebornBerger)}</td><td className="py-2 text-right text-gray-500">{standing.whiteCount}-{standing.blackCount}</td></tr>)}</tbody></table>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
