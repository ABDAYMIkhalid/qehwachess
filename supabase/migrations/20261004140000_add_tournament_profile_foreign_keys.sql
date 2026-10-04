DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tournaments'::regclass
      AND conname = 'tournaments_organizer_id_fkey'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_organizer_id_fkey
      FOREIGN KEY (organizer_id)
      REFERENCES public.profiles(id)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.registrations'::regclass
      AND conname = 'registrations_player_id_fkey'
  ) THEN
    ALTER TABLE public.registrations
      ADD CONSTRAINT registrations_player_id_fkey
      FOREIGN KEY (player_id)
      REFERENCES public.profiles(id)
      NOT VALID;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
