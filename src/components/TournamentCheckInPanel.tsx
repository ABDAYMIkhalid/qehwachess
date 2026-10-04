import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, QrCode, ScanLine } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface CheckInRow {
  id: string;
  status: string;
  checked_in_at: string | null;
  player: { full_name: string; username: string | null } | null;
}

interface CheckInResult {
  registration_id: string;
  player_name: string;
  checked_in_at: string;
}

function isCheckInResult(value: unknown): value is CheckInResult {
  if (!value || typeof value !== 'object') return false;
  return 'registration_id' in value
    && typeof value.registration_id === 'string'
    && 'player_name' in value
    && typeof value.player_name === 'string'
    && 'checked_in_at' in value
    && typeof value.checked_in_at === 'string';
}

export function TournamentCheckInPanel({ tournamentId }: { tournamentId: string }) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rows, setRows] = useState<CheckInRow[]>([]);
  const [token, setToken] = useState('');
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadRegistrations() {
      const { data, error: queryError } = await supabase
        .from('registrations')
        .select('id, status, checked_in_at, player:profiles!registrations_player_id_fkey(full_name, username)')
        .eq('tournament_id', tournamentId)
        .eq('status', 'confirmed')
        .order('registered_at');
      if (!active) return;
      if (queryError) setError(queryError.message);
      setRows((data ?? []) as unknown as CheckInRow[]);
      setLoading(false);
    }
    void loadRegistrations();
    return () => { active = false; };
  }, [tournamentId]);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let active = true;
    let controls: { stop: () => void } | undefined;
    const video = videoRef.current;
    void import('@zxing/browser').then(({ BrowserQRCodeReader }) => {
      if (!active) return undefined;
      const reader = new BrowserQRCodeReader();
      return reader.decodeFromVideoDevice(undefined, video, (result) => {
        if (!active || !result) return;
        setToken(result.getText());
        setScanning(false);
      });
    }).then((scannerControls) => {
      if (!scannerControls) return;
      if (active) controls = scannerControls;
      else scannerControls.stop();
    }).catch((scanError: unknown) => {
      if (!active) return;
      setError(scanError instanceof Error ? scanError.message : 'Could not start the camera scanner.');
      setScanning(false);
    });
    return () => {
      active = false;
      controls?.stop();
    };
  }, [scanning]);

  async function checkIn() {
    const normalizedToken = token.trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedToken)) {
      setError(t('Enter a valid check-in QR code.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    const { data, error: rpcError } = await supabase.rpc('check_in_tournament_registration', { p_token: normalizedToken });
    if (rpcError) {
      setError(rpcError.message);
    } else if (!isCheckInResult(data)) {
      setError(t('The check-in response was invalid.'));
    } else {
      setRows((current) => current.map((row) => row.id === data.registration_id
        ? { ...row, checked_in_at: data.checked_in_at }
        : row));
      setSuccess(`${data.player_name} ${t('checked in successfully.')}`);
      setToken('');
    }
    setSubmitting(false);
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10"><QrCode className="h-5 w-5 text-brand-400" /></div>
        <div><h2 className="text-xl font-bold text-white">{t('Tournament Check-in')}</h2><p className="text-sm text-gray-500">{t('Scan a player QR code or enter its code manually.')}</p></div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          {scanning && <video ref={videoRef} className="mb-3 aspect-video w-full rounded-xl bg-black object-cover" muted playsInline />}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={token}
              onChange={(event) => setToken(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void checkIn(); }}
              placeholder={t('Paste scanned QR token')}
              aria-label={t('Check-in token')}
              className="min-w-0 flex-1 rounded-lg border border-surface-700 bg-surface-800 px-3.5 py-2.5 text-white"
            />
            <Button onClick={() => void checkIn()} disabled={submitting || !token.trim()}>{submitting ? t('Checking in...') : t('Check in')}</Button>
          </div>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setError(null); setScanning((current) => !current); }}>
            <ScanLine className="h-4 w-4" />{scanning ? t('Stop camera') : t('Scan with camera')}
          </Button>
          {error && <p role="alert" className="mt-3 text-sm text-error-400">{t(error)}</p>}
          {success && <p role="status" className="mt-3 flex items-center gap-2 text-sm text-success-300"><CheckCircle2 className="h-4 w-4" />{success}</p>}
        </div>

        <div>
          <h3 className="mb-3 text-sm font-semibold text-gray-300">{t('Confirmed participants')} ({rows.filter((row) => row.checked_in_at).length}/{rows.length})</h3>
          {loading ? <p className="text-sm text-gray-500">{t('Loading participants...')}</p> : rows.length === 0 ? (
            <p className="text-sm text-gray-500">{t('No confirmed participants yet.')}</p>
          ) : (
            <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {rows.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-800/70 px-3 py-2">
                  <span className="truncate text-sm text-white">{row.player?.full_name ?? t('Player')}</span>
                  <span className={`shrink-0 text-xs ${row.checked_in_at ? 'text-success-300' : 'text-gray-500'}`}>{row.checked_in_at ? t('Checked in') : t('Not checked in')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}
