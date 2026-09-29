-- =====================================================================
-- Codes d'accès des joueurs sans adresse e-mail (identifiant technique).
--
-- Le coach référent ou le responsable du club génère un code d'accès à usage
-- unique (fonction child-access, action « generate »). L'enfant s'en sert une
-- fois sur la page /code-acces pour choisir son propre mot de passe.
--
-- Le mot de passe actuel n'est JAMAIS modifié à la génération du code : si
-- l'enfant retrouve son mot de passe, il reste valable et le code expire seul.
--
-- Tables accessibles au service_role uniquement (aucune policy) : le code
-- n'est stocké que sous forme d'empreinte salée.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.child_access_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  code_salt text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS child_access_codes_active_idx
  ON public.child_access_codes (child_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS child_access_codes_created_by_idx
  ON public.child_access_codes (created_by, created_at);

-- Demandes « mot de passe oublié » d'un enfant : une seule ouverte à la fois,
-- notifications limitées à une par 24 h (anti-spam du coach et du parent).
CREATE TABLE IF NOT EXISTS public.child_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_request_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1,
  notified_at timestamptz,
  resolved_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS child_access_requests_one_open_idx
  ON public.child_access_requests (child_id)
  WHERE resolved_at IS NULL;

-- Limitation par appareil (empreinte de l'adresse IP), persistante entre
-- instances de la fonction.
CREATE TABLE IF NOT EXISTS public.child_access_rate_log (
  id bigserial PRIMARY KEY,
  ip_hash text NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS child_access_rate_log_idx
  ON public.child_access_rate_log (ip_hash, action, created_at);

ALTER TABLE public.child_access_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.child_access_rate_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.child_access_codes FROM anon, authenticated;
REVOKE ALL ON public.child_access_requests FROM anon, authenticated;
REVOKE ALL ON public.child_access_rate_log FROM anon, authenticated;

-- État de l'accès d'un joueur, pour sa fiche (staff du joueur uniquement) :
-- demande « mot de passe oublié » en cours et code actif éventuel. Ne révèle
-- jamais le code.
CREATE OR REPLACE FUNCTION public.get_child_access_status(_child_id uuid)
RETURNS TABLE (
  open_request_at timestamptz,
  request_count integer,
  active_code_expires_at timestamptz,
  last_code_used_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    (SELECT r.last_request_at FROM public.child_access_requests r
      WHERE r.child_id = _child_id AND r.resolved_at IS NULL LIMIT 1),
    (SELECT r.request_count FROM public.child_access_requests r
      WHERE r.child_id = _child_id AND r.resolved_at IS NULL LIMIT 1),
    (SELECT max(c.expires_at) FROM public.child_access_codes c
      WHERE c.child_id = _child_id AND c.used_at IS NULL AND c.revoked_at IS NULL
        AND c.expires_at > now()),
    (SELECT max(c.used_at) FROM public.child_access_codes c
      WHERE c.child_id = _child_id)
  WHERE auth.uid() IS NOT NULL
    AND (
      public.is_admin(auth.uid())
      OR public.is_coach_of_player(auth.uid(), _child_id)
      OR public.is_club_admin(auth.uid(), public.get_player_club_id(_child_id))
    );
$$;

REVOKE ALL ON FUNCTION public.get_child_access_status(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_child_access_status(uuid) TO authenticated;
