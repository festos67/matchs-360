-- Garantit l'unicité du nom de débrief par joueur (parmi les non supprimés)
-- Évite les race conditions du calcul de nom unique côté JS

-- Étape 1 : nettoyer les doublons éventuels (name identiques pour un même player_id, non supprimés)
-- On garde le plus ancien (created_at ASC) et on renomme les autres en suffixant l'id court
WITH dups AS (
  SELECT
    id,
    player_id,
    name,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY player_id, name
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.evaluations
  WHERE deleted_at IS NULL
)
UPDATE public.evaluations e
SET name = e.name || ' (' || substring(e.id::text, 1, 8) || ')'
FROM dups
WHERE e.id = dups.id
  AND dups.rn > 1;

-- Étape 2 : créer l'index unique partiel
CREATE UNIQUE INDEX IF NOT EXISTS evaluations_unique_name_per_player_idx
  ON public.evaluations (player_id, name)
  WHERE deleted_at IS NULL;