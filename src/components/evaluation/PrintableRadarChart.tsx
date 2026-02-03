interface RadarDataPoint {
  theme: string;
  score: number;
  color: string;
}

interface PrintableRadarChartProps {
  data: RadarDataPoint[];
}

export const PrintableRadarChart = ({ data }: PrintableRadarChartProps) => {
  // Use a larger viewBox to fit labels, actual render size controlled by container
  const viewBoxSize = 400;
  const center = viewBoxSize / 2;
  const radius = 100; // Fixed small radius to leave lots of room for labels
  const levels = 5;
  const angleStep = (2 * Math.PI) / data.length;

  // Calculate polygon points for a given level (1-5)
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

  // Calculate data polygon points
  const getDataPolygonPoints = () => {
    return data
      .map((item, index) => {
        const angle = index * angleStep - Math.PI / 2;
        const r = (radius * item.score) / levels;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  };

  // Calculate label positions - pushed much further out
  const getLabelPosition = (index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = radius + 55;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y, angle };
  };

  // Calculate dot positions
  const getDotPosition = (index: number, score: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = (radius * score) / levels;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  return (
    <svg 
      width="100%" 
      height="260" 
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
          strokeDasharray={level < 5 ? "3,3" : "0"}
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

      {/* Data polygon fill */}
      <polygon
        points={getDataPolygonPoints()}
        fill="rgba(59, 130, 246, 0.3)"
        stroke="#3B82F6"
        strokeWidth="2.5"
      />

      {/* Data points */}
      {data.map((item, index) => {
        const { x, y } = getDotPosition(index, item.score);
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="6"
            fill={item.color}
            stroke="white"
            strokeWidth="2"
          />
        );
      })}

      {/* Labels with colored dots */}
      {data.map((item, index) => {
        const { x, y } = getLabelPosition(index);
        const textAnchor =
          x < center - 20 ? "end" : x > center + 20 ? "start" : "middle";

        return (
          <g key={index}>
            {/* Colored indicator dot */}
            <circle
              cx={textAnchor === "end" ? x + 8 : textAnchor === "start" ? x - 8 : x}
              cy={y - 12}
              r="5"
              fill={item.color}
            />
            {/* Theme name - full name, larger font */}
            <text
              x={x}
              y={y + 4}
              textAnchor={textAnchor}
              dominantBaseline="middle"
              fontSize="14"
              fill="#111827"
              fontWeight="600"
            >
              {item.theme}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
