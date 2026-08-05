-- B24/B28 — audit_log n'avait plus AUCUNE policy INSERT -> les ecritures d'audit
-- cote client (MyConsents : revocation consentement, droit a l'image) echouaient
-- silencieusement (best-effort) => trou de tracabilite RGPD. On autorise un
-- utilisateur authentifie a inserer une entree d'audit UNIQUEMENT attribuee a
-- lui-meme (actor_id = auth.uid()) : restaure l'audit legitime sans permettre
-- de falsifier l'auteur d'une autre personne. Les triggers SECURITY DEFINER
-- (fn_audit_trigger) continuent d'inserer normalement (ils bypassent la RLS).
DROP POLICY IF EXISTS "Authenticated insert own audit entries" ON public.audit_log;
CREATE POLICY "Authenticated insert own audit entries"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (actor_id = auth.uid());
