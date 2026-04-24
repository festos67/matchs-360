/**
 * @page InvitationsAdmin
 * @route /invitations
 * @access admin, club_admin (RLS scopes club_admin to their club)
 *
 * Vue admin des invitations envoyées avec actions :
 *  - Annuler une pending (RPC cancel_invitation)
 *  - Prolonger pending/expired (RPC resend_invitation)
 *  - Copier l'email du destinataire (utile pour relance manuelle)
 *
 * NB: le lien magique d'invitation est généré côté Supabase Auth (action_link)
 * et n'est pas stocké en BD. Pas de "Copier le lien" — copie de l'email à la place.
 */
import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Loader2, Mail, RefreshCw, X, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { format, isPast } from "date-fns";
import { fr } from "date-fns/locale";

type InvStatus = "pending" | "accepted" | "expired" | "cancelled";

type InvitationRow = {
  id: string;
  email: string;
  invited_by: string | null;
  club_id: string | null;
  team_id: string | null;
  intended_role: string;
  coach_role: string | null;
  status: InvStatus;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
  inviter: { id: string; first_name: string | null; last_name: string | null; email: string } | null;
  club: { id: string; name: string } | null;
  team: { id: string; name: string } | null;
};

const STATUS_LABEL: Record<InvStatus, { label: string; cls: string }> = {
  pending:   { label: "En attente",  cls: "bg-amber-100 text-amber-800 border-amber-200" },
  accepted:  { label: "Acceptée",    cls: "bg-green-100 text-green-800 border-green-200" },
  expired:   { label: "Expirée",     cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Annulée",     cls: "bg-destructive/10 text-destructive border-destructive/30" },
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  club_admin: "Admin Club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

export default function InvitationsAdmin() {
  const { user, currentRole, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | InvStatus>("all");
  const [roleFilter, setRoleFilter] = useState<"all" | string>("all");
  const [clubFilter, setClubFilter] = useState<"all" | string>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  if (!user) return <Navigate to="/auth" replace />;
  const isClubAdmin = currentRole?.role === "club_admin";
  if (!isAdmin && !isClubAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const { data: clubs } = useQuery({
    queryKey: ["invitations-clubs-filter"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs").select("id, name").is("deleted_at", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: invitations, isLoading } = useQuery<InvitationRow[]>({
    queryKey: ["invitations-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invitations")
        .select(`
          id, email, invited_by, club_id, team_id, intended_role, coach_role,
          status, expires_at, created_at, accepted_at,
          inviter:profiles!invitations_invited_by_fkey(id, first_name, last_name, email),
          club:clubs(id, name),
          team:teams(id, name)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Auto-flag visuel "expired" si pending && date dépassée (sans muter la BD)
      return (data ?? []).map((inv) => {
        const status: InvStatus =
          inv.status === "pending" && isPast(new Date(inv.expires_at))
            ? "expired"
            : (inv.status as InvStatus);
        return { ...(inv as unknown as InvitationRow), status };
      });
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (invId: string) => {
      const { data, error } = await supabase.rpc("cancel_invitation", {
        _invitation_id: invId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Invitation annulée");
      qc.invalidateQueries({ queryKey: ["invitations-admin"] });
    },
    onError: (e: Error) => toast.error(`Annulation impossible : ${e.message}`),
  });

  const resendMut = useMutation({
    mutationFn: async (invId: string) => {
      const { data, error } = await supabase.rpc("resend_invitation", {
        _invitation_id: invId,
        _new_expires_days: 7,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Invitation prolongée de 7 jours");
      qc.invalidateQueries({ queryKey: ["invitations-admin"] });
    },
    onError: (e: Error) => toast.error(`Prolongation impossible : ${e.message}`),
  });

  const copyEmail = async (inv: InvitationRow) => {
    try {
      await navigator.clipboard.writeText(inv.email);
      setCopiedId(inv.id);
      toast.success("Email copié");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Copie impossible");
    }
  };

  const filtered = useMemo(() => {
    if (!invitations) return [];
    return invitations.filter((inv) => {
      if (statusFilter !== "all" && inv.status !== statusFilter) return false;
      if (roleFilter !== "all" && inv.intended_role !== roleFilter) return false;
      if (clubFilter !== "all" && inv.club_id !== clubFilter) return false;
      if (search.trim() && !inv.email.toLowerCase().includes(search.toLowerCase().trim()))
        return false;
      return true;
    });
  }, [invitations, statusFilter, roleFilter, clubFilter, search]);

  const stats = useMemo(() => {
    const s: Record<InvStatus, number> = { pending: 0, accepted: 0, expired: 0, cancelled: 0 };
    invitations?.forEach((inv) => { s[inv.status]++; });
    return s;
  }, [invitations]);

  return (
    <AppLayout>
      <TooltipProvider>
        <div className="container max-w-7xl mx-auto p-6 space-y-6">
          <div>
            <h1 className="text-3xl font-display font-bold tracking-tight flex items-center gap-3">
              <Mail className="w-7 h-7 text-primary" />
              Invitations
            </h1>
            <p className="text-muted-foreground mt-1">
              Suivi des invitations envoyées{isAdmin ? " (tous clubs)" : " de votre club"}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(["pending", "accepted", "expired", "cancelled"] as const).map((s) => (
              <Card key={s}>
                <CardContent className="pt-6">
                  <div className="text-3xl font-bold">{stats[s]}</div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {STATUS_LABEL[s].label}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filtres</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
              <Input
                placeholder="Rechercher par email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | InvStatus)}>
                <SelectTrigger><SelectValue placeholder="Statut" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="pending">En attente</SelectItem>
                  <SelectItem value="accepted">Acceptée</SelectItem>
                  <SelectItem value="expired">Expirée</SelectItem>
                  <SelectItem value="cancelled">Annulée</SelectItem>
                </SelectContent>
              </Select>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger><SelectValue placeholder="Rôle" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous rôles</SelectItem>
                  {Object.entries(ROLE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isAdmin && (
                <Select value={clubFilter} onValueChange={setClubFilter}>
                  <SelectTrigger><SelectValue placeholder="Club" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous clubs</SelectItem>
                    {clubs?.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </CardContent>
          </Card>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="flex items-center justify-center p-12">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center text-muted-foreground p-12">
                  Aucune invitation ne correspond aux filtres.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Rôle</TableHead>
                      <TableHead>Club</TableHead>
                      <TableHead>Équipe</TableHead>
                      <TableHead>Invité par</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead>Envoyée</TableHead>
                      <TableHead>Expire</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((inv) => {
                      const inviterName = inv.inviter
                        ? `${inv.inviter.first_name ?? ""} ${inv.inviter.last_name ?? ""}`.trim()
                          || inv.inviter.email
                        : "—";
                      return (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium">{inv.email}</TableCell>
                          <TableCell>
                            {ROLE_LABEL[inv.intended_role] ?? inv.intended_role}
                            {inv.coach_role && (
                              <span className="text-xs text-muted-foreground ml-1">
                                ({inv.coach_role})
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{inv.club?.name ?? "—"}</TableCell>
                          <TableCell>{inv.team?.name ?? "—"}</TableCell>
                          <TableCell className="text-sm">{inviterName}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={STATUS_LABEL[inv.status].cls}>
                              {STATUS_LABEL[inv.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(inv.created_at), "dd MMM yyyy", { locale: fr })}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {format(new Date(inv.expires_at), "dd MMM yyyy", { locale: fr })}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => copyEmail(inv)}
                                    aria-label="Copier l'email"
                                  >
                                    {copiedId === inv.id
                                      ? <Check className="w-4 h-4 text-green-600" />
                                      : <Copy className="w-4 h-4" />}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copier l'email</TooltipContent>
                              </Tooltip>

                              {(inv.status === "pending" || inv.status === "expired") && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={() => resendMut.mutate(inv.id)}
                                      disabled={resendMut.isPending}
                                      aria-label="Prolonger 7 jours"
                                    >
                                      <RefreshCw className="w-4 h-4 text-blue-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Prolonger 7 jours</TooltipContent>
                                </Tooltip>
                              )}

                              {inv.status === "pending" && (
                                <AlertDialog>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          aria-label="Annuler l'invitation"
                                        >
                                          <X className="w-4 h-4 text-destructive" />
                                        </Button>
                                      </AlertDialogTrigger>
                                    </TooltipTrigger>
                                    <TooltipContent>Annuler</TooltipContent>
                                  </Tooltip>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Annuler l'invitation ?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        L'invitation envoyée à <strong>{inv.email}</strong> sera
                                        marquée comme annulée. Le destinataire ne pourra plus
                                        l'accepter. Vous devrez réenvoyer une nouvelle invitation
                                        depuis le formulaire de création si besoin.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Retour</AlertDialogCancel>
                                      <AlertDialogAction
                                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                        onClick={() => cancelMut.mutate(inv.id)}
                                      >
                                        Annuler l'invitation
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>
    </AppLayout>
  );
}
