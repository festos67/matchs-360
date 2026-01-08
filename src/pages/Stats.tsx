import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Activity, Users, Trophy, Target } from "lucide-react";

const Stats = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Statistiques</h1>
          <p className="text-muted-foreground">
            Vue d'ensemble des performances et métriques
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatsCard
            title="Total Joueurs"
            value="-"
            icon={Users}
            color="primary"
          />
          <StatsCard
            title="Évaluations"
            value="-"
            icon={Trophy}
            color="success"
          />
          <StatsCard
            title="Score Moyen"
            value="-"
            icon={Target}
            color="warning"
          />
          <StatsCard
            title="Progression"
            value="-"
            icon={Activity}
            color="primary"
          />
        </div>

        <div className="rounded-lg border bg-card p-6 text-center text-muted-foreground">
          <Activity className="mx-auto h-12 w-12 mb-4 opacity-50" />
          <p>Les statistiques détaillées seront bientôt disponibles.</p>
        </div>
      </div>
    </AppLayout>
  );
};

export default Stats;
