-- Allow supporters to delete their own pending requests
CREATE POLICY "Supporters delete own pending requests"
ON public.supporter_evaluation_requests
FOR DELETE
TO authenticated
USING (supporter_id = auth.uid() AND status = 'pending');

-- Trigger function: notify the coach when a supporter declines (deletes) or completes
CREATE OR REPLACE FUNCTION public.notify_coach_on_supporter_request_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _supporter_name text;
  _player_name text;
BEGIN
  -- DELETE: supporter declined
  IF TG_OP = 'DELETE' THEN
    IF OLD.supporter_id IS NULL OR OLD.requested_by IS NULL THEN
      RETURN OLD;
    END IF;
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), nickname, email, 'Le supporter')
      INTO _supporter_name FROM public.profiles WHERE id = OLD.supporter_id;
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), nickname, email, 'le joueur')
      INTO _player_name FROM public.profiles WHERE id = OLD.player_id;
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      OLD.requested_by,
      'Demande de débrief supprimée',
      _supporter_name || ' a supprimé la demande de débrief pour ' || _player_name || '.',
      'supporter_request',
      '/players/' || OLD.player_id
    );
    RETURN OLD;
  END IF;

  -- UPDATE: pending -> completed
  IF TG_OP = 'UPDATE' AND OLD.status = 'pending' AND NEW.status = 'completed' THEN
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), nickname, email, 'Le supporter')
      INTO _supporter_name FROM public.profiles WHERE id = NEW.supporter_id;
    SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', first_name, last_name)), ''), nickname, email, 'le joueur')
      INTO _player_name FROM public.profiles WHERE id = NEW.player_id;
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (
      NEW.requested_by,
      'Débrief supporter complété',
      _supporter_name || ' a complété le débrief pour ' || _player_name || '.',
      'supporter_request',
      '/players/' || NEW.player_id
    );
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_coach_supporter_request_delete ON public.supporter_evaluation_requests;
CREATE TRIGGER trg_notify_coach_supporter_request_delete
AFTER DELETE ON public.supporter_evaluation_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coach_on_supporter_request_change();

DROP TRIGGER IF EXISTS trg_notify_coach_supporter_request_complete ON public.supporter_evaluation_requests;
CREATE TRIGGER trg_notify_coach_supporter_request_complete
AFTER UPDATE ON public.supporter_evaluation_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_coach_on_supporter_request_change();