/**
 * @component PrintableFramework
 * @description Référentiel de compétences imprimable (PDF A4). Utilise le terme
 *              "Observateur" (et non "Évaluateur") et inclut une colonne vide
 *              pour appréciation manuscrite.
 * @access Bouton Export PDF (Responsable Club, Coach, Super Admin)
 * @features
 *  - Mise en page A4 portrait avec entête MATCHS360
 *  - Colonnes : Compétence | Définition | Appréciation (vide) | Note
 *  - Logo club converti en base64 (useImageAsBase64)
 *  - Section objectifs fusionnée (1 colonne globale)
 *  - Terminologie "Observateur" (mem://features/framework-printable-pdf)
 * @maintenance
 *  - Identité PDF : mem://style/pdf-reports-identity
 *  - Spécifications : mem://features/framework-printable-pdf
 */
import { forwardRef } from "react";
import { useImageAsBase64 } from "@/hooks/useImageAsBase64";

// Couleurs alignées avec l'identité applicative (light mode)
// --accent (MATCHS, orange) : hsl(13 65% 52%) ≈ #D24E2A
// --secondary-foreground (360, navy) : hsl(224 76% 24%) ≈ #0F2466
// --primary (radar) : hsl(224 76% 33%) ≈ #163A9E
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

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
}

interface PrintableFrameworkProps {
  frameworkName: string;
  teamName: string;
  clubName: string;
  clubLogoUrl?: string | null;
  themes: Theme[];
}

export const PrintableFramework = forwardRef<HTMLDivElement, PrintableFrameworkProps>(
  ({ frameworkName, teamName, clubName, clubLogoUrl, themes }, ref) => {
    const totalSkills = themes.reduce((sum, t) => sum + t.skills.length, 0);
    // Pré-charge le logo en base64 pour fiabiliser l'export PDF.
    const clubLogoSrc = useImageAsBase64(clubLogoUrl);

    return (
      <div ref={ref} className="print-framework bg-white text-black" style={{ width: "210mm", margin: "0 auto" }}>
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 12mm 10mm; margin-top: 8mm; margin-bottom: 8mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-framework { width: 100% !important; }
            .print-no-break { break-inside: avoid; }
          }
          .print-framework * { font-family: 'Segoe UI', Arial, sans-serif; box-sizing: border-box; }
        `}</style>

        {/* Header */}
        <div style={{ borderBottom: "3px solid #3B82F6", paddingBottom: "14px", marginBottom: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
            <Activity style={{ width: "30px", height: "30px", color: "#3B82F6" }} />
            <span style={{ fontSize: "20px", fontWeight: 700, color: "#3B82F6", letterSpacing: "1.5px" }}>MATCHS360</span>
            {clubLogoSrc && (
              <img
                src={clubLogoSrc}
                alt={clubName}
                crossOrigin="anonymous"
                style={{ width: "32px", height: "32px", objectFit: "contain", marginLeft: "auto" }}
              />
            )}
          </div>
          <h1 style={{ fontSize: "28px", fontWeight: 700, margin: "0 0 10px 0", lineHeight: 1.2 }}>{frameworkName}</h1>
          <div style={{ fontSize: "12px", color: "#6B7280", lineHeight: 1.8 }}>
            {clubName} — {teamName}<br />
            {themes.length} thématiques — {totalSkills} compétences<br />
            Généré le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>

        {/* Player identity zone */}
        <div className="print-no-break" style={{ border: "1px solid #D1D5DB", borderRadius: "6px", padding: "12px 16px", marginBottom: "20px", display: "flex", gap: "24px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Nom & Prénom</div>
            <div style={{ borderBottom: "1px solid #E5E7EB", height: "24px" }}></div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Date</div>
            <div style={{ borderBottom: "1px solid #E5E7EB", height: "24px" }}></div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "11px", color: "#6B7280", marginBottom: "4px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>Observateur</div>
            <div style={{ borderBottom: "1px solid #E5E7EB", height: "24px" }}></div>
          </div>
        </div>

        {/* Themes */}
        {themes
          .sort((a, b) => a.order_index - b.order_index)
          .map((theme, themeIndex) => (
            <div key={theme.id} className="print-no-break" style={{ marginBottom: "20px" }}>
              {/* Theme header */}
              <div style={{
                background: theme.color || "#3B82F6",
                color: "white",
                padding: "8px 14px",
                borderRadius: "6px 6px 0 0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{ fontSize: "14px", fontWeight: 700 }}>
                  {themeIndex + 1}. {theme.name}
                </span>
                <span style={{ fontSize: "11px", opacity: 0.9 }}>
                  {theme.skills.length} compétence{theme.skills.length > 1 ? "s" : ""}
                </span>
              </div>

              {/* Skills table */}
              <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #D1D5DB", borderTop: "none" }}>
                <thead>
                  <tr style={{ backgroundColor: "#F3F4F6" }}>
                    <th style={{ textAlign: "left", padding: "6px 10px", fontSize: "10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", width: "35%" }}>Compétence</th>
                    <th style={{ textAlign: "left", padding: "6px 10px", fontSize: "10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", width: "40%" }}>Définition</th>
                    <th style={{ textAlign: "center", padding: "6px 10px", fontSize: "10px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", width: "25%" }}>Appréciation</th>
                  </tr>
                </thead>
                <tbody>
                  {theme.skills
                    .sort((a, b) => a.order_index - b.order_index)
                    .map((skill, skillIndex) => (
                      <>
                        {/* Row for each skill */}
                        <tr key={skill.id} style={{ borderBottom: "1px solid #E5E7EB" }}>
                          <td style={{ padding: "8px 10px", fontSize: "12px", fontWeight: 600, verticalAlign: "top" }}>
                            {skill.name}
                          </td>
                          <td style={{ padding: "8px 10px", fontSize: "11px", color: "#4B5563", verticalAlign: "top", lineHeight: 1.4 }}>
                            {skill.definition || <span style={{ color: "#9CA3AF", fontStyle: "italic" }}>—</span>}
                          </td>
                          <td style={{ padding: "8px 10px", verticalAlign: "top" }}>
                            <div style={{ minHeight: "28px" }}></div>
                          </td>
                        </tr>
                      </>
                    ))}
                </tbody>
              </table>

              {/* Objectifs de la thématique */}
              <div style={{
                border: "1px solid #D1D5DB",
                borderTop: "none",
                borderRadius: "0 0 6px 6px",
                padding: "10px 14px",
                backgroundColor: "#F9FAFB",
              }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#374151", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  🎯 Objectifs / Pour s'améliorer — {theme.name}
                </div>
                <div style={{ borderBottom: "1px dotted #D1D5DB", minHeight: "22px" }}></div>
                <div style={{ borderBottom: "1px dotted #D1D5DB", minHeight: "22px", marginTop: "2px" }}></div>
                <div style={{ borderBottom: "1px dotted #D1D5DB", minHeight: "22px", marginTop: "2px" }}></div>
              </div>
            </div>
          ))}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #E5E7EB", paddingTop: "8px", marginTop: "20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <Activity style={{ width: "12px", height: "12px", color: "#3B82F6" }} />
            <span style={{ fontSize: "9px", color: "#9CA3AF", fontWeight: 600 }}>MATCHS360</span>
          </div>
        </div>
      </div>
    );
  }
);

PrintableFramework.displayName = "PrintableFramework";
