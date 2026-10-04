ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cities'::regclass
      AND conname = 'cities_latitude_range_check'
  ) THEN
    ALTER TABLE public.cities
      ADD CONSTRAINT cities_latitude_range_check
      CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cities'::regclass
      AND conname = 'cities_longitude_range_check'
  ) THEN
    ALTER TABLE public.cities
      ADD CONSTRAINT cities_longitude_range_check
      CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
  END IF;
END;
$$;

UPDATE public.cities SET latitude = 33.5731, longitude = -7.5898 WHERE lower(name) = 'casablanca';
UPDATE public.cities SET latitude = 34.0209, longitude = -6.8416 WHERE lower(name) = 'rabat';
UPDATE public.cities SET latitude = 31.6295, longitude = -7.9811 WHERE lower(name) = 'marrakech';
UPDATE public.cities SET latitude = 35.7595, longitude = -5.8340 WHERE lower(name) = 'tangier';

NOTIFY pgrst, 'reload schema';
