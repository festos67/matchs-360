/**
 * @component PlayerEvaluationTab
 * @description Onglet "Résultat" de la fiche joueur : affichage du dernier
 *              débrief officiel (priorité coach), radar avec couches comparatives
 *              (auto/supporter), restitution granulaire par compétence.
 * @access Tous rôles avec accès à la fiche joueur (RLS)
 * @features
 *  - Vue par défaut : dernier débrief coach officiel
 *  - Toggles "Auto-évaluation" / "Supporter" pour superposer (Checkbox)
 *  - EvaluationRadar avec data dynamique selon couches actives
 *  - Restitution granulaire (scores + commentaires + objectifs)
 *  - Bouton "Nouveau débrief" (RotateCcw) selon permissions
 * @maintenance
 *  - Vue par défaut : mem://logic/radar-view-priority
 *  - Restitution détaillée : mem://features/player-result-tab/detailed-view
 *  - Débriefs consultatifs en overlay : mem://features/consultative-debrief-types
 */
import { useState, useCallback } from "react";
import { ClipboardList, Heart, MessageSquare, Star, UserCircle } from "lucide-react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ComparisonRadar } from "@/components/evaluation/ComparisonRadar";
import { calculateRadarData, calculateOverallAverage, formatAverage, getScoreLabel, type ThemeScores } from "@/lib/evaluation-utils";
import { cn } from "@/lib/utils";
import { getThemePaletteColor } from "@/lib/theme-palette";
import type { Player, TeamMembership, ReferentCoach, Evaluation, Theme } from "@/hooks/usePlayerData";

interface PlayerEvaluationTabProps {
  player: Player;
  teamMembership: TeamMembership | null;
  referentCoach: ReferentCoach | null;
  evaluations: Evaluation[];
  selectedEvaluation: Evaluation | null;
  selectedEvalThemes: Theme[];
  themes: Theme[];
  frameworkId: string | null;
  canEvaluate: boolean;
  isViewingHistory: boolean;
  comparisonIds: string[];
  onReturnToCurrent: () => void;
  onToggleComparison: (id: string) => void;
  hideSupporterLayer?: boolean;
}

const COMPARISON_COLORS = ["#6B7280", "#F97316", "#06B6D4", "#8B5CF6"];

