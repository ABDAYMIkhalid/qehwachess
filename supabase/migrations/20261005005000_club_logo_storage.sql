INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'club-logos',
  'club-logos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Anyone can view club logos" ON storage.objects;
CREATE POLICY "Anyone can view club logos"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'club-logos');

DROP POLICY IF EXISTS "Organizers can upload club logos" ON storage.objects;
CREATE POLICY "Organizers can upload club logos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'club-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('organizer', 'admin')
  )
);

DROP POLICY IF EXISTS "Organizers can update club logos" ON storage.objects;
CREATE POLICY "Organizers can update club logos"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'club-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('organizer', 'admin')
  )
)
WITH CHECK (
  bucket_id = 'club-logos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role IN ('organizer', 'admin')
  )
);
