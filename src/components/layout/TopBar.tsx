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
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export const TopBar = () => {
  const { user, profile, roles, currentRole, setCurrentRole, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <header className="h-14 border-b border-border bg-card px-4 md:px-6 flex items-center justify-between gap-2">
      {/* Mobile menu + Search */}
      <div className="flex items-center gap-2 flex-1 min-w-0 max-w-[480px]">
        <MobileSidebar />
        <GlobalSearch />
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 md:gap-3.5 ml-auto">
        {/* Role Switcher - only shows if multiple roles */}
        <RoleSwitcher
          roles={roles}
          currentRole={currentRole}
          onRoleChange={setCurrentRole}
        />

        {/* Notifications */}
        <NotificationBell />

        {/* Theme toggle */}
        <ThemeToggle />

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 px-2 md:px-2 h-auto py-1.5">
              <div className="w-8 h-8 rounded-[10px] bg-secondary flex items-center justify-center overflow-hidden text-xs font-bold text-foreground">
                {profile?.photo_url ? (
                  <img
                    src={profile.photo_url}
                    alt="Profile"
                    className="w-8 h-8 rounded-[10px] object-cover"
                  />
                ) : (
                  (profile?.first_name?.[0] ?? user?.email?.[0] ?? "U").toUpperCase()
                )}
              </div>
              <div className="text-left hidden md:block">
                <p className="text-[13px] font-bold text-foreground leading-tight">
                  {profile?.first_name || user?.email?.split("@")[0]}
                </p>
                <p className="text-[10px] text-muted-foreground leading-tight">
                  {profile?.last_name || user?.email}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mon compte</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/profile")}>Profil</DropdownMenuItem>
            
            {currentRole?.role === "club_admin" && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/clubs")}>
                  <Building2 className="w-4 h-4 mr-2" />
                  Gérer un autre club
                </DropdownMenuItem>
              </>
            )}
            
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
