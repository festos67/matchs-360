-- =====================================================================
-- Mail « Le profil de votre enfant a ete modifie » : uniquement quand une
-- information visible change (prenom, nom, surnom, photo, date de naissance,
-- club).
--
-- Constat : le trigger mettait un mail en file a CHAQUE UPDATE de la fiche
-- du mineur, meme sans aucun changement visible (changed_fields = null).
-- A la signature du consentement, la fiche est modifiee deux fois
-- (reactivation du compte par activate_minor_on_consent, puis ecriture des
-- autorisations photo / auto-debrief) : le parent recevait 1 a 2 mails
-- « profil modifie » dans les 2 minutes. Les 8 mails de ce type envoyes en
-- production etaient tous de cette nature.
--
-- La trace d'acces aux donnees du mineur (log_minor_data_write) reste
-- ecrite a chaque modification, comme avant.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_guardian_on_profile_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_changed jsonb;
BEGIN
  BEGIN
    IF NEW.id = OLD.id AND public.is_minor(NEW.id) THEN
      SELECT jsonb_agg(k) INTO v_changed FROM (
        SELECT 'first_name' AS k WHERE NEW.first_name IS DISTINCT FROM OLD.first_name
        UNION ALL SELECT 'last_name' WHERE NEW.last_name IS DISTINCT FROM OLD.last_name
        UNION ALL SELECT 'nickname'  WHERE NEW.nickname  IS DISTINCT FROM OLD.nickname
        UNION ALL SELECT 'photo_url' WHERE NEW.photo_url IS DISTINCT FROM OLD.photo_url
        UNION ALL SELECT 'birthdate' WHERE NEW.birthdate IS DISTINCT FROM OLD.birthdate
        UNION ALL SELECT 'club_id'   WHERE NEW.club_id   IS DISTINCT FROM OLD.club_id
      ) s;

      IF v_changed IS NOT NULL THEN
        PERFORM public.enqueue_guardian_notification(
          NEW.id, 'profile_updated', jsonb_build_object('changed_fields', v_changed)
        );
      END IF;

      PERFORM public.log_minor_data_write(NEW.id, 'profile');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guardian_on_profile_update failed (profile_id=%): % / %', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
