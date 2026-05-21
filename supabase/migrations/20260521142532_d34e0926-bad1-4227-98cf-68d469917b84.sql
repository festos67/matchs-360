BEGIN;

-- Évaluations (AFTER INSERT/UPDATE on evaluations)
CREATE OR REPLACE FUNCTION public.notify_guardian_on_evaluation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.enqueue_guardian_notification(
      NEW.player_id,
      'evaluation_' || lower(TG_OP),
      jsonb_build_object('evaluation_id', NEW.id, 'type', NEW.type, 'name', NEW.name));
    PERFORM public.log_minor_data_write(NEW.player_id, 'evaluation');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guardian_on_evaluation failed (player_id=%): % / %', NEW.player_id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END; $$;

-- Profils (AFTER UPDATE on profiles)
CREATE OR REPLACE FUNCTION public.notify_guardian_on_profile_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    IF NEW.id = OLD.id AND public.is_minor(NEW.id) THEN
      PERFORM public.enqueue_guardian_notification(
        NEW.id, 'profile_updated',
        jsonb_build_object(
          'changed_fields',
          (SELECT jsonb_agg(k) FROM (
            SELECT 'first_name' AS k WHERE NEW.first_name IS DISTINCT FROM OLD.first_name
            UNION ALL SELECT 'last_name' WHERE NEW.last_name IS DISTINCT FROM OLD.last_name
            UNION ALL SELECT 'nickname'  WHERE NEW.nickname  IS DISTINCT FROM OLD.nickname
            UNION ALL SELECT 'photo_url' WHERE NEW.photo_url IS DISTINCT FROM OLD.photo_url
            UNION ALL SELECT 'birthdate' WHERE NEW.birthdate IS DISTINCT FROM OLD.birthdate
            UNION ALL SELECT 'club_id'   WHERE NEW.club_id   IS DISTINCT FROM OLD.club_id
          ) s)
        )
      );
      PERFORM public.log_minor_data_write(NEW.id, 'profile');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guardian_on_profile_update failed (profile_id=%): % / %', NEW.id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END; $$;

-- Membres d'équipe (AFTER INSERT/UPDATE on team_members)
CREATE OR REPLACE FUNCTION public.notify_guardian_on_team_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.enqueue_guardian_notification(
      NEW.user_id, 'team_' || lower(TG_OP),
      jsonb_build_object('team_id', NEW.team_id, 'member_type', NEW.member_type, 'is_active', NEW.is_active));
    PERFORM public.log_minor_data_write(NEW.user_id, 'team_membership');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guardian_on_team_change failed (user_id=%): % / %', NEW.user_id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END; $$;

-- Rôles utilisateur (AFTER INSERT on user_roles)
CREATE OR REPLACE FUNCTION public.notify_guardian_on_role_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.enqueue_guardian_notification(
      NEW.user_id, 'role_added',
      jsonb_build_object('role', NEW.role, 'club_id', NEW.club_id));
    PERFORM public.log_minor_data_write(NEW.user_id, 'user_role');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_guardian_on_role_change failed (user_id=%): % / %', NEW.user_id, SQLSTATE, SQLERRM;
  END;
  RETURN NEW;
END; $$;

COMMENT ON FUNCTION public.notify_guardian_on_evaluation() IS
  'Phase 4 RGPD mineurs — AFTER trigger. Garde-fou EXCEPTION WHEN OTHERS : une erreur de notification ne doit JAMAIS bloquer l''écriture. Erreurs visibles via RAISE WARNING. Ne pas appliquer ce pattern aux triggers BEFORE bloquants (check_evaluation_limit).';

COMMIT;