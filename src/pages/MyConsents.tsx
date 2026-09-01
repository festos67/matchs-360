/**
 * @page MyConsents
 * @route /my-consents
 *
 * Phase 2 RGPD art. 7 §3 : revocation aussi simple que le consentement.
 * Liste les consentements parentaux signes par l'utilisateur courant et
 * permet la revocation en un clic (UPDATE revoked_at via RLS owner).
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  ShieldOff,
  Camera,
  CameraOff,
  ClipboardCheck,
  ClipboardX,
  FileText,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface ConsentRow {
  id: string;
  minor_profile_id: string;
  relationship: string;
  signed_at: string;
  revoked_at: string | null;
  minor?: {
    first_name: string | null;
    last_name: string | null;
    image_rights_consent_at?: string | null;
    image_rights_consent_by?: string | null;
    self_eval_consent_at?: string | null;
  } | null;
}

const RELATIONSHIP_LABEL: Record<string, string> = {
  mere: "Mère",
  pere: "Père",
  tuteur_legal: "Tuteur légal",
  autre_titulaire: "Autre titulaire",
};

export default function MyConsents() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from("parental_consents")
      .select("id, minor_profile_id, relationship, signed_at, revoked_at")
      .eq("guardian_profile_id", userData.user.id)
      .order("signed_at", { ascending: false });
    if (error) {
      toast.error("Impossible de charger les consentements", {
        description: error.message,
      });
      setRows([]);
      setLoading(false);
      return;
    }
    const consents = (data ?? []) as ConsentRow[];
    // Resolve minor display names (RLS-aware).
    if (consents.length > 0) {
      const ids = Array.from(new Set(consents.map((c) => c.minor_profile_id)));
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, image_rights_consent_at, image_rights_consent_by, self_eval_consent_at")
        .in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p]));
      consents.forEach((c) => {
        c.minor = map.get(c.minor_profile_id) ?? null;
      });
    }
    setRows(consents);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const revoke = async (id: string) => {
    const reason = window.prompt(
      "Motif (facultatif) — sera enregistré à des fins de traçabilité :",
      "",
    );
    if (reason === null) return; // cancel
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("parental_consents")
        .update({
          revoked_at: new Date().toISOString(),
          revoked_reason: reason || null,
        })
        .eq("id", id);
      if (error) {
        toast.error("Échec de la révocation", { description: error.message });
        return;
      }
      const { data: u } = await supabase.auth.getUser();
      if (u?.user) {
        await supabase.from("audit_log").insert({
          actor_id: u.user.id,
          actor_role: "guardian",
          action: "parental_consent_revoked",
          table_name: "parental_consents",
          record_id: id,
          after_data: { revoked_reason: reason || null },
        });
      }
      toast.success("Consentement révoqué");
      load();
    } finally {
      setBusy(false);
    }
  };

  /**
   * Consentements OPTIONNELS (photographie art. 9 CC, auto-evaluation) :
   * refusables et revocables a tout moment, independamment du socle.
   *
   * L'ecriture passe par la RPC `set_minor_optional_consents` et NON par un
   * UPDATE direct sur `profiles` : le representant legal n'a aucune policy
   * UPDATE sur le profil de son enfant, si bien que l'ancien UPDATE direct
   * etait filtre par la RLS — 0 ligne modifiee, aucune erreur remontee, et
   * un toast de succes trompeur. La RPC verifie is_legal_guardian_of() puis
   * n'ecrit que les deux paires de colonnes de consentement.
   */
  const toggleOptionalConsent = async (
    row: ConsentRow,
    scope: "photo" | "self_eval",
    nextEnabled: boolean,
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const photo =
        scope === "photo" ? nextEnabled : !!row.minor?.image_rights_consent_at;
      const selfEval =
        scope === "self_eval" ? nextEnabled : !!row.minor?.self_eval_consent_at;

      const { error } = await supabase.rpc(
        "set_minor_optional_consents" as never,
        {
          _minor_id: row.minor_profile_id,
          _photo: photo,
          _self_eval: selfEval,
        } as never,
      );
      if (error) {
        toast.error("Échec de la mise à jour", { description: error.message });
        return;
      }

      if (scope === "photo") {
        toast.success(
          nextEnabled
            ? "Diffusion de la photo autorisée"
            : "Diffusion de la photo retirée — photo immédiatement masquée",
        );
      } else {
        toast.success(
          nextEnabled
            ? "Auto-évaluation autorisée"
            : "Auto-évaluation retirée — seules les évaluations de l'encadrement seront recueillies",
        );
      }
      load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container max-w-3xl mx-auto py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-display font-bold">Mes consentements parentaux</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Vous pouvez révoquer chacun de ces consentements à tout moment
          (RGPD art. 7 §3).
        </p>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Chargement...</p>
      ) : rows.length === 0 ? (
        <div className="p-8 text-center border rounded-xl text-muted-foreground">
          Aucun consentement parental enregistré.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((c) => {
            const name = c.minor
              ? `${c.minor.first_name ?? ""} ${c.minor.last_name ?? ""}`.trim() || "Mineur"
              : "Mineur";
            const revoked = !!c.revoked_at;
            return (
              <div key={c.id} className="p-4 border rounded-xl space-y-3">
                <div className="flex items-center gap-4">
                  {revoked ? (
                    <ShieldOff className="w-5 h-5 text-muted-foreground" />
                  ) : (
                    <ShieldCheck className="w-5 h-5 text-primary" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">
                      {RELATIONSHIP_LABEL[c.relationship] ?? c.relationship} ·
                      signé le {new Date(c.signed_at).toLocaleDateString("fr-FR")}
                      {revoked
                        ? ` · révoqué le ${new Date(c.revoked_at!).toLocaleDateString("fr-FR")}`
                        : ""}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/consent/${c.id}/attestation`}>
                      <FileText className="w-4 h-4 mr-2" />
                      Attestation
                    </Link>
                  </Button>
                  {!revoked && (
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => revoke(c.id)}>
                      Révoquer
                    </Button>
                  )}
                </div>
              {!revoked && (
                <div className="ml-9 mt-2 p-3 rounded-lg border bg-muted/30 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1">
                    {c.minor?.image_rights_consent_at ? (
                      <Camera className="w-4 h-4 mt-0.5 text-primary" />
                    ) : (
                      <CameraOff className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Droit à l'image — diffusion de la photo
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Consentement spécifique (art. 9 CC), distinct du
                        consentement aux données. Photo masquée immédiatement
                        si retiré.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!c.minor?.image_rights_consent_at}
                    disabled={busy}
                    onCheckedChange={(v) => toggleOptionalConsent(c, "photo", v)}
                    aria-label={`Autoriser la diffusion de la photo de ${name}`}
                  />
                </div>
              )}
              {!revoked && (
                <div className="ml-9 mt-2 p-3 rounded-lg border bg-muted/30 flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2 flex-1">
                    {c.minor?.self_eval_consent_at ? (
                      <ClipboardCheck className="w-4 h-4 mt-0.5 text-primary" />
                    ) : (
                      <ClipboardX className="w-4 h-4 mt-0.5 text-muted-foreground" />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        Auto-évaluation par l'enfant
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Autorise l'enfant à renseigner sa propre perception de ses
                        compétences, en complément de l'évaluation de l'encadrement.
                        Si retiré, seule l'évaluation de l'encadrement est recueillie.
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!c.minor?.self_eval_consent_at}
                    disabled={busy}
                    onCheckedChange={(v) => toggleOptionalConsent(c, "self_eval", v)}
                    aria-label={`Autoriser l'auto-évaluation de ${name}`}
                  />
                </div>
              )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}