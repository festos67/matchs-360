interface RadarDataPoint {
  theme: string;
  score: number;
  color: string;
}

interface PrintableRadarChartProps {
  data: RadarDataPoint[];
  size?: number;
}

export const PrintableRadarChart = ({ data, size = 200 }: PrintableRadarChartProps) => {
  const center = size / 2;
  const radius = size * 0.4;
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

  // Calculate label positions
  const getLabelPosition = (index: number) => {
    const angle = index * angleStep - Math.PI / 2;
    const r = radius + 20;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
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
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="mx-auto">
      {/* Background grid levels */}
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={getPolygonPoints(level)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
          strokeDasharray={level < 5 ? "2,2" : "0"}
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
        fill="rgba(59, 130, 246, 0.25)"
        stroke="#3B82F6"
        strokeWidth="2"
      />

      {/* Data points */}
      {data.map((item, index) => {
        const { x, y } = getDotPosition(index, item.score);
        return (
          <circle
            key={index}
            cx={x}
            cy={y}
            r="4"
            fill={item.color}
            stroke="white"
            strokeWidth="1"
          />
        );
      })}

      {/* Labels */}
      {data.map((item, index) => {
        const { x, y } = getLabelPosition(index);
        const textAnchor =
          x < center - 10 ? "end" : x > center + 10 ? "start" : "middle";
        const truncatedName =
          item.theme.length > 12 ? item.theme.slice(0, 12) + "..." : item.theme;

        return (
          <text
            key={index}
            x={x}
            y={y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize="9"
            fill="#374151"
            fontWeight="500"
          >
            {truncatedName}
          </text>
        );
      })}

      {/* Level labels */}
      {[1, 2, 3, 4, 5].map((level) => {
        const y = center - (radius * level) / levels;
        return (
          <text
            key={level}
            x={center + 3}
            y={y + 3}
            fontSize="7"
            fill="#9ca3af"
          >
            {level}
          </text>
        );
      })}
    </svg>
  );
};
