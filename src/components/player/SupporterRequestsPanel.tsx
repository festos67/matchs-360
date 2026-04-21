/**
 * @component SupporterRequestsPanel
 * @description Panneau récapitulatif des demandes de débrief consultatif envoyées
 *              aux supporters d'un joueur. Statuts visuels (En attente / Complété /
 *              Expiré) et action de relance.
 * @access Coachs, Responsables Club, Super Admin (sur fiche joueur)
 * @features
 *  - Liste des supporter_evaluation_requests pour le joueur
 *  - Statuts : Clock (pending) / CheckCircle (completed) / Mail (sent)
 *  - Action de relance (Send) si demande expirée
 *  - Format date FR (date-fns)
 *  - Lien direct vers le débrief complété
 * @maintenance
 *  - Débriefs consultatifs : mem://features/consultative-debrief-types
 *  - Identité Heart orange (action sur supporter)
 */
import { useState, useEffect } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Mail,
  Clock,
  CheckCircle,
  Send,
  AlertCircle,
  Users,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface SupporterRequest {
  id: string;
  supporter_id: string;
  supporter_email: string;
  supporter_name: string;
  status: string;
  created_at: string;
  completed_at: string | null;
  expires_at: string;
  evaluation_id: string | null;
}

interface SupporterRequestsPanelProps {
  playerId: string;
  playerName: string;
  onViewEvaluation?: (evaluationId: string) => void;
}

