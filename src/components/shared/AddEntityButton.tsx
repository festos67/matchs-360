/**
 * @component AddEntityButton
 * @description Bouton "+ Entité" harmonisé pour ajouter coach/équipe/joueur/supporter.
 *              Layout : icône `+` orange à gauche, libellé centré, pastille colorée
 *              avec icône de rôle à droite. Identité visuelle alignée sur la
 *              standardisation des rôles (mem://style/role-branding-standard).
 */
import { Plus, UserCog, Users, UserCircle, Heart, Building2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type AddEntityType = "coach" | "team" | "player" | "supporter" | "club";

const ENTITY_CONFIG: Record<AddEntityType, { label: string; Icon: LucideIcon; color: string; bg: string }> = {
  coach: { label: "Coach", Icon: UserCog, color: "text-orange-500", bg: "bg-orange-500/10" },
  team: { label: "Équipe", Icon: Users, color: "text-primary", bg: "bg-primary/10" },
  player: { label: "Joueur", Icon: UserCircle, color: "text-green-500", bg: "bg-green-500/10" },
  supporter: { label: "Supporter", Icon: Heart, color: "text-pink-500", bg: "bg-pink-500/10" },
  club: { label: "Club", Icon: Building2, color: "text-primary", bg: "bg-primary/10" },
};

interface AddEntityButtonProps {
  type: AddEntityType;
  onClick?: () => void;
  className?: string;
  /** Override du libellé par défaut (ex: "Ajouter") */
  label?: string;
}

export const AddEntityButton = ({ type, onClick, className, label }: AddEntityButtonProps) => {
  const { label: defaultLabel, Icon, color, bg } = ENTITY_CONFIG[type];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative inline-flex items-center gap-2 px-2.5 sm:px-3 py-2 rounded-lg border border-orange-500/20 bg-background hover:border-orange-500/40 hover:shadow-sm transition-all text-sm font-medium text-foreground max-w-full min-w-0",
        className,
      )}
    >
      <Plus className="w-4 h-4 text-orange-500 shrink-0" />
      <span className="flex-1 min-w-0 text-left truncate">{label ?? defaultLabel}</span>
      <span className={cn("flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-md shrink-0", bg)}>
        <Icon className={cn("w-3.5 h-3.5 sm:w-4 sm:h-4", color)} />
      </span>
    </button>
  );
};