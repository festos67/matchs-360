BEGIN;

-- ============================================================
-- F-107 — framework_snapshots.framework_id → competence_frameworks(id)
-- ============================================================

-- Colonne actuellement NOT NULL : nécessaire de la rendre nullable pour
-- supporter ON DELETE SET NULL (préservation forensic du snapshot).
ALTER TABLE public.framework_snapshots
  ALTER COLUMN framework_id DROP NOT NULL;

-- Nettoyage défensif (0 orphelin observé, mais idempotent)
UPDATE public.framework_snapshots
SET framework_id = NULL
WHERE framework_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.competence_frameworks cf
    WHERE cf.id = framework_snapshots.framework_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'framework_snapshots_framework_id_fkey'
      AND conrelid = 'public.framework_snapshots'::regclass
  ) THEN
    ALTER TABLE public.framework_snapshots
      ADD CONSTRAINT framework_snapshots_framework_id_fkey
      FOREIGN KEY (framework_id)
      REFERENCES public.competence_frameworks(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON CONSTRAINT framework_snapshots_framework_id_fkey
  ON public.framework_snapshots IS
  'F-107 fix (2026-04-25): empeche INSERT de framework_id arbitraire. ON DELETE SET NULL : le snapshot survit a la suppression du framework source pour preserver l''historique.';

-- ============================================================
-- F-108 — invitation_send_log : club_id + invited_by
-- ============================================================

ALTER TABLE public.invitation_send_log
  ALTER COLUMN club_id DROP NOT NULL;

ALTER TABLE public.invitation_send_log
  ALTER COLUMN invited_by DROP NOT NULL;

UPDATE public.invitation_send_log
SET club_id = NULL
WHERE club_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.clubs c WHERE c.id = invitation_send_log.club_id
  );

UPDATE public.invitation_send_log
SET invited_by = NULL
WHERE invited_by IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = invitation_send_log.invited_by
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invitation_send_log_club_id_fkey'
      AND conrelid = 'public.invitation_send_log'::regclass
  ) THEN
    ALTER TABLE public.invitation_send_log
      ADD CONSTRAINT invitation_send_log_club_id_fkey
      FOREIGN KEY (club_id)
      REFERENCES public.clubs(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'invitation_send_log_invited_by_fkey'
      AND conrelid = 'public.invitation_send_log'::regclass
  ) THEN
    ALTER TABLE public.invitation_send_log
      ADD CONSTRAINT invitation_send_log_invited_by_fkey
      FOREIGN KEY (invited_by)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON CONSTRAINT invitation_send_log_club_id_fkey
  ON public.invitation_send_log IS
  'F-108 fix (2026-04-25): empeche pollution du log avec des UUID inventes. ON DELETE SET NULL pour preserver le log forensic (RGPD).';

COMMENT ON CONSTRAINT invitation_send_log_invited_by_fkey
  ON public.invitation_send_log IS
  'F-108 fix (2026-04-25): empeche faux invited_by + preserve le log apres suppression du compte inviteur (forensic + RGPD).';

-- ============================================================
-- F-109 — audit_log : actor_id (FK classique)
-- ============================================================

-- actor_id est deja nullable, pas besoin de DROP NOT NULL
UPDATE public.audit_log
SET actor_id = NULL
WHERE actor_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = audit_log.actor_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_log_actor_id_fkey'
      AND conrelid = 'public.audit_log'::regclass
  ) THEN
    ALTER TABLE public.audit_log
      ADD CONSTRAINT audit_log_actor_id_fkey
      FOREIGN KEY (actor_id)
      REFERENCES auth.users(id)
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

COMMENT ON CONSTRAINT audit_log_actor_id_fkey
  ON public.audit_log IS
  'F-109 fix (2026-04-25): empeche INSERT avec actor_id forge. ON DELETE SET NULL : audit_log est SACRE et survit a la suppression du compte (forensic eternel + RGPD).';

-- record_id : polymorphe (peut pointer vers users, clubs, teams, evaluations, etc.)
-- Pas de FK classique possible. Volume actuel = 143 rows, trigger validate
-- non justifie. Documentation de l'intention :
COMMENT ON COLUMN public.audit_log.record_id IS
  'F-109 (2026-04-25): UUID polymorphe pointant vers la ligne mutee dans table_name. Pas de FK classique car polymorphe. Validation forte possible via trigger BEFORE INSERT (a evaluer si pollution observee, volume actuel trop faible pour justifier le cout).';

COMMIT;