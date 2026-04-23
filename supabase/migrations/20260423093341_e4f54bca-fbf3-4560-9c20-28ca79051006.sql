-- ============================================================
-- guard_team_update + trg_audit_teams
-- ============================================================
-- Faille corrigée :
--   1) Un referent coach pouvait UPDATE teams SET deleted_at = now()
--      (soft-delete silencieux) ou muter created_at/club_id sans
--      passer par un club_admin/admin. La policy RLS "Referent coach
--      update team" contrôle l'identité de la ligne, pas les colonnes.
--   2) Aucun trigger d'audit sur public.teams → forensic impossible
--      après une éventuelle altération.
--
-- 2 mécanismes mis en place :
--   - guard_team_update() + trg_guard_team_update (BEFORE UPDATE)
--     gèle les colonnes structurelles pour les non-privilégiés.
--   - trg_audit_teams (AFTER INSERT/UPDATE/DELETE) via
--     public.fn_audit_trigger (déjà utilisée par 7 autres tables).
--
-- Colonnes gelées : id, club_id, deleted_at, created_at.
-- Colonnes mutables : name, season, description, color, short_name,
--   updated_at (toujours géré par update_teams_updated_at).
--
-- Bypasses :
--   - service_role (edge functions, jobs cron)
--   - is_admin(auth.uid()) (super-admin)
--   - is_club_admin(auth.uid(), OLD.club_id) (responsable du club parent)
--
-- Non-bypass volontaire :
--   - is_referent_coach_of_team → reste limité aux colonnes cosmétiques.
--
-- Modèle de référence : guard_subscription_update (20260420165729).
-- ============================================================

CREATE OR REPLACE FUNCTION public.guard_team_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Bypass service_role (edge functions, jobs)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass super admin
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Bypass club_admin du club parent (OLD.club_id pour empêcher
  -- d'utiliser NEW.club_id manipulé pour s'auto-autoriser)
  IF public.is_club_admin(auth.uid(), OLD.club_id) THEN
    RETURN NEW;
  END IF;

  -- À ce stade : referent coach ou autre rôle non privilégié.
  -- Vérification colonne par colonne (IS DISTINCT FROM gère NULL).
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot modify id on team without admin/club_admin/service_role authority'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
    RAISE EXCEPTION 'Cannot modify club_id on team without admin/club_admin/service_role authority'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Cannot modify deleted_at on team without admin/club_admin/service_role authority'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify created_at on team without admin/club_admin/service_role authority'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Guard BEFORE UPDATE
DROP TRIGGER IF EXISTS trg_guard_team_update ON public.teams;
CREATE TRIGGER trg_guard_team_update
BEFORE UPDATE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.guard_team_update();

-- Audit AFTER INSERT/UPDATE/DELETE (manquant, à ajouter)
DROP TRIGGER IF EXISTS trg_audit_teams ON public.teams;
CREATE TRIGGER trg_audit_teams
AFTER INSERT OR UPDATE OR DELETE ON public.teams
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();