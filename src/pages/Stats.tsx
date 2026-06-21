/**
 * @page Stats
 * @route /stats
 *
 * État "bientôt disponible" pour la future console de statistiques avancées.
 *
 * @maintenance
 * Cette page sera enrichie avec des graphiques agrégés par club/équipe/coach.
 * Voir mem://features/stats-and-member-counting pour les règles de calcul
 * (membres actifs, exclusion des évaluations consultatives, etc.).
 */
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock } from "lucide-react";

const Stats = () => {
  return (
    <AppLayout>
      <div className="container mx-auto px-4 py-10 max-w-2xl">
        <Card>
          <CardContent className="p-10 flex flex-col items-center text-center gap-5">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <BarChart3 className="h-8 w-8 text-muted-foreground" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight">Statistiques</h1>
              <Badge variant="secondary" className="gap-1.5">
                <Clock className="h-3 w-3" />
                Bientôt disponible
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              Cette section proposera prochainement des tableaux de bord et des
              graphiques agrégés (par club, équipe et coach). Elle est en cours
              de préparation.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
};

export default Stats;