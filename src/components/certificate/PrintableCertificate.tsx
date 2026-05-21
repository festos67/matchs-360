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
const BRAND_ORANGE = "#E55A2B";
const LAUREL_GOLD = "#C9A227";
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
            pointerEvents: "none", opacity: 0.27, zIndex: 0,
          }}>
            <LaurelWreathSvg color={LAUREL_GOLD} size={760} />
          </div>

          {/* Logos — alignés à la même hauteur dans les coins hauts */}
          <div style={{ position: "absolute", top: "18mm", left: "16mm", height: "52px", display: "flex", alignItems: "center", gap: "12px", zIndex: 2 }}>
            <RadarLogoSvg color={accent} size={52} />
            <span style={{ fontSize: "24px", fontWeight: 800, letterSpacing: "0.04em", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif", lineHeight: 1 }}>
              <span style={{ color: BRAND_ORANGE }}>MATCHS</span><span style={{ color: accent }}>360</span>
            </span>
          </div>
          <div style={{ position: "absolute", top: "18mm", right: "16mm", height: "52px", display: "flex", alignItems: "center", gap: "12px", zIndex: 2 }}>
            {clubLogoSrc && (
              <img src={clubLogoSrc} alt={clubName} crossOrigin="anonymous"
                   style={{ width: "52px", height: "52px", objectFit: "contain" }} />
            )}
            <span style={{ fontSize: "13px", fontWeight: 700, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.16em", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif" }}>
              {clubName}
            </span>
          </div>

          {/* Contenu principal */}
          <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", padding: "26mm 10mm 0" }}>

            {/* Titre */}
            <div style={{ textAlign: "center", marginBottom: "4mm", marginTop: "5mm" }}>
              <h1 style={{
                fontSize: "48px", fontWeight: 500, color: accent,
                margin: 0, letterSpacing: "0.01em", fontStyle: "italic",
                fontFamily: "'Cormorant Garamond', 'Georgia', serif",
              }}>
                Attestation de compétences
              </h1>
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "10px", marginTop: "4px",
              }}>
                <div style={{ width: "60px", height: "1px", background: accent, opacity: 0.5 }} />
                <div style={{ width: "6px", height: "6px", background: accent, transform: "rotate(45deg)" }} />
                <div style={{ width: "60px", height: "1px", background: accent, opacity: 0.5 }} />
              </div>
            </div>

            {/* Décerné à */}
            <div style={{ textAlign: "center", marginBottom: "5mm" }}>
              <div style={{ fontSize: "11px", color: TEXT_MUTED, marginBottom: "6px", letterSpacing: "0.28em", textTransform: "uppercase", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif" }}>
                Décernée à
              </div>
              <div style={{ fontSize: "32px", fontWeight: 600, color: TEXT_DARK, letterSpacing: "0.02em", fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                {playerName}
              </div>
              <div style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "4px", fontStyle: "italic", fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                Garant : {guarantorName}
              </div>
              {accompanimentPeriod && (
                <div style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "2px", fontStyle: "italic", fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                  Durée d'observation : {accompanimentPeriod}
                </div>
              )}
            </div>

            {/* Corps : compétences + radar */}
            <div style={{ display: "flex", gap: "6mm", flex: 1, minHeight: 0, alignItems: "stretch", paddingBottom: "14mm", paddingTop: "6mm", marginLeft: "-6mm" }}>
              <div style={{ flex: radarData ? "1.7" : "1", display: "flex", flexDirection: "column", minWidth: 0, paddingLeft: 0, paddingRight: "2mm" }}>
                {competences.length > 0 && (
                  <>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: "0.22em", marginBottom: "10px", fontFamily: "'Outfit', 'Helvetica Neue', Arial, sans-serif" }}>
                      Compétences observées
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", width: "100%", boxSizing: "border-box" }}>
                      {competences.map((c, i) => (
                        <div key={i} style={{ width: "100%", boxSizing: "border-box" }}>
                          <div style={{ fontSize: "13px", fontWeight: 700, color: TEXT_DARK, fontFamily: "'Outfit', sans-serif" }}>
                            {c.name}
                          </div>
                          {c.definition && (
                            <div style={{ fontSize: "11.5px", color: TEXT_MUTED, lineHeight: 1.6, marginTop: "1px", textAlign: "justify", fontFamily: "'Cormorant Garamond', 'Georgia', serif" }}>
                              {c.definition}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {additionalMessage && (
                  <div style={{
                    marginTop: competences.length > 0 ? "3mm" : 0,
                    paddingTop: "10px",
                    borderTop: `1px solid ${accent}`,
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: "11.5px", color: TEXT_DARK, lineHeight: 1.6,
                    whiteSpace: "pre-wrap", fontStyle: "italic",
                    fontFamily: "'Cormorant Garamond', 'Georgia', serif",
                    textAlign: "justify",
                  }}>
                    {additionalMessage}
                  </div>
                )}
              </div>
              {radarData && (
                <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center", minWidth: 0 }}>
                  <div style={{ width: "100%", maxWidth: "82mm" }}>
                    <PrintableRadarChart data={radarData} />
                  </div>
                </div>
              )}
            </div>

          </div>

          {/* Date — coin bas droit */}
          <div style={{ position: "absolute", right: "22mm", bottom: "18mm", textAlign: "right", zIndex: 2 }}>
            <div style={{ fontSize: "9px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.22em", fontFamily: "'Outfit', sans-serif", fontWeight: 600 }}>
              Date
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_DARK, paddingTop: "4px", marginTop: "3px", minWidth: "55mm", fontFamily: "'Cormorant Garamond', 'Georgia', serif", fontStyle: "italic" }}>
              {formatDateFr(date)}
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
  // Couronne ouverte vers le haut, deux branches symétriques avec multiples feuilles
  // par point d'insertion, inspirée des diplômes classiques.
  const cx = 200;
  const cy = 210;

  const buildBranch = (mirror: boolean) => {
    const elements: JSX.Element[] = [];
    const sign = mirror ? -1 : 1;
    const steps = 14;
    // Arc allant du bas (nœud) vers le haut (ouverture)
    const startAngle = mirror ? 95 : 85;   // près du bas
    const endAngle   = mirror ? 215 : -35; // vers le haut
    const radius = 155;

    const points: { x: number; y: number; tangent: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const deg = startAngle + (endAngle - startAngle) * t;
      const rad = (deg * Math.PI) / 180;
      const x = cx + radius * Math.cos(rad);
      const y = cy + radius * Math.sin(rad);
      const tangent = deg + 90 * sign;
      points.push({ x, y, tangent });
    }

    // Tige fine reliant les points
    const stemD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
    elements.push(
      <path key={`stem-${mirror}`} d={stemD} fill="none"
            stroke={color} strokeOpacity="0.55" strokeWidth="0.8" strokeLinecap="round" />
    );

    // À chaque point : 2 feuilles (intérieure + extérieure) en éventail
    points.forEach((p, i) => {
      // Skip le tout premier point (zone du nœud)
      if (i === 0) return;
      const leafLen = 22;
      const leafW = 6;
      // Feuille extérieure (vers l'extérieur du cercle)
      const outAngle = p.tangent - 28 * sign;
      const inAngle = p.tangent + 8 * sign;
      elements.push(
        <ellipse
          key={`out-${mirror}-${i}`}
          cx={p.x} cy={p.y} rx={leafLen} ry={leafW}
          fill={color} fillOpacity="0.18"
          stroke={color} strokeOpacity="0.85" strokeWidth="0.9"
          transform={`rotate(${outAngle} ${p.x} ${p.y}) translate(${leafLen * 0.6} 0)`}
        />
      );
      elements.push(
        <ellipse
          key={`in-${mirror}-${i}`}
          cx={p.x} cy={p.y} rx={leafLen * 0.9} ry={leafW * 0.85}
          fill={color} fillOpacity="0.14"
          stroke={color} strokeOpacity="0.8" strokeWidth="0.8"
          transform={`rotate(${inAngle} ${p.x} ${p.y}) translate(${leafLen * 0.55} 0)`}
        />
      );
    });

    return elements;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      {buildBranch(false)}
      {buildBranch(true)}
      {/* Nœud / ruban au bas, jonction des deux branches */}
      <path d="M 182 360 Q 200 372 218 360" fill="none"
            stroke={color} strokeOpacity="0.9" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M 186 366 Q 200 378 214 366" fill="none"
            stroke={color} strokeOpacity="0.85" strokeWidth="1.3" strokeLinecap="round" />
      {/* Rubans qui pendent */}
      <path d="M 188 372 Q 184 385 178 392 L 172 388 Q 180 380 184 372 Z"
            fill={color} fillOpacity="0.18" stroke={color} strokeOpacity="0.75" strokeWidth="0.9" />
      <path d="M 212 372 Q 216 385 222 392 L 228 388 Q 220 380 216 372 Z"
            fill={color} fillOpacity="0.18" stroke={color} strokeOpacity="0.75" strokeWidth="0.9" />
    </svg>
  );
};