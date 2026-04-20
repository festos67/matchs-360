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
        { icon: Building2, label: "Mon Club", path: "/coach/my-club" },
        { icon: Users, label: "Mes Équipes", path: "/teams" },
        { icon: UserCircle, label: "Mes Joueurs", path: "/players" },
        { icon: Heart, label: "Les Supporters", path: "/supporters" },
        { icon: ClipboardList, label: "Mes Débriefs", path: "/evaluations" },
      ];
    case "player":
      return [
        { icon: UserCircle, label: "Mon Profil", path: "/player/profile" },
        { icon: Users, label: "Mon Équipe", path: "/my-team" },
        { icon: Heart, label: "Mes Supporters", path: "/my-supporters" },
        { icon: ClipboardList, label: "Mes Débriefs", path: "/evaluations" },
      ];
    case "supporter":
      return [
        { icon: Heart, label: "Mes Joueurs", path: "/supporter/dashboard" },
        { icon: ClipboardList, label: "Débriefs joueurs", path: "/supporter/debriefs" },
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
      case "coach": return "/coach/my-club";
      case "player": return "/player/profile";
      case "supporter": return "/supporter/dashboard";
      default: return "/dashboard";
    }
  };

  const handleLinkClick = () => {
    onNavigate?.();
  };

  return (
    <>
      {/* Logo */}
      <div className="px-4 pt-6 pb-4 border-b border-sidebar-border">
        <Link to={getDashboardPath()} className="flex items-center gap-3 px-2" onClick={handleLinkClick}>
          <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-[hsl(var(--primary))] to-[hsl(226_72%_38%)] flex items-center justify-center text-primary-foreground text-xs font-extrabold">
            M
          </div>
          <div>
            <span className="font-display text-[15px] font-extrabold text-sidebar-foreground tracking-tight block leading-tight">
              MATCHS360
            </span>
            <div className="text-[9px] text-sidebar-foreground/60 tracking-[0.12em] uppercase">
              Sports Analytics
            </div>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            // "Mon Profil" should be active when viewing own player detail page
            (item.path === "/player/profile" && location.pathname.startsWith("/players/")) ||
            (item.path !== "/dashboard" && 
             item.path !== "/admin/dashboard" && 
             item.path !== "/club/redirect" && 
             item.path !== "/coach/dashboard" && 
             item.path !== "/player/dashboard" && 
             item.path !== "/player/profile" && 
             location.pathname.startsWith(item.path) &&
             // Avoid parent path matching when a more specific sibling path matches
             !navItems.some(other => other.path !== item.path && other.path.startsWith(item.path) && location.pathname.startsWith(other.path)));
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={handleLinkClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-foreground font-bold [&_svg]:text-sidebar-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
        
        {/* Admin Section */}
        {isAdmin && (
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <div className="text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-[1.2px] px-3 pt-2 pb-1.5">
              Administration
            </div>
            <Link
              to="/admin/users"
              onClick={handleLinkClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
                location.pathname === "/admin/users"
                  ? "bg-sidebar-accent text-sidebar-foreground font-bold [&_svg]:text-sidebar-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Shield className="w-4 h-4" />
              <span>Gestion Utilisateurs</span>
            </Link>
            <Link
              to="/role-approvals"
              onClick={handleLinkClick}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
                location.pathname === "/role-approvals"
                  ? "bg-sidebar-accent text-sidebar-foreground font-bold [&_svg]:text-sidebar-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Users className="w-4 h-4" />
              <span>Approbations</span>
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
            "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
            location.pathname === "/settings"
              ? "bg-sidebar-accent text-sidebar-foreground font-bold [&_svg]:text-sidebar-foreground"
              : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>Paramètres</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          <span>Déconnexion</span>
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
