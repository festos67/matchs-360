/**
 * @page Stats
 * @route /stats
 *
 * Page placeholder pour la future console de statistiques avancées.
 *
 * @maintenance
 * Cette page sera enrichie avec des graphiques agrégés par club/équipe/coach.
 * Voir mem://features/stats-and-member-counting pour les règles de calcul
 * (membres actifs, exclusion des évaluations consultatives, etc.).
 */
import { AppLayout } from "@/components/layout/AppLayout";

const Stats = () => {
  return (
    <AppLayout>
      <div className="flex items-center justify-center min-h-[70vh]">
        <h1 className="text-2xl md:text-4xl font-display font-bold text-center text-muted-foreground px-4">
          En attente de construction par notre vénérable dieu Sahand ALEBOYEH
        </h1>
      </div>
    </AppLayout>
  );
};

export default Stats;
