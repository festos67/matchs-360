import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Trophy, 
  Settings, 
  BookOpen,
  LogOut,
  Activity,
  Shield,
  ClipboardList,
  UserCog,
  UserCircle,
  Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

// Navigation items by role
const getNavItems = (role: string | undefined, isAdmin: boolean, clubId?: string | null) => {
  if (isAdmin) {
    return [
      { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard" },
      { icon: Building2, label: "Clubs", path: "/clubs" },
      { icon: Users, label: "Équipes", path: "/teams" },
      { icon: UserCog, label: "Coachs", path: "/coaches" },
      { icon: UserCircle, label: "Joueurs", path: "/players" },
      { icon: Activity, label: "Statistiques", path: "/stats" },
    ];
  }

  switch (role) {
    case "club_admin":
      return [
        { icon: Building2, label: "Mon Club", path: clubId ? `/clubs/${clubId}` : "/clubs" },
        { icon: BookOpen, label: "Référentiel du club", path: clubId ? `/clubs/${clubId}/framework` : "/clubs" },
        { icon: Users, label: "Équipes", path: "/teams" },
        { icon: UserCog, label: "Coachs", path: "/coaches" },
        { icon: UserCircle, label: "Joueurs", path: "/players" },
        { icon: Heart, label: "Supporters", path: "/supporters" },
        { icon: Trophy, label: "Débriefs", path: "/evaluations" },
        { icon: Shield, label: "Utilisateurs", path: "/club/users" },
      ];
    case "coach":
      return [
        { icon: LayoutDashboard, label: "Dashboard", path: "/coach/dashboard" },
        { icon: Users, label: "Mes Équipes", path: "/teams" },
        { icon: UserCircle, label: "Mes Joueurs", path: "/players" },
        { icon: ClipboardList, label: "Débriefs", path: "/evaluations" },
      ];
    case "player":
      return [
        { icon: LayoutDashboard, label: "Dashboard", path: "/player/dashboard" },
        { icon: Users, label: "Mon Équipe", path: "/my-team" },
        { icon: Heart, label: "Mes Supporters", path: "/my-supporters" },
        { icon: ClipboardList, label: "Mes Débriefs", path: "/evaluations" },
      ];
    case "supporter":
      return [
        { icon: LayoutDashboard, label: "Dashboard", path: "/player/dashboard" },
        { icon: Users, label: "Mon Équipe", path: "/my-team" },
        { icon: ClipboardList, label: "Mes Débriefs", path: "/evaluations" },
      ];
    default:
      return [
        { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
      ];
  }
};

interface SidebarContentProps {
  onNavigate?: () => void;
}

export const SidebarContent = ({ onNavigate }: SidebarContentProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, currentRole } = useAuth();

  const navItems = getNavItems(currentRole?.role, isAdmin, currentRole?.club_id);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getDashboardPath = () => {
    if (isAdmin) return "/admin/dashboard";
    switch (currentRole?.role) {
      case "club_admin": return "/club/redirect";
      case "coach": return "/coach/dashboard";
      case "player":
      case "supporter": return "/player/dashboard";
      default: return "/dashboard";
    }
  };

  const handleLinkClick = () => {
    onNavigate?.();
  };

  return (
    <>
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <Link to={getDashboardPath()} className="flex items-center gap-3" onClick={handleLinkClick}>
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">MATCHS360</h1>
            <p className="text-xs text-muted-foreground">Sports Analytics</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== "/dashboard" && 
             item.path !== "/admin/dashboard" && 
             item.path !== "/club/redirect" && 
             item.path !== "/coach/dashboard" && 
             item.path !== "/player/dashboard" && 
             location.pathname.startsWith(item.path) &&
             // Avoid parent path matching when a more specific sibling path matches
             !navItems.some(other => other.path !== item.path && other.path.startsWith(item.path) && location.pathname.startsWith(other.path)));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleLinkClick}
              className={cn(
                "nav-item",
                isActive && "active"
              )}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
        
        {/* Admin Section */}
        {isAdmin && (
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <span className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Administration
            </span>
            <Link
              to="/admin/users"
              onClick={handleLinkClick}
              className={cn(
                "nav-item mt-2",
                location.pathname === "/admin/users" && "active"
              )}
            >
              <Shield className="w-5 h-5" />
              <span className="font-medium">Gestion Utilisateurs</span>
            </Link>
            <Link
              to="/role-approvals"
              onClick={handleLinkClick}
              className={cn(
                "nav-item",
                location.pathname === "/role-approvals" && "active"
              )}
            >
              <Users className="w-5 h-5" />
              <span className="font-medium">Approbations</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/settings"
          onClick={handleLinkClick}
          className={cn(
            "nav-item",
            location.pathname === "/settings" && "active"
          )}
        >
          <Settings className="w-5 h-5" />
          <span className="font-medium">Paramètres</span>
        </Link>
        <button
          onClick={handleLogout}
          className="nav-item w-full text-destructive hover:text-destructive"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Déconnexion</span>
        </button>
      </div>
    </>
  );
};

export const Sidebar = () => {
  return (
    <aside className="hidden md:flex w-64 bg-sidebar border-r border-sidebar-border flex-col">
      <SidebarContent />
    </aside>
  );
};