export function SupporterRequestsPanel({
  playerId,
  playerName,
  onViewEvaluation,
}: SupporterRequestsPanelProps) {
  const { user, hasAdminRole: isAdmin, roles } = useAuth();
  const [requests, setRequests] = useState<SupporterRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [playerId]);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("supporter_evaluation_requests")
        .select(`
          id,
          supporter_id,
          status,
          created_at,
          completed_at,
          expires_at,
          evaluation_id,
          supporter:profiles!supporter_evaluation_requests_supporter_id_fkey (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq("player_id", playerId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formattedRequests: SupporterRequest[] = (data || []).map((r: any) => ({
        id: r.id,
        supporter_id: r.supporter_id,
        supporter_email: r.supporter?.email || "Email inconnu",
        supporter_name: r.supporter?.first_name && r.supporter?.last_name
          ? `${r.supporter.first_name} ${r.supporter.last_name}`
          : r.supporter?.first_name || r.supporter?.email || "Supporter",
        status: r.status,
        created_at: r.created_at,
        completed_at: r.completed_at,
        expires_at: r.expires_at,
        evaluation_id: r.evaluation_id,
      }));

      setRequests(formattedRequests);
    } catch (error) {
      console.error("Error fetching supporter requests:", error);
      toast.error("Erreur lors du chargement des demandes");
    } finally {
      setLoading(false);
    }
  };

  const handleResendRequest = async (requestId: string, supporterId: string) => {
    if (!user) return;
    
    setResending(requestId);
    try {
      // Create a new request (the old one stays for history)
      const { error } = await supabase
        .from("supporter_evaluation_requests")
        .insert({
          player_id: playerId,
          supporter_id: supporterId,
          requested_by: user.id,
          status: "pending",
        });

      if (error) {
        if (error.message?.includes("duplicate")) {
          toast.error("Une demande est déjà en attente pour ce supporter");
        } else {
          throw error;
        }
      } else {
        toast.success("Demande relancée avec succès");
        fetchRequests();
      }
    } catch (error) {
      console.error("Error resending request:", error);
      toast.error("Erreur lors de la relance");
    } finally {
      setResending(null);
    }
  };

  const getStatusBadge = (status: string, expiresAt: string) => {
    const isExpired = new Date(expiresAt) < new Date();
    
    if (status === "completed") {
      return (
        <Badge variant="outline" className="bg-success/20 text-success border-success/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Complété
        </Badge>
      );
    }
    
    if (isExpired) {
      return (
        <Badge variant="outline" className="bg-destructive/20 text-destructive border-destructive/30">
          <AlertCircle className="w-3 h-3 mr-1" />
          Expiré
        </Badge>
      );
    }
    
    return (
      <Badge variant="outline" className="bg-warning/20 text-warning border-warning/30">
        <Clock className="w-3 h-3 mr-1" />
        En attente
      </Badge>
    );
  };

  const canResend = (request: SupporterRequest) => {
    // Can resend if expired or completed (to request a new one)
    const isExpired = new Date(request.expires_at) < new Date();
    return request.status === "completed" || isExpired;
  };

  const pendingCount = requests.filter(
    r => r.status === "pending" && new Date(r.expires_at) >= new Date()
  ).length;
  const completedCount = requests.filter(r => r.status === "completed").length;

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-display font-semibold flex items-center gap-2">
            <Mail className="w-5 h-5 text-warning" />
            Suivi des Demandes Supporters
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Invitations envoyées aux supporters pour évaluer {playerName}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="gap-1">
            <Clock className="w-3 h-3" />
            {pendingCount} en attente
          </Badge>
          <Badge variant="secondary" className="gap-1 bg-success/20 text-success">
            <CheckCircle className="w-3 h-3" />
            {completedCount} complété{completedCount > 1 ? "s" : ""}
          </Badge>
          <Button variant="ghost" size="sm" onClick={fetchRequests}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12 bg-muted/20 rounded-lg">
          <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">Aucune demande envoyée</p>
          <p className="text-sm text-muted-foreground mt-1">
            Utilisez le bouton "Demander avis" pour solliciter les supporters
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const isExpired = new Date(request.expires_at) < new Date() && request.status === "pending";
            
            return (
              <div
                key={request.id}
                className={`flex items-center gap-4 p-4 rounded-lg border ${
                  request.status === "completed"
                    ? "bg-success/5 border-success/20"
                    : isExpired
                    ? "bg-destructive/5 border-destructive/20"
                    : "bg-warning/5 border-warning/20"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    request.status === "completed"
                      ? "bg-success/20"
                      : isExpired
                      ? "bg-destructive/20"
                      : "bg-warning/20"
                  }`}
                >
                  {request.status === "completed" ? (
                    <CheckCircle className="w-5 h-5 text-success" />
                  ) : isExpired ? (
                    <AlertCircle className="w-5 h-5 text-destructive" />
                  ) : (
                    <Clock className="w-5 h-5 text-warning" />
                  )}
                </div>

                <div className="flex-1">
                  <p className="font-medium">{request.supporter_name}</p>
                  <p className="text-sm text-muted-foreground">{request.supporter_email}</p>
                </div>

                <div className="text-right text-sm">
                  <p className="text-muted-foreground">
                    Envoyé le {format(new Date(request.created_at), "d MMM yyyy", { locale: fr })}
                  </p>
                  {request.completed_at && (
                    <p className="text-success">
                      Complété le {format(new Date(request.completed_at), "d MMM yyyy", { locale: fr })}
                    </p>
                  )}
                </div>

                {getStatusBadge(request.status, request.expires_at)}

                <div className="flex items-center gap-2">
                  {request.status === "completed" && request.evaluation_id && onViewEvaluation && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onViewEvaluation(request.evaluation_id!)}
                    >
                      Voir
                    </Button>
                  )}
                  {canResend(request) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() => handleResendRequest(request.id, request.supporter_id)}
                      disabled={resending === request.id}
                    >
                      <Send className="w-3 h-3" />
                      {resending === request.id ? "..." : "Relancer"}
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 p-4 bg-muted/30 rounded-lg">
        <p className="text-sm text-muted-foreground">
          💡 <strong>Info:</strong> Les demandes expirent après 30 jours. Vous pouvez relancer une demande à tout moment après son expiration ou sa complétion.
        </p>
      </div>
    </div>
  );
}
