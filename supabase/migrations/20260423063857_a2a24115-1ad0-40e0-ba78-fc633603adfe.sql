-- ============================================================================
-- Découplage du super-admin de l'email hardcodé
-- ============================================================================
-- Contexte : la migration 20260106211519 a introduit un trigger
-- `on_super_admin_created` sur public.profiles qui promeut automatiquement
-- en role='admin' tout INSERT dont l'email = 'asahand@protonmail.com'.
-- Risque : si ce compte mail est un jour repris par un tiers, l'attaquant
-- obtient automatiquement les droits super-admin sans intervention humaine.
--
-- Stratégie :
--   1) S'assurer (idempotent) que le super-admin actuel a bien sa ligne
--      en public.user_roles AVANT de retirer le trigger.
--      UUID actuel (documentation, NON utilisé comme littéral) :
--      e5728b9e-de5f-4c11-89cf-4e389eae664c → asahand@protonmail.com
--   2) DROP du trigger + de la fonction d'auto-promotion par email.
--   3) La promotion future passe exclusivement par l'edge function
--      admin-users (action 'promote-admin'), qui exige déjà role='admin'
--      sur le caller (RBAC via user_roles, plus aucun check email).
-- ============================================================================

-- Étape 1 : garantie idempotente que le super-admin vivant conserve ses droits
INSERT INTO public.user_roles (user_id, role, club_id)
SELECT u.id, 'admin'::public.app_role, NULL
FROM auth.users u
WHERE u.email = 'asahand@protonmail.com'
ON CONFLICT (user_id, role, club_id) DO NOTHING;

-- Étape 2 : suppression du trigger d'auto-promotion par email
DROP TRIGGER IF EXISTS on_super_admin_created ON public.profiles;
DROP FUNCTION IF EXISTS public.assign_super_admin_role();
