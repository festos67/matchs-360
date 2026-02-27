import { forwardRef } from "react";
import { Star, Meh, Smile, SmilePlus, Laugh, Sparkles, TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
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

// Design tokens matching app's dark theme (but printed on white)
const BRAND_BLUE = "#3B82F6";
const BRAND_DARK = "#0f172a";
const BRAND_NAVY = "#1e293b";
const BRAND_SLATE = "#475569";
const BRAND_LIGHT = "#f1f5f9";

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
      <IconComponent className="w-12 h-12" style={{ color }} strokeWidth={1.5} />
      {isExpert && <Sparkles className="w-6 h-6" style={{ color }} strokeWidth={1.5} />}
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

// Brand header bar used on both pages
const BrandBar = ({ clubLogoUrl, clubName }: { clubLogoUrl?: string | null; clubName: string }) => (
  <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "20px",
    paddingBottom: "12px",
    borderBottom: `3px solid ${BRAND_BLUE}`,
  }}>
    {/* MATCHS360 logo/brand */}
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <div style={{
        width: "32px",
        height: "32px",
        borderRadius: "8px",
        background: `linear-gradient(135deg, ${BRAND_BLUE}, #6366f1)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontSize: "12px",
        fontWeight: 800,
        fontFamily: "'Space Grotesk', sans-serif",
      }}>
        M
      </div>
      <span style={{
        fontSize: "20px",
        fontWeight: 800,
        letterSpacing: "0.04em",
        color: BRAND_BLUE,
        fontFamily: "'Space Grotesk', 'Inter', sans-serif",
      }}>
        MATCHS<span style={{ color: "#6366f1" }}>360</span>
      </span>
    </div>

    {/* Club logo + name */}
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      {clubLogoUrl && (
        <img src={clubLogoUrl} alt={clubName} style={{ width: "32px", height: "32px", objectFit: "contain" }} />
      )}
      <span style={{ fontSize: "12px", fontWeight: 600, color: BRAND_SLATE, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {clubName}
      </span>
    </div>
  </div>
);

// Footer used on both pages
const PageFooter = ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
  <div style={{
    paddingTop: "10px",
    borderTop: `2px solid ${BRAND_BLUE}20`,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "auto",
    fontSize: "9px",
    color: BRAND_SLATE,
  }}>
    <span>Page {pageNumber}/{totalPages}</span>
    <span style={{ fontWeight: 700, letterSpacing: "0.05em", color: BRAND_BLUE, fontFamily: "'Space Grotesk', sans-serif" }}>
      MATCHS<span style={{ color: "#6366f1" }}>360</span>
    </span>
    <span>Document confidentiel</span>
  </div>
);

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
      ? `${formatDateFr(previousEvaluationDate!)} → ${evalDate}`
      : null;

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{ fontFamily: "'Inter', system-ui, -apple-system, sans-serif", width: "210mm" }}
      >
        {/* ===== PAGE 1 ===== */}
        <div style={{ padding: "10mm 10mm 8mm 10mm", minHeight: "297mm", display: "flex", flexDirection: "column" }}>

          <BrandBar clubLogoUrl={club.logo_url} clubName={club.name} />

          {/* ── Player identity card ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "20px",
            padding: "20px 24px",
            borderRadius: "14px",
            background: `linear-gradient(135deg, ${BRAND_DARK} 0%, ${BRAND_NAVY} 100%)`,
            color: "white",
            boxShadow: "0 4px 20px rgba(15, 23, 42, 0.25)",
          }}>
            {/* Photo */}
            {player.photo_url ? (
              <img
                src={player.photo_url}
                alt={getPlayerName()}
                style={{
                  width: "88px",
                  height: "88px",
                  borderRadius: "12px",
                  objectFit: "cover",
                  border: `3px solid ${BRAND_BLUE}`,
                  boxShadow: `0 0 20px ${BRAND_BLUE}40`,
                }}
              />
            ) : (
              <div style={{
                width: "88px",
                height: "88px",
                borderRadius: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "30px",
                fontWeight: "bold",
                color: "white",
                background: `linear-gradient(135deg, ${BRAND_BLUE}, #6366f1)`,
                boxShadow: `0 0 20px ${BRAND_BLUE}40`,
              }}>
                {(player.first_name?.[0] || "").toUpperCase()}{(player.last_name?.[0] || "").toUpperCase()}
              </div>
            )}

            {/* Name + team + period */}
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: "28px", fontWeight: 800, margin: "0 0 4px 0", lineHeight: 1.15, fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
                {getPlayerName()}
              </h1>
              <p style={{ fontSize: "14px", color: "#94a3b8", margin: "0 0 6px 0" }}>
                {team.name} • {club.name}
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  Coach : <span style={{ color: "white", fontWeight: 500 }}>{getCoachName()}</span>
                </span>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>
                  {evalDate}
                </span>
                {periodLabel && (
                  <span style={{
                    fontSize: "10px",
                    padding: "2px 8px",
                    borderRadius: "999px",
                    backgroundColor: `${BRAND_BLUE}30`,
                    color: "#93c5fd",
                    fontWeight: 600,
                  }}>
                    📅 {periodLabel}
                  </span>
                )}
              </div>
            </div>

            {/* Global level */}
            <div style={{ textAlign: "center", minWidth: "120px" }}>
              <GlobalAverageIcon score={overallAverage} />
              <p style={{
                fontSize: "28px",
                fontWeight: 800,
                margin: "4px 0 0 0",
                color: LEVEL_COLORS[Math.round(overallAverage || 0)] || "#6b7280",
                fontFamily: "'Space Grotesk', sans-serif",
              }}>
                {formatAverage(overallAverage)}<span style={{ fontSize: "16px", color: "#64748b" }}>/5</span>
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

          {/* ── Radar chart ── */}
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{
              fontSize: "14px",
              fontWeight: 700,
              color: BRAND_DARK,
              margin: "0 0 8px 0",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Analyse des compétences
            </h2>
            <div style={{ width: "100%", height: "340px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: "520px", height: "100%" }}>
                <PrintableRadarChart data={radarData} />
              </div>
            </div>
          </div>

          {/* ── Detail par thématique ── */}
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontSize: "14px",
              fontWeight: 700,
              color: BRAND_DARK,
              margin: "0 0 12px 0",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontFamily: "'Space Grotesk', sans-serif",
            }}>
              Détail par thématique
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 24px" }}>
              {radarData.map((item) => (
                <div key={item.theme}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: item.color }} />
                      <span style={{ fontSize: "12px", fontWeight: 500, color: BRAND_DARK }}>{item.theme}</span>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: BRAND_NAVY, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {item.score.toFixed(1)}/5
                    </span>
                  </div>
                  <div style={{ height: "6px", backgroundColor: "#e2e8f0", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "999px", width: `${(item.score / 5) * 100}%`, backgroundColor: item.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <PageFooter pageNumber={1} totalPages={2} />
        </div>

        {/* Page break */}
        <div className="break-before-page" />

        {/* ===== PAGE 2 ===== */}
        <div style={{ padding: "10mm 10mm 8mm 10mm", minHeight: "297mm", display: "flex", flexDirection: "column" }}>

          <BrandBar clubLogoUrl={club.logo_url} clubName={club.name} />

          {/* Compact player reminder */}
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "16px",
            padding: "8px 14px",
            borderRadius: "8px",
            backgroundColor: BRAND_LIGHT,
          }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: BRAND_DARK, fontFamily: "'Space Grotesk', sans-serif" }}>
              {getPlayerName()}
            </span>
            <span style={{ fontSize: "11px", color: BRAND_SLATE }}>{team.name} • {evalDate}</span>
          </div>

          <h2 style={{
            fontSize: "14px",
            fontWeight: 700,
            color: BRAND_DARK,
            borderBottom: `2px solid ${BRAND_BLUE}20`,
            paddingBottom: "6px",
            marginBottom: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
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
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "7px 12px",
                    borderRadius: "8px 8px 0 0",
                    background: `linear-gradient(135deg, ${theme.color || BRAND_BLUE}18, ${theme.color || BRAND_BLUE}08)`,
                    borderLeft: `4px solid ${theme.color || BRAND_BLUE}`,
                  }}>
                    <h3 style={{ fontWeight: 700, color: BRAND_DARK, fontSize: "13px", margin: 0, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {theme.name}
                    </h3>
                    <span style={{ fontWeight: 800, fontSize: "13px", color: theme.color || BRAND_BLUE, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {formatAverage(themeAverage)}/5
                    </span>
                  </div>

                  {/* Skills table */}
                  <div style={{ border: "1px solid #e2e8f0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
                    <table style={{ width: "100%", fontSize: "12px", borderCollapse: "collapse" }}>
                      <tbody>
                        {theme.skills.map((skill, idx) => {
                          const scoreData = themeScore.skills.find(s => s.skill_id === skill.id);
                          return (
                            <tr key={skill.id} style={{ borderBottom: idx < theme.skills.length - 1 ? "1px solid #f1f5f9" : "none" }}>
                              <td style={{ padding: "5px 12px" }}>
                                <span style={{ color: scoreData?.is_not_observed ? "#94a3b8" : BRAND_DARK }}>
                                  {skill.name}
                                </span>
                                {scoreData?.is_not_observed && (
                                  <span style={{ marginLeft: "6px", fontSize: "10px", color: "#94a3b8" }}>(Non observé)</span>
                                )}
                              </td>
                              <td style={{ padding: "5px 12px", textAlign: "right" }}>
                                {scoreData?.is_not_observed ? (
                                  <span style={{ color: "#94a3b8", fontSize: "10px" }}>N/O</span>
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
                      <div style={{ padding: "8px 12px", backgroundColor: "#f8fafc", borderTop: "1px solid #f1f5f9" }}>
                        <p style={{ fontSize: "11px", fontWeight: 700, color: BRAND_NAVY, margin: "0 0 3px 0" }}>💬 Conseils</p>
                        {themeScore.skills
                          .filter(s => s.comment)
                          .map(s => {
                            const skill = theme.skills.find(sk => sk.id === s.skill_id);
                            return (
                              <p key={s.skill_id} style={{ fontSize: "11px", color: BRAND_SLATE, margin: "0 0 2px 0" }}>
                                <strong>{skill?.name} :</strong> {s.comment}
                              </p>
                            );
                          })}
                      </div>
                    )}

                    {/* Objectifs */}
                    {objective && (
                      <div style={{ padding: "8px 12px", backgroundColor: "#eff6ff", borderTop: "1px solid #f1f5f9" }}>
                        <p style={{ fontSize: "11px", fontWeight: 700, color: BRAND_BLUE, margin: "0 0 3px 0" }}>🎯 Objectifs</p>
                        <p style={{ fontSize: "11px", color: BRAND_NAVY, margin: 0 }}>{objective}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <PageFooter pageNumber={2} totalPages={2} />
        </div>
      </div>
    );
  }
);

PrintablePlayerSheet.displayName = "PrintablePlayerSheet";
