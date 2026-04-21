/**
 * @component PrintableRadarChart
 * @description Radar SVG pur (sans recharts) optimisé pour rendu PDF. Génère un
 *              graphe déterministe sans dépendance runtime, idéal pour html2canvas.
 * @props
 *  - datasets: ComparisonDataset[] — un ou plusieurs datasets superposés
 *  - size?: number — taille du SVG en pixels
 * @features
 *  - Calcul manuel des coordonnées polaires (sin/cos)
 *  - Styles inline pour fidélité PDF (pas de Tailwind requis)
 *  - Support multi-datasets (comparaison Coach/Auto/Supporter)
 * @maintenance
 *  - Utilisé par PrintablePlayerSheet pour export PDF
 *  - SVG embarqué = rendu fiable html2canvas (mem://style/pdf-reports-identity)
 */
interface RadarDataPoint {
  theme: string;
  score: number;
  color: string;
}

interface ComparisonDataset {
  label: string;
  data: RadarDataPoint[];
  color: string;
}

interface PrintableRadarChartProps {
  data: RadarDataPoint[];
  comparisonDatasets?: ComparisonDataset[];
}

export const PrintableRadarChart = ({ data, comparisonDatasets = [] }: PrintableRadarChartProps) => {
  const viewBoxSize = 600;
  const center = viewBoxSize / 2;
  const radius = 150;
  const levels = 5;
  const angleStep = (2 * Math.PI) / data.length;

  const getPolygonPoints = (level: number) => {
    return data
      .map((_, index) => {
        const angle = index * angleStep - Math.PI / 2;
        const r = (radius * level) / levels;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  const getDataPolygonPoints = (dataset: RadarDataPoint[]) => {
    return dataset
      .map((item, index) => {
        const angle = index * angleStep - Math.PI / 2;
        const r = (radius * item.score) / levels;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  const getLabelPosition = (index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = radius + 70;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y, angle };
  };

  const getDotPosition = (index: number, score: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (radius * score) / levels;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const getLevelLabelPosition = (level: number) => {
    const angle = -Math.PI / 2;
    const r = (radius * level) / levels;
    const x = center + r * Math.cos(angle) + 12;
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const hasComparisons = comparisonDatasets.length > 0;

  return (
    <div>
      <svg 
        width="100%" 
        height="100%" 
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} 
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Background grid levels */}
        {[1, 2, 3, 4, 5].map((level) => (
          <polygon
            key={level}
            points={getPolygonPoints(level)}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="1"
          />
        ))}

        {/* Axis lines */}
        {data.map((_, index) => {
          const angle = index * angleStep - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return (
            <line
              key={index}
              x1={center}
              y1={center}
              x2={x2}
              y2={y2}
              stroke="#d1d5db"
              strokeWidth="1"
            />
          );
        })}

        {/* Level labels */}
        {[1, 2, 3, 4, 5].map((level) => {
          const { x, y } = getLevelLabelPosition(level);
          return (
            <text key={level} x={x} y={y} fontSize="12" fill="#9ca3af" dominantBaseline="middle">
              {level}
            </text>
          );
        })}

        {/* Comparison datasets (behind main) */}
        {comparisonDatasets.map((dataset, dsIndex) => (
          <g key={dsIndex}>
            <polygon
              points={getDataPolygonPoints(dataset.data)}
              fill={`${dataset.color}15`}
              stroke={dataset.color}
              strokeWidth="1.5"
              strokeDasharray="6,3"
            />
            {dataset.data.map((item, index) => {
              const { x, y } = getDotPosition(index, item.score);
              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill={dataset.color}
                  stroke="white"
                  strokeWidth="1.5"
                />
              );
            })}
          </g>
        ))}

        {/* Main data polygon */}
        <polygon
          points={getDataPolygonPoints(data)}
          fill="rgba(59, 130, 246, 0.25)"
          stroke="#3B82F6"
          strokeWidth="2"
        />

        {/* Main data points */}
        {data.map((item, index) => {
          const { x, y } = getDotPosition(index, item.score);
          return (
            <circle
              key={index}
              cx={x}
              cy={y}
              r="5"
              fill="#3B82F6"
              stroke="white"
              strokeWidth="2"
            />
          );
        })}

        {/* Labels */}
        {data.map((item, index) => {
          const { x, y } = getLabelPosition(index);
          const textAnchor =
            x < center - 20 ? "end" : x > center + 20 ? "start" : "middle";

          const words = item.theme.split(" ");
          const lines: string[] = [];
          let current = "";
          for (const word of words) {
            if (current && (current + " " + word).length > 18) {
              lines.push(current);
              current = word;
            } else {
              current = current ? current + " " + word : word;
            }
          }
          if (current) lines.push(current);

          const lineHeight = 16;
          const startY = y - ((lines.length - 1) * lineHeight) / 2;

          return (
            <text
              key={index}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize="13"
              fill={item.color}
              fontWeight="600"
            >
              {lines.map((line, i) => (
                <tspan key={i} x={x} y={startY + i * lineHeight}>
                  {line}
                </tspan>
              ))}
            </text>
          );
        })}
      </svg>

      {/* Legend for comparisons */}
      {hasComparisons && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", justifyContent: "center", marginTop: "4px", fontSize: "11px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <div style={{ width: "16px", height: "3px", backgroundColor: "#3B82F6", borderRadius: "2px" }} />
            <span style={{ color: "#374151" }}>Actuel</span>
          </div>
          {comparisonDatasets.map((ds, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <div style={{ width: "16px", height: "3px", backgroundColor: ds.color, borderRadius: "2px", borderTop: "1px dashed " + ds.color }} />
              <span style={{ color: "#6b7280" }}>{ds.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
