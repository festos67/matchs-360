-- =====================================================================
-- Phase 05 — Synchronisation de profiles.email avec auth.users.email.
--
-- Il n'existait qu'un declencheur a la CREATION (on_auth_user_created) et
-- rien a la mise a jour. Les 43 profils sont aujourd'hui parfaitement
-- synchronises ; le premier changement d'adresse aurait cree la premiere
-- divergence, et l'application lit profiles.email un peu partout (annuaires,
-- recherche, affichage, invitations).
--
-- Place au niveau du declencheur plutot que dans le code appelant : la
-- coherence est ainsi garantie quel que soit le chemin emprunte — action
-- serveur, tableau de bord Supabase, ou script de maintenance.
--
-- Verifie apres application : un UPDATE sur auth.users se propage bien a
-- profiles (test joue puis annule, aucune donnee modifiee).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ne s'execute que sur un changement effectif d'adresse.
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL THEN
    UPDATE public.profiles
       SET email = NEW.email,
           updated_at = now()
     WHERE id = NEW.id
       AND email IS DISTINCT FROM NEW.email;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_email();
