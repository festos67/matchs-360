/**
 * @page GuardianConsent
 * @route /guardian/consent
 *
 * Phase 2 RGPD art. 8 FR : ecran de consentement du titulaire de l'autorite
 * parentale (parent / tuteur legal) pour un mineur.
 *
 * Pattern auth deterministe (R3 / F-303 / docs/auth-flows.md) :
 *  - laisse detectSessionInUrl établir prioritairement la session depuis le hash
 *  - récupère cette session via getSession, sans aucun signOut
 *  - utilise setSession uniquement en repli si le SDK n'a pas encore agi
 *  - nettoie le hash APRÈS obtention de la session
 *  - consumedRef anti-double-execution (React StrictMode)
 *
 * Le formulaire recueille :
 *  - l'identite DECLAREE PAR LE PARENT (nom / prenom) : c'est elle qui porte
 *    la valeur probante, le nom saisi par le club n'engageant que le club
 *  - le socle obligatoire, dont le libelle reprend en clair l'identite saisie
 *    et le NOM DE L'ENFANT (une attestation qui ne designe pas l'enfant n'a
 *    aucune valeur ; cf get_minor_for_pending_consent ci-dessous)
 *  - deux consentements optionnels, independants et refusables sans
 *    consequence sur l'inscription, DECOCHES par defaut (RGPD art. 4-11 :
 *    le consentement est un acte positif clair)
 *
 * Le `minor_id` est passe en query string (?minor=<uuid>) — temporaire tant
 * que la Phase 0 bloque la creation des mineurs en prod (mode dormant).
 * En Phase 6, le mapping sera resolu cote serveur via la table invitations.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Qualite telle qu'elle se lit dans l'attestation : « agissant en qualite de … ». */
const REL_QUALITY: Record<Relationship, string> = {
  mere: "mère",
  pere: "père",
  tuteur_legal: "tuteur légal",
  autre_titulaire: "titulaire de l'autorité parentale",
};

interface MinorInfo {
  id: string;
  first_name: string | null;
  last_name: string | null;
  club_name?: string | null;
}

