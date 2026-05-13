/**
 * @component Sidebar + SidebarContent
 * @description Barre latérale de navigation principale (desktop fixe / mobile
 *              en Sheet via MobileSidebar). Le menu affiché dépend strictement
 *              du rôle actif de l'utilisateur (currentRole), avec un ordre et
 *              des entrées spécifiques par profil.
 * @access Tous rôles authentifiés (rendu conditionnel par rôle)
 * @features
 *  - SidebarContent : composant interne réutilisable (desktop + Sheet mobile)
 *  - Menus différenciés : Admin / Club Admin / Coach / Joueur / Supporter
 *  - Indication visuelle de la route active (highlight primary)
 *  - Bouton de déconnexion en pied de menu
 *  - Identité visuelle MATCHS360 (logo + couleur primaire #3B82F6)
 * @maintenance
 *  - Ordre menu par rôle : mem://navigation/role-based-sidebar-order
 *  - Identité visuelle par rôle : mem://style/role-branding-standard
 *  - Responsive (mobile drawer) : mem://navigation/mobile-responsiveness
 *  - Navigation Club Admin : mem://navigation/club-admin-navigation
 *  - Restrictions joueur : mem://features/player/interface-restrictions
 */
import { Link, useLocation } from "react-router-dom";
import { useState } from "react";
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
  Heart,
  Plus,
  Mail,
  Star
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { Crown } from "lucide-react";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import { CreateEvaluationModal } from "@/components/modals/CreateEvaluationModal";

// Navigation items by role
const getNavItems = (role: string | undefined, isAdmin: boolean, clubId?: string | null) => {
  if (isAdmin) {
    return [
      { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard" },
      { icon: Building2, label: "Clubs", path: "/clubs" },
      { icon: Users, label: "Équipes", path: "/teams" },
      { icon: UserCog, label: "Coachs", path: "/coaches" },
      { icon: UserCircle, label: "Joueurs", path: "/players" },
      { icon: Heart, label: "Supporters", path: "/supporters" },
      { icon: BookOpen, label: "Référentiels", path: "/frameworks" },
      { icon: Trophy, label: "Débriefs", path: "/evaluations" },
      { icon: Mail, label: "Invitations", path: "/invitations" },
      { icon: Activity, label: "Statistiques", path: "/stats" },
    ];
  }

  switch (role) {
    case "club_admin":
      return [
        { icon: Building2, label: "Mon Club", path: clubId ? `/clubs/${clubId}` : "/clubs" },
        { icon: BookOpen, label: "Référentiel club", path: clubId ? `/clubs/${clubId}/framework` : "/clubs" },
        { icon: Users, label: "Équipes", path: "/teams" },
        { icon: UserCog, label: "Coachs", path: "/coaches" },
        { icon: UserCircle, label: "Joueurs", path: "/players" },
        { icon: Heart, label: "Supporters", path: "/supporters" },
        { icon: Trophy, label: "Débriefs", path: "/evaluations" },
        { icon: Shield, label: "Utilisateurs", path: "/club/users" },
        { icon: Mail, label: "Invitations", path: "/invitations" },
      ];
    case "coach":
      return [
        { icon: Building2, label: "Mon Club", path: "/coach/my-club" },
        { icon: Users, label: "Mes Équipes", path: "/teams" },
        { icon: UserCircle, label: "Mes Joueurs", path: "/players" },
        { icon: Heart, label: "Les Supporters", path: "/supporters" },
        { icon: ClipboardList, label: "Débriefs", path: "/evaluations" },
      ];
    case "player":
      return [
        { icon: UserCircle, label: "Mon Profil", path: "/player/profile" },
        { icon: Users, label: "Mon Équipe", path: "/my-team" },
        { icon: Heart, label: "Mes Supporters", path: "/my-supporters" },
        { icon: ClipboardList, label: "Mes Débriefs", path: "/evaluations" },
        { icon: Star, label: "M'auto-débriefer", path: "/player/self-evaluation" },
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
  const { isFree, isTrial } = usePlan();
  const [showCreateEval, setShowCreateEval] = useState(false);

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
          <RadarPulseLogo size={54} />
          <span className="font-display text-2xl font-extrabold text-accent tracking-tight leading-tight">
            MATCHS<span className="text-secondary-foreground">360</span>
          </span>
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
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
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
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
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
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Users className="w-4 h-4" />
              <span>Approbations</span>
            </Link>
          </div>
        )}

        {/* Upgrade CTA: only for club_admin on free plan (not trial) */}
        {currentRole?.role === "club_admin" && isFree && !isTrial && (
          <Link
            to="/pricing"
            onClick={handleLinkClick}
            className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-bold text-accent hover:bg-accent/10 transition-all mt-4 border border-accent/30"
          >
            <Crown className="w-4 h-4" />
            <span>Passer en Pro</span>
          </Link>
        )}

        {/* Quick action: Nouveau débrief (coach) */}
        {currentRole?.role === "coach" && (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              setShowCreateEval(true);
            }}
            className="mt-4 w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-all"
          >
            <Plus className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="flex-1 text-left truncate text-foreground">Nouveau débrief</span>
            <span className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 bg-accent/15">
              <ClipboardList className="w-4 h-4 text-accent" />
            </span>
          </button>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/profile"
          onClick={handleLinkClick}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
            location.pathname === "/profile"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
              : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Settings className="w-4 h-4" />
          <span>Mon profil</span>
        </Link>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium text-destructive hover:bg-destructive/10 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          <span>Déconnexion</span>
        </button>
      </div>

      {currentRole?.role === "coach" && (
        <CreateEvaluationModal
          open={showCreateEval}
          onOpenChange={setShowCreateEval}
        />
      )}
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
