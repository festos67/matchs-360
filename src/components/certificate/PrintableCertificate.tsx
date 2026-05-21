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
const LAUREL_LEAF = "#6b7a30";
const LAUREL_STEM = "#4a5520";
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
            <LaurelWreathSvg size={760} />
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
const LaurelWreathSvg = ({ size = 480 }: { size?: number }) => {
  // Deux branches symétriques en arc, 6 feuilles ovales pleines par branche,
  // disposées en éventail le long d'une tige courbe.
  const cx = 200;
  const baseY = 360; // jonction des deux tiges en bas

  const buildBranch = (mirror: boolean) => {
    const sign = mirror ? -1 : 1;
    const leafCount = 6;

    // Points le long d'une courbe quadratique (Bezier) qui part du bas-centre
    // et monte en s'écartant vers l'extérieur puis se recourbe vers le haut.
    const p0 = { x: cx, y: baseY };                          // bas, jonction
    const p1 = { x: cx + sign * 170, y: 230 };               // contrôle (extérieur)
    const p2 = { x: cx + sign * 60, y: 70 };                 // sommet

    const bezier = (t: number) => {
      const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
      const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
      // Dérivée pour la tangente
      const dx = 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
      const dy = 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
      const tangent = (Math.atan2(dy, dx) * 180) / Math.PI;
      return { x, y, tangent };
    };

    const stemD = `M ${p0.x} ${p0.y} Q ${p1.x} ${p1.y} ${p2.x} ${p2.y}`;
    const elements: JSX.Element[] = [
      <path
        key={`stem-${mirror}`}
        d={stemD}
        fill="none"
        stroke={LAUREL_STEM}
        strokeWidth="1.6"
        strokeLinecap="round"
      />,
    ];

    // Feuilles : éventail, de plus en plus tournées vers l'extérieur en montant
    for (let i = 0; i < leafCount; i++) {
      const t = 0.12 + (i / (leafCount - 1)) * 0.82;
      const { x, y, tangent } = bezier(t);
      const leafLen = 28 - i * 1.2;
      const leafW = 9 - i * 0.4;
      // Inclinaison : plus on monte, plus la feuille s'écarte de la tige
      const outwardTilt = 25 + i * 6; // 25° -> ~55°
      const angle = tangent - sign * outwardTilt;
      elements.push(
        <ellipse
          key={`leaf-${mirror}-${i}`}
          cx={x}
          cy={y}
          rx={leafLen}
          ry={leafW}
          fill={LAUREL_LEAF}
          transform={`rotate(${angle} ${x} ${y}) translate(${leafLen * 0.55} 0)`}
        />
      );
    }

    return elements;
  };

  return (
    <svg width={size} height={size} viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
      {buildBranch(false)}
      {buildBranch(true)}
    </svg>
  );
};