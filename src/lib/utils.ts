import { FeePaymentMode, TimeControlCategory, TournamentFormat, TournamentStatus } from '@/types';

type Language = 'en' | 'fr' | 'ar';

const dateLocales: Record<Language, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  ar: 'ar',
};

export function formatDate(dateStr: string, language: Language = 'en'): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(dateLocales[language], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateRange(startDate: string, endDate: string, language: Language = 'en'): string {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const locale = dateLocales[language];

  if (startDate === endDate) {
    return start.toLocaleDateString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.toLocaleDateString(locale, { day: 'numeric' })}–${end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
  }

  return `${start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${end.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

export function formatPrice(amount: number): string {
  if (amount === 0) return 'Free';
  return `${amount} MAD`;
}

export function getDaysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatLabel(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// P1 — split labels (NOTES.md §1). tournamentFormatLabels is
// SYSTEM-ONLY now. 'blitz' / 'rapid' / 'classical' moved to
// timeControlLabels below; do not re-add them here — any code
// still indexing this map with a time control is a bug the
// split is meant to surface at compile time.
export const tournamentFormatLabels: Record<TournamentFormat, string> = {
  'swiss': 'Swiss System',
  'round-robin': 'Round Robin',
  'knockout': 'Knockout',
  'simultaneous': 'Simultaneous',
};

export const timeControlLabels: Record<TimeControlCategory, string> = {
  'blitz': 'Blitz',
  'rapid': 'Rapid',
  'classical': 'Classical',
};

export const feePaymentModeLabels: Record<FeePaymentMode, string> = {
  'pay_at_venue': 'Pay at venue',
  'online_link': 'Pay online',
  'free': 'Free entry',
};

// Combined display label, e.g. "Swiss System · Rapid" or just
// "Swiss System" when no category is set. Compose it at the call
// site with t() applied to EACH part separately — do NOT pass a
// pre-joined string to t(), the joined string has no translation:
//   t(tournamentFormatLabels[t.format])
//     + (t.time_control_category ? ` · ${t(timeControlLabels[t.time_control_category])}` : '')
// (No helper is provided on purpose: a helper returning the
// joined English string would silently break fr/ar lookup.)

// Format a HH:MM (24h) start_time for display. Returns '' for
// null/empty/invalid input — callers fall back to 'TBD'.
// No timezone conversion: the value is venue-local wall time,
// matching the date columns (which are also wall dates).
export function formatTimeOfDay(time: string | null | undefined): string {
  if (!time) return '';
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(time.trim());
  if (!match) return '';
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

export const tournamentStatusLabels: Record<TournamentStatus, string> = {
  'draft': 'Draft',
  'pending': 'Pending Review',
  'published': 'Published',
  'cancelled': 'Cancelled',
  'completed': 'Completed',
};

export const tournamentStatusColors: Record<TournamentStatus, string> = {
  'draft': 'bg-gray-600/20 text-gray-300 border-gray-500/30',
  'pending': 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  'published': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  'cancelled': 'bg-red-500/20 text-red-300 border-red-500/30',
  'completed': 'bg-blue-500/20 text-blue-300 border-blue-500/30',
};

export function getChessPieceIcon(format: TournamentFormat): string {
  const icons: Record<TournamentFormat, string> = {
    'swiss': '♟',
    'round-robin': '♜',
    'knockout': '♞',
    'simultaneous': '♛',
  };
  return icons[format] || '♟';
}
