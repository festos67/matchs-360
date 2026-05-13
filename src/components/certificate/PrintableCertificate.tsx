/**
 * @component PrintableCertificate
 * @description Diplôme "Attestation de compétences" rendu hors-écran via
 *              forwardRef pour impression / export PDF (react-to-print).
 * @maintenance
 *  - Identité MATCHS360 : mem://style/pdf-reports-identity
 *  - Réutilise PrintableRadarChart pour cohérence avec PrintablePlayerSheet
 */
import { forwardRef } from "react";
import { useImagesAsBase64 } from "@/hooks/useImageAsBase64";
import { PrintableRadarChart } from "@/components/evaluation/PrintableRadarChart";
import { calculateRadarData, type ThemeScores } from "@/lib/evaluation-utils";

const BRAND_NAVY = "#1E3A8A";
const TEXT_DARK = "#0f172a";
const TEXT_MUTED = "#475569";

export interface CertificateCompetence {
  name: string;
  definition: string;
}

interface PrintableCertificateProps {
  playerName: string;
  clubName: string;
  clubLogoUrl?: string | null;
  clubPrimaryColor?: string;
  guarantorName: string;
  accompanimentPeriod?: string | null;
  competences: CertificateCompetence[];
  additionalMessage?: string | null;
  radarThemeScores?: ThemeScores[] | null;
  radarLabel?: string | null;
  date?: Date;
}

