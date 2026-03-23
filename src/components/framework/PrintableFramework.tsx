import { forwardRef } from "react";
import { Activity } from "lucide-react";

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
  themes: Theme[];
}

export const PrintableFramework = forwardRef<HTMLDivElement, PrintableFrameworkProps>(
  ({ frameworkName, teamName, clubName, themes }, ref) => {
    const totalSkills = themes.reduce((sum, t) => sum + t.skills.length, 0);

    return (
      <div ref={ref} className="print-framework bg-white text-black" style={{ width: "210mm", margin: "0 auto" }}>
        <style>{`
          @media print {
            @page { size: A4 portrait; margin: 12mm 10mm; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .print-framework { width: 100% !important; }
            .print-no-break { break-inside: avoid; }
          }
          .print-framework * { font-family: 'Segoe UI', Arial, sans-serif; box-sizing: border-box; }
        `}</style>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "3px solid #3B82F6", paddingBottom: "12px", marginBottom: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <Activity style={{ width: "20px", height: "20px", color: "#3B82F6" }} />
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#3B82F6", letterSpacing: "1px" }}>MATCHS360</span>
            </div>
            <h1 style={{ fontSize: "22px", fontWeight: 700, margin: 0, lineHeight: 1.3 }}>{frameworkName}</h1>
            <p style={{ fontSize: "12px", color: "#6B7280", margin: "4px 0 0 0" }}>
              {teamName} • {clubName}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "11px", color: "#6B7280" }}>{themes.length} thématiques • {totalSkills} compétences</div>
            <div style={{ fontSize: "11px", color: "#6B7280", marginTop: "2px" }}>
              Généré le {new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
            </div>
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
          <span style={{ fontSize: "9px", color: "#9CA3AF" }}>
            {frameworkName} — {teamName}
          </span>
        </div>
      </div>
    );
  }
);

PrintableFramework.displayName = "PrintableFramework";
