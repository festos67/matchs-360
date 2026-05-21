-- GV-EDGE-007 / P0 — Câblage des crons RGPD avec authentification correcte
--
-- Contexte : execute-erasure et dispatch-guardian-notifications appliquent
-- la garde BUG-EDGE-002 (comparaison constant-time du SERVICE_ROLE_KEY dans
-- Authorization: Bearer). Les jobs cron existants envoyaient une ANON KEY
-- via header 'apikey' → 403 systématique → effacement art. 17 et
-- notifications art. 8 inopérants.
--
-- Fix : recâbler en lisant SERVICE_ROLE_KEY depuis Vault
-- (secret `email_queue_service_role_key`, déjà utilisé par
-- process-email-queue) et en posant le header Authorization: Bearer attendu.
-- Le secret n'apparaît PAS en clair dans cron.job.command.
--
-- Périmètre : UNIQUEMENT les 2 jobs RGPD défaillants. process-email-queue
-- (déjà correct) et les 6 autres crons (purges SQL internes) sont intacts.

DO $$
BEGIN
  -- Idempotence : déprogrammer si déjà présents.
  BEGIN PERFORM cron.unschedule('dispatch-guardian-notifications');
  EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN PERFORM cron.unschedule('execute-erasure-daily');
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- dispatch-guardian-notifications : toutes les 2 minutes.
-- Drainage rapide de pending_notifications → enqueue dans pgmq
-- (transactional_emails) → process-email-queue (déjà câblé) envoie.
SELECT cron.schedule(
  'dispatch-guardian-notifications',
  '*/2 * * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://aasihxqsasjpszqjlbid.supabase.co/functions/v1/dispatch-guardian-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $cmd$
);

-- execute-erasure : quotidien 03:00 UTC. Le délai de grâce 7j est géré
-- DANS la fonction (filtre scheduled_for <= now()), donc daily suffit.
SELECT cron.schedule(
  'execute-erasure-daily',
  '0 3 * * *',
  $cmd$
  SELECT net.http_post(
    url := 'https://aasihxqsasjpszqjlbid.supabase.co/functions/v1/execute-erasure',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets
        WHERE name = 'email_queue_service_role_key'
      )
    ),
    body := jsonb_build_object('triggered_at', now())
  );
  $cmd$
);