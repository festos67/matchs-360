import { useState } from "react";
import { Building2, Shield, UserCog, UserCircle, Heart } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UserRole {
  id: string;
  role: "admin" | "club_admin" | "coach" | "player" | "supporter";
  club_id: string | null;
  club_name?: string;
}

interface RoleSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: UserRole[];
  onSelectRole: (role: UserRole) => void;
}

const roleConfig = {
  admin: {
    icon: Shield,
    label: "Administrateur",
    description: "Accès complet à la plateforme",
    color: "bg-red-500/10 text-red-500",
  },
  club_admin: {
    icon: Building2,
    label: "Responsable Club",
    description: "Gestion du club",
    color: "bg-primary/10 text-primary",
  },
  coach: {
    icon: UserCog,
    label: "Coach",
    description: "Évaluation des joueurs",
    color: "bg-green-500/10 text-green-500",
  },
  player: {
    icon: UserCircle,
    label: "Joueur",
    description: "Consultation de ma fiche",
    color: "bg-blue-500/10 text-blue-500",
  },
  supporter: {
    icon: Heart,
    label: "Supporter",
    description: "Suivi de mes joueurs",
    color: "bg-pink-500/10 text-pink-500",
  },
};

export const RoleSelectorModal = ({
  open,
  onOpenChange,
  roles,
  onSelectRole,
}: RoleSelectorModalProps) => {
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  const handleConfirm = () => {
    const selected = roles.find((r) => r.id === selectedRoleId);
    if (selected) {
      onSelectRole(selected);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            Choisir un profil
          </DialogTitle>
          <DialogDescription>
            Vous avez plusieurs rôles. Sélectionnez le profil avec lequel vous souhaitez continuer.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          {roles.map((role) => {
            const config = roleConfig[role.role];
            const Icon = config.icon;
            const isSelected = selectedRoleId === role.id;

            return (
              <button
                key={role.id}
                onClick={() => setSelectedRoleId(role.id)}
                className={`w-full p-4 rounded-xl border-2 transition-all text-left flex items-center gap-4 ${
                  isSelected
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50 hover:bg-muted/50"
                }`}
              >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${config.color}`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{config.label}</p>
                  <p className="text-sm text-muted-foreground">
                    {role.club_name || config.description}
                  </p>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                    <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!selectedRoleId}>
            Continuer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
