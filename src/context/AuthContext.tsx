// P1 DRAFT — full corrected file. Base: src/context/AuthContext.tsx on
// main @ 75c3541a309811fb8f7ef1a6b0577955ed7f200d (SHA b23ad56bc7c6dbe2267648725ebc1485a8d58734).
// UNTESTED — see PART-SUMMARY.md and TEST-CHECKLIST.md.
//
// What changed vs main (Scope E — organiser approval):
//   * ensureProfile() NO LONGER trusts user_metadata.role. On main it
//     (a) inserted a new profile with role='organizer' when the user
//     picked "Organize" at sign-up, and (b) PROMOTED an existing
//     'player' to 'organizer' on sign-in (old lines 92-102).
//     user_metadata is client-controlled, so anyone could self-promote
//     by editing it. Now: every new profile is inserted with
//     role='player'; picking "Organize" only records a PENDING
//     organiser request (profiles.organizer_request_status='pending'
//     + an organizer_requests row, via the request_organizer_role()
//     RPC). An existing player who signs in with role='organizer' in
//     their metadata gets the same pending request — never a role.
//   * signUp() return type gains `organizerRequested?: boolean` so
//     SignUpPage can tell the user their request is pending instead
//     of silently sending them to the player dashboard (see
//     patches/PATCH-SignUpPage-organizer-request.md). The `role`
//     argument is still passed through into auth metadata — ONLY so
//     ensureProfile() knows a request was made. Metadata is untrusted;
//     the database enforces player-only creation (migration
//     20261126000003 tightens the profiles INSERT policy and adds a
//     trigger that blocks non-admin role changes).
//   * NEW: requestOrganizerRole() — lets an already-signed-in player
//     request organiser status later (e.g. from ProfilePage). It
//     calls the request_organizer_role() RPC and refreshes the
//     profile. Additive; no existing caller is changed.
//   * Promotion itself happens ONLY in review_organizer_request()
//     (SECURITY DEFINER, admin-checked) — there is deliberately no
//     client code path that writes role='organizer' anywhere in this
//     file. An admin cannot promote via a plain UPDATE either: the v2
//     profiles UPDATE policy only allows a user to update their OWN
//     row, which is why the RPC exists.
//   * Back-compat: existing organisers are untouched. The migration
//     backfills them as approved, loadProfile() already selects '*'
//     (so it picks up organizer_request_status), and signIn() still
//     returns { error } only. A requesting user stays role='player'
//     until approved, so the P0 register_for_tournament() check
//     (role='player') keeps working for them — they can play while
//     they wait.
//   * Fallback: if migration 20261126000003 has NOT been applied yet,
//     requestOrganizerRole()/ensureProfile() fall back to a direct
//     insert into organizer_requests + a profile-field update, and
//     surface the error instead of failing silently. Remove the
//     fallback once the migration is applied everywhere (it is marked
//     FALLBACK below).
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Profile, UserRole } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    cityId: string,
    chessAccounts: {
      username: string;
      lichessUsername: string;
      chesscomUsername: string;
      fideId: string;
    }
  ) => Promise<{ error: string | null; confirmationRequired?: boolean; organizerRequested?: boolean }>;
  resendSignupConfirmation: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // P1 (Scope E): file (or re-file) an organiser request for the
  // signed-in player. Does NOT change the role — an admin approves.
  requestOrganizerRole: () => Promise<{ error: string | null; alreadyRequested?: boolean }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await loadProfile(session.user.id);
          setLoading(false);
        })();
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        (async () => {
          await loadProfile(session.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*, city:cities(*)')
      .eq('id', userId)
      .maybeSingle();
    setProfile(data as Profile | null);
  }

  async function refreshProfile() {
    if (user) await loadProfile(user.id);
  }

  // P1 (Scope E): file the caller's organiser request through the
  // request_organizer_role() RPC (migration 20261126000003). The RPC
  // is idempotent (returns the existing pending request) and updates
  // profiles.organizer_request_status for us.
  // FALLBACK (remove once the migration is applied everywhere): if
  // the RPC does not exist yet (PostgREST error PGRST202 / 404), do
  // the two writes directly and surface any error. The direct path
  // is still safe-ish — the profile update only ever sets the
  // request fields, never `role` — but it is not atomic, so the RPC
  // is preferred.
  async function fileOrganizerRequest(): Promise<{ error: string | null; alreadyRequested?: boolean }> {
    if (!user) return { error: 'Sign in to request organizer access.' };
    const { data, error: rpcError } = await supabase.rpc('request_organizer_role');
    if (!rpcError) {
      const status = (data as { status?: string } | null)?.status;
      return { error: null, alreadyRequested: status === 'pending' || status === 'already_organizer' || status === 'already_admin' };
    }
    // RPC missing (migration not applied) — fall back to direct writes.
    if (rpcError.code !== 'PGRST202' && rpcError.code !== '404' && !/could not find the function/i.test(rpcError.message)) {
      return { error: rpcError.message };
    }
    const { error: insertError } = await supabase.from('organizer_requests').insert({
      profile_id: user.id,
      status: 'pending',
    });
    // 23505 = a pending request already exists (partial unique index).
    if (insertError && insertError.code !== '23505') return { error: insertError.message };
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ organizer_request_status: 'pending', organizer_requested_at: new Date().toISOString() })
      .eq('id', user.id);
    if (updateError) return { error: updateError.message };
    return { error: null, alreadyRequested: insertError?.code === '23505' };
  }

  async function requestOrganizerRole() {
    const result = await fileOrganizerRequest();
    if (!result.error) await refreshProfile();
    return result;
  }

  async function ensureProfile(authUser: User) {
    const { data: existingProfile, error: lookupError } = await supabase
      .from('profiles')
      .select('id, role, organizer_request_status')
      .eq('id', authUser.id)
      .maybeSingle();

    if (lookupError) return { error: lookupError.message, organizerRequested: false };

    const metadata = authUser.user_metadata;
    // `role` in metadata is a REQUEST, not a fact. It is
    // client-controlled (anyone can set user_metadata), so it must
    // never decide the profile role. The database enforces this too
    // (migration 20261126000003: self-insert role='player' only +
    // trigger blocking non-admin role changes).
    const requestedOrganizer = metadata.role === 'organizer';

    if (existingProfile) {
      // Existing user signing in again. Never promote here — not even
      // if they previously picked "Organize". If they asked for
      // organiser status and are still a player without a pending
      // request, (re-)file the request.
      if (
        requestedOrganizer &&
        existingProfile.role === 'player' &&
        existingProfile.organizer_request_status !== 'pending'
      ) {
        const requestResult = await fileOrganizerRequestFor(authUser.id);
        if (requestResult.error) return { error: requestResult.error, organizerRequested: false };
        return { error: null, organizerRequested: true };
      }
      return { error: null, organizerRequested: false };
    }

    const fullName =
      (typeof metadata.full_name === 'string' && metadata.full_name) ||
      (typeof metadata.name === 'string' && metadata.name) ||
      authUser.email?.split('@')[0] ||
      'Player';
    const cityId = typeof metadata.city_id === 'string' ? metadata.city_id : null;

    // New profile: ALWAYS role='player'. An organiser request is
    // recorded separately (pending) and decided by an admin.
    const { error: insertError } = await supabase.from('profiles').upsert(
      {
        id: authUser.id,
        full_name: fullName,
        email: authUser.email ?? '',
        role: 'player',
        city_id: cityId,
        username: typeof metadata.username === 'string' ? metadata.username : null,
        lichess_username: typeof metadata.lichess_username === 'string' ? metadata.lichess_username : null,
        chesscom_username: typeof metadata.chesscom_username === 'string' ? metadata.chesscom_username : null,
        fide_id: typeof metadata.fide_id === 'string' ? metadata.fide_id : null,
        organizer_request_status: requestedOrganizer ? 'pending' : 'none',
        organizer_requested_at: requestedOrganizer ? new Date().toISOString() : null,
      },
      { onConflict: 'id', ignoreDuplicates: true }
    );

    if (insertError) return { error: insertError.message, organizerRequested: false };

    if (requestedOrganizer) {
      // The profile row now exists, so the RPC can find it. If the
      // RPC is missing (migration not applied), the profile fields
      // above already record the request; still try to create the
      // organizer_requests row directly so the admin queue sees it.
      const requestResult = await fileOrganizerRequestFor(authUser.id);
      if (requestResult.error) return { error: requestResult.error, organizerRequested: false };
      return { error: null, organizerRequested: true };
    }

    return { error: null, organizerRequested: false };
  }

  // Same as fileOrganizerRequest() but for a user id that is not
  // necessarily the `user` state yet (first sign-in / sign-up, where
  // AuthContext has not re-rendered). Uses supabase.auth.getUser()
  // instead of the `user` state. Kept separate so the two call sites
  // cannot drift apart silently.
  async function fileOrganizerRequestFor(authUserId: string): Promise<{ error: string | null }> {
    const { data, error: rpcError } = await supabase.rpc('request_organizer_role');
    if (!rpcError) {
      void data;
      return { error: null };
    }
    if (rpcError.code !== 'PGRST202' && rpcError.code !== '404' && !/could not find the function/i.test(rpcError.message)) {
      return { error: rpcError.message };
    }
    const { error: insertError } = await supabase.from('organizer_requests').insert({
      profile_id: authUserId,
      status: 'pending',
    });
    if (insertError && insertError.code !== '23505') return { error: insertError.message };
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ organizer_request_status: 'pending', organizer_requested_at: new Date().toISOString() })
      .eq('id', authUserId);
    if (updateError) return { error: updateError.message };
    return { error: null };
  }

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    if (!data.user) return { error: 'Sign-in succeeded but no user was returned.' };

    const profileResult = await ensureProfile(data.user);
    if (profileResult.error) return profileResult;

    await loadProfile(data.user.id);
    return { error: null };
  }

  async function signUp(
    email: string,
    password: string,
    fullName: string,
    role: UserRole,
    cityId: string,
    chessAccounts: {
      username: string;
      lichessUsername: string;
      chesscomUsername: string;
      fideId: string;
    }
  ) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          // P1: `role` in auth metadata is a REQUEST for organiser
          // status, not the role itself. ensureProfile() treats
          // 'organizer' here as "file a pending request" and always
          // creates the profile as 'player'. Do not read this value
          // anywhere else as if it were authoritative.
          role,
          city_id: cityId,
          username: chessAccounts.username.trim().replace(/^@/, ''),
          lichess_username: chessAccounts.lichessUsername.trim().replace(/^@/, '') || null,
          chesscom_username: chessAccounts.chesscomUsername.trim().replace(/^@/, '') || null,
          fide_id: chessAccounts.fideId.trim() || null,
        },
      },
    });

    if (error) {
      if (error.status === 429 || /rate.?limit/i.test(error.message)) {
        return {
          error:
            'Sign-ups are temporarily rate-limited by Supabase. Please wait a while before trying again.',
        };
      }
      return { error: error.message };
    }

    if (!data.user) return { error: 'Failed to create account' };

    // P1: the organiser request is recorded when the profile is
    // created (first sign-in with a session, via ensureProfile).
    // Until email confirmation, no profile exists yet, so report the
    // request now and let ensureProfile() record it on sign-in.
    const organizerRequested = role === 'organizer';
    if (!data.session) {
      return { error: null, confirmationRequired: true, organizerRequested };
    }

    if (data.session) {
      const profileResult = await ensureProfile(data.user);
      if (profileResult.error) return profileResult;
      await loadProfile(data.user.id);
    }

    return { error: null, organizerRequested };
  }

  async function resendSignupConfirmation(email: string) {
    const { error } = await supabase.auth.resend({ type: 'signup', email });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
  }

  return (
    <AuthContext.Provider
      value={{ session, user, profile, loading, signIn, signUp, resendSignupConfirmation, signOut, refreshProfile, requestOrganizerRole }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
