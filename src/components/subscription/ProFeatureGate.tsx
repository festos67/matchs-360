import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/hooks/usePlan";

interface ProFeatureGateProps {
  feature: string;
  description?: string;
  children: ReactNode;
  /** Optional blurred preview shown behind the lock overlay */
  preview?: ReactNode;
}

export const ProFeatureGate = ({
  feature,
  description,
  children,
  preview,
}: ProFeatureGateProps) => {
  const navigate = useNavigate();
  const { isPro, isTrial, loading } = usePlan();

  // Pendant le trial, l'utilisateur bénéficie de toutes les features Pro
  if (loading || isPro || isTrial) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-border">
      <div className="pointer-events-none select-none blur-sm opacity-40">
        {preview ?? children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm p-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Lock className="h-6 w-6 text-primary" />
        </div>
        <div className="space-y-1">
          <p className="font-semibold">{feature}</p>
          <p className="text-sm text-muted-foreground">
            {description ?? "Disponible avec le plan Pro"}
          </p>
        </div>
        <Button size="sm" onClick={() => navigate("/pricing")}>
          Passer en Pro — 99€/an
        </Button>
      </div>
    </div>
  );
};