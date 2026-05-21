-- Phase 6 RGPD : table de DÉSIGNATION du tuteur légal d'un mineur.
-- Source de vérité serveur (email authentifié ↔ mineur ciblé) consultée
-- par record-parental-consent AVANT tout INSERT dans parental_consents.

DO $$ BEGIN
  CREATE TYPE public.guardian_designation_status AS ENUM ('pending', 'consumed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.guardian_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  minor_profile_id uuid NOT NULL,
  guardian_email text NOT NULL,
  relationship public.guardian_relationship NOT NULL,
  status public.guardian_designation_status NOT NULL DEFAULT 'pending',
  created_by uuid,
  consumed_by uuid,
  consumed_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guardian_email_lowercase CHECK (guardian_email = lower(guardian_email))
);

CREATE UNIQUE INDEX IF NOT EXISTS guardian_designations_unique_pending
  ON public.guardian_designations (minor_profile_id, guardian_email)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS guardian_designations_email_idx
  ON public.guardian_designations (guardian_email) WHERE status = 'pending';

ALTER TABLE public.guardian_designations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads guardian_designations" ON public.guardian_designations;
CREATE POLICY "Admin reads guardian_designations"
  ON public.guardian_designations FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Creator reads guardian_designations" ON public.guardian_designations;
CREATE POLICY "Creator reads guardian_designations"
  ON public.guardian_designations FOR SELECT TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Guardian reads own designations" ON public.guardian_designations;
CREATE POLICY "Guardian reads own designations"
  ON public.guardian_designations FOR SELECT TO authenticated
  USING (lower(guardian_email) = lower(coalesce((auth.jwt() ->> 'email'), '')));

-- Aucune INSERT/UPDATE/DELETE par RLS : passage obligatoire par
-- send-invitation (création) ou record-parental-consent (consommation),
-- tous deux en service_role.

COMMENT ON TABLE public.guardian_designations IS
  'Phase 6 RGPD : désignation serveur d''un tuteur légal pour un mineur. Posée par send-invitation à la création du mineur, consommée par record-parental-consent. Preuve de filiation requise avant tout consentement.';
