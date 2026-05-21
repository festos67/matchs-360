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
import { ShieldCheck, ShieldOff } from "lucide-react";

interface ConsentRow {
  id: string;
  minor_profile_id: string;
  relationship: string;
  signed_at: string;
  revoked_at: string | null;
  minor?: { first_name: string | null; last_name: string | null } | null;
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
        .select("id, first_name, last_name")
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
    // Audit (best-effort, ne bloque pas l'UX).
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
              <div
                key={c.id}
                className="p-4 border rounded-xl flex items-center gap-4"
              >
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
                {!revoked && (
                  <Button variant="outline" size="sm" onClick={() => revoke(c.id)}>
                    Révoquer
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}