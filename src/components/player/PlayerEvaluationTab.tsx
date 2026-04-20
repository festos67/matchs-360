import { useState, useCallback } from "react";
import { ClipboardList, Heart, MessageSquare, Star } from "lucide-react";
import { RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EvaluationRadar } from "@/components/evaluation/EvaluationRadar";
import { ComparisonRadar } from "@/components/evaluation/ComparisonRadar";
import { calculateRadarData, calculateOverallAverage, formatAverage, type ThemeScores } from "@/lib/evaluation-utils";
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
  onClearComparison: () => void;
  onToggleComparison: (id: string) => void;
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
  onClearComparison,
  onToggleComparison,
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
  const showComparison = comparisonIds.length > 0;

  const latestCoachEvaluation = evaluations.find(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
  const latestSelfEvaluation = evaluations.find(e => e.type === "self" && !e.deleted_at && e.framework_id === frameworkId);
  const latestSupporterEvaluation = evaluations.find(e => e.type === "supporter" && !e.deleted_at && e.framework_id === frameworkId);
  const currentFrameworkCoachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
  const previousCoachEvaluation = currentFrameworkCoachEvals.length >= 2 ? currentFrameworkCoachEvals[1] : null;

  const isMultiSourceMode = showSelfEvalLayer || showSupporterLayer;

  const getMultiSourceOverlayDatasets = () => {
    const datasets: Array<{ id: string; label: string; date: string; data: ReturnType<typeof calculateRadarData>; color: string; isCurrent?: boolean }> = [];
    if (selectedEvaluation) {
      datasets.push({ id: selectedEvaluation.id, label: selectedEvaluation.name, date: selectedEvaluation.date, data: calculateRadarData(getRadarDataFromEvaluation(selectedEvaluation)), color: teamColor, isCurrent: true });
    }
    if (showSelfEvalLayer && latestSelfEvaluation && latestSelfEvaluation.id !== selectedEvaluation?.id) {
      datasets.push({ id: latestSelfEvaluation.id, label: "Auto-débrief", date: latestSelfEvaluation.date, data: calculateRadarData(getRadarDataFromEvaluation(latestSelfEvaluation)), color: "#F59E0B", isCurrent: false });
    }
    if (showSupporterLayer && latestSupporterEvaluation && latestSupporterEvaluation.id !== selectedEvaluation?.id) {
      datasets.push({ id: latestSupporterEvaluation.id, label: "Débrief Supporter", date: latestSupporterEvaluation.date, data: calculateRadarData(getRadarDataFromEvaluation(latestSupporterEvaluation)), color: "#F97316", isCurrent: false });
    }
    return datasets;
  };

  const getComparisonDatasets = () => {
    const datasets: Array<{ id: string; label: string; date: string; data: ReturnType<typeof calculateRadarData>; color: string; isCurrent?: boolean }> = [];
    if (selectedEvaluation) {
      datasets.push({ id: selectedEvaluation.id, label: selectedEvaluation.name, date: selectedEvaluation.date, data: calculateRadarData(getRadarDataFromEvaluation(selectedEvaluation)), color: teamColor, isCurrent: true });
    }
    comparisonIds.forEach((evalId, index) => {
      const evaluation = evaluations.find(e => e.id === evalId);
      if (evaluation && evaluation.id !== selectedEvaluation?.id) {
        datasets.push({ id: evaluation.id, label: evaluation.name, date: evaluation.date, data: calculateRadarData(getRadarDataFromEvaluation(evaluation)), color: COMPARISON_COLORS[index % COMPARISON_COLORS.length], isCurrent: false });
      }
    });
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-display font-semibold">Analyse des résultats</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isMultiSourceMode ? (() => {
                  const sources = [];
                  if (showSelfEvalLayer && latestSelfEvaluation) sources.push("Auto-éval");
                  if (showSupporterLayer && latestSupporterEvaluation) sources.push("Supporter");
                  return sources.length > 0 ? `Comparaison: ${sources.join(" vs ")}` : "Sélectionnez au moins une source";
                })() : selectedEvaluation ? (() => {
                  const coachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                  const evalIndex = coachEvals.findIndex(e => e.id === selectedEvaluation.id);
                  const evalNumber = evalIndex >= 0 ? evalIndex + 1 : "–";
                  const playerName = `${player.first_name || ""} ${player.last_name || ""}`.trim();
                  const coachName = referentCoach ? `${referentCoach.first_name || ""} ${referentCoach.last_name || ""}`.trim() : "";
                  const evalDate = new Date(selectedEvaluation.date);
                  return `Débrief N°${evalNumber} – ${playerName} – ${coachName} – ${evalDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" })} ${evalDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
                })() : "Aucune évaluation"}
              </p>
            </div>
            <div className="flex items-center gap-4 flex-wrap">
              {canEvaluate && !showComparison && (
                <>
                  {previousCoachEvaluation && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="coach-layer" checked={comparisonIds.includes(previousCoachEvaluation.id)} onCheckedChange={(checked) => { onToggleComparison(previousCoachEvaluation.id); }} />
                      <Label htmlFor="coach-layer" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <ClipboardList className="w-4 h-4 text-primary" />Dernier débrief
                      </Label>
                    </div>
                  )}
                  {!!latestSelfEvaluation && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="self-eval-layer" checked={showSelfEvalLayer} onCheckedChange={(checked) => setShowSelfEvalLayer(checked as boolean)} />
                      <Label htmlFor="self-eval-layer" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Star className="w-4 h-4 text-amber-500" />Auto-éval
                      </Label>
                    </div>
                  )}
                  {!!latestSupporterEvaluation && (
                    <div className="flex items-center gap-2">
                      <Checkbox id="supporter-layer" checked={showSupporterLayer} onCheckedChange={(checked) => setShowSupporterLayer(checked as boolean)} />
                      <Label htmlFor="supporter-layer" className="text-sm cursor-pointer flex items-center gap-1.5">
                        <Heart className="w-4 h-4 text-orange-500" />Supporter
                      </Label>
                    </div>
                  )}
                </>
              )}
              {showComparison && (
                <Button variant="outline" size="sm" onClick={onClearComparison}>Effacer comparaison</Button>
              )}
            </div>
          </div>

          {radarData.length > 0 ? (
            isMultiSourceMode ? (
              <ComparisonRadar datasets={getMultiSourceOverlayDatasets()} primaryColor={teamColor} />
            ) : showComparison ? (
              <ComparisonRadar datasets={getComparisonDatasets()} primaryColor={teamColor} />
            ) : (
              <EvaluationRadar data={radarData} primaryColor={teamColor} />
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
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                      <span className="text-sm font-medium">{theme.name}</span>
                    </div>
                    <span className="text-sm text-muted-foreground">{themeData?.score || 0}/5</span>
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
                  <span className="font-bold text-sm" style={{ color }}>{formatAverage(avgScore)}/5</span>
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
