-- =====================================================================
-- Date de naissance corrigée qui fait passer un joueur SOUS 15 ans.
--
-- Déjà en place : le compte est suspendu (govern_minor_activation) et les
-- actions sur le joueur sont bloquées (guard_minor_consent_pending).
-- Manquait :
--  1. Nettoyage : photo publique (bucket user-photos, marquée « adulte »)
--     retirée ; autorisations photo / auto-débrief données sans représentant
--     légal retirées. Le fichier public est supprimé par l'interface.
--  2. Alerte au coach référent et au responsable du club, et trace.
--  3. Les supporters ne lisent plus les données d'un joueur de moins de
--     15 ans sans consentement valide (seule l'écriture était bloquée).
--  4. get_my_guardian_request_status() : l'écran d'attente du jeune sait si
--     une demande de consentement est réellement partie.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.birthdate_crosses_under_15(_old date, _new date)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT _new IS NOT NULL
     AND _new > (CURRENT_DATE - INTERVAL '15 years')
     AND (_old IS NULL OR _old <= (CURRENT_DATE - INTERVAL '15 years'));
$$;

-- 1. Nettoyage (BEFORE) --------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_on_birthdate_under_15()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.birthdate_crosses_under_15(OLD.birthdate, NEW.birthdate)
     AND NOT public.minor_has_valid_consent(NEW.id) THEN
    -- Photo rangée comme celle d'un adulte (bucket public) : retirée.
    IF NEW.photo_url IS NOT NULL AND COALESCE(NEW.photo_is_minor, false) = false THEN
      NEW.photo_url := NULL;
      NEW.photo_is_minor := false;
    END IF;
    -- Autorisations qui ne viennent pas d'un représentant légal : retirées.
    IF NEW.image_rights_consent_at IS NOT NULL
       AND (NEW.image_rights_consent_by IS NULL
            OR NOT public.is_legal_guardian_of(NEW.image_rights_consent_by, NEW.id)) THEN
      NEW.image_rights_consent_at := NULL;
      NEW.image_rights_consent_by := NULL;
      NEW.image_rights_consent_ip := NULL;
      NEW.image_rights_consent_method := NULL;
    END IF;
    IF NEW.self_eval_consent_at IS NOT NULL
       AND (NEW.self_eval_consent_by IS NULL
            OR NOT public.is_legal_guardian_of(NEW.self_eval_consent_by, NEW.id)) THEN
      NEW.self_eval_consent_at := NULL;
      NEW.self_eval_consent_by := NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_birthdate_under15_cleanup ON public.profiles;
CREATE TRIGGER trg_birthdate_under15_cleanup
  BEFORE UPDATE OF birthdate ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.cleanup_on_birthdate_under_15();

-- 2. Alerte au staff et trace (AFTER) ------------------------------------
CREATE OR REPLACE FUNCTION public.notify_staff_on_birthdate_under_15()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.birthdate_crosses_under_15(OLD.birthdate, NEW.birthdate)
     OR public.minor_has_valid_consent(NEW.id) THEN
    RETURN NEW;
  END IF;
  BEGIN
    v_name := COALESCE(NULLIF(trim(concat_ws(' ', NEW.first_name, NEW.last_name)), ''), 'Un joueur');

    -- Coachs référents des équipes du joueur + responsables de ses clubs,
    -- sauf l'auteur de la correction.
    INSERT INTO public.notifications (user_id, title, message, type, link)
    SELECT DISTINCT s.uid,
      'Représentant légal à désigner — ' || v_name,
      'La date de naissance de ' || v_name || ' a été corrigée : il a moins de 15 ans. '
        || 'Son compte est suspendu jusqu''au consentement de son représentant légal. '
        || 'Vérifiez qu''un représentant est désigné (fiche joueur › Modifier joueur).',
      'warning',
      '/players/' || NEW.id
    FROM (
      SELECT c.user_id AS uid
      FROM public.team_members p
      JOIN public.team_members c ON c.team_id = p.team_id
      WHERE p.user_id = NEW.id AND p.member_type = 'player' AND p.is_active AND p.deleted_at IS NULL
        AND c.member_type = 'coach' AND c.coach_role = 'referent' AND c.is_active AND c.deleted_at IS NULL
      UNION
      SELECT ur.user_id
      FROM public.user_roles ur
      WHERE ur.role = 'club_admin'
        AND ur.club_id IN (
          SELECT t.club_id
          FROM public.team_members p
          JOIN public.teams t ON t.id = p.team_id
          WHERE p.user_id = NEW.id AND p.member_type = 'player' AND p.is_active AND p.deleted_at IS NULL
          UNION
          SELECT NEW.club_id
        )
    ) s
    WHERE s.uid IS NOT NULL AND s.uid IS DISTINCT FROM auth.uid();

    INSERT INTO public.audit_log (actor_id, actor_role, action, table_name, record_id, after_data)
    VALUES (
      auth.uid(),
      COALESCE(auth.role(), 'system'),
      'birthdate_corrected_under_15',
      'profiles',
      NEW.id,
      jsonb_build_object('consent_required', true)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_staff_on_birthdate_under_15 failed (%): %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_birthdate_under15_notify ON public.profiles;
CREATE TRIGGER trg_birthdate_under15_notify
  AFTER UPDATE OF birthdate ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_staff_on_birthdate_under_15();

REVOKE ALL ON FUNCTION public.cleanup_on_birthdate_under_15() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_staff_on_birthdate_under_15() FROM public, anon, authenticated;

-- 3. Supporters : plus de lecture sans consentement ----------------------
-- is_supporter_of_player porte toutes les règles « supporter » (fiche,
-- débriefs, notes, référentiels figés, écriture des avis). Le représentant
-- légal n'est concerné qu'après avoir consenti (il n'est alors plus « en
-- attente »).
CREATE OR REPLACE FUNCTION public.is_supporter_of_player(_supporter_id uuid, _player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF _supporter_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.supporters_link
    WHERE supporter_id = _supporter_id AND player_id = _player_id
  )
  AND NOT public.minor_consent_pending(_player_id);
END;
$function$;

-- 4. Écran d'attente du jeune --------------------------------------------
-- 'pending' : une demande de consentement valable est partie ; 'none' sinon.
CREATE OR REPLACE FUNCTION public.get_my_guardian_request_status()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM public.guardian_designations gd
    WHERE gd.minor_profile_id = auth.uid()
      AND gd.status = 'pending'
      AND (gd.expires_at IS NULL OR gd.expires_at > now())
  ) THEN 'pending' ELSE 'none' END;
$$;

REVOKE ALL ON FUNCTION public.get_my_guardian_request_status() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_my_guardian_request_status() TO authenticated;
