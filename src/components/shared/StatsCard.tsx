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
}

const colorClasses = {
  primary: {
    icon: "bg-primary/10 text-primary",
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
}: StatsCardProps) => {
  return (
    <div className={cn("stats-card", className)}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-muted-foreground font-medium">{title}</p>
          <p className="text-3xl font-display font-bold mt-2">{value}</p>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
          {trend && (
            <div className={cn("flex items-center gap-1 mt-2", colorClasses[color].trend)}>
              <span className="text-sm font-medium">
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              <span className="text-xs text-muted-foreground">{trend.label}</span>
            </div>
          )}
        </div>
        <div
          className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center",
            colorClasses[color].icon
          )}
        >
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
};
