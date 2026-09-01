-- =====================================================================
-- Le representant legal n'avait aucun acces reel.
--
-- record-parental-consent faisait un UPDATE sur supporters_link pour une
-- ligne jamais creee : zero ligne affectee, aucune erreur remontee. Resultat
-- verifie en production : les 3 parents ayant consenti n'ont NI role NI lien
-- supporter, et voient donc le menu par defaut (une seule entree Dashboard).
--
-- Ce rattrapage repare l'existant ; l'UPSERT cote edge function empeche la
-- reapparition du probleme pour les prochains consentements.
--
-- Le role attribue est 'supporter' : l'enum app_role n'a pas de valeur
-- dediee au representant legal, et c'est ce role que les policies du
-- parcours joueur reconnaissent deja (is_supporter_of_player). La distinction
-- avec un simple supporter est portee par supporters_link.is_legal_guardian.
-- =====================================================================

-- 1) Lien supporter, marque « representant legal »
INSERT INTO public.supporters_link (supporter_id, player_id, is_legal_guardian, relationship)
SELECT pc.guardian_profile_id, pc.minor_profile_id, true, pc.relationship
FROM public.parental_consents pc
WHERE pc.revoked_at IS NULL
ON CONFLICT ON CONSTRAINT unique_supporter_player
DO UPDATE SET is_legal_guardian = true,
              relationship = EXCLUDED.relationship;

-- 2) Role, rattache au club de l'enfant (les 9 roles supporter existants en
--    ont tous un : rester coherent avec eux).
INSERT INTO public.user_roles (user_id, role, club_id)
SELECT DISTINCT pc.guardian_profile_id, 'supporter'::app_role, m.club_id
FROM public.parental_consents pc
JOIN public.profiles m ON m.id = pc.minor_profile_id
WHERE pc.revoked_at IS NULL
  AND m.club_id IS NOT NULL
ON CONFLICT (user_id, role, club_id) DO NOTHING;
