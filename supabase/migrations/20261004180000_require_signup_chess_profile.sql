CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  profile_name text;
  profile_username text;
  profile_city uuid;
  profile_lichess text;
  profile_chesscom text;
  profile_fide_id text;
BEGIN
  profile_name := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    ''
  )), '');
  profile_username := NULLIF(btrim(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'username', ''),
    '^@',
    ''
  )), '');
  profile_city := NULLIF(NEW.raw_user_meta_data->>'city_id', '')::uuid;
  profile_lichess := NULLIF(btrim(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'lichess_username', ''),
    '^@',
    ''
  )), '');
  profile_chesscom := NULLIF(btrim(regexp_replace(
    COALESCE(NEW.raw_user_meta_data->>'chesscom_username', ''),
    '^@',
    ''
  )), '');
  profile_fide_id := NULLIF(btrim(COALESCE(
    NEW.raw_user_meta_data->>'fide_id',
    ''
  )), '');

  IF profile_name IS NULL THEN
    RAISE EXCEPTION 'Full name is required.';
  END IF;
  IF profile_username IS NULL OR profile_username !~ '^[A-Za-z0-9_]{3,24}$' THEN
    RAISE EXCEPTION 'Username must be 3-24 letters, numbers, or underscores.';
  END IF;
  IF profile_city IS NULL THEN
    RAISE EXCEPTION 'City is required.';
  END IF;
  IF profile_lichess IS NULL AND profile_chesscom IS NULL AND profile_fide_id IS NULL THEN
    RAISE EXCEPTION 'Enter at least one Chess.com, Lichess, or FIDE ID.';
  END IF;

  INSERT INTO public.profiles (
    id, full_name, email, role, city_id, username,
    lichess_username, chesscom_username, fide_id
  )
  VALUES (
    NEW.id,
    profile_name,
    COALESCE(NEW.email, ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('player', 'organizer')
        THEN NEW.raw_user_meta_data->>'role'
      ELSE 'player'
    END,
    profile_city,
    profile_username,
    profile_lichess,
    profile_chesscom,
    profile_fide_id
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    city_id = EXCLUDED.city_id,
    username = EXCLUDED.username,
    lichess_username = EXCLUDED.lichess_username,
    chesscom_username = EXCLUDED.chesscom_username,
    fide_id = EXCLUDED.fide_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();
