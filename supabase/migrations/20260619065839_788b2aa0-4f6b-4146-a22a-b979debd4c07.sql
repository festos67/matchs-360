-- Auth cron -> edge : secret dédié partagé via Vault, lu côté fonction par une
-- RPC SECURITY DEFINER (comparaison temps-constant côté TS) et côté cron par
-- decrypted_secrets. Découple l'auth des crons de la service_role key.

-- 1) Secret partagé généré DANS la base (aléatoire, idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_auth_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'cron_auth_secret',
      'Secret partage authentifiant pg_cron -> edge functions (crons RGPD)'
    );
  END IF;
END $$;

-- 2) Lecteur SECURITY DEFINER reserve a service_role
CREATE OR REPLACE FUNCTION public.get_cron_secret()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_auth_secret';
$$;

REVOKE ALL ON FUNCTION public.get_cron_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_secret() TO service_role;

-- 3) (Re)programmer les 3 crons edge sur le nouveau secret + le bon projet.
SELECT cron.schedule('dispatch-guardian-notifications', '*/2 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://zsossagpsxtjbloxxetq.supabase.co/functions/v1/dispatch-guardian-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_auth_secret')
    ),
    body := jsonb_build_object('triggered_at', now())
  );
$cron$);

SELECT cron.schedule('execute-erasure-daily', '0 3 * * *', $cron$
  SELECT net.http_post(
    url := 'https://zsossagpsxtjbloxxetq.supabase.co/functions/v1/execute-erasure',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_auth_secret')
    ),
    body := jsonb_build_object('triggered_at', now())
  );
$cron$);

SELECT cron.schedule('send-invitation-reminders-daily', '0 9 * * *', $cron$
  SELECT net.http_post(
    url := 'https://zsossagpsxtjbloxxetq.supabase.co/functions/v1/send-invitation-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_auth_secret')
    ),
    body := jsonb_build_object('triggered_at', now())
  );
$cron$);