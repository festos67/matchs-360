
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  type text NOT NULL DEFAULT 'info',
  link text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users update own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "System can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

CREATE OR REPLACE FUNCTION public.notify_team_on_new_objective()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _player record;
  _team_name text;
BEGIN
  SELECT name INTO _team_name FROM public.teams WHERE id = NEW.team_id;

  FOR _player IN
    SELECT user_id FROM public.team_members
    WHERE team_id = NEW.team_id
      AND member_type = 'player'
      AND is_active = true
  LOOP
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      _player.user_id,
      'Nouvel objectif',
      'Un nouvel objectif a été ajouté à l''équipe ' || _team_name || ' : ' || NEW.title,
      'objective',
      '/teams/' || NEW.team_id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_new_objective
  AFTER INSERT ON public.team_objectives
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_team_on_new_objective();