const formatDateFr = (d: Date) =>
  d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export const PrintableCertificate = forwardRef<HTMLDivElement, PrintableCertificateProps>(
  ({
    playerName, clubName, clubLogoUrl, clubPrimaryColor,
    guarantorName, accompanimentPeriod, competences,
    additionalMessage, radarThemeScores, radarLabel, date = new Date(),
  }, ref) => {
    const imageMap = useImagesAsBase64([clubLogoUrl]);
    const clubLogoSrc = clubLogoUrl ? imageMap[clubLogoUrl] ?? null : null;
    const radarData = radarThemeScores && radarThemeScores.length > 0 ? calculateRadarData(radarThemeScores) : null;
    const accent = BRAND_NAVY; // Identité MATCHS360 — bleu foncé exclusif

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{ fontFamily: "'Georgia', 'Times New Roman', serif", width: "297mm" }}
      >
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@600;700;800;900&family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
          @page { size: A4 landscape; margin: 0; }
          @media print {
            html, body { margin: 0 !important; padding: 0 !important; }
            .cert-page { page-break-after: always; }
          }
        `}</style>
        <div
          className="cert-page"
          style={{
            width: "297mm",
            height: "210mm",
            padding: "18mm",
            boxSizing: "border-box",
            position: "relative",
            background: "#fdfcf8",
            overflow: "hidden",
          }}
        >
          {/* Cadre double — fin extérieur + très fin intérieur */}
          <div style={{
            position: "absolute", inset: "10mm",
            border: `1.5px solid ${accent}`,
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", inset: "12mm",
            border: `0.5px solid ${accent}`,
            opacity: 0.5,
            pointerEvents: "none",
          }} />

          {/* Lauriers en filigrane — grand, centré, très transparent */}
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", opacity: 0.06,
          }}>
            <LaurelWreathSvg color={accent} size={520} />
          </div>

          {/* Contenu principal */}
          <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "6mm 16mm 8mm" }}>
            {/* Top bar : Logo MATCHS360 (gauche) + Club (droite) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6mm" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <RadarLogoSvg color={accent} size={64} />
                <span style={{ fontSize: "26px", fontWeight: 800, letterSpacing: "0.04em", color: accent, fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif", lineHeight: 1 }}>
                  MATCHS360
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {clubLogoSrc && (
                  <img src={clubLogoSrc} alt={clubName} crossOrigin="anonymous"
                       style={{ width: "60px", height: "60px", objectFit: "contain" }} />
                )}
                <span style={{ fontSize: "13px", fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif" }}>
                  {clubName}
                </span>
              </div>
            </div>

            {/* Titre */}
            <div style={{ textAlign: "center", marginBottom: "5mm" }}>
              <h1 style={{
                fontSize: "46px", fontWeight: 500, color: accent,
                margin: 0, letterSpacing: "0.01em", fontStyle: "italic",
                fontFamily: "'Cormorant Garamond', 'Georgia', serif",
              }}>
                Attestation de compétences
              </h1>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "10px", marginTop: "6px",
              }}>
                <div style={{ width: "60px", height: "1px", background: accent, opacity: 0.5 }} />
                <div style={{ width: "6px", height: "6px", background: accent, transform: "rotate(45deg)" }} />
                <div style={{ width: "60px", height: "1px", background: accent, opacity: 0.5 }} />
              </div>
            </div>

            {/* Décerné à */}
            <div style={{ textAlign: "center", marginBottom: "6mm" }}>
              <div style={{ fontSize: "11px", color: TEXT_MUTED, marginBottom: "6px", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif" }}>
                Décernée à
              </div>
              <div style={{ fontSize: "34px", fontWeight: 600, color: TEXT_DARK, letterSpacing: "0.02em", fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                {playerName}
              </div>
              {accompanimentPeriod && (
                <div style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "4px", fontStyle: "italic" }}>
                  Durée d'observation : {accompanimentPeriod}
                </div>
              )}
            </div>

            {/* Corps : compétences + radar */}
            <div style={{ display: "flex", gap: "14mm", flex: 1, minHeight: 0, alignItems: "stretch" }}>
              <div style={{ flex: radarData ? "1.3" : "1", display: "flex", flexDirection: "column", minWidth: 0 }}>
                {competences.length > 0 && (
                  <>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: "10px", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif" }}>
                      Compétences observées
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {competences.map((c, i) => (
                        <div key={i} style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                          <span style={{ fontSize: "13px", color: accent, fontWeight: 700, fontFamily: "'Outfit', sans-serif", minWidth: "18px" }}>
                            {String(i + 1).padStart(2, "0")}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "13px", fontWeight: 700, color: TEXT_DARK, fontFamily: "'Outfit', sans-serif" }}>
                              {c.name}
                            </div>
                            {c.definition && (
                              <div style={{ fontSize: "11px", color: TEXT_MUTED, lineHeight: 1.5, marginTop: "1px" }}>
                                {c.definition}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {additionalMessage && (
                  <div style={{
                    marginTop: competences.length > 0 ? "8mm" : 0,
                    paddingLeft: "14px",
                    borderLeft: `2px solid ${accent}`,
                    fontSize: "11.5px", color: TEXT_DARK, lineHeight: 1.6,
                    whiteSpace: "pre-wrap", fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                  }}>
                    {additionalMessage}
                  </div>
                )}
              </div>
              {radarData && (
                <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
                  <div style={{ width: "100%", maxWidth: "95mm" }}>
                    <PrintableRadarChart data={radarData} />
                  </div>
                </div>
              )}
            </div>

            {/* Pied : garant + date */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "6mm", gap: "20mm" }}>
              <div>
                <div style={{ fontSize: "9px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.22em", fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>
                  Garant
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT_DARK, borderTop: `1px solid ${accent}`, paddingTop: "5px", marginTop: "3px", minWidth: "70mm", fontFamily: "'Cormorant Garamond', 'Georgia', serif", fontStyle: "italic" }}>
                  {guarantorName}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.22em", fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>
                  Date
                </div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: TEXT_DARK, borderTop: `1px solid ${accent}`, paddingTop: "5px", marginTop: "3px", minWidth: "60mm", fontFamily: "'Cormorant Garamond', 'Georgia', serif", fontStyle: "italic" }}>
                  {formatDateFr(date)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);
PrintableCertificate.displayName = "PrintableCertificate";

/**
 * Logo MATCHS360 — version SVG inline pour PDF (radar octogonal + ECG).
 * Statique (pas d'animation) car destiné à l'impression.
 */
const RadarLogoSvg = ({ color, size = 42 }: { color: string; size?: number }) => {
  const polygon = (radius: number) => {
    const sides = 8;
    const pts: string[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      pts.push(`${100 + radius * Math.cos(angle)},${100 + radius * Math.sin(angle)}`);
    }
    return pts.join(" ");
  };
  const axes = Array.from({ length: 8 }).map((_, i) => {
    const angle = (Math.PI * 2 * i) / 8 - Math.PI / 2;
    return (
      <line key={i} x1="100" y1="100"
            x2={100 + 80 * Math.cos(angle)} y2={100 + 80 * Math.sin(angle)}
            stroke={color} strokeOpacity="0.35" strokeWidth="0.6" />
    );
  });
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
      <g>{axes}</g>
      <polygon points={polygon(48)} fill={color} fillOpacity="0.06" stroke={color} strokeOpacity="0.55" strokeWidth="1.2" />
      <polygon points={polygon(80)} fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="1.2" />
      <polyline points="55,100 85,100 95,75 105,125 115,100 145,100"
                fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
};

/**
 * Couronne de lauriers — filigrane fin pour fond de diplôme.
 * Deux branches symétriques composées de feuilles ovales fines, ouvertes en haut.
 */
const LaurelWreathSvg = ({ color, size = 480 }: { color: string; size?: number }) => {
  // Génère une branche : suite de feuilles le long d'un arc
  const buildBranch = (mirror: boolean) => {
    const cx = 200;
    const cy = 200;
    const radius = 150;
    const leaves: JSX.Element[] = [];
    // Arc de -150° à -30° (côté gauche), mirroir pour droite
    const startDeg = mirror ? -30 : 210;
    const endDeg = mirror ? -150 : 330;
    const steps = 14;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const deg = startDeg + (endDeg - startDeg) * t;
      const rad = (deg * Math.PI) / 180;
      const x = cx + radius * Math.cos(rad);
      const y = cy + radius * Math.sin(rad);
      // orientation : tangente à l'arc, feuilles pointant vers l'extérieur
      const tangentDeg = deg + (mirror ? -75 : 75);
      leaves.push(
        <ellipse
          key={`${mirror ? "r" : "l"}-${i}`}
          cx={x} cy={y} rx="14" ry="4.2"
          fill="none" stroke={color} strokeWidth="1.2"
          transform={`rotate(${tangentDeg} ${x} ${y})`}
        />
      );
    }
    return leaves;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      {buildBranch(false)}
      {buildBranch(true)}
      {/* nœud en bas */}
      <path d="M 188 348 Q 200 360 212 348" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M 188 352 Q 200 366 212 352" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" />
      <line x1="200" y1="356" x2="194" y2="378" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
      <line x1="200" y1="356" x2="206" y2="378" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
};