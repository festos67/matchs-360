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
            background: "#ffffff",
          }}
        >
          {/* Cadre épuré : un seul filet fin */}
          <div style={{
            position: "absolute", inset: "12mm",
            border: `1px solid ${accent}`,
            pointerEvents: "none",
          }} />

          {/* Contenu principal */}
          <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "8mm 14mm" }}>
            {/* Top bar : Logo MATCHS360 (gauche) + Club (droite) */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10mm" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <RadarLogoSvg color={accent} size={42} />
                <span style={{ fontSize: "18px", fontWeight: 700, letterSpacing: "0.18em", color: accent, fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                  MATCHS360
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {clubLogoSrc && (
                  <img src={clubLogoSrc} alt={clubName} crossOrigin="anonymous"
                       style={{ width: "40px", height: "40px", objectFit: "contain" }} />
                )}
                <span style={{ fontSize: "12px", fontWeight: 600, color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.14em", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                  {clubName}
                </span>
              </div>
            </div>

            {/* Titre */}
            <div style={{ textAlign: "center", marginBottom: "6mm" }}>
              <div style={{
                fontSize: "10px", color: accent, letterSpacing: "0.4em",
                fontWeight: 600, textTransform: "uppercase", marginBottom: "8px",
                fontFamily: "'Helvetica Neue', Arial, sans-serif",
              }}>
                Attestation
              </div>
              <h1 style={{
                fontSize: "40px", fontWeight: 400, color: accent,
                margin: 0, letterSpacing: "0.01em", fontStyle: "italic",
              }}>
                Attestation de compétences
              </h1>
              <div style={{
                width: "60px", height: "1px", background: accent,
                margin: "10px auto 0",
              }} />
            </div>

            {/* Décerné à */}
            <div style={{ textAlign: "center", marginBottom: "8mm" }}>
              <div style={{ fontSize: "11px", color: TEXT_MUTED, marginBottom: "6px", letterSpacing: "0.2em", textTransform: "uppercase", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                Décernée à
              </div>
              <div style={{ fontSize: "32px", fontWeight: 700, color: TEXT_DARK, letterSpacing: "0.02em" }}>
                {playerName}
              </div>
              {accompanimentPeriod && (
                <div style={{ fontSize: "12px", color: TEXT_MUTED, marginTop: "6px", fontStyle: "italic" }}>
                  Durée d'observation : {accompanimentPeriod}
                </div>
              )}
            </div>

            {/* Corps : compétences + radar */}
            <div style={{ display: "flex", gap: "12mm", flex: 1, minHeight: 0, alignItems: "stretch" }}>
              <div style={{ flex: radarData ? "1.4" : "1", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: accent, textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: "8px", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                  Compétences observées
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {competences.map((c, i) => (
                    <div key={i}>
                      <span style={{ fontSize: "12px", fontWeight: 700, color: TEXT_DARK }}>
                        {c.name}
                      </span>
                      {c.definition && (
                        <span style={{ fontSize: "11px", color: "#1f2937", lineHeight: 1.5 }}>
                          {" — "}{c.definition}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                {additionalMessage && (
                  <div style={{
                    marginTop: "8mm",
                    fontSize: "11px", color: TEXT_DARK, lineHeight: 1.6,
                    whiteSpace: "pre-wrap", fontStyle: "italic",
                  }}>
                    {additionalMessage}
                  </div>
                )}
              </div>
              {radarData && (
                <div style={{ flex: "1", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: "100%", maxWidth: "90mm" }}>
                    <PrintableRadarChart data={radarData} />
                  </div>
                </div>
              )}
            </div>

            {/* Pied : garant + date */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "8mm" }}>
              <div>
                <div style={{ fontSize: "9px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                  Garant
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_DARK, borderTop: `1px solid ${accent}`, paddingTop: "4px", marginTop: "3px", minWidth: "70mm" }}>
                  {guarantorName}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "9px", color: TEXT_MUTED, textTransform: "uppercase", letterSpacing: "0.18em", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                  Date
                </div>
                <div style={{ fontSize: "13px", fontWeight: 600, color: TEXT_DARK, borderTop: `1px solid ${accent}`, paddingTop: "4px", marginTop: "3px", minWidth: "60mm" }}>
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