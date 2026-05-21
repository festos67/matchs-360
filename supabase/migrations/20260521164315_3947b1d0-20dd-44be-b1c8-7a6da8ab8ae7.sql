BEGIN;

-- BUG-SQL-004: Tighten profiles SELECT policy so peers cannot read minor PII directly.
-- Adults remain visible between teammates/club members (no regression).
-- Minors are visible (full row) only to elevated viewers: self, admin, coach of player,
-- legal guardian, club admin of one of their teams, or supporter of the minor (parent).

DROP POLICY IF EXISTS "Users view profiles in scope" ON public.profiles;

CREATE POLICY "Users view profiles in scope"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      -- Self
      id = auth.uid()
      -- Elevated roles (see everything, including minors)
      OR public.is_admin(auth.uid())
      OR public.is_coach_of_player(auth.uid(), id)
      OR public.is_legal_guardian_of(auth.uid(), id)
      OR public.is_supporter_of_player(auth.uid(), id)
      OR EXISTS (
        SELECT 1 FROM public.team_members tm
        WHERE tm.user_id = profiles.id
          AND tm.is_active = true
          AND public.is_club_admin_of_team(auth.uid(), tm.team_id)
      )
      -- Peers (same club / teammates): ONLY if target is an ADULT
      OR (
        NOT public.is_minor(id)
        AND (
          club_id IN (SELECT public.get_user_club_ids(auth.uid()))
          OR id IN (SELECT public.get_teammate_user_ids(auth.uid()))
        )
      )
    )
  );

-- profiles_safe: switch to SECURITY DEFINER with an explicit scope WHERE.
-- The view bypasses base RLS to serve the masked safe-subset of minors to peers,
-- but the WHERE clause restricts rows to those the caller could legitimately see
-- (prevents oracle-style enumeration of the entire base).

DROP VIEW IF EXISTS public.profiles_safe;

CREATE VIEW public.profiles_safe
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.first_name,
  p.nickname,
  p.club_id,
  p.created_at,
  p.updated_at,
  p.deleted_at,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.last_name ELSE NULL END AS last_name,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.email ELSE NULL END AS email,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.photo_url ELSE NULL END AS photo_url,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.birthdate ELSE NULL END AS birthdate,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.photo_is_minor ELSE NULL END AS photo_is_minor,
  CASE WHEN public.viewer_sees_sensitive(p.id) THEN p.image_rights_consent_at ELSE NULL END AS image_rights_consent_at
FROM public.profiles p
WHERE
  p.deleted_at IS NULL
  AND (
    p.id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_coach_of_player(auth.uid(), p.id)
    OR public.is_legal_guardian_of(auth.uid(), p.id)
    OR public.is_supporter_of_player(auth.uid(), p.id)
    OR p.club_id IN (SELECT public.get_user_club_ids(auth.uid()))
    OR p.id IN (SELECT public.get_teammate_user_ids(auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = p.id
        AND tm.is_active = true
        AND public.is_club_admin_of_team(auth.uid(), tm.team_id)
    )
  );

GRANT SELECT ON public.profiles_safe TO authenticated;

COMMIT;