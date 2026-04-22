/**
 * @component ThemeAccordion
 * @description Accordéon par thème dans le formulaire de débrief. Affiche les
 *              compétences avec StarRating, toggle "Non observé", commentaires
 *              et indicateurs visuels (icônes œil, MessageSquare).
 * @props
 *  - theme: Theme + skills + scores
 *  - onScoreChange / onCommentChange / onToggleObserved
 *  - previousScores?: référence pour icône History
 *  - readOnly?: boolean
 * @features
 *  - Ouverture par défaut (UX standards)
 *  - Tooltip d'info pour les définitions de compétences
 *  - Icône History pour consulter le score du débrief précédent
 *  - Moyenne thème calculée live (calculateThemeAverage, exclut "non observé")
 *  - Toggle EyeOff/Eye pour basculer "Non observé"
 * @maintenance
 *  - Calculs : mem://logic/evaluation/calculations-logic
 *  - UX standards (accordéons ouverts) : mem://style/ux-standards
 *  - Score précédent : mem://features/debrief-previous-score-reference
 */
import { useState } from "react";
import { EyeOff, Eye, Info, MessageSquare, ChevronDown, ChevronRight, History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StarRating } from "./StarRating";
import { calculateThemeAverage, formatAverage, SCORE_LABELS, getScoreLabel, type SkillScore } from "@/lib/evaluation-utils";

interface Skill {
  id: string;
  name: string;
  definition: string | null;
}

interface SkillRowProps {
  skill: Skill;
  score: SkillScore;
  previousScore?: number | null;
  onScoreChange: (score: number) => void;
  onNotObservedChange: (isNotObserved: boolean) => void;
  onCommentChange: (comment: string) => void;
  disabled?: boolean;
  showDefinitionInline?: boolean;
}

