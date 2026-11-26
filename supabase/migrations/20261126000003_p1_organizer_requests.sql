-- P1 — Organiser approval: a user may REQUEST 'organizer' but is
-- created as 'player' with a pending request; only an admin can
-- promote them.
--
-- DRAFT — UNTESTED. Do not apply to production before running
-- TEST-CHECKLIST.md (Scope E). Requires main @
-- 75c3541a309811fb8f7ef1a6b0577955ed7f200d, including:
--   * supabase/migrations/20261002170804_chess_morocco_schema_v2.sql (v2)
--     (profiles.role CHECK ('player','organizer','admin'); the v2
--     INSERT policy currently allows role IN ('player','organizer')
--     and the UPDATE policy allows a user to update their own row —
--     both are tightened/guarded below)
--   * supabase/migrations/20261126000000_p0_registration_checkin.sql (P0)
--     (register_for_tournament() raises unless the caller's profile
--     role = 'player' — so a requesting user stays a player, and can
--     still register for tournaments, until an admin approves them.
--     That RPC needs NO change in this migration.)
--
-- WHY THIS MIGRATION IS NECESSARY (not just a client change)
--   AuthContext.ensureProfile on main reads `user_metadata.role` and
--   (a) inserts a new profile with role='organizer' when the user
--   picked "Organize" at sign-up, and (b) PROMOTES an existing
--   'player' to 'organizer' on sign-in (AuthContext.tsx lines
--   92-102, SHA b23ad56b…). user_metadata is client-controlled, so
--   anyone could self-promote. The corrected AuthContext in this
--   bundle stops asking for that — but a client fix alone is not
--   enforcement: the old code (or a raw API call) could still write
--   role='organizer'. So this migration enforces it in the database:
--     1. Self-insert may only create role='player'.
--     2. A BEFORE UPDATE trigger blocks any non-admin role change
--        (and any non-admin change to organizer_request_status other
--        than requesting 'pending' for yourself).
--     3. Promotion happens ONLY inside review_organizer_request(),
--        a SECURITY DEFINER function that checks the caller is an
--        admin. This matters because the v2 profiles UPDATE policy
--        lets a user update ONLY their own row — an admin literally
--        cannot promote someone else with a plain UPDATE under RLS.
--
-- BACKFILL (existing organisers are NOT broken)
--   Every profile that already has role='organizer' on the day this
--   migration runs is backfilled as approved: organizer_requests row
--   with status='approved' and profiles.organizer_request_status=
--   'approved'. Nobody loses organiser access. reviewed_by is NULL
--   for backfilled rows (no admin performed the review — it is a
--   migration backfill, not a decision).

