/**
 * @component PrintablePlayerSheet
 * @description Fiche joueur imprimable A4 (PDF export) avec identité MATCHS360,
 *              radar, scores par compétence, progression, objectifs, commentaires.
 *              Rendu hors-écran via forwardRef pour capture html2canvas.
 * @access Génération via bouton Export PDF (Coachs, Club Admin, Super Admin)
 * @features
 *  - Identité MATCHS360 (logo agrandi, bleu primaire #3B82F6)
 *  - PrintableRadarChart SVG embarqué (rendu déterministe pour PDF)
 *  - Indicateurs progression (TrendingUp/Down) calculés sur 2 derniers débriefs
 *  - Logos club + photo joueur convertis en base64 (useImagesAsBase64)
 *  - Émojis de score (Meh/Smile/Laugh) pour visualisation rapide
 * @maintenance
 *  - Identité PDF : mem://style/pdf-reports-identity
 *  - Logique progression : mem://features/progression-percentage-logic
 *  - Calculs scores : mem://logic/evaluation/calculations-logic
 */
import { forwardRef } from "react";
import { Star, Meh, Smile, SmilePlus, Laugh, Sparkles, TrendingUp, TrendingDown, Activity, type LucideIcon } from "lucide-react";
import { 
  calculateRadarData, 
  calculateThemeAverage, 
  formatAverage,
  getScoreLabel,
  type ThemeScores 
} from "@/lib/evaluation-utils";
import { PrintableRadarChart } from "./PrintableRadarChart";
import { useImagesAsBase64 } from "@/hooks/useImageAsBase64";
import { useResolvedPhotoBase64 } from "@/hooks/useResolvedPhotoBase64";
import { MinorWatermark } from "@/components/pdf/MinorWatermark";

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
  type?: "coach" | "self" | "supporter";
  coach: { first_name: string | null; last_name: string | null };
  talent?: string | null;
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

interface ComparisonDatasetForPrint {
  label: string;
  data: Array<{ theme: string; score: number; color: string }>;
  color: string;
  themeScores?: ThemeScores[];
}

