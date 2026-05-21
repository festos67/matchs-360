/**
 * @page GuardianConsent
 * @route /guardian/consent
 *
 * Phase 2 RGPD art. 8 FR : ecran de consentement du titulaire de l'autorite
 * parentale (parent / tuteur legal) pour un mineur.
 *
 * Pattern auth deterministe (R3 / F-303 / docs/auth-flows.md) :
 *  - lit le hash URL (type=invite, access_token, refresh_token)
 *  - signOut({ scope: "global" }) pour purger toute session pre-existante
 *  - nettoie le hash AVANT setSession
 *  - setSession explicite (pas de onAuthStateChange)
 *  - consumedRef anti-double-execution (React StrictMode)
 *
 * Le `minor_id` est passe en query string (?minor=<uuid>) — temporaire tant
 * que la Phase 0 bloque la creation des mineurs en prod (mode dormant).
 * En Phase 6, le mapping sera resolu cote serveur via la table invitations.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";

type Relationship = "mere" | "pere" | "tuteur_legal" | "autre_titulaire";

interface MinorInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

export default function GuardianConsent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const minorId = params.get("minor");

  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minor, setMinor] = useState<MinorInfo | null>(null);
  const [relationship, setRelationship] = useState<Relationship | "">("");
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;
    consumedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        if (!minorId) {
          if (!cancelled) {
            setError("Lien invalide : identifiant du mineur manquant.");
            setChecking(false);
          }
          return;
        }

        const hash = window.location.hash || "";
        const hp = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
        const errDesc = hp.get("error_description");
        if (errDesc) {
          if (!cancelled) {
            setError(errDesc);
            setChecking(false);
          }
          return;
        }

        const tokenType = hp.get("type");
        const accessToken = hp.get("access_token");
        const refreshToken = hp.get("refresh_token");

        // Cas A : utilisateur arrive avec lien magique invite → setSession.
        if (tokenType === "invite" && accessToken && refreshToken) {
          await supabase.auth.signOut({ scope: "global" }).catch(() => {});
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
          const { error: sErr } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sErr) {
            if (!cancelled) {
              setError("Impossible d'etablir la session. Lien expire ?");
              setChecking(false);
            }
            return;
          }
        }

        // Cas B : pas de hash → l'utilisateur doit deja etre authentifie.
        const { data: userData } = await supabase.auth.getUser();
        if (!userData?.user) {
          if (!cancelled) {
            setError(
              "Vous devez ouvrir le lien recu par email pour acceder a cet ecran.",
            );
            setChecking(false);
          }
          return;
        }

        // Charger un minimum d'info sur le mineur (RLS-aware).
        const { data: minorRow } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .eq("id", minorId)
          .maybeSingle();

        if (!cancelled) {
          setMinor(
            minorRow ?? { id: minorId, first_name: null, last_name: null },
          );
          setChecking(false);
        }
      } catch (e) {
        console.error("GuardianConsent fatal:", e);
        if (!cancelled) {
          setError("Erreur inattendue. Veuillez reessayer.");
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [minorId]);

  const handleSubmit = async () => {
    if (!minorId || !relationship || !accepted) return;
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "record-parental-consent",
        {
          body: {
            minor_profile_id: minorId,
            relationship,
          },
        },
      );
      if (fnErr) throw fnErr;
      if ((data as { error?: string })?.error) {
        throw new Error((data as { error: string }).error);
      }
      setDone(true);
      toast.success("Consentement enregistré");
      setTimeout(() => navigate("/dashboard"), 2500);
    } catch (e) {
      console.error("record-parental-consent failed:", e);
      toast.error("Impossible d'enregistrer le consentement", {
        description: (e as Error).message,
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <div className="w-8 h-8 mx-auto border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Vérification du lien...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-display font-bold mb-3">Lien invalide</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate("/auth")}>Aller à la connexion</Button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <Check className="w-10 h-10 mx-auto text-primary mb-4" />
          <h1 className="text-xl font-display font-bold mb-3">Merci !</h1>
          <p className="text-muted-foreground">
            Votre consentement a bien été enregistré. Redirection...
          </p>
        </div>
      </div>
    );
  }

  const childName =
    minor?.first_name || minor?.last_name
      ? `${minor?.first_name ?? ""} ${minor?.last_name ?? ""}`.trim()
      : "votre enfant";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <RadarPulseLogo size={48} />
          <div>
            <h1 className="font-display text-2xl font-bold">MATCHS360</h1>
            <p className="text-sm text-muted-foreground">Consentement parental</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-8 space-y-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-6 h-6 text-primary mt-1 shrink-0" />
            <div>
              <h2 className="text-lg font-semibold">
                Consentement au traitement des données de {childName}
              </h2>
              <p className="text-sm text-muted-foreground mt-2">
                Conformément à l'article 8 du RGPD, le traitement des données
                personnelles d'un mineur requiert le consentement du titulaire
                de l'autorité parentale.
              </p>
            </div>
          </div>

          <div className="text-sm space-y-2 p-4 rounded-lg bg-muted/40">
            <p className="font-medium">Finalités du traitement :</p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Évaluations sportives par le ou les entraîneurs</li>
              <li>Suivi de la progression et objectifs pédagogiques</li>
              <li>Communications liées à la vie de l'équipe</li>
            </ul>
          </div>

          <div className="space-y-2">
            <Label htmlFor="relationship">Lien avec l'enfant</Label>
            <Select
              value={relationship}
              onValueChange={(v) => setRelationship(v as Relationship)}
            >
              <SelectTrigger id="relationship">
                <SelectValue placeholder="Sélectionner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mere">Mère</SelectItem>
                <SelectItem value="pere">Père</SelectItem>
                <SelectItem value="tuteur_legal">Tuteur légal</SelectItem>
                <SelectItem value="autre_titulaire">Autre titulaire</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg border">
            <Checkbox
              id="accept"
              checked={accepted}
              onCheckedChange={(v) => setAccepted(v === true)}
              className="mt-1"
            />
            <Label htmlFor="accept" className="text-sm leading-relaxed cursor-pointer">
              J'atteste être titulaire de l'autorité parentale de{" "}
              <span className="font-medium">{childName}</span> et je consens
              au traitement de ses données pour le suivi sportif décrit
              ci-dessus. Je pourrai retirer ce consentement à tout moment
              depuis mon espace personnel.
            </Label>
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!accepted || !relationship || submitting}
            className="w-full h-12"
          >
            {submitting ? "Enregistrement..." : "Donner mon consentement"}
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Cette action est horodatée et tracée à des fins de preuve légale
            (RGPD art. 7). Vous pouvez la révoquer à tout moment.
          </p>
        </div>
      </div>
    </div>
  );
}