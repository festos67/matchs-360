BEGIN;

-- ============================================================
-- F-110 — UNIQUE partiel sur (lower(email), club_id) WHERE pending
-- ============================================================

-- 1. Cleanup defensif : si des doublons pending existent, garder le plus
--    recent et marquer les autres comme 'canceled' (pas de DELETE,
--    historique forensic preserve). La table n'a pas de colonne
--    canceled_at / canceled_reason / deleted_at — on se limite a status.
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
SET status = 'canceled'
FROM ranked r
WHERE i.id = r.id
  AND r.rn > 1;

-- 2. Index UNIQUE partiel — bloque les doublons VIVANTS uniquement.
--    Tolerant a la re-invitation apres acceptation / expiration / cancel.
--    lower(email) normalise la casse pour empecher User@x.com vs user@x.com.
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_email_club_uniq
  ON public.invitations (lower(email), club_id)
  WHERE status = 'pending';

COMMENT ON INDEX public.invitations_pending_email_club_uniq IS
  'F-110 fix (2026-04-25): empeche les doublons VIVANTS (1 invitation
   pending max par couple lower(email)/club_id). Apres acceptation,
   expiration ou annulation, la re-invitation reste possible.
   Pas de deleted_at dans cette condition car la colonne n''existe pas
   sur invitations (soft-delete non utilise sur cette table).';

COMMIT;