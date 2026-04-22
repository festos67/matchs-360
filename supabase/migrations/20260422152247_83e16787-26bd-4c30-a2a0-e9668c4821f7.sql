-- Supprime la policy permissive et révoque l'INSERT direct.
-- Les triggers SECURITY DEFINER continuent d'écrire car ils s'exécutent avec
-- les privilèges du owner (postgres), qui n'est pas concerné par le REVOKE
-- sur les rôles applicatifs.

DROP POLICY IF EXISTS "Triggers can insert audit_log" ON public.audit_log;

REVOKE INSERT ON public.audit_log FROM authenticated, anon;