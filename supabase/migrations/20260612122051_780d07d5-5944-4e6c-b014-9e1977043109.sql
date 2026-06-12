DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;

-- SEC-RLS-001 : un client ne peut au plus créer qu'une notification pour LUI-MÊME.
-- Les notifications vers d'autres utilisateurs passent par des fonctions
-- SECURITY DEFINER / edge (service_role), qui bypassent la RLS.
CREATE POLICY "Users insert own notifications only"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());