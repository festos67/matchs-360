/**
 * Phase 5 RGPD — Dashboard parental (droits art. 15, 17, 20).
 *
 * Acces : titulaires legaux uniquement (get_my_children() retourne les
 * enfants pour lesquels parental_consents.guardian_profile_id = auth.uid()
 * et revoked_at IS NULL). Un supporter lambda ne voit RIEN.
 *
 * LECTURE SEULE — les evaluations appartiennent au club. Le parent peut :
 *  - consulter (acces art. 15, trace via get_minor_record → minor_data_access_log)
 *  - exporter les donnees (portabilite art. 20 → edge fn export-minor-data)
 *  - demander l'effacement (art. 17 → edge fn request-erasure, grace 7j)
 *  - gerer l'autorisation photo (Phase 3)
 *  - reviquer son consentement parental (Phase 2 → /my-consents)
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { usePhotoUrl } from "@/hooks/usePhotoUrl";
import {
  Loader2, Download, Trash2, Shield, History, FileText,
  AlertTriangle, Eye, Camera, KeyRound,
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface ChildRecord {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  birthdate: string | null;
  photo_url: string | null;
  photo_is_minor: boolean | null;
  image_rights_consent_at: string | null;
}

const initials = (c: ChildRecord) =>
  `${(c.first_name?.[0] ?? "")}${(c.last_name?.[0] ?? "")}`.toUpperCase() || "?";

const MyChildren = () => {
  // 1. Recupere la liste de mes enfants
  const { data: childrenIds, isLoading: loadingIds } = useQuery({
    queryKey: ["my-children-ids"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_children");
      if (error) throw error;
      return (data ?? []) as unknown as string[];
    },
  });

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <header className="mb-8">
        <h1 className="text-3xl font-display font-bold flex items-center gap-3">
          <Shield className="h-7 w-7 text-pink-500" />
          Mes enfants
        </h1>
        <p className="text-muted-foreground mt-2">
          Espace parental — consultez les données de votre enfant, exportez-les
          (portabilité RGPD art. 20) ou demandez leur effacement (art. 17).
          Les évaluations restent gérées par le club ; vous disposez d'un droit
          d'accès et de contrôle, mais pas de modification.
        </p>
      </header>

      {loadingIds && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loadingIds && (!childrenIds || childrenIds.length === 0) && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Aucun mineur ne vous est associé en tant que titulaire légal.
            <br />
            Si vous attendez un consentement parental à signer,{" "}
            <Link to="/my-consents" className="text-primary underline">
              consultez vos consentements
            </Link>.
          </CardContent>
        </Card>
      )}

      <div className="space-y-6">
        {childrenIds?.map((id) => <ChildCard key={id} minorId={id} />)}
      </div>

      <p className="text-xs text-muted-foreground mt-8 text-center">
        Toute consultation est journalisée dans le registre d'accès aux données
        de votre enfant (RGPD art. 15). Vous pouvez le consulter ci-dessus.
      </p>
    </div>
  );
};

const ChildCard = ({ minorId }: { minorId: string }) => {
  const qc = useQueryClient();
  const { toast } = useToast();

  // get_minor_record logs the access (Phase 4 audit)
  const { data: child, isLoading } = useQuery({
    queryKey: ["minor-record", minorId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_minor_record", {
        _minor_id: minorId,
      });
      if (error) throw error;
      return (data ?? null) as unknown as ChildRecord | null;
    },
  });

  const photoUrl = usePhotoUrl(child ?? null);

  // Pending erasure for this minor (if any)
  const { data: pendingErasure } = useQuery({
    queryKey: ["erasure-request", minorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erasure_requests")
        .select("id, scheduled_for, status")
        .eq("subject_profile_id", minorId)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: accessLog } = useQuery({
    queryKey: ["minor-access-log", minorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("minor_data_access_log")
        .select("id, access_type, target, actor_role, occurred_at")
        .eq("minor_profile_id", minorId)
        .order("occurred_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: activeConsents } = useQuery({
    queryKey: ["child-consents", minorId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parental_consents")
        .select("id, relationship, signed_at, revoked_at")
        .eq("minor_profile_id", minorId)
        .is("revoked_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("export-minor-data", {
        body: { subject_profile_id: minorId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      if (data?.download_url) {
        window.location.href = data.download_url;
      }
      qc.invalidateQueries({ queryKey: ["minor-access-log", minorId] });
      toast({
        title: "Export prêt",
        description: "Le téléchargement va démarrer. Conservez ce fichier en lieu sûr.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Export impossible", description: e.message, variant: "destructive" }),
  });

  const erasureMutation = useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await supabase.functions.invoke("request-erasure", {
        body: { subject_profile_id: minorId, reason },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erasure-request", minorId] });
      toast({
        title: "Demande d'effacement enregistrée",
        description:
          "Vous avez 7 jours pour annuler la demande. Passé ce délai, les données seront effacées automatiquement.",
      });
    },
    onError: (e: any) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase
        .from("erasure_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["erasure-request", minorId] });
      toast({ title: "Demande annulée" });
    },
    onError: (e: any) =>
      toast({ title: "Erreur", description: e.message, variant: "destructive" }),
  });

  const [reason, setReason] = useState("");

  if (isLoading) {
    return (
      <Card><CardContent className="py-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </CardContent></Card>
    );
  }

  if (!child) {
    return (
      <Card><CardContent className="py-6 text-center text-muted-foreground">
        Accès refusé à cette fiche.
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            {photoUrl && <AvatarImage src={photoUrl} alt="" />}
            <AvatarFallback>{initials(child)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-xl">
              {[child.first_name, child.last_name].filter(Boolean).join(" ") || "Enfant"}
            </CardTitle>
            <CardDescription className="flex flex-wrap gap-2 mt-1">
              {child.birthdate && (
                <Badge variant="outline">
                  Né(e) le {format(new Date(child.birthdate), "dd MMM yyyy", { locale: fr })}
                </Badge>
              )}
              {child.image_rights_consent_at ? (
                <Badge variant="secondary">
                  <Camera className="h-3 w-3 mr-1" />
                  Droit à l'image accordé
                </Badge>
              ) : (
                <Badge variant="outline">Droit à l'image non accordé</Badge>
              )}
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {pendingErasure && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-destructive">
                  Effacement programmé
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Les données seront effacées le{" "}
                  {format(new Date(pendingErasure.scheduled_for), "dd MMMM yyyy 'à' HH:mm", { locale: fr })}.
                  Vous pouvez encore annuler cette demande.
                </p>
                <Button
                  variant="outline" size="sm" className="mt-3"
                  onClick={() => cancelMutation.mutate(pendingErasure.id)}
                  disabled={cancelMutation.isPending}
                >
                  Annuler la demande d'effacement
                </Button>
              </div>
            </div>
          </div>
        )}

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <History className="h-4 w-4" />
            Consentements actifs
          </h3>
          {activeConsents && activeConsents.length > 0 ? (
            <ul className="space-y-1 text-sm">
              {activeConsents.map((c: any) => (
                <li key={c.id} className="flex justify-between">
                  <span className="capitalize">{c.relationship.replace("_", " ")}</span>
                  <span className="text-muted-foreground">
                    Signé le {format(new Date(c.signed_at), "dd/MM/yyyy", { locale: fr })}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun consentement actif.</p>
          )}
          <Button asChild variant="link" size="sm" className="px-0 mt-2">
            <Link to="/my-consents">Gérer mes consentements →</Link>
          </Button>
        </section>

        <section>
          <h3 className="font-semibold flex items-center gap-2 mb-3">
            <Eye className="h-4 w-4" />
            Journal d'accès (10 derniers)
          </h3>
          {accessLog && accessLog.length > 0 ? (
            <ul className="space-y-1 text-xs text-muted-foreground max-h-48 overflow-auto">
              {accessLog.map((l: any) => (
                <li key={l.id} className="flex justify-between gap-2">
                  <span>
                    <Badge variant="outline" className="mr-2 text-[10px]">{l.access_type}</Badge>
                    {l.target ?? "—"}
                    {l.actor_role ? ` · ${l.actor_role}` : ""}
                  </span>
                  <span>{format(new Date(l.occurred_at), "dd/MM HH:mm", { locale: fr })}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Aucun accès enregistré.</p>
          )}
        </section>

        <section className="flex flex-wrap gap-2 pt-2 border-t">
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            {exportMutation.isPending
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Download className="h-4 w-4 mr-2" />}
            Exporter les données
          </Button>

          <Button asChild variant="outline">
            <Link to="/my-consents">
              <KeyRound className="h-4 w-4 mr-2" />
              Gérer l'autorisation photo
            </Link>
          </Button>

          {!pendingErasure && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Demander l'effacement
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Demander l'effacement des données ?</AlertDialogTitle>
                  <AlertDialogDescription className="space-y-2">
                    <span className="block">
                      Cette demande déclenche un délai de grâce de <strong>7 jours</strong>,
                      pendant lequel vous pouvez annuler. Passé ce délai, les données
                      personnelles de votre enfant seront <strong>anonymisées</strong>{" "}
                      automatiquement et la photo sera <strong>supprimée définitivement</strong>.
                    </span>
                    <span className="block text-xs">
                      Conformément au RGPD (art. 17), un squelette anonymisé est conservé
                      pour traçabilité. Aucune donnée personnelle identifiante ne demeure.
                    </span>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <textarea
                  className="w-full border rounded-md p-2 text-sm min-h-20"
                  placeholder="Motif (facultatif)"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => erasureMutation.mutate(reason)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Confirmer la demande
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </section>
      </CardContent>
    </Card>
  );
};

export default MyChildren;