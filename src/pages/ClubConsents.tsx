/**
 * @page ClubConsents
 * @route /club/consents
 *
 * Registre des attestations de consentement parental du club (RGPD art. 7 §1 :
 * le responsable de traitement doit pouvoir DEMONTRER, pour chaque mineur, que
 * le consentement a bien ete recueilli).
 *
 * @access Club Admin (et Super Admin). Le controle est porte par la RPC
 *         `get_club_parental_consents`, pas par l'UI.
 *
 * @maintenance
 * `signed_ip` / `signed_user_agent` ne sont deliberement PAS exposes ici : ce
 * sont des donnees personnelles du representant legal, sans utilite pour le
 * club, conservees en base comme preuve technique (minimisation, art. 5.1.c).
 * Ne pas les ajouter a la RPC « pour information ».
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, Search, ShieldCheck, ShieldOff } from "lucide-react";

interface ConsentRow {
  consent_id: string;
  minor_id: string;
  minor_first_name: string | null;
  minor_last_name: string | null;
  guardian_first_name: string | null;
  guardian_last_name: string | null;
  guardian_email: string | null;
  relationship: string;
  signed_at: string;
  revoked_at: string | null;
  revoked_reason: string | null;
  photo_consent_at: string | null;
  self_eval_consent_at: string | null;
  consent_scope: Record<string, boolean> | null;
}

const REL_LABEL: Record<string, string> = {
  mere: "Mère",
  pere: "Père",
  tuteur_legal: "Tuteur légal",
  autre_titulaire: "Autre titulaire",
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));

/** Pastille compacte « Oui / Non » pour une autorisation optionnelle. */
function OptionBadge({ granted, label }: { granted: boolean; label: string }) {
  return (
    <Badge variant={granted ? "default" : "outline"} className="font-normal">
      {label} : {granted ? "oui" : "non"}
    </Badge>
  );
}

export default function ClubConsents() {
  const { currentRole, isAdmin } = useAuth();
  const clubId = currentRole?.club_id ?? null;
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<ConsentRow[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!clubId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.rpc(
        "get_club_parental_consents" as never,
        { _club_id: clubId } as never,
      );
      if (cancelled) return;
      if (error) {
        console.error("get_club_parental_consents failed", error);
        toast.error("Impossible de charger les attestations", {
          description: error.message,
        });
        setRows([]);
      } else {
        setRows((data as ConsentRow[] | null) ?? []);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [clubId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.minor_first_name,
        r.minor_last_name,
        r.guardian_first_name,
        r.guardian_last_name,
        r.guardian_email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const activeCount = rows.filter((r) => !r.revoked_at).length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <FileText className="w-6 h-6 text-primary" />
            Attestations parentales
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Registre des consentements recueillis auprès des représentants légaux des
            joueurs de moins de 15 ans. {activeCount} attestation
            {activeCount > 1 ? "s" : ""} en vigueur sur {rows.length}.
          </p>
        </div>

        {!clubId && !isAdmin ? (
          <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Aucun club n'est rattaché à votre rôle courant.
          </div>
        ) : (
          <>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un enfant ou un représentant…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-lg border border-border bg-muted/30 p-6 text-sm text-muted-foreground text-center">
                {rows.length === 0
                  ? "Aucune attestation pour le moment. Elles apparaîtront ici dès qu'un représentant légal aura validé le consentement."
                  : "Aucun résultat pour cette recherche."}
              </div>
            ) : (
              <div className="rounded-xl border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Enfant</TableHead>
                      <TableHead>Représentant légal</TableHead>
                      <TableHead>Signée le</TableHead>
                      <TableHead>Autorisations</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Attestation</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const scope = r.consent_scope ?? {};
                      const photo = r.photo_consent_at !== null || scope.photo === true;
                      const selfEval =
                        r.self_eval_consent_at !== null || scope.self_evaluation === true;
                      return (
                        <TableRow key={r.consent_id}>
                          <TableCell className="font-medium">
                            {[r.minor_first_name, r.minor_last_name]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              {[r.guardian_first_name, r.guardian_last_name]
                                .filter(Boolean)
                                .join(" ") || "—"}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {REL_LABEL[r.relationship] ?? r.relationship}
                              {r.guardian_email ? ` · ${r.guardian_email}` : ""}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {formatDate(r.signed_at)}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              <OptionBadge granted={photo} label="Photo" />
                              <OptionBadge granted={selfEval} label="Auto-éval" />
                            </div>
                          </TableCell>
                          <TableCell>
                            {r.revoked_at ? (
                              <Badge variant="destructive" className="font-normal">
                                <ShieldOff className="w-3 h-3 mr-1" />
                                Révoquée
                              </Badge>
                            ) : (
                              <Badge variant="default" className="font-normal">
                                <ShieldCheck className="w-3 h-3 mr-1" />
                                En vigueur
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button asChild variant="outline" size="sm">
                              <Link to={`/consent/${r.consent_id}/attestation`}>
                                Consulter
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