export function PlayerEvaluationTab({
  player,
  teamMembership,
  referentCoach,
  evaluations,
  selectedEvaluation,
  selectedEvalThemes,
  themes,
  frameworkId,
  canEvaluate,
  isViewingHistory,
  comparisonIds,
  onReturnToCurrent,
  onToggleComparison,
  hideSupporterLayer = false,
}: PlayerEvaluationTabProps) {
  const [showSelfEvalLayer, setShowSelfEvalLayer] = useState(false);
  const [showSupporterLayer, setShowSupporterLayer] = useState(false);

  const teamColor = teamMembership?.team?.club?.primary_color || "#3B82F6";

  const getRadarDataFromEvaluation = useCallback((evaluation: Evaluation | null, useThemes?: Theme[]): ThemeScores[] => {
    const t = useThemes || selectedEvalThemes;
    if (!evaluation || t.length === 0) return [];
    return t.map(theme => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map(skill => {
        const score = evaluation.scores.find(s => s.skill_id === skill.id);
        return {
          skill_id: skill.id,
          score: score?.score ?? null,
          is_not_observed: score?.is_not_observed ?? false,
          comment: score?.comment ?? null,
        };
      }),
      objective: evaluation.objectives.find(o => o.theme_id === theme.id)?.content ?? null,
    }));
  }, [selectedEvalThemes]);

  const radarData = calculateRadarData(getRadarDataFromEvaluation(selectedEvaluation));

  const latestCoachEvaluation = evaluations.find(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
  const latestSelfEvaluation = evaluations.find(e => e.type === "self" && !e.deleted_at && e.framework_id === frameworkId);
  const latestSupporterEvaluation = evaluations.find(e => e.type === "supporter" && !e.deleted_at && e.framework_id === frameworkId);
  const currentFrameworkCoachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
  const previousCoachEvaluation = currentFrameworkCoachEvals.length >= 2 ? currentFrameworkCoachEvals[1] : null;
  const hasComparisonLayers = comparisonIds.length > 0 || showSelfEvalLayer || showSupporterLayer;

  const getDisplayedDatasets = () => {
    const datasets: Array<{ id: string; label: string; date: string; data: ReturnType<typeof calculateRadarData>; color: string; isCurrent?: boolean }> = [];
    const seenIds = new Set<string>();

    const pushDataset = (
      evaluation: Evaluation | null,
      options: { label?: string; color: string; isCurrent?: boolean },
    ) => {
      if (!evaluation || seenIds.has(evaluation.id)) return;
      seenIds.add(evaluation.id);
      datasets.push({
        id: evaluation.id,
        label: options.label || evaluation.name,
        date: evaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(evaluation)),
        color: options.color,
        isCurrent: options.isCurrent,
      });
    };

    pushDataset(selectedEvaluation, { color: teamColor, isCurrent: true });

    comparisonIds.forEach((evalId, index) => {
      const evaluation = evaluations.find(e => e.id === evalId);
      pushDataset(evaluation ?? null, {
        color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
      });
    });

    if (showSelfEvalLayer) {
      pushDataset(latestSelfEvaluation, { label: "Auto-débrief", color: "#F59E0B" });
    }

    if (showSupporterLayer) {
      pushDataset(latestSupporterEvaluation, { label: "Débrief Supporter", color: "#F97316" });
    }

    return datasets;
  };

  return (
    <div className="space-y-6">
      {isViewingHistory && (
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-warning">📜 Vous consultez un débrief passé: <strong>{selectedEvaluation?.name}</strong></span>
          <Button size="sm" variant="outline" onClick={onReturnToCurrent} className="gap-2">
            <RotateCcw className="w-4 h-4" />Retour à la version actuelle
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
        {/* Radar */}
        <div className="2xl:col-span-2 glass-card p-6">
          <div className="flex items-start justify-between gap-4 mb-4 min-h-[5.5rem]">
            <div className="min-h-[3.5rem] flex-1">
              <h2 className="text-xl font-display font-semibold">Analyse des résultats</h2>
              <p className="text-sm text-muted-foreground mt-1 min-h-[2.5rem]">
                {hasComparisonLayers ? (() => {
                  const sources = [];
                  if (comparisonIds.length > 0) sources.push("Dernier débrief");
                  if (showSelfEvalLayer && latestSelfEvaluation) sources.push("Auto-éval");
                  if (showSupporterLayer && latestSupporterEvaluation) sources.push("Supporter");
                  return sources.length > 0 ? `Comparaison: ${sources.join(" + ")}` : "Sélectionnez au moins une source";
                })() : selectedEvaluation ? (() => {
                  const coachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const evalIndex = coachEvals.findIndex(e => e.id === selectedEvaluation.id);
                  const evalNumber = evalIndex >= 0 ? evalIndex + 1 : "–";
                  const playerName = `${player.first_name || ""} ${player.last_name || ""}`.trim();
                  const coachName = referentCoach ? `${referentCoach.first_name || ""} ${referentCoach.last_name || ""}`.trim() : "";
                  const evalDate = new Date(selectedEvaluation.date);
                   return (
                     <>
                       Débrief N°{evalNumber} – {playerName}
                       <br />
                       {coachName} – {evalDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })} {evalDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                     </>
                   );
                })() : "Aucune évaluation"}
              </p>
            </div>
              <div className="flex items-center gap-4 flex-nowrap min-h-[2.5rem] shrink-0 self-start">
                {previousCoachEvaluation && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Checkbox id="coach-layer" checked={comparisonIds.includes(previousCoachEvaluation.id)} onCheckedChange={() => onToggleComparison(previousCoachEvaluation.id)} />
                    <Label htmlFor="coach-layer" className="text-sm cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                      <ClipboardList className="w-4 h-4 text-orange-500" />Dernier débrief
                    </Label>
                  </div>
                )}
                {!!latestSelfEvaluation && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Checkbox id="self-eval-layer" checked={showSelfEvalLayer} onCheckedChange={(checked) => setShowSelfEvalLayer(checked as boolean)} />
                    <Label htmlFor="self-eval-layer" className="text-sm cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                      <UserCircle className="w-4 h-4 text-success" />Auto-éval
                    </Label>
                  </div>
                )}
                {!!latestSupporterEvaluation && !hideSupporterLayer && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Checkbox id="supporter-layer" checked={showSupporterLayer} onCheckedChange={(checked) => setShowSupporterLayer(checked as boolean)} />
                    <Label htmlFor="supporter-layer" className="text-sm cursor-pointer flex items-center gap-1.5 whitespace-nowrap">
                      <Heart className="w-4 h-4 text-accent" />Supporter
                    </Label>
                  </div>
                )}
              </div>
          </div>

          {radarData.length > 0 ? (
            selectedEvaluation ? (
              <ComparisonRadar
                datasets={getDisplayedDatasets()}
                primaryColor={teamColor}
              />
            ) : (
              <div className="h-[350px] flex items-center justify-center text-muted-foreground">Aucune évaluation disponible</div>
            )
          ) : (
            <div className="h-[350px] flex items-center justify-center text-muted-foreground">Aucune évaluation disponible</div>
          )}
        </div>

        {/* Theme detail sidebar */}
        <div className="glass-card p-6">
          <h3 className="font-display font-semibold mb-4">Détail par thématique</h3>
          <div className="space-y-4">
            {selectedEvalThemes.map((theme) => {
              const themeData = radarData.find(d => d.theme === theme.name);
              const themeIndex = selectedEvalThemes.findIndex(t => t.id === theme.id);
              const color = theme.color || getThemePaletteColor(themeIndex);
              return (
                <div key={theme.id}>
                  <div className="flex items-start gap-2 mb-1">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ backgroundColor: color }} />
                    <span className="text-sm font-medium flex-1 min-w-0 break-words">{theme.name}</span>
                  </div>
                  <div className="flex justify-end mb-1">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {themeData?.score ? getScoreLabel(themeData.score) : "—"}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${((themeData?.score || 0) / 5) * 100}%`, backgroundColor: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Detailed skills breakdown */}
      {selectedEvaluation && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-primary" />
            <h3 className="font-display font-semibold text-lg">Détail des compétences</h3>
            <Badge variant="outline" className="text-xs ml-auto">
              {new Date(selectedEvaluation.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </Badge>
          </div>

          {selectedEvalThemes.map((theme) => {
            const themeScoreData = getRadarDataFromEvaluation(selectedEvaluation).find(ts => ts.theme_id === theme.id);
            if (!themeScoreData) return null;
            const themeAvg = themeScoreData.skills.filter(s => !s.is_not_observed && s.score !== null && s.score > 0);
            const avgScore = themeAvg.length > 0 ? themeAvg.reduce((acc, s) => acc + (s.score || 0), 0) / themeAvg.length : null;
            const hasComments = themeScoreData.skills.some(s => s.comment);
            const objective = themeScoreData.objective;
            const themeIndex = selectedEvalThemes.findIndex(t => t.id === theme.id);
            const color = theme.color || getThemePaletteColor(themeIndex);

            return (
              <div key={theme.id} className="glass-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3" style={{ backgroundColor: `${color}15` }}>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="font-semibold text-sm">{theme.name}</span>
                  </div>
                  <span className="font-bold text-sm" style={{ color }}>
                    {avgScore !== null ? getScoreLabel(avgScore) : "—"}
                  </span>
                </div>
                <div className="divide-y divide-border">
                  {theme.skills.map((skill) => {
                    const scoreData = themeScoreData.skills.find(s => s.skill_id === skill.id);
                    return (
                      <div key={skill.id} className="px-4 py-2.5 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <span className={cn("text-sm", scoreData?.is_not_observed && "text-muted-foreground")}>{skill.name}</span>
                          {scoreData?.is_not_observed && <span className="ml-2 text-xs text-muted-foreground">(Non observé)</span>}
                        </div>
                        <div className="shrink-0">
                          {scoreData?.is_not_observed ? (
                            <span className="text-xs text-muted-foreground">N/O</span>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star key={star} className={cn("w-4 h-4", star <= (scoreData?.score || 0) ? "fill-warning text-warning" : "fill-transparent text-muted-foreground/30")} />
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {hasComments && (
                  <div className="px-4 py-3 bg-muted/30 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5" />Conseils
                    </p>
                    <div className="space-y-1">
                      {themeScoreData.skills.filter(s => s.comment).map(s => {
                        const skill = theme.skills.find(sk => sk.id === s.skill_id);
                        return <p key={s.skill_id} className="text-sm text-muted-foreground"><strong className="text-foreground">{skill?.name} :</strong> {s.comment}</p>;
                      })}
                    </div>
                  </div>
                )}
                {objective && (
                  <div className="px-4 py-3 bg-primary/5 border-t border-border">
                    <p className="text-xs font-semibold text-primary mb-1 flex items-center gap-1.5">🎯 Objectifs</p>
                    <p className="text-sm text-muted-foreground">{objective}</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