export const SkillRow = ({
  skill,
  score,
  previousScore,
  onScoreChange,
  onNotObservedChange,
  onCommentChange,
  disabled = false,
  showDefinitionInline = false,
}: SkillRowProps) => {
  const [showComment, setShowComment] = useState(!!score.comment);
  const [showPreviousScore, setShowPreviousScore] = useState(false);
  const hasPreviousScore = previousScore !== undefined && previousScore !== null && previousScore > 0;

  return (
    <div
      className={cn(
        "p-4 rounded-lg transition-all duration-200",
        score.is_not_observed 
          ? "bg-muted/20 opacity-60" 
          : "bg-muted/40 hover:bg-muted/60"
      )}
    >
      <div className="flex items-center gap-4">
        {/* Skill name with info tooltip */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-medium",
              score.is_not_observed && "text-muted-foreground"
            )}>
              {skill.name}
            </span>
            {skill.definition && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs text-sm">
                  {skill.definition}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>

        {/* Star rating */}
        <StarRating
          value={score.score}
          onChange={onScoreChange}
          disabled={disabled || score.is_not_observed}
          size="lg"
        />

        {/* Not observed toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={score.is_not_observed ? "secondary" : "ghost"}
              size="icon"
              disabled={disabled}
              onClick={() => onNotObservedChange(!score.is_not_observed)}
              className={cn(
                "shrink-0",
                score.is_not_observed && "bg-muted text-muted-foreground"
              )}
            >
              {score.is_not_observed ? (
                <EyeOff className="w-5 h-5" />
              ) : (
                <Eye className="w-5 h-5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {score.is_not_observed ? "Marquer comme observé" : "Non observé"}
          </TooltipContent>
        </Tooltip>

        {/* Comment toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={score.comment ? "secondary" : "ghost"}
              size="icon"
              disabled={disabled}
              onClick={() => setShowComment(!showComment)}
              className="shrink-0"
            >
              <MessageSquare className={cn(
                "w-5 h-5",
                score.comment && "text-primary"
              )} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ajouter un conseil</TooltipContent>
        </Tooltip>

        {/* Previous score toggle */}
        {hasPreviousScore && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={showPreviousScore ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setShowPreviousScore(!showPreviousScore)}
                className="shrink-0"
              >
                <History className={cn(
                  "w-5 h-5",
                  showPreviousScore && "text-primary"
                )} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Dernière note attribuée</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Comment textarea */}
      {showComment && (
        <div className="mt-3 pl-0">
          <Textarea
            value={score.comment || ""}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Conseil ou remarque pour cette compétence..."
            rows={2}
            disabled={disabled}
            className="text-sm"
          />
        </div>
      )}

      {/* Previous score display */}
      {showPreviousScore && hasPreviousScore && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded-md bg-muted/60 border border-border/50">
          <History className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm text-muted-foreground">Dernière note :</span>
          <div className="flex items-center gap-1">
            <StarRating value={previousScore!} disabled size="sm" />
            <span className="text-sm font-medium ml-1">
              {previousScore} - {SCORE_LABELS[previousScore!]}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

interface ThemeAccordionProps {
  themeName: string;
  themeColor: string | null;
  skills: Skill[];
  scores: SkillScore[];
  previousScores?: Record<string, number | null>;
  objective: string | null;
  onScoreChange: (skillId: string, score: number) => void;
  onNotObservedChange: (skillId: string, isNotObserved: boolean) => void;
  onCommentChange: (skillId: string, comment: string) => void;
  onObjectiveChange: (objective: string) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
}

export const ThemeAccordion = ({
  themeName,
  themeColor,
  skills,
  scores,
  previousScores,
  objective,
  onScoreChange,
  onNotObservedChange,
  onCommentChange,
  onObjectiveChange,
  disabled = false,
  defaultOpen = true,
}: ThemeAccordionProps) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  const average = calculateThemeAverage(scores);
  const ratedCount = scores.filter(s => !s.is_not_observed && s.score !== null && s.score > 0).length;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className="glass-card overflow-hidden"
        style={{ borderLeftWidth: 4, borderLeftColor: themeColor || "#3B82F6" }}
      >
        {/* Header */}
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors">
            <div className="p-1">
              {isOpen ? (
                <ChevronDown className="w-5 h-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              )}
            </div>
            
            <div className="flex-1 text-left">
              <h3 className="font-display font-semibold text-lg">{themeName}</h3>
              <p className="text-sm text-muted-foreground">
                {ratedCount}/{skills.length} compétences évaluées
              </p>
            </div>

            {/* Average score display */}
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span
                  className="text-2xl font-display font-bold"
                  style={{ color: themeColor || "hsl(var(--primary))" }}
                >
                  {formatAverage(average)}
                </span>
                <span className="text-muted-foreground">/5</span>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Content */}
        <CollapsibleContent>
          <div className="p-4 pt-0 space-y-3">
            {skills.map((skill) => {
              const skillScore = scores.find(s => s.skill_id === skill.id) || {
                skill_id: skill.id,
                score: null,
                is_not_observed: false,
                comment: null,
              };

              return (
                <SkillRow
                  key={skill.id}
                  skill={skill}
                  score={skillScore}
                  previousScore={previousScores?.[skill.id]}
                  onScoreChange={(score) => onScoreChange(skill.id, score)}
                  onNotObservedChange={(isNotObserved) => onNotObservedChange(skill.id, isNotObserved)}
                  onCommentChange={(comment) => onCommentChange(skill.id, comment)}
                  disabled={disabled}
                />
              );
            })}

            {/* Objectives section */}
            <div className="mt-6 pt-4 border-t border-border">
              <label className="text-sm font-medium mb-2 block">
                🎯 Objectifs pour cette thématique
              </label>
              <Textarea
                value={objective || ""}
                onChange={(e) => onObjectiveChange(e.target.value)}
                placeholder="Axes de travail, points d'amélioration, objectifs à atteindre..."
                rows={3}
                disabled={disabled}
                className="text-sm"
              />
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
};