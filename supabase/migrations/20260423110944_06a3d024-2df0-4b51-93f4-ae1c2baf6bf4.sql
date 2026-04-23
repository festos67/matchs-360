CREATE OR REPLACE FUNCTION public._admin_list_users_check_caller(
  p_caller uuid, p_is_admin boolean, p_club_filter uuid
) RETURNS uuid[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $check$
DECLARE v_club_ids uuid[];
BEGIN
  IF p_is_admin THEN
    IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_caller AND role = 'admin') THEN
      RAISE EXCEPTION 'Caller claims admin but is not' USING ERRCODE = '42501';
    END IF;
    RETURN ARRAY[]::uuid[];
  END IF;
  SELECT COALESCE(array_agg(DISTINCT club_id), ARRAY[]::uuid[]) INTO v_club_ids
  FROM public.user_roles
  WHERE user_id = p_caller AND role = 'club_admin' AND club_id IS NOT NULL;
  IF COALESCE(array_length(v_club_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'Caller is not a club_admin' USING ERRCODE = '42501';
  END IF;
  IF p_club_filter IS NOT NULL AND NOT (p_club_filter = ANY(v_club_ids)) THEN
    RAISE EXCEPTION 'Club filter outside caller scope' USING ERRCODE = '42501';
  END IF;
  RETURN v_club_ids;
END;
$check$;

REVOKE ALL ON FUNCTION public._admin_list_users_check_caller(uuid, boolean, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._admin_list_users_check_caller(uuid, boolean, uuid) TO service_role;