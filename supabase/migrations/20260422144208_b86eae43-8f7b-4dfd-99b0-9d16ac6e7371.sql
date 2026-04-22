-- Recettage: les administrateurs (super admin) sont considérés en mode Pro
-- pour neutraliser toutes les restrictions de plan via get_club_plan().
-- Les triggers (check_team_limit, check_member_limit, check_evaluation_limit, etc.)
-- s'appuient tous sur get_club_plan(), donc cette modification suffit.

CREATE OR REPLACE FUNCTION public.get_club_plan(p_club_id uuid)
 RETURNS subscription_plan
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    -- Bypass: les super admins sont toujours en Pro (phase de recettage)
    WHEN public.is_admin(auth.uid()) THEN 'pro'::public.subscription_plan
    ELSE COALESCE(
      (
        SELECT plan FROM public.subscriptions
        WHERE club_id = p_club_id
          AND starts_at <= CURRENT_DATE
          AND ends_at >= CURRENT_DATE
        ORDER BY
          CASE plan WHEN 'pro' THEN 0 ELSE 1 END,
          created_at DESC
        LIMIT 1
      ),
      'free'::public.subscription_plan
    )
  END;
$function$;