
CREATE OR REPLACE FUNCTION public.create_framework_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.framework_snapshots (framework_id, snapshot)
  SELECT
    NEW.framework_id,
    jsonb_build_object(
      'name', cf.name,
      'themes', (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'name', t.name,
            'color', t.color,
            'skills', (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'id', s.id,
                  'name', s.name,
                  'definition', s.definition
                ) ORDER BY s.order_index
              )
              FROM public.skills s WHERE s.theme_id = t.id
            )
          ) ORDER BY t.order_index
        )
        FROM public.themes t WHERE t.framework_id = cf.id
      )
    )
  FROM public.competence_frameworks cf
  WHERE cf.id = NEW.framework_id
  ON CONFLICT (framework_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_framework_snapshot
  AFTER INSERT ON public.evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_framework_snapshot();
