// P1 MERGED — src/types/index.ts.
// Combines:
//  - organiser-format: TournamentFormat (system-only), TimeControlCategory,
//    FeePaymentMode, RoundScheduleEntry, TournamentAnnouncement, and the
//    Tournament.start_time / round_schedule / time_control_category /
//    fee_payment_mode / payment_link fields.
//  - data-auth-rating: OrganizerRequestStatus, OrganizerRequestDecision,
//    OrganizerRequest, ClubRating, and Profile.organizer_request_status
//    (required — NOT NULL DEFAULT 'none' per migration 20261126000003)
//    + organizer_requested_at (string | null).
// Base: main @ 75c3541 (post-P0). No duplicate type/interface names.
// UNTESTED — merged file, needs `npm run typecheck`.
export type UserRole = 'player' | 'organizer' | 'admin';

export type TournamentStatus = 'draft' | 'pending' | 'published' | 'cancelled' | 'completed';

// P1 (Scope E) — organiser-request lifecycle. A user is always created
// as 'player'; 'organizer' is only reached through an admin approval
// (see supabase/migrations/20261126000003_p1_organizer_requests.sql).
// 'none' = never requested, 'pending' = awaiting an admin,
// 'approved' = was promoted (kept for history), 'rejected' = an admin
// said no (the user may request again).
export type OrganizerRequestStatus = 'none' | 'pending' | 'approved' | 'rejected';

export type OrganizerRequestDecision = 'pending' | 'approved' | 'rejected';

// P1 — format / time-control split (NOTES.md §1).
// TournamentFormat is the SYSTEM only (how players are paired).
// How fast the games are is TimeControlCategory, below.
// 'blitz' | 'rapid' | 'classical' are NO LONGER valid formats:
// the P1 migration backfills them to format='swiss' +
// time_control_category=<that value>. Do not re-add them here.
export type TournamentFormat =
  | 'swiss'
  | 'round-robin'
  | 'knockout'
  | 'simultaneous';

// Speed only — how fast the games are. Null = not set / casual.
// NOTE: 'casual' is intentionally NOT a category value: a casual
// (no-clock) event leaves this null and says so in time_control.
export type TimeControlCategory = 'blitz' | 'rapid' | 'classical';

// How the entry fee is collected. There is NO payment-provider
// integration in this bundle: 'online_link' only stores a URL
// the organiser pastes in (payment_link); 'pay_at_venue' means
// cash/card at the venue; 'free' is entry_fee 0.
export type FeePaymentMode = 'pay_at_venue' | 'online_link' | 'free';

// One entry of a tournament's round schedule (day-of tool, P1).
// day is an ISO date (YYYY-MM-DD, within start/end_date);
// start_time is HH:MM (24h, local venue time). round_number is
// 1-based and must be unique per tournament. label is free text,
// e.g. "Round 1" is the default when omitted.
export interface RoundScheduleEntry {
  round_number: number;
  day: string;
  start_time: string;
  label?: string | null;
}

export type RegistrationStatus = 'pending' | 'confirmed' | 'waitlisted' | 'cancelled';

export interface City {
  id: string;
  name: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
}

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  city_id: string | null;
  phone: string | null;
  bio: string | null;
  avatar_url: string | null;
  username: string | null;
  lichess_username: string | null;
  chesscom_username: string | null;
  fide_id: string | null;
  // P1 (Scope E). Added by 20261126000003_p1_organizer_requests.sql.
  // Lichess/Chess.com usernames above stay reference-only / unverified
  // (P0 'Unverified' badges); these two fields are the only new
  // trust-relevant columns on the profile.
  // organizer_request_status is REQUIRED (not optional): the column is
  // NOT NULL DEFAULT 'none' in migration 20261126000003.
  organizer_request_status: OrganizerRequestStatus;
  organizer_requested_at: string | null;
  created_at: string;
  city?: City | null;
}