export default function GuardianConsent() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const minorId = params.get("minor");

  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [minor, setMinor] = useState<MinorInfo | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [relationship, setRelationship] = useState<Relationship | "">("");
  const [accepted, setAccepted] = useState(false);
  const [consentPhoto, setConsentPhoto] = useState(false);
  const [consentSelfEval, setConsentSelfEval] = useState(false);
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

        const accessToken = hp.get("access_token");
        const refreshToken = hp.get("refresh_token");

        // detectSessionInUrl peut avoir déjà établi la session et fait tourner le
        // refresh token du hash. Toujours privilégier cette session existante.
        let {
          data: { session },
        } = await supabase.auth.getSession();

        // Repli uniquement si le SDK n'a pas encore consommé les jetons du hash.
        // Le type n'est volontairement pas filtré : selon l'état du compte, le lien
        // peut être invite, magiclink ou recovery.
        if (!session && accessToken && refreshToken) {
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!sessionError) session = sessionData.session;
        }

        // Ne nettoyer le hash qu'après avoir laissé le SDK ou le repli établir la
        // session, afin de ne jamais le priver prématurément des jetons.
        if (accessToken || refreshToken) {
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
        }

        if (!session) {
          if (!cancelled) {
            setError("Impossible d'établir la session. Lien expiré ?");
            setChecking(false);
          }
          return;
        }

        // Identité de l'enfant. La lecture directe de `profiles` est ici
        // inopérante : la policy exige is_legal_guardian_of(), qui dépend de
        // l'existence du consentement — soit exactement ce que cet écran sert
        // à créer. La RPC lève ce verrou circulaire en s'appuyant sur la même
        // preuve de filiation que record-parental-consent (désignation
        // 'pending' non expirée, adressée à l'email authentifié).
        const { data: viaRpc } = await supabase
          .rpc("get_minor_for_pending_consent" as never, { _minor_id: minorId } as never)
          .maybeSingle();

        let resolved = viaRpc as MinorInfo | null;

        // Repli : cas d'un représentant légal déjà reconnu (re-consentement).
        if (!resolved) {
          const { data: minorRow } = await supabase
            .from("profiles")
            .select("id, first_name, last_name")
            .eq("id", minorId)
            .maybeSingle();
          resolved = minorRow as MinorInfo | null;
        }

        // Pré-remplissage de l'identité si le profil du parent la porte déjà.
        const { data: me } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!cancelled) {
          setMinor(resolved ?? { id: minorId, first_name: null, last_name: null });
          if (me?.first_name) setFirstName(me.first_name);
          if (me?.last_name) setLastName(me.last_name);
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

  const identityComplete = firstName.trim().length > 0 && lastName.trim().length > 0;
  const canSubmit = !!minorId && !!relationship && identityComplete && accepted && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        "record-parental-consent",
        {
          body: {
            minor_profile_id: minorId,
            relationship,
            guardian_first_name: firstName.trim(),
            guardian_last_name: lastName.trim(),
            consent_photo: consentPhoto,
            consent_self_eval: consentSelfEval,
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
            Votre consentement a bien été enregistré. Une attestation vous a été
            envoyée par email. Redirection...
          </p>
        </div>
      </div>
    );
  }

  const childName =
    minor?.first_name || minor?.last_name
      ? `${minor?.first_name ?? ""} ${minor?.last_name ?? ""}`.trim()
      : "votre enfant";
  const clubName = minor?.club_name?.trim() || "la structure";
  const declaredName = [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
  const quality = relationship ? REL_QUALITY[relationship] : null;

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

          {/* ---- Finalités ------------------------------------------- */}
          <div className="text-sm space-y-2 p-4 rounded-lg bg-muted/40">
            <p className="font-medium">Finalités du traitement</p>
            <p className="text-muted-foreground">
              Vos données et celles de l'enfant sont traitées par{" "}
              <span className="font-medium text-foreground">{clubName}</span>,
              responsable du traitement, pour :
            </p>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>
                évaluer et suivre les compétences de l'enfant dans le cadre de son
                activité sportive, à partir des référentiels de la structure ;
              </li>
              <li>
                définir des objectifs de progression et l'accompagner dans son
                parcours éducatif et sportif ;
              </li>
              <li>
                restituer ces éléments à l'enfant, à son représentant légal et à
                l'équipe encadrante.
              </li>
            </ul>
            <p className="text-muted-foreground">
              Les données sont conservées pendant la durée du suivi, puis supprimées
              ou archivées conformément à la réglementation. Vous pouvez à tout
              moment consulter les données, les rectifier, en demander l'effacement
              ou retirer votre consentement depuis votre espace personnel.
            </p>
          </div>

          {/* ---- Identité du déclarant ------------------------------- */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Votre identité</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="guardianLastName">Nom</Label>
                <Input
                  id="guardianLastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={50}
                  placeholder="DUPONT"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guardianFirstName">Prénom</Label>
                <Input
                  id="guardianFirstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={50}
                  placeholder="Marie"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="relationship">Vous agissez en qualité de</Label>
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
                  <SelectItem value="autre_titulaire">
                    Autre titulaire de l'autorité parentale
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ---- Attestation (socle, obligatoire) -------------------- */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Attestation — case obligatoire</p>
            <div className="flex items-start gap-3 p-4 rounded-lg border">
              <Checkbox
                id="accept"
                checked={accepted}
                disabled={!identityComplete || !relationship}
                onCheckedChange={(v) => setAccepted(v === true)}
                className="mt-1"
              />
              <Label htmlFor="accept" className="text-sm leading-relaxed cursor-pointer">
                Je soussigné(e){" "}
                <span className="font-medium">
                  {declaredName || "…"}
                </span>
                , agissant en qualité de{" "}
                <span className="font-medium">{quality || "…"}</span>, atteste être
                titulaire de l'autorité parentale sur{" "}
                <span className="font-medium">{childName}</span> et je consens au
                traitement de ses données pour le suivi sportif et éducatif décrit
                ci-dessus. Je peux retirer ce consentement à tout moment depuis mon
                espace personnel.
              </Label>
            </div>
            {!identityComplete || !relationship ? (
              <p className="text-xs text-muted-foreground">
                Renseignez votre nom, votre prénom et votre qualité pour pouvoir
                cocher cette case.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Sans cette case, le compte de l'enfant ne peut pas être activé.
            </p>
          </div>

          {/* ---- Consentements optionnels ---------------------------- */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Consentements optionnels</p>
            <p className="text-xs text-muted-foreground">
              Chaque case est indépendante et peut être refusée. Votre refus
              n'empêche pas l'inscription.
            </p>

            <div className="flex items-start gap-3 p-4 rounded-lg border">
              <Checkbox
                id="consentPhoto"
                checked={consentPhoto}
                onCheckedChange={(v) => setConsentPhoto(v === true)}
                className="mt-1"
              />
              <Label htmlFor="consentPhoto" className="text-sm leading-relaxed cursor-pointer">
                <span className="font-medium">Photographie</span> — J'autorise l'ajout
                d'une photographie de l'enfant dans l'application et sa consultation
                par l'équipe encadrante, au titre du droit à l'image (article 9 du
                Code civil).
                <span className="block text-xs text-muted-foreground mt-1">
                  Si vous ne cochez pas : aucune photographie ne pourra être ajoutée ;
                  l'enfant sera identifié par son nom et un avatar.
                </span>
              </Label>
            </div>

            <div className="flex items-start gap-3 p-4 rounded-lg border">
              <Checkbox
                id="consentSelfEval"
                checked={consentSelfEval}
                onCheckedChange={(v) => setConsentSelfEval(v === true)}
                className="mt-1"
              />
              <Label htmlFor="consentSelfEval" className="text-sm leading-relaxed cursor-pointer">
                <span className="font-medium">Auto-évaluation</span> — J'autorise
                l'enfant à renseigner sa propre perception de ses compétences, en
                complément de l'évaluation de l'encadrement.
                <span className="block text-xs text-muted-foreground mt-1">
                  Si vous ne cochez pas : seule l'évaluation de l'encadrement sera
                  recueillie.
                </span>
              </Label>
            </div>
          </div>

          <Button onClick={handleSubmit} disabled={!canSubmit} className="w-full h-12">
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
