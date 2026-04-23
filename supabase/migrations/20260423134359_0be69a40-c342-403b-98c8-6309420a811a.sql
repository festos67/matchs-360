-- =====================================================================
-- Cycle 5 finding C5-7 — Scope invitation_send_log SELECT RLS (Pattern #8)
-- =====================================================================
-- Constat verify :
--   - Policy SELECT actuelle = is_admin(auth.uid()) UNIQUEMENT.
--     → Pas de fuite cross-club observée (faux positif strict sur lecture
--       élargie), MAIS pas de scope club_admin / sender non plus.
--   - Policy INSERT authenticated existante : WITH CHECK (invited_by =
--     auth.uid()) → permet à n'importe quel authentifié de polluer le log
--     forensique en se loguant lui-même. Doit disparaître : les écritures
--     viennent du service_role (edge function send-invitation) qui bypasse
--     RLS.
--
-- Fix C5-7 :
--   1. Élargir SELECT au scope strict : super-admin OR sender (invited_by)
--      OR club_admin du club (colonne club_id directe → variante A).
--   2. Supprimer la policy INSERT authenticated (write append-only via
--      service_role uniquement).
--   3. REVOKE INSERT/UPDATE/DELETE pour authenticated/anon.
--   4. GRANT SELECT, INSERT à service_role pour debugging + writes.
--   5. RLS déjà ENABLED (préservé).
-- Idempotent.
-- =====================================================================

-- 1. Drop policies existantes (à remplacer)
DROP POLICY IF EXISTS "Admins can read invitation_send_log" ON public.invitation_send_log;
DROP POLICY IF EXISTS "Authenticated can insert own invitation_send_log" ON public.invitation_send_log;
DROP POLICY IF EXISTS "Scoped read invitation_send_log" ON public.invitation_send_log;

-- 2. SELECT scopé : super-admin OR sender OR club_admin du club
CREATE POLICY "Scoped read invitation_send_log"
  ON public.invitation_send_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR invited_by = auth.uid()
    OR public.is_club_admin(auth.uid(), club_id)
  );

-- 3. Aucune policy INSERT/UPDATE/DELETE pour authenticated → service_role only
--    (service_role bypasse RLS). Verrou supplémentaire au niveau GRANTs.
REVOKE INSERT, UPDATE, DELETE ON public.invitation_send_log FROM authenticated, anon;
GRANT SELECT, INSERT ON public.invitation_send_log TO service_role;

-- 4. RLS déjà active (vérification défensive idempotente)
ALTER TABLE public.invitation_send_log ENABLE ROW LEVEL SECURITY;