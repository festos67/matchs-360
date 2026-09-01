-- =====================================================================
-- CORRECTIF — can_self_evaluate etait executable par anon.
--
-- La migration 20260901132425 a pose REVOKE ... FROM public, anon sur cinq
-- de ses six fonctions, mais l'a OUBLIE sur can_self_evaluate (et sur la
-- fonction de trigger enforce_self_eval_consent). PostgreSQL accorde EXECUTE
-- a PUBLIC par defaut : anon en heritait.
--
-- can_self_evaluate est SECURITY DEFINER et enveloppe
-- requires_parental_consent, qui avait ete explicitement retiree a anon pour
-- ce motif exact (doctrine anti-oracle du projet). Un appel anonyme sur
-- /rest/v1/rpc/can_self_evaluate distinguait trois reponses :
--   null  -> l'UUID n'existe pas
--   false -> le profil existe ET a moins de 15 ans
--   true  -> le profil existe et a 15 ans ou plus
-- Les UUID sont recoltables : le bucket user-photos est public en lecture et
-- ses chemins sont prefixes par l'UUID du profil.
-- =====================================================================
REVOKE ALL ON FUNCTION public.can_self_evaluate(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_self_evaluate(uuid) TO authenticated;

-- Fonction de trigger : personne n'a a l'appeler directement.
REVOKE ALL ON FUNCTION public.enforce_self_eval_consent() FROM public, anon, authenticated;
