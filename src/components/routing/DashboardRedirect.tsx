import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export const DashboardRedirect = () => {
  const { user, currentRole, loading, roles } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;

    // Not authenticated - redirect to auth
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    // No roles assigned - redirect to pending approval
    if (roles.length === 0) {
      navigate("/pending-approval", { replace: true });
      return;
    }

    // Redirect based on current role
    if (currentRole) {
      switch (currentRole.role) {
        case "admin":
          navigate("/admin/dashboard", { replace: true });
          break;
        case "club_admin":
          navigate("/club/dashboard", { replace: true });
          break;
        case "coach":
          navigate("/coach/dashboard", { replace: true });
          break;
        case "player":
        case "supporter":
          navigate("/player/dashboard", { replace: true });
          break;
        default:
          navigate("/pending-approval", { replace: true });
      }
    }
  }, [user, currentRole, loading, roles, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Redirection en cours...</p>
      </div>
    </div>
  );
};
