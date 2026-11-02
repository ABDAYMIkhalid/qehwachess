CREATE TABLE IF NOT EXISTS public.message_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  thread_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  UNIQUE (recipient_id, message_id)
);

CREATE INDEX IF NOT EXISTS message_notifications_unread_idx
  ON public.message_notifications (recipient_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER TABLE public.message_notifications ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.message_notifications TO authenticated;
GRANT UPDATE (read_at) ON public.message_notifications TO authenticated;

DROP POLICY IF EXISTS "Users can view own message notifications" ON public.message_notifications;
CREATE POLICY "Users can view own message notifications"
  ON public.message_notifications FOR SELECT
  TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS "Users can mark own message notifications as read" ON public.message_notifications;
CREATE POLICY "Users can mark own message notifications as read"
  ON public.message_notifications FOR UPDATE
  TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

CREATE OR REPLACE FUNCTION public.create_message_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
BEGIN
  IF NEW.recipient_id IS NOT NULL THEN
    INSERT INTO public.message_notifications (recipient_id, message_id, thread_key)
    VALUES (NEW.recipient_id, NEW.id, 'player:' || NEW.sender_id::text)
    ON CONFLICT (recipient_id, message_id) DO NOTHING;
  ELSIF NEW.meetup_id IS NOT NULL THEN
    INSERT INTO public.message_notifications (recipient_id, message_id, thread_key)
    SELECT participants.player_id, NEW.id, 'meetup:' || NEW.meetup_id::text
    FROM (
      SELECT cm.creator_id AS player_id
      FROM public.casual_meetups cm
      WHERE cm.id = NEW.meetup_id
      UNION
      SELECT ma.player_id
      FROM public.meetup_attendees ma
      WHERE ma.meetup_id = NEW.meetup_id
        AND ma.status = 'joined'
    ) AS participants
    WHERE participants.player_id <> NEW.sender_id
    ON CONFLICT (recipient_id, message_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_message_notifications() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS create_message_notifications ON public.community_messages;
CREATE TRIGGER create_message_notifications
AFTER INSERT ON public.community_messages
FOR EACH ROW
EXECUTE FUNCTION public.create_message_notifications();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'message_notifications'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_notifications;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
