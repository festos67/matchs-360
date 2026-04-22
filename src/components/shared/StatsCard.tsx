/**
 * @component StatsCard
 * @description Carte KPI réutilisable (titre, valeur, sous-titre, icône). Brique
 *              de base de tous les dashboards (Admin, Club, Coach, Joueur).
 * @props
 *  - title: string
 *  - value: string | number
 *  - subtitle?: string — texte secondaire (variation, contexte)
 *  - icon: LucideIcon
 *  - variant?: "default" | "success" | "warning" | "destructive"
 * @features
 *  - Layout uniforme (icône + titre + valeur en gras)
 *  - Couleur de fond selon variant (HSL semantic tokens)
 *  - Subtitle pour contexte (ex: "+12% vs mois dernier")
 *  - Hover state subtle
 * @maintenance
 *  - Comptage actifs uniquement : mem://features/stats-and-member-counting
 *  - Design tokens HSL impérativement (jamais de couleurs hardcodées)
 */
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    label: string;
  };
  color?: "primary" | "success" | "warning" | "destructive";
  className?: string;
  iconClassName?: string;
}

const colorClasses = {
  primary: {
    icon: "bg-accent/10 text-accent",
    trend: "text-primary",
  },
  success: {
    icon: "bg-success/10 text-success",
    trend: "text-success",
  },
  warning: {
    icon: "bg-warning/10 text-warning",
    trend: "text-warning",
  },
  destructive: {
    icon: "bg-destructive/10 text-destructive",
    trend: "text-destructive",
  },
};

export const StatsCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  color = "primary",
  className,
  iconClassName,
}: StatsCardProps) => {
  return (
    <div className={cn("stats-card py-2.5 px-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground font-medium truncate">{title}</p>
          <p className="text-xl font-display font-bold mt-0.5">{value}</p>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
          {trend && (
            <div className={cn("flex items-center gap-1 mt-0.5", colorClasses[color].trend)}>
              <span className="text-xs font-medium">
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-[10px] text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
            colorClasses[color].icon,
            iconClassName
          )}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
