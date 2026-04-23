-- =====================================================================
-- Fix C4-8 / C5-19 — Schedule pg_cron purges (RGPD retention)
-- =====================================================================
-- Programme via pg_cron les fonctions de purge SECURITY DEFINER déjà
-- existantes au HEAD courant. Aucune nouvelle fonction créée.
-- Inventaire (étape 1) : purge_old_audit_log (rétention 1 an, RGPD),
-- purge_old_evaluations, purge_old_frameworks, purge_old_invitation_send_log.
-- Heures off-peak décalées (03:17, 03:27, 03:37, 03:47 UTC) pour éviter
-- contention avec 'trial-notifications-daily' (08:00 UTC).
-- Idempotent : DO $$ unschedule $$ avant chaque cron.schedule.
-- =====================================================================

-- 1. Audit log purge (RGPD 12 mois) — 03:17 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit-log-purge-daily') THEN
    PERFORM cron.unschedule('audit-log-purge-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'audit-log-purge-daily',
  '17 3 * * *',
  $$SELECT public.purge_old_audit_log();$$
);

-- 2. Evaluations purge (rétention par type) — 03:27 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluations-purge-daily') THEN
    PERFORM cron.unschedule('evaluations-purge-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'evaluations-purge-daily',
  '27 3 * * *',
  $$SELECT public.purge_old_evaluations();$$
);

-- 3. Frameworks purge (anciens référentiels non utilisés) — 03:37 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'frameworks-purge-daily') THEN
    PERFORM cron.unschedule('frameworks-purge-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'frameworks-purge-daily',
  '37 3 * * *',
  $$SELECT public.purge_old_frameworks();$$
);

-- 4. Invitation send log purge — 03:47 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'invitation-send-log-purge-daily') THEN
    PERFORM cron.unschedule('invitation-send-log-purge-daily');
  END IF;
END $$;

SELECT cron.schedule(
  'invitation-send-log-purge-daily',
  '47 3 * * *',
  $$SELECT public.purge_old_invitation_send_log();$$
);