interface PrintablePlayerSheetProps {
  player: {
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    photo_url: string | null;
    /** BUG-PHOTO-003 — routage signed URL pour photo mineur */
    photo_is_minor?: boolean | null;
    /** BUG-PHOTO-003 — gate consentement obligatoire (art. 9 CC) */
    image_rights_consent_at?: string | null;
    birthdate?: string | null;
    /** Phase 6 RGPD — si true, watermark "CONFIDENTIEL — MINEUR" applique */
    is_minor?: boolean;
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
  comparisonDatasets?: ComparisonDatasetForPrint[];
  referentCoachName?: string | null;
}

// Bleu primaire de l'interface numérique
const BRAND_BLUE = "#3B82F6";
const BRAND_ORANGE = "#D24E2A";
const BRAND_NAVY = "#0F2466";
const BRAND_PRIMARY = "#163A9E";

const RadarLogoSvg = ({ size = 34 }: { size?: number }) => {
  const polygon = (radius: number) => {
    const sides = 8;
    const pts: string[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      pts.push(`${100 + radius * Math.cos(angle)},${100 + radius * Math.sin(angle)}`);
    }
    return pts.join(" ");
  };
  const axis = Array.from({ length: 8 }).map((_, i) => {
    const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
    return (
      <line key={i} x1="100" y1="100"
        x2={100 + 80 * Math.cos(angle)}
        y2={100 + 80 * Math.sin(angle)}
        stroke={BRAND_PRIMARY} strokeOpacity="0.35" strokeWidth="0.6" />
    );
  });
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="MATCHS360" role="img">
      <g>{axis}</g>
      <polygon points={polygon(48)} fill={BRAND_PRIMARY} fillOpacity="0.08" stroke={BRAND_PRIMARY} strokeOpacity="0.55" strokeWidth="1" />
      <polygon points={polygon(84)} fill="none" stroke={BRAND_PRIMARY} strokeOpacity="0.55" strokeWidth="1" />
      <polygon points={polygon(120)} fill="none" stroke={BRAND_PRIMARY} strokeOpacity="0.55" strokeWidth="1" />
      <polyline points="55,100 85,100 95,75 105,125 115,100 145,100"
        fill="none" stroke={BRAND_PRIMARY} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

const MatchsBrand = ({ size = "lg" }: { size?: "lg" | "sm" }) => {
  const logoSize = size === "lg" ? 36 : 14;
  const fontSize = size === "lg" ? "22px" : "10px";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size === "lg" ? "8px" : "4px" }}>
      <RadarLogoSvg size={logoSize} />
      <span style={{ fontSize, fontWeight: 800, letterSpacing: "-0.5px", fontFamily: "'Poppins', 'Segoe UI', Arial, sans-serif" }}>
        <span style={{ color: BRAND_ORANGE }}>MATCHS</span><span style={{ color: BRAND_NAVY }}>360</span>
      </span>
    </div>
  );
};

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
  ({ player, club, team, evaluation, themes, progressionPercent, previousEvaluationDate, comparisonDatasets = [], referentCoachName }, ref) => {
    // Pré-charge les images en base64 pour garantir leur rendu dans les exports PDF
    // (évite les soucis de CORS / tainted canvas avec html2canvas).
    // BUG-PHOTO-003 : la photo joueur passe par un resolver dédié qui
    // applique le gate consentement (mineur ET adulte) + signed URL mineur.
    // Si pas de consentement → null → fallback initiales (aucun octet image).
    const imageMap = useImagesAsBase64([club.logo_url]);
    const clubLogoSrc = club.logo_url ? imageMap[club.logo_url] ?? null : null;
    const playerPhotoSrc = useResolvedPhotoBase64(player);

    const getPlayerName = () => {
      if (player.first_name && player.last_name) return `${player.first_name} ${player.last_name}`;
      if (player.first_name || player.last_name) return player.first_name || player.last_name || "Joueur";
      if (player.nickname) return player.nickname;
      return "Joueur";
    };

    const getCoachName = () => {
      if (evaluation.coach.first_name && evaluation.coach.last_name) {
        return `${evaluation.coach.first_name} ${evaluation.coach.last_name}`;
      }
      return evaluation.coach.first_name || evaluation.coach.last_name || "Coach";
    };

    const authorName = getCoachName();
    const displayedCoachName = referentCoachName?.trim() || authorName;
    const isConsultative = evaluation.type === "supporter" || evaluation.type === "self";
    const authorRoleLabel = evaluation.type === "self" ? "le joueur" : evaluation.type === "supporter" ? "un supporter" : null;

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

    // ───────────────────────────────────────────────────────────────
    // Pagination déterministe des pages "Détail des compétences".
    // @page { margin: 0 } supprime les en-têtes/pieds injectés par le
    // navigateur (URL Lovable…) mais empêche aussi le navigateur de
    // gérer marges + numéros sur les pages de débordement. On découpe
    // donc nous-mêmes le contenu en pages fixes : chaque page a son
    // en-tête, ses marges (padding) et son numéro "Page X/Y".
    // Les hauteurs sont ESTIMÉES de façon conservatrice (mieux vaut une
    // page de plus qu'un contenu coupé).
    // ───────────────────────────────────────────────────────────────
    const estimateThemeHeight = (theme: Theme, ts: ThemeScores): number => {
      let h = 36; // en-tête du thème
      for (const skill of theme.skills) {
        let row = 30;
        if (skill.definition) row += Math.ceil(skill.definition.length / 85) * 13;
        row += comparisonDatasets.length * 16;
        h += row;
      }
      const comments = ts.skills.filter(s => s.comment);
      if (comments.length > 0) {
        h += 26;
        for (const c of comments) h += Math.ceil(((c.comment?.length ?? 0) + 20) / 90) * 16;
      }
      if (ts.objective) h += 26 + Math.ceil(ts.objective.length / 90) * 16;
      return h + 16; // marginBottom
    };

    // Budget vertical utile d'une page détail (≈ A4 − padding − header − titre − footer)
    const DETAIL_PAGE_BUDGET_PX = 840;

    type ThemeBlock = { theme: Theme; ts: ThemeScores; height: number };
    const themeBlocks: ThemeBlock[] = themeScores
      .map(ts => {
        const theme = themes.find(t => t.id === ts.theme_id);
        return theme ? { theme, ts, height: estimateThemeHeight(theme, ts) } : null;
      })
      .filter((b): b is ThemeBlock => b !== null);

    const talentText = evaluation.talent?.trim() ?? "";
    const talentHeight = talentText ? 60 + Math.ceil(talentText.length / 90) * 16 : 0;

    const detailPages: ThemeBlock[][] = [];
    let currentPage: ThemeBlock[] = [];
    let usedHeight = 0;
    for (const block of themeBlocks) {
      if (currentPage.length > 0 && usedHeight + block.height > DETAIL_PAGE_BUDGET_PX) {
        detailPages.push(currentPage);
        currentPage = [];
        usedHeight = 0;
      }
      currentPage.push(block);
      usedHeight += block.height;
    }
    if (talentText && currentPage.length > 0 && usedHeight + talentHeight > DETAIL_PAGE_BUDGET_PX) {
      detailPages.push(currentPage);
      currentPage = [];
      usedHeight = 0;
    }
    if (currentPage.length > 0 || (talentText && detailPages.length === 0)) {
      detailPages.push(currentPage);
    } else if (talentText && usedHeight === 0 && currentPage.length === 0 && detailPages.length > 0) {
      detailPages.push([]);
    }

    const totalPages = 1 + detailPages.length;

    const PageFooter = ({ pageNumber }: { pageNumber: number }) => (
      <div style={{ paddingTop: "12px", borderTop: `2px solid ${BRAND_BLUE}20`, textAlign: "center", fontSize: "10px", color: "#9ca3af", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span>Page {pageNumber}/{totalPages}</span>
        <MatchsBrand size="sm" />
        <span>Document confidentiel</span>
      </div>
    );

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", width: "210mm" }}
      >
        {/* Phase 6 RGPD (A2-011) : watermark + bandeau si le joueur est mineur */}
        {/* Print page setup: define real @page margins so EVERY printed page
            (including those auto-paginated by the browser when content
            overflows) keeps a safe top/bottom/left/right margin. Without this,
            printers may clip content on continuation pages. */}
        <style>{`
          /* @page margin: 0 supprime les en-têtes/pieds de page injectés par
             le navigateur (date, titre, URL Lovable). Les marges visuelles du
             document sont donc portées par le padding de .pps-page. */
          @page { size: A4; margin: 0; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; }
            /* Pagination contrôlée : chaque .pps-page-fixed = exactement une
               feuille (marges incluses via padding). overflow hidden évite
               qu'un léger débordement crée une page parasite sans marge. */
            .pps-page-fixed { height: 296mm !important; min-height: 0 !important; overflow: hidden !important; page-break-after: always; break-after: page; }
            .pps-page-fixed:last-child { page-break-after: auto; break-after: auto; }
            /* En impression, on laisse la page occuper la largeur imprimable
               réelle (A4 - marges non imprimables du driver) pour éviter
               toute coupe à droite. */
            .pps-page { width: 100% !important; max-width: 100% !important; }
          }
          .pps-page {
            width: 210mm;
            min-height: 297mm;
            padding: 12mm 12mm 10mm 12mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
          }
          .pps-page-fixed {
            height: 297mm;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
          }
        `}</style>
        {/* ===== PAGE 1 ===== */}
        <div
          className={comparisonDatasets.length >= 2 ? "pps-page" : "pps-page pps-page-fixed"}
          style={{
            position: "relative",
            ...(comparisonDatasets.length >= 2 ? { pageBreakAfter: "always", breakAfter: "page" } : {}),
          }}
        >
          <MinorWatermark isMinor={!!player.is_minor} orientation="portrait" />

          {/* ── Top brand bar ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", paddingBottom: "14px", borderBottom: `3px solid ${BRAND_BLUE}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {clubLogoSrc && (
                <img src={clubLogoSrc} alt={club.name} crossOrigin="anonymous" style={{ width: "36px", height: "36px", objectFit: "contain" }} />
              )}
              <span style={{ fontSize: "12px", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {club.name}
              </span>
            </div>
            <MatchsBrand size="lg" />
          </div>

          {/* ── Player identity card ── */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "20px",
            padding: "16px 20px",
            borderRadius: "12px",
            background: `linear-gradient(135deg, ${BRAND_BLUE}10, ${BRAND_BLUE}05)`,
            border: `1px solid ${BRAND_BLUE}30`,
          }}>
            {/* Photo */}
            {playerPhotoSrc ? (
              <img
                src={playerPhotoSrc}
                alt={getPlayerName()}
                crossOrigin="anonymous"
                style={{
                  width: "80px",
                  height: "80px",
                  borderRadius: "50%",
                  objectFit: "cover",
                  border: `3px solid ${BRAND_BLUE}`,
                  boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                }}
              />
            ) : (
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "28px",
                fontWeight: "bold",
                color: "white",
                backgroundColor: BRAND_BLUE,
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
                {club.name}
              </p>
              <p style={{ fontSize: "14px", color: "#6b7280", margin: 0 }}>
                {team.name}
              </p>
            </div>

            {/* Global level */}
            <div style={{ minWidth: "150px", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <GlobalAverageIcon score={overallAverage} />
                <p style={{ fontSize: "28px", fontWeight: 800, margin: 0, color: LEVEL_COLORS[Math.round(overallAverage || 0)] || "#6b7280", lineHeight: 1 }}>
                  {formatAverage(overallAverage)}/5
                </p>
              </div>
              {progressionPercent !== null && progressionPercent !== undefined && (
                <div style={{ display: "flex", alignItems: "center", gap: "3px", marginTop: "6px" }}>
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
              <span style={{ fontWeight: 600, color: "#374151" }}>Coach :</span> {displayedCoachName}
              {" • "}
              <span style={{ fontWeight: 600, color: "#374151" }}>Date :</span> {evalDate}
              {isConsultative && (
                <>
                  {" • "}
                  <span style={{ fontWeight: 600, color: "#374151" }}>Débrief réalisé par :</span>{" "}
                  {authorName}{authorRoleLabel ? ` (${authorRoleLabel})` : ""}
                </>
              )}
            </div>
          </div>

          {/* ── Radar chart - full width ── */}
          <div style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", margin: "0 0 8px 0", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Analyse des compétences
            </h2>
            <div style={{ width: "100%", display: "flex", justifyContent: "center" }}>
              <div style={{ width: "100%", maxWidth: "520px" }}>
                <PrintableRadarChart data={radarData} comparisonDatasets={comparisonDatasets} />
              </div>
            </div>
          </div>

          {/* ── Detail par thématique - progress bars ── */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "0.03em" }}>
              Détail par thématique
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 24px" }}>
              {radarData.map((item) => (
                <div key={item.theme} style={{ breakInside: "avoid", pageBreakInside: "avoid", marginBottom: "6px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "3px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: item.color }} />
                      <span style={{ fontSize: "12px", fontWeight: 500, color: "#111827" }}>{item.theme}</span>
                    </div>
                    <span style={{ fontSize: "12px", fontWeight: "bold", color: "#374151" }}>
                      {item.score > 0 ? getScoreLabel(item.score) : "—"}
                    </span>
                  </div>
                  <div style={{ height: "5px", backgroundColor: "#e5e7eb", borderRadius: "999px", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: "999px", width: `${(item.score / 5) * 100}%`, backgroundColor: item.color }} />
                  </div>
                  {comparisonDatasets.map((cmp) => {
                    const cmpItem = cmp.data.find(d => d.theme === item.theme);
                    const cmpScore = cmpItem?.score || 0;
                    return (
                      <div key={cmp.label} style={{ marginTop: "4px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2px" }}>
                          <span style={{ fontSize: "9px", color: cmp.color, fontWeight: 600 }}>
                            {cmp.label}
                          </span>
                          <span style={{ fontSize: "9px", color: "#6b7280" }}>
                            {cmpScore > 0 ? getScoreLabel(cmpScore) : "—"}
                          </span>
                        </div>
                        <div style={{ height: "4px", backgroundColor: "#f3f4f6", borderRadius: "999px", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: "999px", width: `${(cmpScore / 5) * 100}%`, backgroundColor: cmp.color, opacity: 0.85 }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Page 1 Footer */}
          <PageFooter pageNumber={1} />
        </div>

        {/* ===== PAGES 2..N : Détail des compétences (pagination contrôlée) ===== */}
        {detailPages.map((pageBlocks, pageIndex) => {
          const isLastDetailPage = pageIndex === detailPages.length - 1;
          return (
        <div key={pageIndex} className="pps-page pps-page-fixed" style={{ position: "relative" }}>
          <MinorWatermark isMinor={!!player.is_minor} orientation="portrait" />

          {/* ── Top brand bar (repeated) ── */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px", paddingBottom: "14px", borderBottom: `3px solid ${BRAND_BLUE}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              {clubLogoSrc && (
                <img src={clubLogoSrc} alt={club.name} crossOrigin="anonymous" style={{ width: "36px", height: "36px", objectFit: "contain" }} />
              )}
              <div>
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>{getPlayerName()}</span>
                <span style={{ fontSize: "12px", color: "#6b7280", marginLeft: "8px" }}>{team.name}</span>
              </div>
            </div>
            <MatchsBrand size="lg" />
          </div>

          <h2 style={{ fontSize: "15px", fontWeight: 700, color: "#111827", borderBottom: "1px solid #e5e7eb", paddingBottom: "6px", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Détail des compétences{pageIndex > 0 ? " (suite)" : ""}
          </h2>

          <div style={{ flex: 1 }}>
            {pageBlocks.map(({ theme, ts: themeScore }) => {
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
                      {themeAverage !== null ? getScoreLabel(themeAverage) : "—"}
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
                                {skill.definition && (
                                  <div style={{ fontSize: "9px", color: "#6b7280", marginTop: "1px", lineHeight: 1.3, fontStyle: "italic" }}>
                                    {skill.definition}
                                  </div>
                                )}
                              </td>
                              <td style={{ padding: "5px 10px", textAlign: "right" }}>
                                {scoreData?.is_not_observed ? (
                                  <span style={{ color: "#9ca3af", fontSize: "10px" }}>N/O</span>
                                ) : (
                                  <StarDisplay score={scoreData?.score || null} />
                                )}
                                {comparisonDatasets.map((cmp) => {
                                  const cmpTheme = cmp.themeScores?.find(t => t.theme_id === themeScore.theme_id);
                                  const cmpScoreData = cmpTheme?.skills.find(s => s.skill_id === skill.id);
                                  if (!cmpScoreData) return null;
                                  const cmpScore = cmpScoreData.score || 0;
                                  return (
                                    <div key={cmp.label} style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "4px", marginTop: "2px" }}>
                                      <span style={{ fontSize: "8px", color: cmp.color, fontWeight: 600 }}>{cmp.label}</span>
                                      {cmpScoreData.is_not_observed ? (
                                        <span style={{ fontSize: "8px", color: "#9ca3af" }}>N/O</span>
                                      ) : (
                                        <div style={{ display: "flex", alignItems: "center", gap: "1px" }}>
                                          {[1, 2, 3, 4, 5].map((star) => (
                                            <Star
                                              key={star}
                                              className="w-2.5 h-2.5"
                                              style={{
                                                fill: star <= cmpScore ? cmp.color : "transparent",
                                                color: cmp.color,
                                                opacity: star <= cmpScore ? 1 : 0.3,
                                              }}
                                            />
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
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

          {/* ── Talent observé (facultatif) ── */}
          {evaluation.talent && evaluation.talent.trim() !== "" && (
            <div style={{ marginTop: "14px", breakInside: "avoid", pageBreakInside: "avoid" }}>
              <div style={{
                border: `1px solid ${BRAND_BLUE}40`,
                borderRadius: "8px",
                padding: "10px 14px",
                background: `linear-gradient(135deg, ${BRAND_BLUE}10, ${BRAND_BLUE}05)`,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                  <Sparkles className="w-4 h-4" style={{ color: BRAND_BLUE }} />
                  <h3 style={{ fontSize: "13px", fontWeight: 700, color: "#111827", margin: 0, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Talent observé
                  </h3>
                </div>
                <p style={{ fontSize: "12px", color: "#374151", margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {evaluation.talent}
                </p>
              </div>
            </div>
          )}

          {/* Page 2 Footer */}
          <div style={{ paddingTop: "12px", borderTop: `2px solid ${BRAND_BLUE}20`, textAlign: "center", fontSize: "10px", color: "#9ca3af", marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span />
            <MatchsBrand size="sm" />
            <span>Document confidentiel</span>
          </div>
        </div>
      </div>
    );
  }
);

PrintablePlayerSheet.displayName = "PrintablePlayerSheet";
