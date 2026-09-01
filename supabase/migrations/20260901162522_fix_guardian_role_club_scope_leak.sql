-- =====================================================================
-- CORRECTIF DE FUITE — le rattrapage du 20260901153111 donnait au
-- representant legal la portee du CLUB ENTIER.
--
-- Le backfill inserait user_roles(role='supporter', club_id=<club de
-- l'enfant>). Or get_user_club_ids() renvoie TOUS les club_id de user_roles
-- SANS filtrer le role : le club de l'enfant entrait donc dans le perimetre
-- « membre du club » du parent.
--
-- Mesure avant correctif, sous l'identite d'un parent representant legal d'UN
-- seul enfant :
--    profiles_safe = 24 lignes (annuaire du club, mineurs compris)
--    profiles      = 15 lignes (fiches completes : email, nom, naissance)
--    subscriptions =  1 ligne (plan, montant, identifiants Stripe)
-- Apres : 2, 2 et 0 — l'enfant et le parent lui-meme.
--
-- Le role 'supporter' est CONSERVE : il porte le menu et l'acces a la route
-- /supporter/players/:id. Seul club_id est retire. L'acces du parent aux
-- donnees de son enfant ne passe pas par lui mais par les policies
-- « Guardians ... » (20260901155122), adossees au consentement parental.
--
-- Verifie en simulation avant application : themes (130), skills (448) et
-- referentiels (26) restent accessibles au parent. Rien de legitime n'est
-- retire.
--
-- NOTE — les supporters ordinaires preexistants portent le meme club_id et
-- ont donc la meme exposition. Ce defaut leur est anterieur et n'est PAS
-- traite ici : le corriger suppose de revoir get_user_club_ids (ou d'ajouter
-- des policies dediees), ce qui touche themes/skills/subscriptions pour tous
-- les supporters. A instruire separement.
-- =====================================================================

-- guard_privileged_role_grant interdit de modifier club_id hors service_role.
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

UPDATE public.user_roles ur
   SET club_id = NULL
 WHERE ur.role = 'supporter'
   AND ur.club_id IS NOT NULL
   AND EXISTS (
     SELECT 1 FROM public.parental_consents pc
     WHERE pc.guardian_profile_id = ur.user_id
       AND pc.revoked_at IS NULL
   )
   -- Ne toucher qu'aux parents dont le lien supporter est celui d'un
   -- representant legal, pas a un supporter ordinaire qui serait par
   -- ailleurs parent d'un autre enfant.
   AND NOT EXISTS (
     SELECT 1 FROM public.supporters_link sl
     WHERE sl.supporter_id = ur.user_id
       AND sl.is_legal_guardian = false
   );
