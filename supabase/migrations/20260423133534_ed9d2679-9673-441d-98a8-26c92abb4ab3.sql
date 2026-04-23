-- =========================================================================
-- FIX cycle 5 #3 — Scope objective-attachments storage WRITE policies
-- =========================================================================
-- Avant : policy INSERT sur storage.objects pour bucket 'objective-attachments'
--   se limite à `auth.uid() IS NOT NULL` (migration 20260420174723 lignes 117-122)
--   → tout user JWT pouvait uploader 25MB sur n'importe quel path (DoS storage,
--   pollution cross-club). Mitigé en lecture par RLS sur table miroir mais le
--   bucket restait squattable.
-- Fix : helper public.can_write_objective_attachment(user, path) qui parse
--   le 1er segment du path pour distinguer team_objective vs player_objective,
--   puis vérifie l'autorité (admin / club_admin / coach assigné / créateur)
--   sur l'objective ciblé. Cast UUID fail-safe via exception block.
-- Conventions path frontend (confirmées via grep) :
--   team    : '<team_id>/<team_objective_id>/<uuid>.<ext>'   → segment[2]
--   player  : 'player/<player_id>/<player_objective_id>/<uuid>.<ext>' → segment[3]
-- =========================================================================

CREATE OR REPLACE FUNCTION public.can_write_objective_attachment(
  _user_id uuid,
  _path text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_segments text[];
  v_objective_id uuid;
  v_first text;
  v_team_id uuid;
  v_player_id uuid;
  v_created_by uuid;
BEGIN
  -- Bypass super-admin (god view)
  IF public.is_admin(_user_id) THEN
    RETURN true;
  END IF;

  IF _user_id IS NULL OR _path IS NULL OR _path = '' THEN
    RETURN false;
  END IF;

  v_segments := storage.foldername(_path);
  IF v_segments IS NULL OR array_length(v_segments, 1) IS NULL THEN
    RETURN false;
  END IF;
  v_first := v_segments[1];

  -- Branche player_objectives : 'player/<player_id>/<player_objective_id>/...'
  IF v_first = 'player' THEN
    IF array_length(v_segments, 1) < 3 THEN
      RETURN false;
    END IF;
    BEGIN
      v_objective_id := v_segments[3]::uuid;
    EXCEPTION WHEN others THEN
      RETURN false;
    END;
    SELECT po.team_id, po.player_id, po.created_by
      INTO v_team_id, v_player_id, v_created_by
    FROM public.player_objectives po
    WHERE po.id = v_objective_id;
    IF v_team_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN (
      v_created_by = _user_id
      OR public.is_club_admin_of_team(_user_id, v_team_id)
      OR public.is_coach_of_team(_user_id, v_team_id)
    );
  END IF;

  -- Branche team_objectives : '<team_id>/<team_objective_id>/...'
  IF array_length(v_segments, 1) < 2 THEN
    RETURN false;
  END IF;
  BEGIN
    v_objective_id := v_segments[2]::uuid;
  EXCEPTION WHEN others THEN
    RETURN false;
  END;
  SELECT t_o.team_id, t_o.created_by
    INTO v_team_id, v_created_by
  FROM public.team_objectives t_o
  WHERE t_o.id = v_objective_id;
  IF v_team_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN (
    v_created_by = _user_id
    OR public.is_club_admin_of_team(_user_id, v_team_id)
    OR public.is_coach_of_team(_user_id, v_team_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_write_objective_attachment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_objective_attachment(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- DROP les policies WRITE existantes (noms exacts depuis migration 20260420174723)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "objective-attachments scoped insert" ON storage.objects;
DROP POLICY IF EXISTS "objective-attachments scoped update" ON storage.objects;
DROP POLICY IF EXISTS "objective-attachments scoped delete" ON storage.objects;

-- ---------------------------------------------------------------------------
-- INSERT : restreint au scope (closes IDOR cycle 5 #3)
-- ---------------------------------------------------------------------------
CREATE POLICY "objective-attachments scoped insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'objective-attachments'
  AND public.can_write_objective_attachment(auth.uid(), name)
);

-- ---------------------------------------------------------------------------
-- UPDATE : même contrôle de scope, USING + WITH CHECK
-- (on remplace la version qui dépendait du JOIN sur la table miroir : trop
-- restrictif pour l'INSERT initial où la row miroir n'existe pas encore ;
-- ici on uniformise via le path)
-- ---------------------------------------------------------------------------
CREATE POLICY "objective-attachments scoped update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND public.can_write_objective_attachment(auth.uid(), name)
)
WITH CHECK (
  bucket_id = 'objective-attachments'
  AND public.can_write_objective_attachment(auth.uid(), name)
);

-- ---------------------------------------------------------------------------
-- DELETE : même contrôle de scope
-- ---------------------------------------------------------------------------
CREATE POLICY "objective-attachments scoped delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'objective-attachments'
  AND public.can_write_objective_attachment(auth.uid(), name)
);