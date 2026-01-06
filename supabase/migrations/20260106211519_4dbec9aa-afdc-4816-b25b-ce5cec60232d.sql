
-- Fonction pour attribuer automatiquement le rôle admin au super administrateur
CREATE OR REPLACE FUNCTION public.assign_super_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Si l'email est celui du super admin, attribuer le rôle admin
  IF NEW.email = 'asahand@protonmail.com' THEN
    INSERT INTO public.user_roles (user_id, role, club_id)
    VALUES (NEW.id, 'admin', NULL)
    ON CONFLICT (user_id, role, club_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger sur la table profiles pour attribuer le rôle admin
DROP TRIGGER IF EXISTS on_super_admin_created ON public.profiles;
CREATE TRIGGER on_super_admin_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_super_admin_role();

-- Si le compte existe déjà, lui attribuer le rôle admin maintenant
INSERT INTO public.user_roles (user_id, role, club_id)
SELECT id, 'admin'::app_role, NULL
FROM public.profiles
WHERE email = 'asahand@protonmail.com'
ON CONFLICT (user_id, role, club_id) DO NOTHING;
