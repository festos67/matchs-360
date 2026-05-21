/**
 * @page ProfilesBirthdateBackfill
 * @description Phase 1 conformite mineurs : page admin de backfill des dates
 *              de naissance manquantes (profils crees avant la Phase 0).
 *              Sans birthdate, les protections RGPD mineurs (is_minor,
 *              requires_parental_consent) ne peuvent pas s'appliquer.
 * @access Super Admin uniquement (RLS profiles "Admins can update profiles")
 * @maintenance
 *  - Vue source : public.profiles_needing_birthdate (SECURITY INVOKER)
 *  - Trigger Phase 0 bloque les INSERT < 18 ans ; les UPDATE ne sont
 *    pas filtres ici (un mineur deja inscrit grandfathered conserve
 *    son profil).
 */
import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldAlert, Save, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PHASE0_ADULT_ONLY_MESSAGE, isPhase0MinorBlockedError } from "@/lib/age-policy";

interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  club_id: string | null;
  created_at: string;
}

export default function ProfilesBirthdateBackfill() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles_needing_birthdate" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erreur de chargement", { description: error.message });
    } else {
      setRows(((data as unknown) as ProfileRow[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.email].some((v) => v?.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const handleSave = async (id: string) => {
    const value = drafts[id];
    if (!value) {
      toast.error("Veuillez saisir une date de naissance");
      return;
    }
    setSaving(id);
    const { error } = await supabase
      .from("profiles")
      .update({ birthdate: value })
      .eq("id", id);
    setSaving(null);
    if (error) {
      if (isPhase0MinorBlockedError(error)) {
        toast.error(PHASE0_ADULT_ONLY_MESSAGE);
      } else {
        toast.error("Erreur de sauvegarde", { description: error.message });
      }
      return;
    }
    toast.success("Date de naissance enregistrée");
    setRows((prev) => prev.filter((r) => r.id !== id));
    setDrafts((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  };

  const today = new Date().toISOString().split("T")[0];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Backfill — Dates de naissance manquantes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {rows.length} profil{rows.length > 1 ? "s" : ""} sans date de naissance.
              La date est requise pour appliquer les protections RGPD mineurs (consentement parental, droit à l'image).
            </p>
          </div>
        </div>

        <Card className="p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher (nom, prénom, email)"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </Card>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            {rows.length === 0
              ? "🎉 Tous les profils ont une date de naissance renseignée."
              : "Aucun profil ne correspond à la recherche."}
          </Card>
        ) : (
          <Card className="divide-y">
            {filtered.map((row) => {
              const fullName =
                [row.first_name, row.last_name].filter(Boolean).join(" ") || "(sans nom)";
              return (
                <div
                  key={row.id}
                  className="grid grid-cols-1 md:grid-cols-[1fr,auto,auto] gap-3 md:gap-4 items-end p-4"
                >
                  <div>
                    <p className="font-medium">{fullName}</p>
                    <p className="text-sm text-muted-foreground">{row.email}</p>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`bd-${row.id}`} className="text-xs">
                      Date de naissance
                    </Label>
                    <Input
                      id={`bd-${row.id}`}
                      type="date"
                      max={today}
                      value={drafts[row.id] || ""}
                      onChange={(e) =>
                        setDrafts((p) => ({ ...p, [row.id]: e.target.value }))
                      }
                      className="w-44"
                    />
                  </div>
                  <Button
                    onClick={() => handleSave(row.id)}
                    disabled={!drafts[row.id] || saving === row.id}
                    size="sm"
                  >
                    {saving === row.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-1" />
                        Enregistrer
                      </>
                    )}
                  </Button>
                </div>
              );
            })}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}