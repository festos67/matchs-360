
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_label text;
  v_club_name text;
  v_first_name text;
  v_title text;
  v_message text;
BEGIN
  v_role_label := CASE NEW.role::text
    WHEN 'admin' THEN 'Super Administrateur'
    WHEN 'club_admin' THEN 'Administrateur de club'
    WHEN 'coach' THEN 'Coach'
    WHEN 'player' THEN 'Joueur'
    WHEN 'supporter' THEN 'Supporter'
    ELSE NEW.role::text
  END;

  IF NEW.club_id IS NOT NULL THEN
    SELECT name INTO v_club_name FROM public.clubs WHERE id = NEW.club_id;
  END IF;

  SELECT first_name INTO v_first_name FROM public.profiles WHERE id = NEW.user_id;

  v_title := 'Félicitations 🎉 Nouveau rôle attribué';
  v_message := 'Bravo' ||
    CASE WHEN v_first_name IS NOT NULL AND length(v_first_name) > 0
         THEN ' ' || v_first_name ELSE '' END ||
    ', vous venez d''obtenir le rôle de ' || v_role_label ||
    CASE WHEN v_club_name IS NOT NULL
         THEN ' au sein de ' || v_club_name ELSE '' END ||
    '. Bienvenue !';

  BEGIN
    INSERT INTO public.notifications (user_id, title, message, type, link)
    VALUES (NEW.user_id, v_title, v_message, 'success', '/');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user_role: in-app notification insert failed: %', SQLERRM;
  END;

  BEGIN
    PERFORM net.http_post(
      url := 'https://aasihxqsasjpszqjlbid.supabase.co/functions/v1/notify-role-assigned',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'userId', NEW.user_id,
        'role', NEW.role::text,
        'clubId', NEW.club_id,
        'roleRowId', NEW.id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user_role: email dispatch failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_role_assigned ON public.user_roles;
CREATE TRIGGER trg_user_role_assigned
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();
