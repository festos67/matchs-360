import { forwardRef } from "react";
import { Star, Meh, Smile, SmilePlus, Laugh, Sparkles, type LucideIcon } from "lucide-react";
import { 
  calculateRadarData, 
  calculateThemeAverage, 
  formatAverage,
  type ThemeScores 
} from "@/lib/evaluation-utils";
import { PrintableRadarChart } from "./PrintableRadarChart";

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
}

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

interface Evaluation {
  id: string;
  name: string;
  date: string;
  coach: { first_name: string | null; last_name: string | null };
  scores: Array<{
    skill_id: string;
    score: number | null;
    is_not_observed: boolean;
    comment: string | null;
  }>;
  objectives: Array<{
    theme_id: string;
    content: string;
  }>;
}

interface PrintablePlayerSheetProps {
  player: {
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    photo_url: string | null;
  };
  club: {
    name: string;
    logo_url?: string | null;
    primary_color: string;
  };
  team: {
    name: string;
  };
  evaluation: Evaluation;
  themes: Theme[];
}

// Palette de couleurs du rouge (1) au vert (5)
const LEVEL_COLORS: Record<number, string> = {
  1: "#EF4444", // Rouge
  2: "#F97316", // Orange
  3: "#EAB308", // Jaune
  4: "#84CC16", // Vert clair
  5: "#22C55E", // Vert
};

// Mapping des icônes de visage selon le niveau (approche bienveillante)
const LEVEL_ICONS: Record<number, { icon: LucideIcon; label: string }> = {
  1: { icon: Meh, label: "En cours d'acquisition" },
  2: { icon: Smile, label: "En progression" },
  3: { icon: SmilePlus, label: "Maîtrisé" },
  4: { icon: Laugh, label: "Confirmé" },
  5: { icon: Laugh, label: "Expert" },
};

// Affiche l'icône smiley colorée (UNIQUEMENT pour la moyenne globale)
const GlobalAverageIcon = ({ score }: { score: number | null }) => {
  const value = score ? Math.round(score) : 0;
  
  if (value === 0) {
    return <span className="text-muted-foreground text-2xl">-</span>;
  }
  
  const levelData = LEVEL_ICONS[value] || LEVEL_ICONS[1];
  const IconComponent = levelData.icon;
  const color = LEVEL_COLORS[value] || LEVEL_COLORS[1];
  const isExpert = value === 5;
  
  return (
    <div className="flex items-center justify-center gap-1" title={levelData.label}>
      <IconComponent className="w-16 h-16" style={{ color }} strokeWidth={1.5} />
      {isExpert && <Sparkles className="w-8 h-8" style={{ color }} strokeWidth={1.5} />}
    </div>
  );
};

