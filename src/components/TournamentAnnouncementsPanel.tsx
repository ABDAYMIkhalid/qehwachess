import { useCallback, useEffect, useState } from 'react';
import { Megaphone, Send } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { formatDate } from '@/lib/utils';
import type { TournamentAnnouncement } from '@/types';

// P1 — organiser announcement to a tournament's confirmed players.
//
// One row in tournament_announcements per announcement, shown on
// the tournament page to confirmed players + the organiser/admin.
// This is deliberately NOT a broadcast of community_messages DMs:
// community_messages is 1-to-1 / meetup chat (sender_id,
// recipient_id, meetup_id — no tournament_id column), so a
// broadcast there would be one DM insert per player and would
// spam every player's inbox. See the P1 migration §C for the
// table and RLS (read: organiser / admin / confirmed players
// only; insert: organiser / admin only, sender_id = caller).
//
// No push/email notification in this bundle: the announcement is
// visible on the tournament page, where confirmed players already
// go for the QR code and pairings. Adding notifications is a
// separate piece of work — do not claim players are notified.
//
// Props: tournamentId, plus what the caller already knows —
// canManageTournament (admin or organiser, same value the detail
// page passes to TournamentPairingsPanel) and whether the viewer
// is a confirmed player. The panel renders nothing at all for
// anyone else (not even an empty card), so waitlisted players
// and strangers cannot tell whether announcements exist.

interface AnnouncementRow extends TournamentAnnouncement {
  sender: { full_name: string; avatar_url: string | null } | null;
}

export function TournamentAnnouncementsPanel({
  tournamentId,
  isManager,
  isConfirmedPlayer,
}: {
  tournamentId: string;
  isManager: boolean;
  isConfirmedPlayer: boolean;
}) {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canView = isManager || isConfirmedPlayer;

  const loadAnnouncements = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from('tournament_announcements')
      .select('id, tournament_id, sender_id, body, created_at, sender:profiles!tournament_announcements_sender_id_fkey(full_name, avatar_url)')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (queryError) throw queryError;
    setAnnouncements((data ?? []) as unknown as AnnouncementRow[]);
  }, [tournamentId]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void loadAnnouncements()
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load announcements.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canView, loadAnnouncements]);

  async function sendAnnouncement() {
    const body = draft.trim();
    if (!body || !user || !isManager) return;
    if (body.length > 2000) {
      setError(t('Announcement is too long (maximum 2000 characters).'));
      return;
    }
    // Confirm before sending: this is visible to every confirmed
    // player at once. There is no unsend in this bundle (the
    // table has no UPDATE/DELETE policy — append-only).
    if (!confirm(t('Send this announcement to all confirmed players? It will appear on the tournament page.'))) return;
    setSending(true);
    setError(null);
    setSuccess(null);
    const { error: insertError } = await supabase
      .from('tournament_announcements')
      .insert({ tournament_id: tournamentId, sender_id: user.id, body });
    if (insertError) {
      setError(insertError.message);
    } else {
      setDraft('');
      setSuccess(t('Announcement sent to confirmed players.'));
      await loadAnnouncements().catch((loadError: unknown) =>
        setError(loadError instanceof Error ? loadError.message : 'Could not load announcements.'));
    }
    setSending(false);
  }

  if (!canView) return null;

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10">
          <Megaphone className="h-5 w-5 text-brand-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">{t('Announcements')}</h2>
          <p className="text-sm text-gray-500">
            {isManager
              ? t('Messages for all confirmed players. They appear on this page only — no individual messages are sent.')
              : t('Messages from the organizer for confirmed players.')}
          </p>
        </div>
      </div>

      {isManager && (
        <div className="mb-5">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            maxLength={2000}
            placeholder={t('Write an announcement for confirmed players...')}
            aria-label={t('Announcement message')}
            className="w-full rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-brand-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-500">{draft.length}/2000</span>
            <Button onClick={() => void sendAnnouncement()} disabled={sending || !draft.trim()}>
              <Send className="h-4 w-4" />
              {sending ? t('Sending...') : t('Send to confirmed players')}
            </Button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-4 text-sm text-error-400">{t(error)}</p>
      )}
      {success && (
        <p role="status" className="mb-4 text-sm text-success-300">{success}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">{t('Loading announcements...')}</p>
      ) : announcements.length === 0 ? (
        <p className="text-sm text-gray-500">{t('No announcements yet.')}</p>
      ) : (
        <ul className="space-y-3">
          {announcements.map((announcement) => (
            <li key={announcement.id} className="rounded-lg bg-surface-800/70 p-4">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-white">
                  {announcement.sender?.full_name ?? t('Organizer')}
                </span>
                <span className="shrink-0 text-xs text-gray-500">
                  {formatDate(announcement.created_at, language)}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-300">{announcement.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
