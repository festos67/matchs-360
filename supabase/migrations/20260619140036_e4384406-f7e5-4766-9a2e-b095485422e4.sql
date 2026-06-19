-- B1 — Permettre au DESTINATAIRE d'une invitation de voir SA propre invitation
-- (par email du JWT). Sans ça, /invite/accept renvoie 0 ligne (RLS) et déconnecte
-- l'invité (« Aucune invitation active »). Policy additive, sûre pour les 2 cibles.
DROP POLICY IF EXISTS "Invitees view own invitation by email" ON public.invitations;

CREATE POLICY "Invitees view own invitation by email"
ON public.invitations
FOR SELECT
TO authenticated
USING (lower(email) = lower((auth.jwt() ->> 'email')));