import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Clock, CheckCircle2, XCircle, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  club_admin: "Admin Club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

export default function PendingApproval() {
  const navigate = useNavigate();
  const { user, signOut, roles } = useAuth();
  const [roleRequest, setRoleRequest] = useState<{
    status: string;
    requested_role: string;
    rejection_reason?: string;
    created_at?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate("/auth");
      return;
    }

    // If user already has roles, redirect to dashboard
    if (roles.length > 0) {
      navigate("/dashboard");
      return;
    }

    fetchRoleRequest();
  }, [user, roles, navigate]);

  const fetchRoleRequest = async () => {
    if (!user) return;

    const { data, error } = await supabase
      .from("role_requests")
      .select("status, requested_role, rejection_reason, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("Error fetching role request:", error);
    }

    setRoleRequest(data);
    setLoading(false);
  };

  const handleResendRequest = async () => {
    if (!user || !roleRequest) return;
    
    setResending(true);
    try {
      // Update the created_at to bump it in the queue
      const { error } = await supabase
        .from("role_requests")
        .update({ updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("status", "pending");

      if (error) throw error;

      toast.success("Demande renvoyée avec succès");
      fetchRoleRequest();
    } catch (error) {
      console.error("Error resending request:", error);
      toast.error("Erreur lors du renvoi de la demande");
    } finally {
      setResending(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Activity className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">MATCHS360</CardTitle>
          <CardDescription>
            Statut de votre demande d'inscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {roleRequest ? (
            <>
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Rôle demandé</p>
                  <p className="font-medium">{roleLabels[roleRequest.requested_role] || roleRequest.requested_role}</p>
                </div>
                <Badge
                  variant={
                    roleRequest.status === "approved"
                      ? "default"
                      : roleRequest.status === "rejected"
                      ? "destructive"
                      : "secondary"
                  }
                  className="flex items-center gap-1"
                >
                  {roleRequest.status === "pending" && <Clock className="w-3 h-3" />}
                  {roleRequest.status === "approved" && <CheckCircle2 className="w-3 h-3" />}
                  {roleRequest.status === "rejected" && <XCircle className="w-3 h-3" />}
                  {roleRequest.status === "pending" && "En attente"}
                  {roleRequest.status === "approved" && "Approuvé"}
                  {roleRequest.status === "rejected" && "Refusé"}
                </Badge>
              </div>

              {roleRequest.status === "pending" && (
                <div className="space-y-4">
                  <p className="text-center text-muted-foreground text-sm">
                    Votre demande est en cours d'examen par un administrateur. 
                    Vous recevrez une notification une fois votre compte validé.
                  </p>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={handleResendRequest}
                    disabled={resending}
                  >
                    {resending ? (
                      <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin mr-2" />
                    ) : (
                      <RefreshCw className="w-4 h-4 mr-2" />
                    )}
                    Renvoyer la demande
                  </Button>
                </div>
              )}

              {roleRequest.status === "rejected" && roleRequest.rejection_reason && (
                <div className="p-4 bg-destructive/10 rounded-lg">
                  <p className="text-sm text-destructive font-medium">Raison du refus :</p>
                  <p className="text-sm text-muted-foreground">{roleRequest.rejection_reason}</p>
                </div>
              )}

              {roleRequest.status === "approved" && (
                <Button className="w-full" onClick={() => navigate("/dashboard")}>
                  Accéder à mon espace
                </Button>
              )}
            </>
          ) : (
            <p className="text-center text-muted-foreground">
              Aucune demande de rôle trouvée. Veuillez vous inscrire.
            </p>
          )}

          <Button variant="outline" className="w-full" onClick={handleSignOut}>
            <LogOut className="w-4 h-4 mr-2" />
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}