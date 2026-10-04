CREATE TABLE IF NOT EXISTS public.community_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  meetup_id uuid REFERENCES public.casual_meetups(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_messages_single_thread_check CHECK (
    (recipient_id IS NOT NULL AND meetup_id IS NULL AND recipient_id <> sender_id)
    OR (recipient_id IS NULL AND meetup_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS community_messages_sender_created_idx
  ON public.community_messages (sender_id, created_at DESC);
CREATE INDEX IF NOT EXISTS community_messages_recipient_created_idx
  ON public.community_messages (recipient_id, created_at DESC)
  WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_messages_meetup_created_idx
  ON public.community_messages (meetup_id, created_at)
  WHERE meetup_id IS NOT NULL;

ALTER TABLE public.community_messages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON public.community_messages TO authenticated;
REVOKE UPDATE, DELETE ON public.community_messages FROM anon, authenticated;

DROP POLICY IF EXISTS "Direct and meetup participants can view messages" ON public.community_messages;
CREATE POLICY "Direct and meetup participants can view messages"
  ON public.community_messages FOR SELECT
  TO authenticated
  USING (
    (meetup_id IS NULL AND (sender_id = auth.uid() OR recipient_id = auth.uid()))
    OR (
      meetup_id IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM public.casual_meetups
          WHERE casual_meetups.id = community_messages.meetup_id
            AND casual_meetups.creator_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.meetup_attendees
          WHERE meetup_attendees.meetup_id = community_messages.meetup_id
            AND meetup_attendees.player_id = auth.uid()
            AND meetup_attendees.status = 'joined'
        )
      )
    )
  );

DROP POLICY IF EXISTS "Participants can send direct or meetup messages" ON public.community_messages;
CREATE POLICY "Participants can send direct or meetup messages"
  ON public.community_messages FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (
        meetup_id IS NULL
        AND recipient_id IS NOT NULL
        AND recipient_id <> auth.uid()
      )
      OR (
        meetup_id IS NOT NULL
        AND recipient_id IS NULL
        AND (
          EXISTS (
            SELECT 1 FROM public.casual_meetups
            WHERE casual_meetups.id = community_messages.meetup_id
              AND casual_meetups.status = 'published'
              AND casual_meetups.creator_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1 FROM public.meetup_attendees
            WHERE meetup_attendees.meetup_id = community_messages.meetup_id
              AND meetup_attendees.player_id = auth.uid()
              AND meetup_attendees.status = 'joined'
          )
        )
      )
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'community_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
