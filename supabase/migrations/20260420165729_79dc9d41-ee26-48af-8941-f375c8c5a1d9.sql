-- Restreindre l'UPDATE subscriptions par les club_admin : seul auto_renew est modifiable.
-- Les colonnes plan, ends_at, starts_at, is_trial, source, amount_cents, stripe_*, season_*
-- doivent rester gérées par l'admin et par les webhooks Stripe (service_role).

DROP POLICY IF EXISTS "Club admins can update their subscription" ON public.subscriptions;

-- Nouvelle policy : USING vérifie que c'est bien leur club ; WITH CHECK garantit
-- qu'aucune colonne sensible n'est modifiée (toutes égales à OLD via une fonction trigger).
CREATE POLICY "Club admins toggle auto_renew on their subscription"
ON public.subscriptions
FOR UPDATE
TO authenticated
USING (is_club_admin(auth.uid(), club_id))
WITH CHECK (is_club_admin(auth.uid(), club_id));

-- Trigger BEFORE UPDATE pour bloquer toute modification autre que auto_renew
-- quand l'appelant n'est pas service_role ni admin.
CREATE OR REPLACE FUNCTION public.guard_subscription_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Bypass pour service_role (webhooks Stripe) et super admins
  IF auth.role() = 'service_role' OR public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Pour les autres rôles (club_admin), seul auto_renew peut changer
  IF NEW.plan IS DISTINCT FROM OLD.plan
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
     OR NEW.ends_at IS DISTINCT FROM OLD.ends_at
     OR NEW.season_start IS DISTINCT FROM OLD.season_start
     OR NEW.season_end IS DISTINCT FROM OLD.season_end
     OR NEW.is_trial IS DISTINCT FROM OLD.is_trial
     OR NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
     OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
     OR NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id
     OR NEW.club_id IS DISTINCT FROM OLD.club_id
     OR NEW.renewed_from IS DISTINCT FROM OLD.renewed_from
  THEN
    RAISE EXCEPTION 'Only auto_renew can be modified by club admins. Use the billing portal to change plan or dates.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_subscription_update ON public.subscriptions;
CREATE TRIGGER trg_guard_subscription_update
BEFORE UPDATE ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.guard_subscription_update();