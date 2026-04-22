/**
 * @component RadarPulseLogo
 * @description Logo MATCHS360 — radar polygonal SVG avec animation "onde
 *              propagée" (3 anneaux concentriques qui pulsent en décalé :
 *              0s / 0.3s / 0.6s) et courbe ECG navy statique au centre.
 * @props
 *  - size?: number (px, défaut 56) — largeur/hauteur du SVG
 *  - className?: string — classes additionnelles sur le wrapper
 * @usage
 *  <RadarPulseLogo size={56} />
 * @maintenance
 *  Couleurs alignées sur le design system (HSL via tokens primary/foreground).
 *  Animation : voir keyframes radar-wave inline (transform-origin centré).
 */

interface RadarPulseLogoProps {
  size?: number;
  className?: string;
}

export const RadarPulseLogo = ({ size = 56, className }: RadarPulseLogoProps) => {
  const polygon = (radius: number) => {
    const sides = 8;
    const pts: string[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      pts.push(`${100 + radius * Math.cos(angle)},${100 + radius * Math.sin(angle)}`);
    }
    return pts.join(" ");
  };

  const axisLines = () => {
    const sides = 8;
    const r = 80;
    return Array.from({ length: sides }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
      return (
        <line
          key={i}
          x1="100"
          y1="100"
          x2={100 + r * Math.cos(angle)}
          y2={100 + r * Math.sin(angle)}
          stroke="hsl(var(--primary))"
          strokeOpacity="0.35"
          strokeWidth="0.6"
        />
      );
    });
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="MATCHS360"
      role="img"
    >
      <style>{`
        @keyframes radar-wave {
          0%, 100% { transform: scale(1);    opacity: 0.55; }
          50%      { transform: scale(1.08); opacity: 1;    }
        }
        .rpl-ring {
          transform-origin: 100px 100px;
          animation: radar-wave 2.4s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .rpl-ring-1 { animation-delay: 0s;   }
        .rpl-ring-2 { animation-delay: 0.3s; }
        .rpl-ring-3 { animation-delay: 0.6s; }
      `}</style>

      <g>{axisLines()}</g>

      <polygon
        className="rpl-ring rpl-ring-1"
        points={polygon(32)}
        fill="hsl(var(--primary))"
        fillOpacity="0.08"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <polygon
        className="rpl-ring rpl-ring-2"
        points={polygon(56)}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.55"
        strokeWidth="1"
      />
      <polygon
        className="rpl-ring rpl-ring-3"
        points={polygon(80)}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeOpacity="0.55"
        strokeWidth="1"
      />

      <polyline
        points="55,100 85,100 95,75 105,125 115,100 145,100"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};