-- F-202: Verrouille les fonctions de maintenance SECURITY DEFINER.
-- PostgreSQL accorde EXECUTE à PUBLIC par défaut → on révoque puis on
-- accorde explicitement à service_role (cron + edge functions backend).

-- purge_old_evaluations()
REVOKE EXECUTE ON FUNCTION public.purge_old_evaluations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_evaluations() TO service_role;

-- purge_old_frameworks()
REVOKE EXECUTE ON FUNCTION public.purge_old_frameworks() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_frameworks() TO service_role;

-- purge_old_audit_log()
REVOKE EXECUTE ON FUNCTION public.purge_old_audit_log() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_audit_log() TO service_role;

-- purge_old_invitation_send_log()
REVOKE EXECUTE ON FUNCTION public.purge_old_invitation_send_log() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_invitation_send_log() TO service_role;

-- purge_old_invitations() — fonction de purge listée dans le schéma
REVOKE EXECUTE ON FUNCTION public.purge_old_invitations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_old_invitations() TO service_role;

-- expire_overdue_invitations() — bascule des invitations vers "expired"
REVOKE EXECUTE ON FUNCTION public.expire_overdue_invitations() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.expire_overdue_invitations() TO service_role;

-- create_trial_notifications() — job de notifications planifié
REVOKE EXECUTE ON FUNCTION public.create_trial_notifications() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.create_trial_notifications() TO service_role;