BEGIN;

-- ============================================================
-- R1 / A1-001 (2026-04-27) : Correction de la typo 'canceled' (1 L)
-- introduite dans la migration 20260425075508_17def63a (fix F-110).
--
-- Le CHECK constraint historique sur invitations.status (defini dans
-- 20260106175240) accepte uniquement l'orthographe BRITANNIQUE
-- 'cancelled' (2 L). La migration originale lance une violation
-- check_constraint des qu'un doublon pending existe au moment de
-- l'UPDATE, ce qui bloque la creation de l'index unique partiel.
--
-- Etat constate au 2026-04-27 :
--   - index 'invitations_pending_email_club_uniq' PRESENT (F-110 actif)
--   - aucun doublon pending actuel
--   - migration 20260425075508 NON enregistree dans schema_migrations
--   => Scenario A : fix defensif/idempotent pour proteger les replays
--      futurs (env de test, dev local, restore, fork).
--
-- Cette migration de correction est strictement idempotente :
--   1. Re-applique l'UPDATE avec la bonne orthographe (no-op aujourd'hui)
--   2. Normalise tout 'canceled' (1 L) qui aurait pu se glisser
--   3. (Re-)cree l'index unique partiel via IF NOT EXISTS
-- ============================================================

-- 1. Re-cancel des doublons pending eventuels avec la bonne orthographe
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(email), club_id
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.invitations
  WHERE status = 'pending'
)
UPDATE public.invitations i
SET status = 'cancelled'  -- 2 L, conforme au CHECK constraint
FROM ranked r
WHERE i.id = r.id
  AND r.rn > 1;

-- 2. Defensif : normalisation de tout 'canceled' (1 L) qui aurait
-- pu etre injecte via service_role / bypass. No-op si rien a corriger.
UPDATE public.invitations
SET status = 'cancelled'
WHERE status = 'canceled';

-- 3. (Re-)creer l'index UNIQUE partiel — IF NOT EXISTS = idempotent
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email_club_uniq
  ON public.invitations (lower(email), club_id)
  WHERE status = 'pending';

COMMENT ON INDEX public.invitations_pending_email_club_uniq IS
  'F-110 fix (2026-04-25, R1 corrige le 2026-04-27): empeche les doublons VIVANTS (1 invitation pending max par couple lower(email)/club_id). Re-creation defensive apres typo canceled/cancelled qui bloquait la migration originale au replay.';

COMMIT;