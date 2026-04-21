/**
 * @component TrialBanner
 * @description Bandeau persistant affiché en haut de l'AppLayout pour les clubs
 *              en période d'essai (trial) ou plan gratuit (free). Communique
 *              le statut d'abonnement avec CTA d'upgrade vers /pricing.
 * @access Affiché si isTrial ou isFree (depuis usePlan)
 * @props
 *  - isTrial: boolean — essai actif
 *  - isFree: boolean — plan gratuit (sans essai actif)
 *  - trialDaysLeft: number — jours restants si trial
 * @features
 *  - Message dynamique selon contexte (essai expirant / plan gratuit)
 *  - Icône Sparkles (essai) ou Info (free)
 *  - Bouton "Découvrir les plans" → /pricing
 *  - Bouton X pour masquer (dismiss session)
 * @maintenance
 *  - Statut plan via hook : src/hooks/usePlan.ts
 *  - Affichage AppLayout : src/components/layout/AppLayout.tsx
 */
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Info, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface TrialBannerProps {
  trialDaysLeft: number | null;
  isTrial: boolean;
  isFree: boolean;
}

export const TrialBanner = ({ trialDaysLeft, isTrial, isFree }: TrialBannerProps) => {
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  // Cas 1 : plan gratuit (hors trial)
  if (isFree && !isTrial) {
    return (
      <BannerShell
        tone="info"
        icon={<Info className="h-4 w-4" />}
        message="Vous êtes en plan gratuit. Certaines fonctionnalités sont limitées."
        onUpgrade={() => navigate("/pricing")}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  // Cas 2 : en trial
  if (isTrial && trialDaysLeft !== null) {
    if (trialDaysLeft <= 1) {
      return (
        <BannerShell
          tone="urgent"
          icon={<AlertTriangle className="h-4 w-4" />}
          message="Dernier jour d'essai Pro ! Passez en Pro pour conserver toutes vos données."
          onUpgrade={() => navigate("/pricing")}
          onDismiss={() => setDismissed(true)}
        />
      );
    }
    if (trialDaysLeft <= 7) {
      return (
        <BannerShell
          tone="warning"
          icon={<AlertTriangle className="h-4 w-4" />}
          message={`Votre essai Pro se termine dans ${trialDaysLeft} jours.`}
          onUpgrade={() => navigate("/pricing")}
          onDismiss={() => setDismissed(true)}
        />
      );
    }
    return (
      <BannerShell
        tone="info"
        icon={<Sparkles className="h-4 w-4" />}
        message={`Essai Pro : ${trialDaysLeft} jours restants`}
        onUpgrade={() => navigate("/pricing")}
        onDismiss={() => setDismissed(true)}
      />
    );
  }

  return null;
};

interface BannerShellProps {
  tone: "info" | "warning" | "urgent";
  icon: React.ReactNode;
  message: string;
  onUpgrade: () => void;
  onDismiss: () => void;
}

const BannerShell = ({ tone, icon, message, onUpgrade, onDismiss }: BannerShellProps) => {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 px-4 py-2 text-sm border-b",
        tone === "info" && "bg-primary/10 text-foreground border-primary/20",
        tone === "warning" && "bg-amber-500/10 text-foreground border-amber-500/30",
        tone === "urgent" && "bg-destructive/10 text-foreground border-destructive/30"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span
          className={cn(
            "shrink-0",
            tone === "info" && "text-primary",
            tone === "warning" && "text-amber-600",
            tone === "urgent" && "text-destructive"
          )}
        >
          {icon}
        </span>
        <span className="truncate">{message}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={onUpgrade}>
          Passer en Pro
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={onDismiss}
          aria-label="Fermer"
          className="h-7 w-7"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};