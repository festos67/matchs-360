import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Shield, Building2, UserCog, UserCircle, Heart } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface UserRole {
  id: string;
  role: "admin" | "club_admin" | "coach" | "player" | "supporter";
  club_id: string | null;
}

interface RoleSwitcherProps {
  roles: UserRole[];
  currentRole: UserRole | null;
  onRoleChange: (role: UserRole) => void;
}

const roleConfig = {
  admin: {
    icon: Shield,
    label: "Administrateur",
    color: "text-red-500",
  },
  club_admin: {
    icon: Building2,
    label: "Responsable Club",
    color: "text-primary",
  },
  coach: {
    icon: UserCog,
    label: "Coach",
    color: "text-primary",
  },
  player: {
    icon: UserCircle,
    label: "Joueur",
    color: "text-blue-500",
  },
  supporter: {
    icon: Heart,
    label: "Supporter",
    color: "text-pink-500",
  },
};

const getDashboardPath = (role: string) => {
  switch (role) {
    case "admin": return "/admin/dashboard";
    case "club_admin": return "/club/dashboard";
    case "coach": return "/coach/dashboard";
    case "player": return "/player/dashboard";
    case "supporter": return "/supporter/dashboard";
    default: return "/dashboard";
  }
};

export const RoleSwitcher = ({ roles, currentRole, onRoleChange }: RoleSwitcherProps) => {
  const [clubNames, setClubNames] = useState<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
    fetchClubNames();
  }, [roles]);

  const fetchClubNames = async () => {
    const clubIds = roles.filter((r) => r.club_id).map((r) => r.club_id) as string[];
    if (clubIds.length === 0) return;

    const { data } = await supabase
      .from("clubs")
      .select("id, name")
      .in("id", clubIds);

    if (data) {
      const names: Record<string, string> = {};
      data.forEach((club) => {
        names[club.id] = club.name;
      });
      setClubNames(names);
    }
  };

  // Only show if user has multiple roles
  if (roles.length <= 1) return null;

  const current = currentRole || roles[0];
  const config = roleConfig[current.role];
  const Icon = config.icon;

  const handleRoleSwitch = (role: UserRole) => {
    onRoleChange(role);
    // Navigate to the appropriate dashboard for the selected role
    navigate(getDashboardPath(role.role));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <span className="hidden sm:inline">{config.label}</span>
          {current.club_id && clubNames[current.club_id] && (
            <span className="text-muted-foreground text-xs hidden md:inline">
              ({clubNames[current.club_id]})
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Changer de profil</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {roles.map((role) => {
          const roleConf = roleConfig[role.role];
          const RoleIcon = roleConf.icon;
          const isActive = current.id === role.id;

          return (
            <DropdownMenuItem
              key={role.id}
              onClick={() => handleRoleSwitch(role)}
              className={isActive ? "bg-primary/10" : ""}
            >
              <RoleIcon className={`w-4 h-4 mr-2 ${roleConf.color}`} />
              <div className="flex-1">
                <span>{roleConf.label}</span>
                {role.club_id && clubNames[role.club_id] && (
                  <span className="text-xs text-muted-foreground ml-1">
                    ({clubNames[role.club_id]})
                  </span>
                )}
              </div>
              {isActive && (
                <div className="w-2 h-2 rounded-full bg-primary" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
