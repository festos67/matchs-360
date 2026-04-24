-- F12: Admin actions on invitations (cancel / resend / purge / expire)

CREATE OR REPLACE FUNCTION public.cancel_invitation(_invitation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_inv RECORD;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT id, club_id, status INTO v_inv
  FROM public.invitations
  WHERE id = _invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_admin(v_actor)
    OR (v_inv.club_id IS NOT NULL AND public.is_club_admin(v_actor, v_inv.club_id))
  ) THEN
    RAISE EXCEPTION 'Forbidden: not authorized to cancel this invitation'
      USING ERRCODE = '42501';
  END IF;

  IF v_inv.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot cancel invitation with status %', v_inv.status
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.invitations
  SET status = 'cancelled'
  WHERE id = _invitation_id;

  RETURN jsonb_build_object('ok', true, 'id', _invitation_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_invitation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invitation(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.resend_invitation(
  _invitation_id uuid,
  _new_expires_days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_inv RECORD;
  v_new_expires timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF _new_expires_days < 1 OR _new_expires_days > 30 THEN
    RAISE EXCEPTION 'expires_days must be between 1 and 30' USING ERRCODE = '22023';
  END IF;

  SELECT id, club_id, status, accepted_at INTO v_inv
  FROM public.invitations
  WHERE id = _invitation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;

  IF NOT (
    public.is_admin(v_actor)
    OR (v_inv.club_id IS NOT NULL AND public.is_club_admin(v_actor, v_inv.club_id))
  ) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_inv.accepted_at IS NOT NULL OR v_inv.status = 'accepted' THEN
    RAISE EXCEPTION 'Cannot resend an accepted invitation' USING ERRCODE = '22023';
  END IF;

  v_new_expires := now() + (_new_expires_days || ' days')::interval;

  UPDATE public.invitations
  SET status = 'pending',
      expires_at = v_new_expires
  WHERE id = _invitation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'id', _invitation_id,
    'expires_at', v_new_expires
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resend_invitation(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resend_invitation(uuid, int) TO authenticated;


CREATE OR REPLACE FUNCTION public.purge_old_invitations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted int;
BEGIN
  WITH d AS (
    DELETE FROM public.invitations
    WHERE status IN ('expired', 'cancelled')
      AND created_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*) INTO v_deleted FROM d;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_old_invitations() FROM PUBLIC, anon;


CREATE OR REPLACE FUNCTION public.expire_overdue_invitations()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  WITH u AS (
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO v_updated FROM u;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_overdue_invitations() FROM PUBLIC, anon;