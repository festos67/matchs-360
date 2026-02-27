interface RadarDataPoint {
  theme: string;
  score: number;
  color: string;
}

interface PrintableRadarChartProps {
  data: RadarDataPoint[];
}

export const PrintableRadarChart = ({ data }: PrintableRadarChartProps) => {
  const viewBoxSize = 600;
  const center = viewBoxSize / 2;
  const radius = 150;
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
    const r = radius + 50;
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

  // Get level label position on axis
  const getLevelLabelPosition = (level: number) => {
    const angle = -Math.PI / 2; // Top axis
    const r = (radius * level) / levels;
    const x = center + r * Math.cos(angle) + 12;
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  return (
    <svg 
      width="100%" 
      height="100%" 
      viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`} 
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Background grid levels - light gray lines */}
      {[1, 2, 3, 4, 5].map((level) => (
        <polygon
          key={level}
          points={getPolygonPoints(level)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth="1"
        />
      ))}

      {/* Axis lines from center */}
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

      {/* Level labels on first axis (0-5) */}
      {[1, 2, 3, 4, 5].map((level) => {
        const { x, y } = getLevelLabelPosition(level);
        return (
          <text
            key={level}
            x={x}
            y={y}
            fontSize="12"
            fill="#9ca3af"
            dominantBaseline="middle"
          >
            {level}
          </text>
        );
      })}

      {/* Data polygon fill - coral/red like the reference */}
      <polygon
        points={getDataPolygonPoints()}
        fill="rgba(239, 68, 68, 0.6)"
        stroke="#EF4444"
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
            r="5"
            fill="#EF4444"
            stroke="white"
            strokeWidth="2"
          />
        );
      })}

      {/* Labels with theme colors */}
      {data.map((item, index) => {
        const { x, y } = getLabelPosition(index);
        const textAnchor =
          x < center - 20 ? "end" : x > center + 20 ? "start" : "middle";

        return (
          <text
            key={index}
            x={x}
            y={y}
            textAnchor={textAnchor}
            dominantBaseline="middle"
            fontSize="14"
            fill={item.color}
            fontWeight="500"
          >
            {item.theme}
          </text>
        );
      })}
    </svg>
  );
};
