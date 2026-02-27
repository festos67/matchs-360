import { forwardRef } from "react";
import { Star, Meh, Smile, SmilePlus, Laugh, Sparkles, TrendingUp, TrendingDown, Activity, type LucideIcon } from "lucide-react";
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
  progressionPercent?: number | null;
  previousEvaluationDate?: string | null;
}

// Palette de couleurs du rouge (1) au vert (5)
const LEVEL_COLORS: Record<number, string> = {
  1: "#EF4444",
  2: "#F97316",
  3: "#EAB308",
  4: "#84CC16",
  5: "#22C55E",
};

const LEVEL_ICONS: Record<number, { icon: LucideIcon; label: string }> = {
  1: { icon: Meh, label: "En cours d'acquisition" },
  2: { icon: Smile, label: "En progression" },
  3: { icon: SmilePlus, label: "Maîtrisé" },
  4: { icon: Laugh, label: "Confirmé" },
  5: { icon: Laugh, label: "Expert" },
};

const GlobalAverageIcon = ({ score }: { score: number | null }) => {
  const value = score ? Math.round(score) : 0;
  if (value === 0) return <span style={{ fontSize: "24px", color: "#9ca3af" }}>-</span>;
  
  const levelData = LEVEL_ICONS[value] || LEVEL_ICONS[1];
  const IconComponent = levelData.icon;
  const color = LEVEL_COLORS[value] || LEVEL_COLORS[1];
  const isExpert = value === 5;
  
  return (
    <div className="flex items-center gap-1" title={levelData.label}>
      <IconComponent className="w-10 h-10" style={{ color }} strokeWidth={1.5} />
      {isExpert && <Sparkles className="w-5 h-5" style={{ color }} strokeWidth={1.5} />}
    </div>
  );
};

const StarDisplay = ({ score }: { score: number | null }) => {
  const value = score ? Math.round(score) : 0;
  if (value === 0) return <span style={{ fontSize: "11px", color: "#9ca3af" }}>-</span>;
  
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "2px" }}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className="w-3.5 h-3.5"
          style={{
            fill: star <= value ? "#f59e0b" : "#e5e7eb",
            color: star <= value ? "#f59e0b" : "#e5e7eb",
          }}
        />
      ))}
    </div>
  );
};

