/**
 * @page ConsentAttestation
 * @route /consent/:id/attestation
 *
 * Attestation de consentement parental — document imprimable (RGPD art. 7 §1 :
 * le responsable de traitement doit pouvoir DEMONTRER le consentement).
 *
 * Lisible par le representant legal signataire, le coach de l'enfant, le
 * responsable du club et l'administrateur : le controle d'acces est porte par
 * la RPC `get_parental_consent_attestation`, qui n'expose deliberement NI
 * `signed_ip` NI `signed_user_agent` — donnees personnelles du parent, sans
 * utilite pour l'encadrement (minimisation, art. 5.1.c). Elles restent en
 * base comme preuve technique en cas de contestation.
 *
 * L'attestation est REGENEREE a partir des donnees, jamais stockee comme
 * fichier : elle reflete donc toujours l'etat courant (revocation comprise)
 * et ne peut pas diverger de la base.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertCircle, ArrowLeft, Printer, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";

interface Attestation {
  consent_id: string;
  minor_first_name: string | null;
  minor_last_name: string | null;
  guardian_first_name: string | null;
  guardian_last_name: string | null;
  guardian_email: string | null;
  relationship: string;
  club_name: string | null;
  signed_at: string;
  revoked_at: string | null;
  photo_consent_at: string | null;
  self_eval_consent_at: string | null;
  consent_scope: Record<string, boolean> | null;
}

const REL_QUALITY: Record<string, string> = {
  mere: "mère",
  pere: "père",
  tuteur_legal: "tuteur légal",
  autre_titulaire: "titulaire de l'autorité parentale",
};

const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

function Decision({ label, granted }: { label: string; granted: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <span className="text-sm">{label}</span>
      <span
        className={
          granted
            ? "text-sm font-semibold text-emerald-700 dark:text-emerald-400"
            : "text-sm font-semibold text-red-700 dark:text-red-400"
        }
      >
        {granted ? "Accordé" : "Refusé"}
      </span>
    </div>
  );
}

export default function ConsentAttestation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [row, setRow] = useState<Attestation | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .rpc("get_parental_consent_attestation" as never, { _consent_id: id } as never)
        .maybeSingle();
      if (error) console.error("get_parental_consent_attestation failed", error);
      if (!cancelled) {
        setRow((data as Attestation | null) ?? null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="max-w-md text-center">
          <AlertCircle className="w-10 h-10 mx-auto text-destructive mb-4" />
          <h1 className="text-xl font-display font-bold mb-3">Attestation introuvable</h1>
          <p className="text-muted-foreground mb-6">
            Ce document n'existe pas, ou vous n'êtes pas autorisé à le consulter.
          </p>
          <Button onClick={() => navigate(-1)}>Retour</Button>
        </div>
      </div>
    );
  }

  const childName =
    [row.minor_first_name, row.minor_last_name].filter(Boolean).join(" ") || "—";
  const guardianName =
    [row.guardian_first_name, row.guardian_last_name].filter(Boolean).join(" ") || "—";
  const quality = REL_QUALITY[row.relationship] ?? row.relationship;
  const clubName = row.club_name || "la structure";
  const scope = row.consent_scope ?? {};

  // La source de verite reste la colonne posee sur le profil de l'enfant :
  // elle suit les revocations ulterieures, contrairement au scope fige a la
  // signature. Le scope sert de repli pour les consentements anterieurs.
  const photoGranted = row.photo_consent_at !== null || scope.photo === true;
  const selfEvalGranted = row.self_eval_consent_at !== null || scope.self_evaluation === true;

  return (
    <div className="min-h-screen bg-muted/30 p-4 print:bg-white print:p-0">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4 print:hidden">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Retour
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Imprimer
          </Button>
        </div>

        <div className="bg-card border rounded-xl p-8 space-y-6 print:border-0 print:shadow-none">
          <div className="flex items-center gap-3">
            <RadarPulseLogo size={40} />
            <div>
              <p className="font-display text-lg font-bold">MATCHS360</p>
              <p className="text-xs text-muted-foreground">
                Référence : <span className="font-mono">{row.consent_id}</span>
              </p>
            </div>
          </div>

          <div>
            <h1 className="text-xl font-display font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" />
              Attestation de consentement parental
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Délivrée le {formatDateTime(row.signed_at)} (heure de Paris)
            </p>
          </div>

          {row.revoked_at && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4">
              <p className="text-sm font-medium text-destructive">
                Consentement révoqué le {formatDateTime(row.revoked_at)}.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ce document ne vaut plus autorisation à compter de cette date.
              </p>
            </div>
          )}

          <p className="text-sm leading-relaxed">
            <span className="font-semibold">{guardianName}</span>, agissant en qualité de{" "}
            <span className="font-semibold">{quality}</span>, a attesté être titulaire de
            l'autorité parentale sur <span className="font-semibold">{childName}</span> et a
            consenti au traitement de ses données pour le suivi sportif et éducatif au sein
            du club <span className="font-semibold">{clubName}</span>.
          </p>

          <div className="rounded-lg border p-4">
            <Decision label="Traitement des données (socle)" granted={!row.revoked_at} />
            <Decision label="Photographie (art. 9 C. civ.)" granted={photoGranted} />
            <Decision label="Auto-évaluation" granted={selfEvalGranted} />
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Consentement enregistré et horodaté par MATCHS360. Chaque autorisation est
            révocable à tout moment par le représentant légal depuis son espace
            « Mes consentements » ; l'application applique immédiatement le retrait.
          </p>
        </div>
      </div>
    </div>
  );
}
