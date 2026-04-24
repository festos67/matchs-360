-- Schedule hourly job to mark overdue invitations as expired
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('expire-invitations-hourly');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
END $$;

SELECT cron.schedule(
  'expire-invitations-hourly',
  '0 * * * *',
  $$SELECT public.expire_overdue_invitations();$$
);