/**
 * @page SupporterPlayerView
 * @route /supporter/players/:id
 * @access Supporter (joueur lié uniquement)
 * @description Fiche lecture seule d'un joueur suivi : identité + restitution
 *              complète de la dernière évaluation officielle (réutilise
 *              PlayerEvaluationTab). Les auto-débriefs restent privés
 *              (le RLS ne les renvoie pas au supporter).
 */
import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { PlayerEvaluationTab } from "@/components/player/PlayerEvaluationTab";
import { usePlayerData, getPlayerName, type Theme } from "@/hooks/usePlayerData";
import { useAuth } from "@/hooks/useAuth";
import { loadFrameworkThemes } from "@/lib/framework-loader";

export default function SupporterPlayerView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const {
    player,
    teamMembership,
    referentCoach,
    evaluations,
    themes,
    frameworkId,
    loading,
  } = usePlayerData(id);

  // Dernier débrief COACH (jamais d'auto-débrief : le RLS ne les renvoie pas au supporter)
  const selectedEvaluation = useMemo(() => {
    const coachEvals = evaluations.filter((e) => e.type === "coach" && !e.deleted_at);
    return (
      coachEvals.find((e) => !frameworkId || e.framework_id === frameworkId) ||
      coachEvals[0] ||
      null
    );
  }, [evaluations, frameworkId]);

  // Thèmes du référentiel correspondant au débrief sélectionné
  const [selectedEvalThemes, setSelectedEvalThemes] = useState<Theme[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (
      selectedEvaluation?.framework_id &&
      selectedEvaluation.framework_id !== frameworkId
    ) {
      loadFrameworkThemes(selectedEvaluation.framework_id).then(({ themes: loaded }) => {
        if (!cancelled) setSelectedEvalThemes(loaded as unknown as Theme[]);
      });
    } else {
      setSelectedEvalThemes(themes);
    }
    return () => {
      cancelled = true;
    };
  }, [selectedEvaluation, themes, frameworkId]);

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!player) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center gap-4 px-4">
          <p className="text-muted-foreground max-w-md">
            Ce joueur n'est pas associé à votre compte.
          </p>
          <Button onClick={() => navigate("/supporter/dashboard")}>Retour à mes joueurs</Button>
        </div>
      </AppLayout>
    );
  }

  const playerName = getPlayerName(player);
  const teamColor = teamMembership?.team?.club?.primary_color || "#3B82F6";
  const teamName = teamMembership?.team?.name;
  const clubName = teamMembership?.team?.club?.name;
  const coachName = referentCoach
    ? `${referentCoach.first_name || ""} ${referentCoach.last_name || ""}`.trim()
    : null;

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/supporter/dashboard")}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> Retour à mes joueurs
        </Button>

        {/* Fiche joueur */}
        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <CircleAvatar
              shape="circle"
              name={playerName}
              profile={player as any}
              color={teamColor}
              size="md"
              showName={false}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-display font-bold">{playerName}</h1>
              {teamName && (
                <p className="text-sm text-muted-foreground">
                  {teamName}
                  {clubName ? ` · ${clubName}` : ""}
                </p>
              )}
              {coachName && <p className="text-sm text-muted-foreground">Coach : {coachName}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Détail complet de la dernière évaluation (radar + thématiques + compétences) */}
        <PlayerEvaluationTab
          player={player}
          teamMembership={teamMembership}
          referentCoach={referentCoach}
          evaluations={evaluations}
          selectedEvaluation={selectedEvaluation}
          selectedEvalThemes={selectedEvalThemes}
          themes={themes}
          frameworkId={frameworkId}
          canEvaluate={false}
          isViewingHistory={false}
          comparisonIds={[]}
          onReturnToCurrent={() => {}}
          onToggleComparison={() => {}}
          hideSupporterLayer
          currentUserId={user?.id}
        />

        <div className="flex justify-center">
          <Button
            variant="ghost"
            onClick={() => navigate("/supporter/debriefs")}
            className="gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            Voir tous les débriefs
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}