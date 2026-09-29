-- =====================================================================
-- Relance unique d'une invitation en attente (fiche joueur).
--
-- Sur la fiche d'un joueur, le coach et le responsable du club voient une
-- note quand le joueur n'a pas encore accepté son invitation ou que son
-- représentant légal n'a pas encore donné son consentement. Ils peuvent
-- relancer par e-mail UNE seule fois par destinataire (ne pas polluer les
-- boîtes) ; ensuite, la note invite à contacter la personne directement.
--
-- invitation_reminders garde la trace de la relance (une ligne par joueur
-- et par destinataire) ; elle est écrite par la fonction serveur
-- remind-pending-invitation (service_role) et n'est lue qu'au travers de
-- get_player_invitation_status.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.invitation_reminders (
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target text NOT NULL CHECK (target IN ('player', 'guardian')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (player_id, target)
);

ALTER TABLE public.invitation_reminders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invitation_reminders FROM anon, authenticated;

-- État des invitations d'un joueur, pour ses coachs, le responsable de son
-- club et les administrateurs (NULL pour tout autre appelant).
CREATE OR REPLACE FUNCTION public.get_player_invitation_status(_player_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_email text;
  v_last_sign_in timestamptz;
  v_guardian_pending boolean;
BEGIN
  IF v_caller IS NULL OR NOT (
       public.is_admin(v_caller)
       OR public.is_coach_of_player(v_caller, _player_id)
       OR public.is_club_admin_of_player(v_caller, _player_id)
     ) THEN
    RETURN NULL;
  END IF;

  SELECT u.email, u.last_sign_in_at INTO v_email, v_last_sign_in
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  WHERE u.id = _player_id AND p.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.guardian_designations g
    WHERE g.minor_profile_id = _player_id AND g.status = 'pending'
  ) INTO v_guardian_pending;

  RETURN jsonb_build_object(
    -- Jamais connecté, avec une vraie adresse (un identifiant technique
    -- « @matchs360.jeunes » n'a pas de boîte : accès par code).
    'player_pending', v_last_sign_in IS NULL
                      AND v_email IS NOT NULL
                      AND lower(v_email) NOT LIKE '%@matchs360.jeunes',
    'guardian_pending', v_guardian_pending,
    'player_reminded_at', (SELECT sent_at FROM public.invitation_reminders
                           WHERE player_id = _player_id AND target = 'player'),
    'guardian_reminded_at', (SELECT sent_at FROM public.invitation_reminders
                             WHERE player_id = _player_id AND target = 'guardian')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_player_invitation_status(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_player_invitation_status(uuid) TO authenticated;