-- ============ PROFILE COLUMNS ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS organizer_request_status text NOT NULL DEFAULT 'none'
    CHECK (organizer_request_status IN ('none', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS organizer_requested_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_profiles_organizer_request_status
  ON public.profiles (organizer_request_status)
  WHERE organizer_request_status = 'pending';

-- ============ ORGANIZER_REQUESTS TABLE ============
CREATE TABLE IF NOT EXISTS public.organizer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- One pending request per profile at a time. (Approved/rejected
-- history rows are kept — the partial index only constrains 'pending'.)
CREATE UNIQUE INDEX IF NOT EXISTS organizer_requests_one_pending_uidx
  ON public.organizer_requests (profile_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS organizer_requests_status_idx
  ON public.organizer_requests (status, requested_at DESC);

ALTER TABLE public.organizer_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own organizer requests" ON public.organizer_requests;
CREATE POLICY "Users can view own organizer requests" ON public.organizer_requests
  FOR SELECT TO authenticated USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all organizer requests" ON public.organizer_requests;
CREATE POLICY "Admins can view all organizer requests" ON public.organizer_requests
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

DROP POLICY IF EXISTS "Users can file own organizer request" ON public.organizer_requests;
CREATE POLICY "Users can file own organizer request" ON public.organizer_requests
  FOR INSERT TO authenticated
  WITH CHECK (profile_id = auth.uid() AND status = 'pending');
-- No UPDATE / DELETE policy: requests are decided only through
-- review_organizer_request() below. (A user who changes their mind
-- simply leaves the request pending; an admin rejects it.)

-- ============ TIGHTEN PROFILES SELF-INSERT ============
-- Was (v2): WITH CHECK (id = auth.uid() AND role IN ('player','organizer')).
-- Now: a user inserting their own profile may only create role='player'.
-- The corrected AuthContext always inserts 'player'; admins are created
-- out-of-band (dashboard / SQL), never through self sign-up.
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND role = 'player');
-- The v2 UPDATE policy ("Users can update own profile", WITH CHECK role
-- IN ('player','organizer')) is deliberately LEFT in place: an existing
-- organiser must still be able to edit their own bio/avatar. Role
-- changes are blocked by the trigger below instead, which can tell a
-- self-promotion apart from a legitimate own-profile edit.

-- ============ ROLE-CHANGE GUARD TRIGGER ============
-- Blocks privilege escalation at the database layer even if a client
-- (old app version, raw fetch, stolen anon key) tries it directly.
CREATE OR REPLACE FUNCTION public.prevent_role_self_promotion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean := false;
BEGIN
  -- Service-role / direct SQL (auth.uid() IS NULL) bypasses this
  -- check: it is the escape hatch for out-of-band admin creation.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) INTO v_is_admin;

  IF NEW.role IS DISTINCT FROM OLD.role AND NOT v_is_admin THEN
    RAISE EXCEPTION 'Only an admin can change a profile role';
  END IF;

  IF NEW.organizer_request_status IS DISTINCT FROM OLD.organizer_request_status
     AND NOT v_is_admin
     AND NOT (
       -- A non-admin may only move their OWN request to 'pending'
       -- (from 'none' or 'rejected' — i.e. file, or re-file after a
       -- rejection). Approving/rejecting yourself is blocked.
       NEW.id = auth.uid()
       AND NEW.organizer_request_status = 'pending'
       AND OLD.organizer_request_status IN ('none', 'rejected')
     ) THEN
    RAISE EXCEPTION 'Only an admin can approve or reject an organizer request';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_role_self_promotion ON public.profiles;
CREATE TRIGGER profiles_prevent_role_self_promotion
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_promotion();

-- ============ REQUEST RPC (called by AuthContext) ============
-- Atomically: create the pending request row (if none pending) and
-- mark the caller's profile pending. Idempotent — calling it twice
-- returns the existing pending request.
CREATE OR REPLACE FUNCTION public.request_organizer_role()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_request public.organizer_requests%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = auth.uid() FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;
  IF v_profile.role IN ('organizer', 'admin') THEN
    RETURN jsonb_build_object('ok', true, 'status', 'already_' || v_profile.role);
  END IF;

  SELECT * INTO v_request FROM public.organizer_requests
  WHERE profile_id = auth.uid() AND status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.organizer_requests (profile_id, status)
    VALUES (auth.uid(), 'pending')
    RETURNING * INTO v_request;
  END IF;

  UPDATE public.profiles
  SET organizer_request_status = 'pending',
      organizer_requested_at = COALESCE(organizer_requested_at, now())
  WHERE id = auth.uid();

  RETURN jsonb_build_object('ok', true, 'status', 'pending', 'request_id', v_request.id);
END;
$$;

REVOKE ALL ON FUNCTION public.request_organizer_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_organizer_role() TO authenticated;

-- ============ REVIEW RPC (called by AdminDashboard only) ============
-- The ONLY path that changes a profile's role to 'organizer'.
-- Checks the caller is an admin, locks the request, updates the
-- request and the profile in one transaction. Approving a user who
-- is somehow already an organiser is a no-op on the role (still
-- marks the request approved) so re-reviews cannot error.
CREATE OR REPLACE FUNCTION public.review_organizer_request(
  p_request_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.organizer_requests%ROWTYPE;
  v_is_admin boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only an admin can review organizer requests';
  END IF;

  SELECT * INTO v_request FROM public.organizer_requests
  WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organizer request not found';
  END IF;
  IF v_request.status <> 'pending' THEN
    RAISE EXCEPTION 'Organizer request has already been reviewed';
  END IF;

  UPDATE public.organizer_requests
  SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END,
      reviewed_at = now(),
      reviewed_by = auth.uid(),
      note = p_note
  WHERE id = p_request_id;

  IF p_approve THEN
    UPDATE public.profiles
    SET role = 'organizer',
        organizer_request_status = 'approved'
    WHERE id = v_request.profile_id AND role = 'player';
    -- If the profile was already 'organizer'/'admin' (race/backfill),
    -- still record the approval on the request status column.
    UPDATE public.profiles
    SET organizer_request_status = 'approved'
    WHERE id = v_request.profile_id AND role <> 'player';
  ELSE
    UPDATE public.profiles
    SET organizer_request_status = 'rejected'
    WHERE id = v_request.profile_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'request_id', p_request_id,
    'profile_id', v_request.profile_id,
    'approved', p_approve
  );
END;
$$;

REVOKE ALL ON FUNCTION public.review_organizer_request(uuid, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_organizer_request(uuid, boolean, text) TO authenticated;

-- ============ BACKFILL: existing organisers stay organisers ============
-- Runs once, at migration time. New organisers after this point can
-- only be created through review_organizer_request().
UPDATE public.profiles
SET organizer_request_status = 'approved',
    organizer_requested_at = COALESCE(organizer_requested_at, created_at)
WHERE role = 'organizer'
  AND organizer_request_status <> 'approved';

INSERT INTO public.organizer_requests (profile_id, status, requested_at, reviewed_at, reviewed_by)
SELECT id, 'approved', created_at, now(), NULL
FROM public.profiles
WHERE role = 'organizer'
  AND NOT EXISTS (
    SELECT 1 FROM public.organizer_requests r
    WHERE r.profile_id = profiles.id AND r.status = 'approved'
  );

NOTIFY pgrst, 'reload schema';
