-- audit_log reste serveur-only (pas de GRANT INSERT a authenticated) : la policy
-- self-insert posee precedemment est inerte -> on la retire.
DROP POLICY IF EXISTS "Authenticated insert own audit entries" ON public.audit_log;

-- B24/B28 — Tracer cote serveur les changements de parental_consents (notamment
-- les REVOCATIONS), qui n'etaient pas audites (aucun trigger d'audit sur cette
-- table, et l'insert client de MyConsents echoue faute de privilege INSERT).
DROP TRIGGER IF EXISTS trg_audit_parental_consents ON public.parental_consents;
CREATE TRIGGER trg_audit_parental_consents
AFTER INSERT OR UPDATE OR DELETE ON public.parental_consents
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
