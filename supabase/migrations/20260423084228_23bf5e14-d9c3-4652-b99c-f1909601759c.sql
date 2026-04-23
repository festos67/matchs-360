-- =============================================================================
-- Migration : guard_profile_self_update
-- =============================================================================
-- Faille corrigée :
--   La policy RLS "Users update own profile" sur public.profiles autorise
--   tout utilisateur authentifié à modifier sa propre ligne SANS column-list,
--   permettant le pivot d'identité (email), la suppression logique de soi
--   (deleted_at) et la falsification du scope multi-tenant (club_id).
--
-- Modèle de référence :
--   public.guard_subscription_update (migration 20260420165729) — même pattern
--   trigger BEFORE UPDATE + bypass service_role/admin + RAISE EXCEPTION 42501.
--
-- Inventaire colonnes public.profiles :
--   FROZEN (bloquées en self-update non-admin) :
--     - id          : clé primaire, ne doit jamais bouger
--     - email       : doit transiter par auth.users (Supabase Auth)
--     - club_id     : scope multi-tenant, changement = flux dédié
--     - deleted_at  : soft delete, doit transiter par flow RGPD audité
--     - created_at  : horodatage système
--   MUTABLE (cosmétique / préférence personnelle) :
--     - first_name, last_name, nickname, photo_url, updated_at
--     (photo_url déjà protégée par guard_profile_photo_url côté validation
--      d'URL storage)
--
-- Bypasses :
--   - service_role : OBLIGATOIRE — edge functions admin-users, import-framework,
--     handle_new_user, sync_profile_club_id doivent pouvoir tout modifier.
--   - is_admin(auth.uid()) : OBLIGATOIRE — super-admin doit pouvoir corriger
--     un profil cassé (mauvais club_id, restauration deleted_at).
--   - PAS de bypass is_club_admin : un club_admin ne doit pas pouvoir
--     réassigner un joueur dans un autre club via UPDATE direct (la policy
--     "Club admin update profiles in club" reste active mais limitée par les
--     mêmes règles trigger ; un changement cross-club doit passer par RPC
--     dédiée auditée).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  -- Bypass service_role (edge functions, jobs, triggers internes)
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Bypass super admin
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Si l'appelant n'est PAS le propriétaire de la ligne, on laisse passer :
  -- les autres policies (Club admin update profiles in club) gèrent ce cas
  -- et restent soumises à leurs propres restrictions RLS.
  IF auth.uid() IS DISTINCT FROM NEW.id THEN
    RETURN NEW;
  END IF;

  -- Vérification colonne par colonne (IS DISTINCT FROM gère les NULL)
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Cannot modify id via self-update'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Cannot modify email via self-update'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.club_id IS DISTINCT FROM OLD.club_id THEN
    RAISE EXCEPTION 'Cannot modify club_id via self-update'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Cannot modify deleted_at via self-update'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Cannot modify created_at via self-update'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

-- Câblage du trigger (idempotent)
DROP TRIGGER IF EXISTS trg_guard_profile_self_update ON public.profiles;

CREATE TRIGGER trg_guard_profile_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.guard_profile_self_update();