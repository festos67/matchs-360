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
import { useState, useEffect } from "react";
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
  Award,
  Mail,
  Star,
  PanelLeft,
  PanelLeftClose
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePlan } from "@/hooks/usePlan";
import { Crown } from "lucide-react";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import { Badge } from "@/components/ui/badge";
import { CreateEvaluationModal } from "@/components/modals/CreateEvaluationModal";
import { CertificatePlayerPickerDialog } from "@/components/certificate/CertificatePlayerPickerDialog";

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
  pinned?: boolean;
  expanded?: boolean;
  onTogglePin?: () => void;
}

export const SidebarContent = ({ onNavigate, pinned = false, expanded = false, onTogglePin }: SidebarContentProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, currentRole } = useAuth();
  const { isFree, isTrial } = usePlan();
  const [showCreateEval, setShowCreateEval] = useState(false);
  const [showCertificatePicker, setShowCertificatePicker] = useState(false);

  const navItems = getNavItems(currentRole?.role, isAdmin, currentRole?.club_id);

  const labelCls = cn(
    "transition-opacity duration-200 whitespace-nowrap",
    expanded ? "opacity-100" : "opacity-0",
  );

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
      <div className="flex items-center justify-between px-4 pt-6 pb-4 border-b border-sidebar-border">
        <Link to={getDashboardPath()} className="flex items-center gap-3 px-2 min-w-0" onClick={handleLinkClick}>
          <RadarPulseLogo size={54} />
          <span className={cn("font-display text-2xl font-extrabold text-accent tracking-tight leading-tight", labelCls)}>
            MATCHS<span className="text-secondary-foreground">360</span>
          </span>
        </Link>
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            aria-label={pinned ? "Détacher le menu" : "Épingler le menu ouvert"}
            aria-pressed={pinned}
            className={cn("shrink-0 rounded-md p-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground", labelCls)}
          >
            {pinned ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            // "Mon Profil" should be active when viewing own player detail page
            (item.path === "/player/profile" && location.pathname.startsWith("/players/")) ||
            // Player "Mon Équipe" redirects to /teams/<id>
            (item.path === "/my-team" && location.pathname.startsWith("/teams/")) ||
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
              title={item.label}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              <span className={labelCls}>{item.label}</span>
              {item.path === "/stats" && (
                <Badge variant="secondary" className={cn("ml-auto text-[10px] px-1.5 py-0 h-4 font-medium", labelCls)}>
                  Bientôt
                </Badge>
              )}
            </Link>
          );
        })}
        
        {/* Admin Section */}
        {isAdmin && (
          <div className="pt-4 mt-4 border-t border-sidebar-border">
            <div className={cn("text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-[1.2px] px-3 pt-2 pb-1.5", labelCls)}>
              Administration
            </div>
            <Link
              to="/admin/users"
              onClick={handleLinkClick}
              title="Gestion Utilisateurs"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
                location.pathname === "/admin/users"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Shield className="w-4 h-4" />
              <span className={labelCls}>Gestion Utilisateurs</span>
            </Link>
            <Link
              to="/role-approvals"
              onClick={handleLinkClick}
              title="Approbations"
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
                location.pathname === "/role-approvals"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
              )}
            >
              <Users className="w-4 h-4" />
              <span className={labelCls}>Approbations</span>
            </Link>
          </div>
        )}

        {/* Upgrade CTA: only for club_admin on free plan (not trial) */}
        {currentRole?.role === "club_admin" && isFree && !isTrial && (
          <Link
            to="/pricing"
            onClick={handleLinkClick}
            title="Passer en Pro"
            className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-bold text-accent hover:bg-accent/10 transition-all mt-4 border border-accent/30"
          >
            <Crown className="w-4 h-4" />
            <span className={labelCls}>Passer en Pro</span>
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
            title="Nouveau débrief"
            className="mt-4 w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-all"
          >
            <Plus className="w-4 h-4 text-orange-500 shrink-0" />
            <span className={cn("flex-1 text-left truncate text-foreground", labelCls)}>Nouveau débrief</span>
            <span className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0 bg-accent/15", labelCls)}>
              <ClipboardList className="w-4 h-4 text-accent" />
            </span>
          </button>
        )}

        {/* Quick action: Attestation de compétences (coach + club_admin) */}
        {(currentRole?.role === "coach" || currentRole?.role === "club_admin") && (
          <button
            type="button"
            onClick={() => {
              onNavigate?.();
              setShowCertificatePicker(true);
            }}
            title="Attestation de compétences"
            className="mt-2 w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium border border-green-500/40 bg-green-500/5 hover:bg-green-500/10 transition-all"
          >
            <Plus className="w-4 h-4 text-green-600 shrink-0" />
            <span className={cn("flex-1 text-left truncate text-foreground", labelCls)}>Attestation de compétences</span>
            <span className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0 bg-green-500/15", labelCls)}>
              <Award className="w-4 h-4 text-green-600" />
            </span>
          </button>
        )}

        {/* Quick action: M'auto-débriefer (player) */}
        {currentRole?.role === "player" && (
          <Link
            to="/player/self-evaluation"
            onClick={handleLinkClick}
            title="M'auto-débriefer"
            className="mt-4 w-full flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-all"
          >
            <Plus className="w-4 h-4 text-green-500 shrink-0" />
            <span className={cn("flex-1 text-left truncate text-foreground", labelCls)}>M'auto-débriefer</span>
            <span className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0 bg-accent/15", labelCls)}>
              <Star className="w-4 h-4 text-accent" />
            </span>
          </Link>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/profile"
          onClick={handleLinkClick}
          title="Mon profil"
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium transition-all",
            location.pathname === "/profile"
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold [&_svg]:text-sidebar-accent-foreground"
              : "text-sidebar-foreground/85 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
          )}
        >
          <Settings className="w-4 h-4" />
          <span className={labelCls}>Mon profil</span>
        </Link>
        <button
          onClick={handleLogout}
          title="Déconnexion"
          className="flex items-center gap-3 px-3 py-2.5 rounded-[10px] text-[13px] font-medium text-primary hover:text-primary hover:bg-primary/10 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          <span className={labelCls}>Déconnexion</span>
        </button>
      </div>

      {currentRole?.role === "coach" && (
        <CreateEvaluationModal
          open={showCreateEval}
          onOpenChange={setShowCreateEval}
        />
      )}
      {(currentRole?.role === "coach" || currentRole?.role === "club_admin") && (
        <CertificatePlayerPickerDialog
          open={showCertificatePicker}
          onOpenChange={setShowCertificatePicker}
        />
      )}
    </>
  );
};

export const Sidebar = () => {
  const [pinned, setPinned] = useState<boolean>(() => {
    try { return localStorage.getItem("sidebar_pinned") === "true"; } catch { return false; }
  });
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;
  const togglePin = () => {
    setPinned((p) => {
      const next = !p;
      try { localStorage.setItem("sidebar_pinned", String(next)); } catch { /* ignore */ }
      return next;
    });
  };
  useEffect(() => {
    document.documentElement.style.setProperty("--sb-w", expanded ? "16rem" : "4rem");
  }, [expanded]);
  return (
    <>
      <div
        aria-hidden
        className={cn("hidden md:block shrink-0 transition-[width] duration-200", expanded ? "w-64" : "w-16")}
      />
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocusCapture={() => setHovered(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setHovered(false);
        }}
        className={cn(
          "hidden md:flex fixed inset-y-0 left-0 z-50 flex-col overflow-hidden bg-sidebar border-r border-sidebar-border transition-[width] duration-200",
          expanded ? "w-64" : "w-16",
        )}
      >
        <div className="flex h-full w-64 flex-col">
          <SidebarContent pinned={pinned} expanded={expanded} onTogglePin={togglePin} />
        </div>
      </aside>
    </>
  );
};
