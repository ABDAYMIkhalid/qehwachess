/*
# Chess Morocco - Initial Schema v2

Creates cities, profiles, clubs, tournaments, and registrations tables with RLS.
*/

-- ============ CITIES ============
CREATE TABLE IF NOT EXISTS cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  region text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view cities" ON cities;
CREATE POLICY "Public can view cities" ON cities FOR SELECT
TO anon, authenticated USING (true);

-- ============ PROFILES ============
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY,
  full_name text NOT NULL,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'organizer', 'admin')),
  city_id uuid REFERENCES cities(id),
  phone text,
  bio text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view profiles" ON profiles;
CREATE POLICY "Public can view profiles" ON profiles FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid() AND role IN ('player', 'organizer'));

DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid() AND role IN ('player', 'organizer'));

-- ============ CLUBS ============
CREATE TABLE IF NOT EXISTS clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  city_id uuid REFERENCES cities(id),
  description text NOT NULL DEFAULT '',
  logo_url text,
  contact_email text,
  contact_phone text,
  address text,
  organizer_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view clubs" ON clubs;
CREATE POLICY "Public can view clubs" ON clubs FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Organizers can create clubs" ON clubs;
CREATE POLICY "Organizers can create clubs" ON clubs FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('organizer', 'admin'))
);

DROP POLICY IF EXISTS "Organizers can update own clubs" ON clubs;
CREATE POLICY "Organizers can update own clubs" ON clubs FOR UPDATE
TO authenticated
USING (organizer_id = auth.uid())
WITH CHECK (organizer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update any club" ON clubs;
CREATE POLICY "Admins can update any club" ON clubs FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- ============ TOURNAMENTS ============
CREATE TABLE IF NOT EXISTS tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  city_id uuid REFERENCES cities(id) NOT NULL,
  club_id uuid REFERENCES clubs(id) ON DELETE SET NULL,
  organizer_id uuid NOT NULL DEFAULT auth.uid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  venue text NOT NULL,
  address text,
  format text NOT NULL DEFAULT 'swiss' CHECK (format IN ('swiss', 'round-robin', 'knockout', 'blitz', 'rapid', 'classical', 'simultaneous')),
  time_control text,
  max_participants integer NOT NULL DEFAULT 60,
  registration_deadline date,
  entry_fee numeric DEFAULT 0,
  prize_fund text,
  contact_email text,
  contact_phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft', 'pending', 'published', 'cancelled', 'completed')),
  featured boolean NOT NULL DEFAULT false,
  image_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view published tournaments" ON tournaments;
CREATE POLICY "Public can view published tournaments" ON tournaments FOR SELECT
TO anon, authenticated
USING (status = 'published');

DROP POLICY IF EXISTS "Organizers can view own tournaments" ON tournaments;
CREATE POLICY "Organizers can view own tournaments" ON tournaments FOR SELECT
TO authenticated
USING (organizer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can view all tournaments" ON tournaments;
CREATE POLICY "Admins can view all tournaments" ON tournaments FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "Organizers can create tournaments" ON tournaments;
CREATE POLICY "Organizers can create tournaments" ON tournaments FOR INSERT
TO authenticated
WITH CHECK (
  organizer_id = auth.uid()
  AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('organizer', 'admin'))
);

DROP POLICY IF EXISTS "Organizers can update own tournaments" ON tournaments;
CREATE POLICY "Organizers can update own tournaments" ON tournaments FOR UPDATE
TO authenticated
USING (organizer_id = auth.uid())
WITH CHECK (organizer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can update any tournament" ON tournaments;
CREATE POLICY "Admins can update any tournament" ON tournaments FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "Organizers can delete own tournaments" ON tournaments;
CREATE POLICY "Organizers can delete own tournaments" ON tournaments FOR DELETE
TO authenticated
USING (organizer_id = auth.uid());

DROP POLICY IF EXISTS "Admins can delete any tournament" ON tournaments;
CREATE POLICY "Admins can delete any tournament" ON tournaments FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- ============ REGISTRATIONS ============
CREATE TABLE IF NOT EXISTS registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  player_id uuid NOT NULL DEFAULT auth.uid(),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'waitlisted', 'cancelled')),
  rating integer,
  registered_at timestamptz DEFAULT now(),
  UNIQUE(tournament_id, player_id)
);

ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Players can view own registrations" ON registrations;
CREATE POLICY "Players can view own registrations" ON registrations FOR SELECT
TO authenticated
USING (player_id = auth.uid());

DROP POLICY IF EXISTS "Organizers can view tournament registrations" ON registrations;
CREATE POLICY "Organizers can view tournament registrations" ON registrations FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = registrations.tournament_id
    AND tournaments.organizer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can view all registrations" ON registrations;
CREATE POLICY "Admins can view all registrations" ON registrations FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

DROP POLICY IF EXISTS "Users can register for tournaments" ON registrations;
CREATE POLICY "Users can register for tournaments" ON registrations FOR INSERT
TO authenticated
WITH CHECK (player_id = auth.uid());

DROP POLICY IF EXISTS "Players can cancel own registrations" ON registrations;
CREATE POLICY "Players can cancel own registrations" ON registrations FOR UPDATE
TO authenticated
USING (player_id = auth.uid())
WITH CHECK (player_id = auth.uid());

DROP POLICY IF EXISTS "Organizers can update tournament registrations" ON registrations;
CREATE POLICY "Organizers can update tournament registrations" ON registrations FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tournaments
    WHERE tournaments.id = registrations.tournament_id
    AND tournaments.organizer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can update any registration" ON registrations;
CREATE POLICY "Admins can update any registration" ON registrations FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
);

-- ============ INDEXES ============
CREATE INDEX IF NOT EXISTS idx_tournaments_city ON tournaments(city_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);
CREATE INDEX IF NOT EXISTS idx_tournaments_start_date ON tournaments(start_date);
CREATE INDEX IF NOT EXISTS idx_tournaments_organizer ON tournaments(organizer_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_club ON tournaments(club_id);
CREATE INDEX IF NOT EXISTS idx_registrations_tournament ON registrations(tournament_id);
CREATE INDEX IF NOT EXISTS idx_registrations_player ON registrations(player_id);
CREATE INDEX IF NOT EXISTS idx_clubs_city ON clubs(city_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tournaments_updated_at ON tournaments;
CREATE TRIGGER tournaments_updated_at
  BEFORE UPDATE ON tournaments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
