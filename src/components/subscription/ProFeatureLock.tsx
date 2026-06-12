/**
 * @component ProFeatureLock
 * @description Wrapper UI verrouillant une fonctionnalité réservée au plan Pro.
 *              Affiche les enfants désactivés (opacity + pointer-events: none)
 *              avec un badge "Pro" et redirige vers /pricing au clic.
 *              Pour les utilisateurs autorisés, rend les enfants tels quels.
 * @access Tous rôles — la décision est prise par le parent via `locked`
 * @props
 *  - locked: boolean — verrouiller ou non
 *  - children: ReactNode — élément à protéger
 *  - label?: string — texte tooltip (par défaut "Réservé au plan Pro")
 *  - className?: string — classes additionnelles sur le wrapper
 * @maintenance
 *  - Source de vérité du plan : src/hooks/usePlan.ts (canDo)
 *  - Page d'upgrade cible : src/pages/Pricing.tsx
 */
import { Crown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ProFeatureLockProps {
  locked: boolean;
  children: React.ReactNode;
  label?: string;
  className?: string;
}

export function ProFeatureLock({
  locked,
  children,
  label = "Fonctionnalité réservée au plan Pro",
  className,
}: ProFeatureLockProps) {
  const navigate = useNavigate();

  if (!locked) return <>{children}</>;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              navigate("/pricing");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                navigate("/pricing");
              }
            }}
            aria-label={label}
            className={cn(
              "relative inline-flex items-center gap-1.5 cursor-pointer rounded-md",
              className
            )}
          >
            <span
              aria-hidden="true"
              className="opacity-50 pointer-events-none select-none [&_*]:pointer-events-none"
            >
              {children}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide shrink-0">
              <Crown className="w-3 h-3" />
              Pro
            </span>
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">
          {label} — cliquez pour voir les plans
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}