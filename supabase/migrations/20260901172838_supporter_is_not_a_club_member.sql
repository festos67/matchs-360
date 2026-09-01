-- =====================================================================
-- Un supporter n'est pas un MEMBRE DU CLUB.
--
-- get_user_club_ids() renvoyait tous les club_id de user_roles sans filtrer le
-- role. Cette liste gouverne la vue profiles_safe (security_invoker = false,
-- donc RLS de profiles contournee), la branche « pairs » de la policy
-- « Users view profiles in scope », subscriptions, clubs, themes et skills.
--
-- Un simple supporter — quelqu'un qui suit UN joueur — obtenait donc
-- l'annuaire nominatif du club, mineurs compris, et l'abonnement avec son
-- plan, son montant et ses identifiants Stripe.
--
-- C'est le meme defaut que celui ferme pour les representants legaux en
-- 20260901162522, mais a sa racine : la correction precedente retirait le
-- club_id du role, celle-ci corrige la fonction qui l'interprete.
--
-- Mesure en simulation, sur un supporter n'ayant AUCUN autre role :
--   avant : annuaire 5, profils 5, abonnements 1
--   apres : annuaire 2, profils 2, abonnements 0
--   themes (111), referentiels (23) et evaluations : INCHANGES
-- Ses acces legitimes passent par les policies dediees
-- (« Supporters view framework of linked players », « Supporters can view
-- evaluations for their linked players »), pas par l'appartenance au club.
--
-- Non-regression verifiee apres application sur les quatre roles :
--   club_admin  annuaire=3  abos=1  themes=80   refs=17   (inchange)
--   coach       annuaire=3  abos=1  themes=80   refs=17   (inchange)
--   player      annuaire=23 abos=1  themes=130  refs=26   (inchange)
--   supporter   annuaire=4  abos=0  themes=130  refs=26   (abonnement retire)
--
-- Un supporter qui est PAR AILLEURS coach, joueur ou club_admin conserve la
-- portee de ces roles : seule la ligne 'supporter' cesse de compter.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.get_user_club_ids(_user_id uuid)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Garde anti-oracle F-205 : inchangee.
  IF _user_id IS DISTINCT FROM auth.uid()
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
     ) THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT DISTINCT club_id
    FROM public.user_roles
    WHERE user_id = _user_id
      AND club_id IS NOT NULL
      AND role <> 'supporter';
END;
$function$;
