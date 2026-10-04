DROP POLICY IF EXISTS "Admins can view all tournaments" ON public.tournaments;
CREATE POLICY "Admins can view all tournaments" ON public.tournaments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update any tournament" ON public.tournaments;
CREATE POLICY "Admins can update any tournament" ON public.tournaments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
  )
);
