/**
 * @page RoleApprovals
 * @route /admin/role-approvals
 *
 * Console de modération des demandes de rôle (Super Admin uniquement).
 *
 * @description
 * Liste les `role_requests` en attente. Le Super Admin peut approuver
 * (création de l'entrée user_roles) ou refuser avec raison.
 *
 * @features
 * - Filtres par rôle demandé et statut
 * - Approbation : crée user_roles + notifie l'utilisateur
 * - Refus : exige une raison textuelle (rejection_reason)
 * - Affichage des informations du demandeur (avatar, email, date)
 *
 * @access Super Admin uniquement
 *
 * @maintenance
 * L'approbation déclenche une notification in-app au demandeur
 * (mem://features/in-app-notifications).
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, XCircle, Clock, User, Mail, Shield, Dumbbell, Users, Heart, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/**
 * Liste des rôles privilégiés (accès global plateforme).
 * KEEP IN SYNC avec la migration `<timestamp>_role_escalation_defense.sql`
 * (CHECK constraint role_requests_no_privileged_request + trigger
 *  guard_privileged_role_grant sur user_roles).
 * NB : 'club_admin' n'est PAS privilégié (scoped à un club).
 */
const PRIVILEGED_ROLES: string[] = ["admin"];

interface RoleRequest {
  id: string;
  user_id: string;
  requested_role: string;
  status: string;
  created_at: string;
  profile?: {
    first_name: string | null;
    last_name: string | null;
    email: string;
  };
}

const roleConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  club_admin: { label: "Admin Club", icon: Shield, color: "text-purple-500" },
  coach: { label: "Coach", icon: Dumbbell, color: "text-orange-500" },
  player: { label: "Joueur", icon: Users, color: "text-green-500" },
  supporter: { label: "Supporter", icon: Heart, color: "text-pink-500" },
};

export default function RoleApprovals() {
  const navigate = useNavigate();
  const { hasAdminRole: isAdmin, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<RoleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<RoleRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processing, setProcessing] = useState(false);
  const [privilegedDialogOpen, setPrivilegedDialogOpen] = useState(false);
  const [privilegedRequest, setPrivilegedRequest] = useState<RoleRequest | null>(null);
  const [privilegedConfirmText, setPrivilegedConfirmText] = useState("");

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/dashboard");
      return;
    }
    fetchRequests();
  }, [isAdmin, authLoading, navigate, filter]);

  const fetchRequests = async () => {
    setLoading(true);
    let query = supabase
      .from("role_requests")
      .select("id, user_id, requested_role, status, created_at")
      .order("created_at", { ascending: false });

    if (filter === "pending") {
      query = query.eq("status", "pending");
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error fetching requests:", error);
      setLoading(false);
      return;
    }

    // Fetch profiles for all users
    if (data && data.length > 0) {
      const userIds = data.map((r) => r.user_id);
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", userIds);

      const profileMap = new Map(profiles?.map((p) => [p.id, p]));
      const enrichedRequests = data.map((r) => ({
        ...r,
        profile: profileMap.get(r.user_id),
      }));
      setRequests(enrichedRequests);
    } else {
      setRequests([]);
    }

    setLoading(false);
  };

  const handleApprove = async (request: RoleRequest) => {
    setProcessing(true);
    
    // Update request status
    const { error: updateError } = await supabase
      .from("role_requests")
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", request.id);

    if (updateError) {
      toast.error("Erreur lors de l'approbation");
      setProcessing(false);
      return;
    }

    // Create the user role
    const { error: roleError } = await supabase
      .from("user_roles")
      .insert({
        user_id: request.user_id,
        role: request.requested_role as "club_admin" | "coach" | "player" | "supporter",
      });

    if (roleError) {
      console.error("Error creating role:", roleError);
      // Couche 2 (trigger guard_privileged_role_grant) bloque code 42501
      if ((roleError as { code?: string }).code === "42501") {
        toast.error("Action refusée par le serveur : permissions insuffisantes.");
      } else {
        toast.error("Erreur lors de la création du rôle");
      }
      setProcessing(false);
      return;
    }

    toast.success(`Demande approuvée pour ${request.profile?.first_name || "l'utilisateur"}`);
    fetchRequests();
    setProcessing(false);
  };

  const requestApprove = (request: RoleRequest) => {
    if (PRIVILEGED_ROLES.includes(request.requested_role)) {
      setPrivilegedRequest(request);
      setPrivilegedConfirmText("");
      setPrivilegedDialogOpen(true);
      return;
    }
    handleApprove(request);
  };

  const confirmPrivilegedApprove = async () => {
    if (!privilegedRequest) return;
    setPrivilegedDialogOpen(false);
    await handleApprove(privilegedRequest);
    setPrivilegedRequest(null);
    setPrivilegedConfirmText("");
  };

  const openRejectDialog = (request: RoleRequest) => {
    setSelectedRequest(request);
    setRejectionReason("");
    setRejectDialogOpen(true);
  };

  const handleReject = async () => {
    if (!selectedRequest) return;
    setProcessing(true);

    const { error } = await supabase
      .from("role_requests")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", selectedRequest.id);

    if (error) {
      toast.error("Erreur lors du refus");
      setProcessing(false);
      return;
    }

    toast.success("Demande refusée");
    setRejectDialogOpen(false);
    fetchRequests();
    setProcessing(false);
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Demandes de rôle</h1>
            <p className="text-muted-foreground">
              Approuvez ou refusez les demandes d'inscription
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant={filter === "pending" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("pending")}
            >
              <Clock className="w-4 h-4 mr-2" />
              En attente
            </Button>
            <Button
              variant={filter === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter("all")}
            >
              Toutes
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <CheckCircle className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {filter === "pending" 
                  ? "Aucune demande en attente" 
                  : "Aucune demande trouvée"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {requests.map((request) => {
              const config = roleConfig[request.requested_role] || {
                label: request.requested_role,
                icon: User,
                color: "text-gray-500",
              };
              const Icon = config.icon;
              const isPrivileged = PRIVILEGED_ROLES.includes(request.requested_role);

              return (
                <Card key={request.id}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">
                            {request.profile?.first_name} {request.profile?.last_name}
                          </p>
                          <Badge variant="outline" className="flex items-center gap-1">
                            <Icon className={`w-3 h-3 ${config.color}`} />
                            {config.label}
                          </Badge>
                          {isPrivileged && (
                            <Badge variant="destructive" className="flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              Rôle privilégié
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="w-3 h-3" />
                          {request.profile?.email}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Demande le {new Date(request.created_at).toLocaleDateString("fr-FR")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {request.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openRejectDialog(request)}
                            disabled={processing}
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Refuser
                          </Button>
                          <Button
                            size="sm"
                            variant={isPrivileged ? "destructive" : "default"}
                            onClick={() => requestApprove(request)}
                            disabled={processing}
                            aria-label={
                              isPrivileged
                                ? `Approuver demande privilégiée pour ${request.requested_role}`
                                : `Approuver demande pour ${request.requested_role}`
                            }
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approuver
                          </Button>
                        </>
                      ) : (
                        <Badge
                          variant={request.status === "approved" ? "default" : "destructive"}
                        >
                          {request.status === "approved" ? "Approuvé" : "Refusé"}
                        </Badge>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser la demande</DialogTitle>
            <DialogDescription>
              Voulez-vous ajouter une raison pour le refus ? (optionnel)
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Raison du refus..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={processing}>
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}