export interface OrganizerRequest {
  id: string;
  profile_id: string;
  status: OrganizerRequestDecision;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  note: string | null;
  created_at: string;
  profile?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'username'> & {
    city?: Pick<City, 'id' | 'name'> | null;
  } | null;
}

// P1 (Scope C) — club rating from completed OTB tournament results
// ONLY. One row per (player, club). Never populated from Lichess,
// Chess.com or FIDE — see 20261126000002_p1_club_ratings.sql.
// `rating` starts at 1200, K=32 (same constants as
// src/lib/clubRating.ts; SQL is the source of truth).
export interface ClubRating {
  profile_id: string;
  club_id: string;
  rating: number;
  games: number;
  updated_at: string;
  profile?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'username'> | null;
  club?: Pick<Club, 'id' | 'name'> | null;
}

export interface PlayerAvailability {
  profile_id: string;
  time_control: 'Casual / no clock' | 'Blitz' | 'Rapid' | 'Classical';
  expires_at: string;
  updated_at: string;
}

export interface Club {
  id: string;
  name: string;
  city_id: string | null;
  description: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  organizer_id: string | null;
  created_at: string;
  city?: City | null;
  organizer?: Profile | null;
}

export interface Tournament {
  id: string;
  title: string;
  description: string;
  city_id: string;
  club_id: string | null;
  organizer_id: string;
  start_date: string;
  end_date: string;
  // P1: start_date/end_date stay DATE columns (see migration
  // 20261126000001 — they are NOT silently changed to timestamptz).
  // start_time is the day-of start time (HH:MM, venue-local) for
  // the first day; multi-day / per-round times live in
  // round_schedule below. Null = not set (pre-P1 rows).
  start_time: string | null;
  round_schedule: RoundScheduleEntry[] | null;
  venue: string;
  address: string | null;
  format: TournamentFormat;
  time_control: string | null;
  time_control_category: TimeControlCategory | null;
  fee_payment_mode: FeePaymentMode;
  payment_link: string | null;
  max_participants: number;
  registration_deadline: string | null;
  entry_fee: number;
  prize_fund: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: TournamentStatus;
  featured: boolean;
  image_url: string | null;
  created_at: string;
  updated_at: string;
  city?: City | null;
  club?: Club | null;
  organizer?: Profile | null;
  registration_count?: number;
}

export interface Registration {
  id: string;
  tournament_id: string;
  player_id: string;
  status: RegistrationStatus;
  rating: number | null;
  registered_at: string;
  check_in_token?: string | null;
  checked_in_at?: string | null;
  tournament?: Tournament | null;
  player?: Profile | null;
}

export interface CasualMeetup {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  city_id: string;
  venue: string;
  address: string | null;
  starts_at: string;
  time_control: string;
  skill_level: string;
  status: 'published' | 'cancelled';
  created_at: string;
  city?: City | null;
  creator?: Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'username'> | null;
}

export interface CommunityMessage {
  id: string;
  sender_id: string;
  recipient_id: string | null;
  meetup_id: string | null;
  body: string;
  created_at: string;
  sender?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  recipient?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  meetup?: Pick<CasualMeetup, 'id' | 'title' | 'creator_id'> | null;
}

// P1 — organiser announcement to a tournament's confirmed players.
// This is a SEPARATE table (tournament_announcements), NOT rows in
// community_messages: community_messages is 1-to-1 / meetup chat
// (sender_id, recipient_id, meetup_id — no tournament_id column,
// see MessagesPage.tsx, SHA 77e94747...), so broadcasting there
// would mean inserting one DM per player. One announcement row is
// shown to every confirmed player on the tournament page instead.
export interface TournamentAnnouncement {
  id: string;
  tournament_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
}

export type ClubMembershipStatus = 'pending' | 'active' | 'rejected';

export interface ClubMembership {
  id: string;
  club_id: string;
  profile_id: string;
  status: ClubMembershipStatus;
  joined_at: string;
  profile?: Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'username'> | null;
}

export interface TournamentWithRelations extends Tournament {
  city?: City | null;
  club?: Club | null;
  organizer?: Profile | null;
  registration_count?: number;
}
