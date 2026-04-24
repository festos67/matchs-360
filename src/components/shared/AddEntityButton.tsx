/**
 * @component AddEntityButton
 * @description Bouton "+ Entité" harmonisé pour ajouter coach/équipe/joueur/supporter.
 *              Layout : icône `+` orange à gauche, libellé centré, pastille colorée
 *              avec icône de rôle à droite. Identité visuelle alignée sur la
 *              standardisation des rôles (mem://style/role-branding-standard).
 */
import { Plus, UserCog, Users, UserCircle, Heart, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export type AddEntityType = "coach" | "team" | "player" | "supporter";

const ENTITY_CONFIG: Record<AddEntityType, { label: string; Icon: LucideIcon; color: string; bg: string }> = {
  coach: { label: "Coach", Icon: UserCog, color: "text-orange-500", bg: "bg-orange-500/10" },
  team: { label: "Équipe", Icon: Users, color: "text-primary", bg: "bg-primary/10" },
  player: { label: "Joueur", Icon: UserCircle, color: "text-green-500", bg: "bg-green-500/10" },
  supporter: { label: "Supporter", Icon: Heart, color: "text-pink-500", bg: "bg-pink-500/10" },
};

interface AddEntityButtonProps {
  type: AddEntityType;
  onClick?: () => void;
  className?: string;
  /** Override du libellé par défaut (ex: "Ajouter") */
  label?: string;
  /** Désactive le bouton (visuel + a11y + click no-op). */
  disabled?: boolean;
  /** Message tooltip affiché au survol/focus quand disabled=true. */
  disabledReason?: string;
}

export const AddEntityButton = ({ type, onClick, className, label, disabled = false, disabledReason }: AddEntityButtonProps) => {
  const { label: defaultLabel, Icon, color, bg } = ENTITY_CONFIG[type];

  const button = (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      title={disabled ? disabledReason : undefined}
      className={cn(
        "group relative flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background text-sm font-medium text-foreground min-w-[110px] transition-all",
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:bg-secondary hover:border-primary/40 hover:shadow-sm",
        className,
      )}
    >
      <Plus className={cn("w-4 h-4 shrink-0", disabled ? "text-muted-foreground" : "text-orange-500")} />
      <span className="flex-1 text-left truncate">{label ?? defaultLabel}</span>
      <span className={cn("flex items-center justify-center w-7 h-7 rounded-md shrink-0", bg)}>
        <Icon className={cn("w-4 h-4", color)} />
      </span>
    </button>
  );

  if (!disabled || !disabledReason) return button;

  // Wrap dans un span pour que le Tooltip capte les events mouseenter/focus
  // (un <button disabled> n'émet pas pointerenter dans tous les navigateurs).
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};