const formatDateFr = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export const PrintablePlayerSheet = forwardRef<HTMLDivElement, PrintablePlayerSheetProps>(
  ({ player, club, team, evaluation, themes, progressionPercent, previousEvaluationDate }, ref) => {
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
    const validAverages = themeScores.map(t => calculateThemeAverage(t.skills)).filter((a): a is number => a !== null);
    const overallAverage = validAverages.length > 0 ? validAverages.reduce((a, b) => a + b, 0) / validAverages.length : null;

    const evalDate = formatDateFr(evaluation.date);
    const hasPreviousEval = !!previousEvaluationDate;
    const periodLabel = hasPreviousEval
      ? `Du ${formatDateFr(previousEvaluationDate!)} au ${evalDate}`
      : null;

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", width: "210mm" }}
      >
        {/* ===== PAGE 1 ===== */}
        <div style={{ padding: "10mm 10mm 8mm 10mm", minHeight: "297mm", display: "flex", flexDirection: "column" }}>

          {/* ── Top brand bar ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "14px", borderBottom: `3px solid ${club.primary_color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {club.logo_url && (
                <img src={club.logo_url} alt={club.name} style={{ width: "36px", height: "36px", objectFit: "contain" }} />
              )}
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {club.name}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: `linear-gradient(135deg, ${club.primary_color}, #6366f1)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Activity style={{ width: "16px", height: "16px", color: "white" }} />
              </div>
              <span style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "0.08em", color: club.primary_color }}>
                MATCHS360
              </span>
            </div>
          </div>

          {/* ── Player identity card ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "20px",
            padding: "16px 20px",
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${club.primary_color}10, ${club.primary_color}05)`,
            border: `1px solid ${club.primary_color}30`,
          }}>
            {/* Photo */}
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={getPlayerName()}
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "10px",
                  objectFit: "cover",
                  border: `3px solid ${club.primary_color}`,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
            ) : (
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "10px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                fontWeight: "bold",
                color: "white",
                backgroundColor: club.primary_color,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
              }}>
                {(player.first_name?.[0] || "").toUpperCase()}{(player.last_name?.[0] || "").toUpperCase()}
              </div>
            )}

            {/* Name + team */}
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: "26px", fontWeight: 800, color: "#111827", margin: "0 0 2px 0", lineHeight: 1.15 }}>
                {getPlayerName()}
              </h1>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                {team.name}
              </p>
            </div>

            {/* Global level */}
            <div style={{ textAlign: "center", minWidth: "120px" }}>
              <GlobalAverageIcon score={overallAverage} />
              <p style={{ fontSize: "26px", fontWeight: 800, margin: "4px 0 0 0", color: LEVEL_COLORS[Math.round(overallAverage || 0)] || "#6b7280" }}>
                {formatAverage(overallAverage)}/5
              </p>
              {progressionPercent !== null && progressionPercent !== undefined && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3px", marginTop: "4px" }}>
                  {progressionPercent >= 0 ? (
                    <TrendingUp className="w-4 h-4" style={{ color: "#22C55E" }} />
                  ) : (
                    <TrendingDown className="w-4 h-4" style={{ color: "#EF4444" }} />
                  )}
                  <span style={{ fontSize: "14px", fontWeight: 700, color: progressionPercent >= 0 ? "#22C55E" : "#EF4444" }}>
                    {progressionPercent >= 0 ? "+" : ""}{progressionPercent}%
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ── Evaluation info line ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", fontSize: "12px", color: "#6b7280" }}>
            <div>
              <span style={{ fontWeight: 600, color: "#374151" }}>Coach :</span> {getCoachName()}
              {" • "}
              <span style={{ fontWeight: 600, color: "#374151" }}>Date :</span> {evalDate}
            </div>
            {periodLabel && (
              <div style={{ padding: "3px 10px", borderRadius: "999px", backgroundColor: `${club.primary_color}15`, color: club.primary_color, fontWeight: 600, fontSize: "11px" }}>
                📅 {periodLabel}
              </div>
            )}
          </div>

          {/* ── Radar chart - full width ── */}
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Analyse des compétences
            </h2>
            <div style={{ width: "100%", height: "340px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: "520px", height: "100%" }}>
                <PrintableRadarChart data={radarData} />
              </div>
            </div>
          </div>

          {/* ── Detail par thématique - progress bars ── */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Détail par thématique
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
              {radarData.map((item) => (
                <div key={item.theme}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color }} />
                      <span style={{ fontSize: "13px", fontWeight: 500, color: "#111827" }}>{item.theme}</span>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: "bold", color: "#374151" }}>{item.score.toFixed(1)}/5</span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "#e5e7eb", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "999px", width: `${(item.score / 5) * 100}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Page 1 Footer */}
          <div style={{ paddingTop: "12px", borderTop: `2px solid ${club.primary_color}20`, textAlign: "center", fontSize: "10px", color: "#9ca3af", marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Page 1/2</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: 700, letterSpacing: "0.05em", color: club.primary_color }}><Activity style={{ width: "12px", height: "12px" }} /> MATCHS360</span>
            <span>Document confidentiel</span>
          </div>
        </div>

        {/* Page break */}
        <div className="break-before-page" />

        {/* ===== PAGE 2: Détail des compétences ===== */}
        <div style={{ padding: "10mm 10mm 8mm 10mm", minHeight: "297mm", display: "flex", flexDirection: "column" }}>

          {/* ── Top brand bar (repeated) ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "14px", borderBottom: `3px solid ${club.primary_color}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {club.logo_url && (
                <img src={club.logo_url} alt={club.name} style={{ width: "36px", height: "36px", objectFit: "contain" }} />
              )}
              <div>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{getPlayerName()}</span>
                <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>{team.name}</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "8px", background: `linear-gradient(135deg, ${club.primary_color}, #6366f1)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Activity style={{ width: "16px", height: "16px", color: "white" }} />
              </div>
              <span style={{ fontSize: "18px", fontWeight: 800, letterSpacing: "0.08em", color: club.primary_color }}>
                MATCHS360
              </span>
            </div>
          </div>

          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", borderBottom: "1px solid #e5e7eb", paddingBottom: "6px", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Détail des compétences
          </h2>

          <div style={{ flex: 1 }}>
            {themeScores.map((themeScore) => {
              const theme = themes.find(t => t.id === themeScore.theme_id);
              if (!theme) return null;

              const themeAverage = calculateThemeAverage(themeScore.skills);
              const objective = themeScore.objective;
              const hasComments = themeScore.skills.some(s => s.comment);

              return (
                <div key={theme.id} style={{ marginBottom: "14px", breakInside: "avoid" }}>
                  {/* Theme header */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", borderRadius: "6px 6px 0 0", backgroundColor: `${theme.color || "#3B82F6"}20` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: theme.color || "#3B82F6" }} />
                      <h3 style={{ fontWeight: 600, color: "#111827", fontSize: "13px", margin: 0 }}>{theme.name}</h3>
                    </div>
                    <span style={{ fontWeight: "bold", fontSize: "13px", color: theme.color || "#3B82F6" }}>
                      {formatAverage(themeAverage)}/5
                    </span>
                  </div>

                  {/* Skills table */}
                  <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 6px 6px" }}>
                    <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                      <tbody>
                        {theme.skills.map((skill, idx) => {
                          const scoreData = themeScore.skills.find(s => s.skill_id === skill.id);
                          return (
                            <tr key={skill.id} style={{ borderBottom: idx < theme.skills.length - 1 ? "1px solid #f3f4f6" : "none" }}>
                              <td style={{ padding: "5px 10px" }}>
                                <span style={{ color: scoreData?.is_not_observed ? "#9ca3af" : "#111827" }}>
                                  {skill.name}
                                </span>
                                {scoreData?.is_not_observed && (
                                  <span style={{ marginLeft: "6px", fontSize: "10px", color: "#9ca3af" }}>(Non observé)</span>
                                )}
                              </td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>
                                {scoreData?.is_not_observed ? (
                                  <span style={{ color: "#9ca3af", fontSize: "10px" }}>N/O</span>
                                ) : (
                                  <StarDisplay score={scoreData?.score || null} />
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Conseils du coach */}
                    {hasComments && (
                      <div style={{ padding: "6px 10px", backgroundColor: "#f9fafb", borderTop: "1px solid #f3f4f6" }}>
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "#4b5563", margin: "0 0 3px 0" }}>💬 Conseils</p>
                        {themeScore.skills
                          .filter(s => s.comment)
                          .map(s => {
                            const skill = theme.skills.find(sk => sk.id === s.skill_id);
                            return (
                              <p key={s.skill_id} style={{ fontSize: "11px", color: "#4b5563", margin: "0 0 2px 0" }}>
                                <strong>{skill?.name} :</strong> {s.comment}
                              </p>
                            );
                          })}
                      </div>
                    )}

                    {/* Objectifs */}
                    {objective && (
                      <div style={{ padding: "6px 10px", backgroundColor: "#eff6ff", borderTop: "1px solid #f3f4f6" }}>
                        <p style={{ fontSize: "11px", fontWeight: 600, color: "#1d4ed8", margin: "0 0 3px 0" }}>🎯 Objectifs</p>
                        <p style={{ fontSize: "11px", color: "#374151", margin: 0 }}>{objective}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Page 2 Footer */}
          <div style={{ paddingTop: "12px", borderTop: `2px solid ${club.primary_color}20`, textAlign: "center", fontSize: "10px", color: "#9ca3af", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>Page 2/2</span>
            <span style={{ display: "flex", alignItems: "center", gap: "4px", fontWeight: 700, letterSpacing: "0.05em", color: club.primary_color }}><Activity style={{ width: "12px", height: "12px" }} /> MATCHS360</span>
            <span>Document confidentiel</span>
          </div>
        </div>
      </div>
    );
  }
);

PrintablePlayerSheet.displayName = "PrintablePlayerSheet";
