/**
 * @component LogoDemo
 * @description Page de prévisualisation isolée pour comparer le logo cercle
 *              actuel et la variante radar avec animation "onde propagée".
 *              Route publique : /logo-demo
 */

const RadarPulseLogo = ({ size = 160 }: { size?: number }) => {
  // Octogone régulier centré (cx=100, cy=100), rayon donné
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
          stroke="hsl(217, 60%, 80%)"
          strokeWidth="0.6"
          opacity="0.5"
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
      style={{ overflow: "visible" }}
    >
      <style>{`
        @keyframes radar-wave {
          0%, 100% { transform: scale(1); opacity: 0.55; }
          50%      { transform: scale(1.08); opacity: 1; }
        }
        .ring {
          transform-origin: 100px 100px;
          animation: radar-wave 2.4s ease-in-out infinite;
          will-change: transform, opacity;
        }
        .ring-1 { animation-delay: 0s; }
        .ring-2 { animation-delay: 0.3s; }
        .ring-3 { animation-delay: 0.6s; }
        .axes   { transform-origin: 100px 100px; opacity: 0.5; }
      `}</style>

      {/* Axes radiaux (statiques) */}
      <g className="axes">{axisLines()}</g>

      {/* Anneau intérieur */}
      <polygon
        className="ring ring-1"
        points={polygon(32)}
        fill="hsl(217, 91%, 60%)"
        fillOpacity="0.06"
        stroke="hsl(217, 70%, 70%)"
        strokeWidth="1"
      />
      {/* Anneau médian */}
      <polygon
        className="ring ring-2"
        points={polygon(56)}
        fill="none"
        stroke="hsl(217, 70%, 72%)"
        strokeWidth="1"
      />
      {/* Anneau extérieur */}
      <polygon
        className="ring ring-3"
        points={polygon(80)}
        fill="none"
        stroke="hsl(217, 70%, 75%)"
        strokeWidth="1"
      />

      {/* Pulse ECG centrale (statique, navy) */}
      <polyline
        points="55,100 85,100 95,75 105,125 115,100 145,100"
        fill="none"
        stroke="hsl(222, 75%, 30%)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const CirclePulseLogo = ({ size = 160 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
    <style>{`
      @keyframes circle-pulse {
        0%, 100% { r: 70; opacity: 0.55; }
        50%      { r: 78; opacity: 1; }
      }
      .c1 { animation: circle-pulse 2.4s ease-in-out infinite; }
    `}</style>
    <circle cx="100" cy="100" r="70" fill="hsl(217, 91%, 70%)" fillOpacity="0.25" className="c1" />
    <polyline
      points="55,100 85,100 95,75 105,125 115,100 145,100"
      fill="none"
      stroke="hsl(222, 75%, 30%)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function LogoDemo() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-12 p-8">
      <h1 className="text-2xl font-semibold text-foreground">Démo logo MATCHS360 — comparaison animations</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="flex flex-col items-center gap-4 p-8 rounded-xl border bg-card">
          <CirclePulseLogo size={180} />
          <p className="text-sm font-medium text-muted-foreground">Actuel — cercle qui pulse</p>
        </div>

        <div className="flex flex-col items-center gap-4 p-8 rounded-xl border bg-card">
          <RadarPulseLogo size={180} />
          <p className="text-sm font-medium text-muted-foreground">Variante — onde radar (delays 0 / 0.3s / 0.6s)</p>
        </div>
      </div>

      <div className="flex items-center gap-12 mt-4">
        <RadarPulseLogo size={64} />
        <RadarPulseLogo size={96} />
        <RadarPulseLogo size={128} />
        <RadarPulseLogo size={200} />
      </div>
      <p className="text-xs text-muted-foreground">Aperçu multi-tailles (TopBar, Auth, Splash)</p>
    </div>
  );
}