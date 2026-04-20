import { useNavigate } from "react-router-dom";
import { Check, X, Sparkles, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePlan } from "@/hooks/usePlan";
import { cn } from "@/lib/utils";

const freeFeatures: Array<{ label: string; included: boolean }> = [
  { label: "2 équipes", included: true },
  { label: "25 joueurs par équipe", included: true },
  { label: "3 débriefs coach par joueur", included: true },
  { label: "3 auto-évaluations par joueur", included: true },
  { label: "1 évaluation supporter par joueur", included: true },
  { label: "Radar de progression", included: true },
  { label: "1 coach référent par équipe", included: true },
  { label: "Import de templates", included: true },
  { label: "Comparaison multi-sources", included: false },
  { label: "Export PDF fiche joueur", included: false },
  { label: "Versioning du référentiel", included: false },
  { label: "Coachs assistants", included: false },
];

const proFeatures: string[] = [
  "Équipes illimitées",
  "Joueurs illimités",
  "30 débriefs coach par joueur",
  "10 auto-évaluations par joueur",
  "10 évaluations supporter par joueur",
  "Comparaison multi-sources",
  "Export PDF fiche joueur",
  "Versioning du référentiel",
  "Coachs assistants illimités",
  "Objectifs illimités",
  "Support email prioritaire",
];

const Pricing = () => {
  const navigate = useNavigate();
  const { isPro, isFree, isTrial, trialDaysLeft, loading } = usePlan();

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold tracking-tight">
            Choisissez votre plan
          </h1>
          <p className="text-muted-foreground">
            Démarrez gratuitement, passez en Pro quand vous êtes prêt. Sans engagement, annulable à tout moment.
          </p>
          {isTrial && trialDaysLeft !== null && (
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles className="h-3.5 w-3.5" />
              Essai Pro actif — {trialDaysLeft} jour{trialDaysLeft > 1 ? "s" : ""} restant{trialDaysLeft > 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Free plan */}
          <Card className={cn("flex flex-col", isFree && !isTrial && "border-primary/40")}>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold">Coach Solo</h2>
                {isFree && !isTrial && <Badge variant="outline">Plan actuel</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                Pour démarrer et découvrir la plateforme
              </p>
              <div>
                <span className="text-4xl font-bold">0€</span>
                <span className="text-sm text-muted-foreground ml-2">pour toujours</span>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="space-y-2.5 flex-1">
                {freeFeatures.map((f) => (
                  <li key={f.label} className="flex items-start gap-2 text-sm">
                    {f.included ? (
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                    )}
                    <span className={cn(!f.included && "text-muted-foreground line-through")}>
                      {f.label}
                    </span>
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                className="w-full mt-6"
                disabled={loading || (isFree && !isTrial)}
              >
                {isFree && !isTrial ? "Plan actuel" : "Rétrograder"}
              </Button>
            </CardContent>
          </Card>

          {/* Pro plan */}
          <Card
            className={cn(
              "flex flex-col relative overflow-hidden",
              "border-primary shadow-lg shadow-primary/10",
              isPro && "ring-2 ring-primary"
            )}
          >
            <div className="absolute top-0 right-0 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 rounded-bl-lg">
              Recommandé
            </div>
            <CardHeader className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="text-2xl font-bold">Club Complet</h2>
                </div>
                {isPro && <Badge>Plan actuel</Badge>}
              </div>
              <p className="text-sm text-muted-foreground">
                Tout ce qu'il faut pour piloter votre club
              </p>
              <div className="space-y-1">
                <div>
                  <span className="text-4xl font-bold">99€</span>
                  <span className="text-sm text-muted-foreground ml-2">par an</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  ou 12,90€/mois · prorata appliqué si en cours de saison
                </p>
              </div>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <ul className="space-y-2.5 flex-1">
                {proFeatures.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                className="w-full mt-6"
                disabled={loading || isPro}
                onClick={() => {
                  // Branchement checkout (Stripe) à venir
                  navigate("/pricing");
                }}
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isPro ? (
                  "Plan actuel"
                ) : isTrial ? (
                  "Activer Pro maintenant"
                ) : (
                  "Passer en Pro"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* FAQ light */}
        <div className="max-w-3xl mx-auto text-center text-sm text-muted-foreground space-y-2 pt-4">
          <p>
            Les paiements sont sécurisés. Vous pouvez annuler ou rétrograder à tout moment.
          </p>
          <p>
            Le prorata est calculé automatiquement en fonction de la date d'activation dans la saison sportive.
          </p>
        </div>
      </div>
    </AppLayout>
  );
};

export default Pricing;