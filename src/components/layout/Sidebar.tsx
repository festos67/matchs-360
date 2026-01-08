import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  Building2, 
  Users, 
  Trophy, 
  Settings, 
  LogOut,
  Activity,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
  { icon: Building2, label: "Clubs", path: "/clubs" },
  { icon: Users, label: "Équipes", path: "/teams" },
  { icon: Trophy, label: "Évaluations", path: "/evaluations" },
  { icon: Activity, label: "Statistiques", path: "/stats" },
];

export const Sidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <aside className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-sidebar-border">
        <Link to="/dashboard" className="flex items-center gap-3">
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
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
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
              className={cn(
                "nav-item mt-2",
                location.pathname === "/admin/users" && "active"
              )}
            >
              <Shield className="w-5 h-5" />
              <span className="font-medium">Gestion Utilisateurs</span>
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom Actions */}
      <div className="p-4 border-t border-sidebar-border space-y-1">
        <Link
          to="/settings"
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
    </aside>
  );
};
