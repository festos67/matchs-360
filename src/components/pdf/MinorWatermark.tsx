/**
 * @component MinorWatermark
 * @description Phase 6 RGPD mineurs (A2-011). Bandeau pied de page rouge
 *              + watermark diagonal "CONFIDENTIEL" pour tout PDF/export
 *              contenant des donnees d'un mineur. A injecter dans
 *              PrintablePlayerSheet et PrintableCertificate.
 *
 *              Activation : la prop `isMinor` est calculee par le parent
 *              a partir de la date de naissance du joueur (cf. is_minor()
 *              SQL ou isMinorPhase0() cote client).
 */
import type { CSSProperties } from "react";

interface MinorWatermarkProps {
  isMinor: boolean;
  /** Layout du document support : "portrait" (A4 vertical) ou "landscape" */
  orientation?: "portrait" | "landscape";
}

const RED = "#B91C1C";

export function MinorWatermark({ isMinor, orientation = "portrait" }: MinorWatermarkProps) {
  if (!isMinor) return null;

  const overlayStyle: CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: "none",
    overflow: "hidden",
    zIndex: 50,
  };

  const diagonalStyle: CSSProperties = {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%) rotate(-30deg)",
    fontSize: orientation === "landscape" ? "140px" : "120px",
    fontWeight: 900,
    color: RED,
    opacity: 0.08,
    letterSpacing: "0.15em",
    whiteSpace: "nowrap",
    fontFamily: "system-ui, -apple-system, sans-serif",
    userSelect: "none",
  };

  const bannerStyle: CSSProperties = {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    background: RED,
    color: "white",
    padding: "6px 14px",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    textAlign: "center",
    fontFamily: "system-ui, -apple-system, sans-serif",
  };

  return (
    <div style={overlayStyle} aria-hidden="true">
      <div style={diagonalStyle}>CONFIDENTIEL</div>
      <div style={bannerStyle}>
        Document confidentiel — Donnees d'un mineur — Destruction obligatoire apres usage
      </div>
    </div>
  );
}