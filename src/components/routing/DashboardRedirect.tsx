import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Shield, Building2, Dumbbell, Users, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface UserRole {
  id: string;
  role: "admin" | "club_admin" | "coach" | "player" | "supporter";
  club_id: string | null;
}

const roleConfig = [
  { value: "admin", label: "Administrateur", description: "Accès complet à la plateforme", icon: Shield, color: "text-red-500", border: "border-red-500", bg: "bg-red-500/10" },
  { value: "club_admin", label: "Responsable Club", description: "Gérer mon club et ses équipes", icon: Building2, color: "text-primary", border: "border-primary", bg: "bg-primary/10" },
  { value: "coach", label: "Coach", description: "Évaluer et suivre mes joueurs", icon: Dumbbell, color: "text-green-500", border: "border-green-500", bg: "bg-green-500/10" },
  { value: "player", label: "Joueur", description: "Consulter mes évaluations", icon: Users, color: "text-blue-500", border: "border-blue-500", bg: "bg-blue-500/10" },
  { value: "supporter", label: "Supporter", description: "Suivre un joueur (parent, etc.)", icon: Heart, color: "text-pink-500", border: "border-pink-500", bg: "bg-pink-500/10" },
];

const getDashboardPath = (role: string) => {
  switch (role) {
    case "admin": return "/admin/dashboard";
    case "club_admin": return "/club/dashboard";
    case "coach": return "/coach/dashboard";
    case "player": return "/player/dashboard";
    case "supporter": return "/supporter/dashboard";
    default: return "/pending-approval";
  }
};

export const DashboardRedirect = () => {
  const { user, currentRole, loading, roles, setCurrentRole } = useAuth();
  const navigate = useNavigate();
  const [clubNames, setClubNames] = useState<Record<string, string>>({});
  const [showRoleSelector, setShowRoleSelector] = useState(false);

  // Fetch club names for display
  useEffect(() => {
    const fetchClubNames = async () => {
      const clubIds = roles.filter((r) => r.club_id).map((r) => r.club_id) as string[];
      if (clubIds.length === 0) return;
      const { data } = await supabase.from("clubs").select("id, name").in("id", clubIds);
      if (data) {
        const names: Record<string, string> = {};
        data.forEach((club) => { names[club.id] = club.name; });
        setClubNames(names);
      }
    };
    if (roles.length > 0) fetchClubNames();
  }, [roles]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }

    if (roles.length === 0) {
      navigate("/pending-approval", { replace: true });
      return;
    }

    // If only one role, auto-redirect
    if (roles.length === 1) {
      setCurrentRole(roles[0]);
      navigate(getDashboardPath(roles[0].role), { replace: true });
      return;
    }

    // Multiple roles: show role selector
    setShowRoleSelector(true);
  }, [user, loading, roles, navigate, setCurrentRole]);

  const handleRoleSelect = (role: UserRole) => {
    setCurrentRole(role);
    navigate(getDashboardPath(role.role), { replace: true });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!showRoleSelector) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Redirection en cours...</p>
        </div>
      </div>
    );
  }

  // Role selection UI
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-display font-bold">Choisir mon profil</h2>
          <p className="text-muted-foreground mt-2">
            Sur quel profil souhaitez-vous vous connecter ?
          </p>
        </div>

        <div className="space-y-3">
          {roles.map((role) => {
            const config = roleConfig.find((r) => r.value === role.role);
            if (!config) return null;
            const Icon = config.icon;

            return (
              <button
                key={role.id}
                onClick={() => handleRoleSelect(role)}
                className={cn(
                  "w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border",
                  "hover:border-primary/50 hover:bg-card/80 transition-all text-left",
                  "focus:outline-none focus:ring-2 focus:ring-primary/30"
                )}
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", config.bg)}>
                  <Icon className={cn("w-6 h-6", config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{config.label}</span>
                    {role.club_id && clubNames[role.club_id] && (
                      <span className="text-xs text-muted-foreground truncate">
                        — {clubNames[role.club_id]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
