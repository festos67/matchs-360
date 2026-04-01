import { User, LogOut, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleSwitcher } from "@/components/shared/RoleSwitcher";
import { useAuth } from "@/hooks/useAuth";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { MobileSidebar } from "./MobileSidebar";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export const TopBar = () => {
  const { user, profile, roles, currentRole, setCurrentRole, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="h-16 border-b border-border bg-card/50 backdrop-blur-xl px-4 md:px-6 flex items-center justify-between gap-2">
      {/* Mobile menu + Search */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <MobileSidebar />
        <GlobalSearch />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Role Switcher - only shows if multiple roles */}
        <RoleSwitcher
          roles={roles}
          currentRole={currentRole}
          onRoleChange={setCurrentRole}
        />

        {/* Notifications */}
        <NotificationBell />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-3 px-2 md:px-3">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                {profile?.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt="Profile"
                    className="w-8 h-8 rounded-full object-cover"
                  />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-sm font-medium">
                  {profile?.first_name || user?.email?.split("@")[0]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {profile?.last_name || "Utilisateur"}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profil</DropdownMenuItem>
            
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={handleSignOut}>
              <LogOut className="w-4 h-4 mr-2" />
              Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
};
