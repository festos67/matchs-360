/**
 * @component PrintableCertificate
 * @description Diplôme "Attestation de compétences" rendu hors-écran via
 *              forwardRef pour impression / export PDF (react-to-print).
 * @maintenance
 *  - Identité MATCHS360 : mem://style/pdf-reports-identity
 *  - Réutilise PrintableRadarChart pour cohérence avec PrintablePlayerSheet
 */
import { forwardRef } from "react";
import { Activity } from "lucide-react";
import { useImagesAsBase64 } from "@/hooks/useImageAsBase64";
import { PrintableRadarChart } from "@/components/evaluation/PrintableRadarChart";
import { calculateRadarData, type ThemeScores } from "@/lib/evaluation-utils";

const BRAND_BLUE = "#3B82F6";

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
    playerName, clubName, clubLogoUrl, clubPrimaryColor = BRAND_BLUE,
    guarantorName, accompanimentPeriod, competences,
    additionalMessage, radarThemeScores, radarLabel, date = new Date(),
  }, ref) => {
    const imageMap = useImagesAsBase64([clubLogoUrl]);
    const clubLogoSrc = clubLogoUrl ? imageMap[clubLogoUrl] ?? null : null;
    const radarData = radarThemeScores && radarThemeScores.length > 0 ? calculateRadarData(radarThemeScores) : null;

    return (
      <div
        ref={ref}
        className="bg-white text-black"
        style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", width: "297mm" }}
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
            padding: "14mm",
            boxSizing: "border-box",
            position: "relative",
            background: "#ffffff",
          }}
        >
          {/* Cadre décoratif */}
          <div style={{
            position: "absolute", inset: "10mm",
            border: `2px solid ${clubPrimaryColor}`, borderRadius: "6px",
            pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", inset: "12mm",
            border: `1px solid ${clubPrimaryColor}55`, borderRadius: "4px",
            pointerEvents: "none",
          }} />

          {/* Contenu principal */}
          <div style={{ position: "relative", height: "100%", display: "flex", flexDirection: "column", padding: "6mm 10mm" }}>
            {/* Top bar : MATCHS360 + Club */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8mm" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <div style={{
                  width: "36px", height: "36px", borderRadius: "10px",
                  background: `linear-gradient(135deg, ${BRAND_BLUE}, #6366f1)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Activity style={{ width: "22px", height: "22px", color: "white" }} />
                </div>
                <span style={{ fontSize: "20px", fontWeight: 800, letterSpacing: "0.08em", color: BRAND_BLUE }}>
                  MATCHS360
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {clubLogoSrc && (
                  <img src={clubLogoSrc} alt={clubName} crossOrigin="anonymous"
                       style={{ width: "44px", height: "44px", objectFit: "contain" }} />
                )}
                <span style={{ fontSize: "14px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {clubName}
                </span>
              </div>
            </div>

            {/* Titre */}
            <div style={{ textAlign: "center", marginBottom: "4mm" }}>
              <div style={{
                fontSize: "11px", color: clubPrimaryColor, letterSpacing: "0.3em",
                fontWeight: 700, textTransform: "uppercase", marginBottom: "4px",
              }}>
                Attestation
              </div>
              <h1 style={{
                fontSize: "38px", fontWeight: 900, color: "#0f172a",
                margin: 0, letterSpacing: "-0.01em",
              }}>
                Attestation de compétences
              </h1>
              <div style={{
                width: "80px", height: "3px", background: clubPrimaryColor,
                margin: "8px auto 0", borderRadius: "2px",
              }} />
            </div>

            {/* Décerné à */}
            <div style={{ textAlign: "center", marginBottom: "6mm" }}>
              <div style={{ fontSize: "12px", color: "#6b7280", marginBottom: "4px" }}>
                Décernée à
              </div>
              <div style={{ fontSize: "30px", fontWeight: 800, color: "#0f172a" }}>
                {playerName}
              </div>
              {accompanimentPeriod && (
                <div style={{ fontSize: "12px", color: "#475569", marginTop: "4px", fontStyle: "italic" }}>
                  Période d'accompagnement : {accompanimentPeriod}
                </div>
              )}
            </div>

            {/* Corps : compétences + radar */}
            <div style={{ display: "flex", gap: "10mm", flex: 1, minHeight: 0, alignItems: "stretch" }}>
              <div style={{ flex: radarData ? "1.4" : "1", display: "flex", flexDirection: "column" }}>
                <div style={{ fontSize: "12px", fontWeight: 700, color: clubPrimaryColor, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "6px" }}>
                  Compétences observées
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", alignContent: "flex-start" }}>
                  {competences.map((c, i) => (
                    <div key={i} style={{
                      border: `1px solid ${clubPrimaryColor}66`,
                      background: `${clubPrimaryColor}10`,
                      borderRadius: "8px", padding: "6px 9px",
                      maxWidth: "100%",
                    }}>
                      <div style={{ fontSize: "11px", fontWeight: 800, color: clubPrimaryColor }}>
                        {c.name}
                      </div>
                      {c.definition && (
                        <div style={{ fontSize: "9px", color: "#374151", marginTop: "2px", lineHeight: 1.3 }}>
                          {c.definition}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {additionalMessage && (
                  <div style={{ marginTop: "6mm" }}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "3px" }}>
                      Message
                    </div>
                    <div style={{
                      fontSize: "11px", color: "#1f2937", lineHeight: 1.5,
                      borderLeft: `3px solid ${clubPrimaryColor}`, paddingLeft: "8px",
                      whiteSpace: "pre-wrap",
                    }}>
                      {additionalMessage}
                    </div>
                  </div>
                )}
              </div>
              {radarData && (
                <div style={{ flex: "1", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "4px" }}>
                    {radarLabel || "Diagramme de compétences"}
                  </div>
                  <div style={{ width: "100%", maxWidth: "90mm" }}>
                    <PrintableRadarChart data={radarData} />
                  </div>
                </div>
              )}
            </div>

            {/* Pied : garant + date */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "6mm" }}>
              <div>
                <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Garant
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", borderTop: `1px solid ${clubPrimaryColor}`, paddingTop: "3px", marginTop: "2px", minWidth: "70mm" }}>
                  {guarantorName}
                </div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "10px", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Date
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a", borderTop: `1px solid ${clubPrimaryColor}`, paddingTop: "3px", marginTop: "2px", minWidth: "60mm" }}>
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