// Affiche les étoiles uniquement (pour les compétences individuelles)
const StarDisplay = ({ score }: { score: number | null }) => {
  const value = score ? Math.round(score) : 0;
  
  if (value === 0) {
    return <span className="text-xs text-gray-400">-</span>;
  }
  
  return (
    <div className="flex items-center justify-end gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${
            star <= value ? "fill-amber-500 text-amber-500" : "fill-gray-200 text-gray-200"
          }`}
        />
      ))}
    </div>
  );
};

export const PrintablePlayerSheet = forwardRef<HTMLDivElement, PrintablePlayerSheetProps>(
  ({ player, club, team, evaluation, themes }, ref) => {
    const getPlayerName = () => {
      if (player.nickname) return player.nickname;
      if (player.first_name && player.last_name) return `${player.first_name} ${player.last_name}`;
      return player.first_name || player.last_name || "Joueur";
    };

    const getCoachName = () => {
      if (evaluation.coach.first_name && evaluation.coach.last_name) {
        return `${evaluation.coach.first_name} ${evaluation.coach.last_name}`;
      }
      return evaluation.coach.first_name || evaluation.coach.last_name || "Coach";
    };

    // Calculate theme scores from evaluation
    const themeScores: ThemeScores[] = themes.map(theme => ({
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

    const radarData = calculateRadarData(themeScores);
    const overallAverage = themeScores.reduce((acc, theme) => {
      const avg = calculateThemeAverage(theme.skills);
      return avg !== null ? acc + avg : acc;
    }, 0) / themeScores.filter(t => calculateThemeAverage(t.skills) !== null).length;

    return (
      <div
        ref={ref}
        className="bg-white text-black p-10 w-[210mm] min-h-[297mm] mx-auto"
        style={{ fontFamily: "system-ui, -apple-system, sans-serif" }}
      >
        {/* Page 1: Poster Layout - Vertical Stack */}
        <div className="h-[277mm] flex flex-col">
          {/* Compact Header */}
          <div className="flex items-center justify-between pb-4 border-b-2 border-gray-300">
            <div className="flex items-center gap-4">
              {club.logo_url ? (
                <img src={club.logo_url} alt={club.name} className="w-14 h-14 object-contain" />
              ) : (
                <div
                  className="w-14 h-14 rounded-lg flex items-center justify-center text-white font-bold text-lg"
                  style={{ backgroundColor: club.primary_color }}
                >
                  {club.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{getPlayerName()}</h1>
                <p className="text-sm text-gray-600">{team.name} • {club.name}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg text-gray-900">{evaluation.name}</p>
              <p className="text-sm text-gray-500">{getCoachName()} • {new Date(evaluation.date).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}</p>
            </div>
          </div>

          {/* Zone 1: Giant Radar Chart (~60% of page) */}
          <div className="flex-1 flex items-center justify-center py-4" style={{ minHeight: '380px' }}>
            <div className="w-full h-full max-w-[500px] max-h-[500px]">
              <PrintableRadarChart data={radarData} />
            </div>
          </div>

          {/* Zone 2: Global Score - Transition Element */}
          <div className="flex items-center justify-center py-4 border-y border-gray-200">
            <div className="flex items-center gap-6">
              <GlobalAverageIcon score={overallAverage || null} />
              <div>
                <p className="text-xl font-bold text-gray-900">Niveau Global</p>
                <p className="text-lg text-gray-600">{formatAverage(overallAverage)}/5</p>
              </div>
            </div>
          </div>

          {/* Zone 3: Theme Score Cards Grid */}
          <div className="py-4">
            <div className="grid grid-cols-3 gap-3">
              {radarData.map((item) => {
                const score = Math.round(item.score);
                const levelData = LEVEL_ICONS[score] || LEVEL_ICONS[1];
                const IconComponent = levelData.icon;
                const iconColor = LEVEL_COLORS[score] || LEVEL_COLORS[1];
                
                return (
                  <div 
                    key={item.theme} 
                    className="flex items-center gap-3 p-3 rounded-xl border-2"
                    style={{ 
                      borderColor: item.color,
                      backgroundColor: `${item.color}10`
                    }}
                  >
                    <div 
                      className="w-4 h-4 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{item.theme}</p>
                      <p className="text-xs text-gray-500">{item.score.toFixed(1)}/5</p>
                    </div>
                    <IconComponent 
                      className="w-8 h-8 flex-shrink-0" 
                      style={{ color: iconColor }} 
                      strokeWidth={1.5} 
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Page 1 Footer */}
          <div className="pt-3 border-t border-gray-200 text-center text-xs text-gray-400">
            <p>Page 1/2 • Document généré le {new Date().toLocaleDateString("fr-FR")} • MATCHS360</p>
          </div>
        </div>

        {/* Page break for print */}
        <div className="break-before-page" />

        {/* Page 2: Detailed Scores */}
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">
            Détail des compétences
          </h2>

          {themeScores.map((themeScore) => {
            const theme = themes.find(t => t.id === themeScore.theme_id);
            if (!theme) return null;

            const themeAverage = calculateThemeAverage(themeScore.skills);
            const objective = themeScore.objective;

            return (
              <div key={theme.id} className="break-inside-avoid">
                <div
                  className="flex items-center justify-between p-2 rounded-t-lg"
                  style={{ backgroundColor: `${theme.color || "#3B82F6"}20` }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: theme.color || "#3B82F6" }}
                    />
                    <h3 className="font-semibold text-gray-900">{theme.name}</h3>
                  </div>
                  <span className="font-bold" style={{ color: theme.color || "#3B82F6" }}>
                    {formatAverage(themeAverage)}/5
                  </span>
                </div>

                <div className="border border-t-0 border-gray-200 rounded-b-lg">
                  <table className="w-full text-sm">
                    <tbody>
                      {theme.skills.map((skill) => {
                        const scoreData = themeScore.skills.find(s => s.skill_id === skill.id);
                        return (
                          <tr key={skill.id} className="border-b border-gray-100 last:border-0">
                            <td className="py-2 px-3">
                              <span className={scoreData?.is_not_observed ? "text-gray-400" : ""}>
                                {skill.name}
                              </span>
                              {scoreData?.is_not_observed && (
                                <span className="ml-2 text-xs text-gray-400">(Non observé)</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-right">
                              {scoreData?.is_not_observed ? (
                                <span className="text-gray-400 text-xs">N/O</span>
                              ) : (
                                <StarDisplay score={scoreData?.score || null} />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Comments for this theme */}
                  {themeScore.skills.some(s => s.comment) && (
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-100">
                      <p className="text-xs font-semibold text-gray-600 mb-1">💬 Conseils</p>
                      {themeScore.skills
                        .filter(s => s.comment)
                        .map(s => {
                          const skill = theme.skills.find(sk => sk.id === s.skill_id);
                          return (
                            <p key={s.skill_id} className="text-xs text-gray-600 mb-1">
                              <strong>{skill?.name}:</strong> {s.comment}
                            </p>
                          );
                        })}
                    </div>
                  )}

                  {/* Objective for this theme */}
                  {objective && (
                    <div className="px-3 py-2 bg-blue-50 border-t border-gray-100">
                      <p className="text-xs font-semibold text-blue-700 mb-1">🎯 Objectifs</p>
                      <p className="text-xs text-gray-700">{objective}</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Page 2 Footer */}
        <div className="mt-8 pt-4 border-t border-gray-200 text-center text-xs text-gray-400">
          <p>Page 2/2 • Document généré le {new Date().toLocaleDateString("fr-FR")} • MATCHS360</p>
        </div>
      </div>
    );
  }
);

PrintablePlayerSheet.displayName = "PrintablePlayerSheet";
