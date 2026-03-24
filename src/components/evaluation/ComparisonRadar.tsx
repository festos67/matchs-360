import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";

interface RadarDataPoint {
  theme: string;
  score: number;
  fullMark: number;
  color?: string;
}

interface ComparisonDataset {
  id: string;
  label: string;
  date: string;
  data: RadarDataPoint[];
  color: string;
  isCurrent?: boolean;
}

interface ComparisonRadarProps {
  datasets: ComparisonDataset[];
  primaryColor?: string;
  animated?: boolean;
}

// Predefined colors for comparison datasets
const COMPARISON_COLORS = [
  "#6B7280", // Gray
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#8B5CF6", // Purple
  "#EF4444", // Red
];

export const ComparisonRadar = ({
  datasets,
  primaryColor = "hsl(217, 91%, 60%)",
  animated = true,
}: ComparisonRadarProps) => {
  if (datasets.length === 0) return null;

  // Merge all datasets into unified data structure for recharts
  const themes = datasets[0]?.data.map(d => d.theme) || [];
  const mergedData = themes.map((theme, index) => {
    const point: Record<string, string | number> = { theme };
    datasets.forEach((dataset) => {
      const dataPoint = dataset.data.find(d => d.theme === theme);
      point[dataset.id] = dataPoint?.score || 0;
    });
    return point;
  });

  // Separate current from comparison datasets for rendering order
  const currentDataset = datasets.find(d => d.isCurrent);
  const comparisonDatasets = datasets.filter(d => !d.isCurrent);

  return (
    <div className="w-full">
      <div className="h-[350px] relative">
        {/* Glow effect behind radar */}
        <div 
          className="absolute inset-0 opacity-20 blur-3xl"
          style={{
            background: `radial-gradient(ellipse at center, ${primaryColor} 0%, transparent 70%)`,
          }}
        />
        
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={mergedData}>
            <PolarGrid
              stroke="hsl(220, 20%, 25%)"
              strokeDasharray="3 3"
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="theme"
              tick={{
                fill: "hsl(215, 20%, 65%)",
                fontSize: 11,
                fontWeight: 500,
              }}
              tickLine={{ stroke: "hsl(220, 20%, 25%)" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{
                fill: "hsl(215, 20%, 55%)",
                fontSize: 10,
              }}
              tickCount={6}
              axisLine={false}
            />
            
            {/* Render comparison datasets first (behind) */}
            {comparisonDatasets.map((dataset, index) => (
              <Radar
                key={dataset.id}
                name={dataset.label}
                dataKey={dataset.id}
                stroke={dataset.color || COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                fill="transparent"
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={{
                  r: 3,
                  fill: dataset.color || COMPARISON_COLORS[index % COMPARISON_COLORS.length],
                  strokeWidth: 0,
                }}
                isAnimationActive={animated}
                animationDuration={500}
                animationEasing="ease-out"
              />
            ))}
            
            {/* Render current dataset last (on top) */}
            {currentDataset && (
              <Radar
                name={currentDataset.label}
                dataKey={currentDataset.id}
                stroke={currentDataset.color || primaryColor}
                fill={currentDataset.color || primaryColor}
                fillOpacity={0.4}
                strokeWidth={2}
                dot={{
                  r: 4,
                  fill: currentDataset.color || primaryColor,
                  strokeWidth: 0,
                }}
                activeDot={{
                  r: 6,
                  fill: currentDataset.color || primaryColor,
                  stroke: "white",
                  strokeWidth: 2,
                }}
                isAnimationActive={animated}
                animationDuration={500}
                animationEasing="ease-out"
              />
            )}
            
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(220, 25%, 10%)",
                border: "1px solid hsl(220, 20%, 18%)",
                borderRadius: "8px",
                boxShadow: "0 4px 24px -4px rgba(0,0,0,0.4)",
              }}
              labelStyle={{
                color: "hsl(210, 40%, 98%)",
                fontWeight: 600,
                marginBottom: "4px",
              }}
              itemStyle={{
                color: "hsl(215, 20%, 65%)",
                padding: "2px 0",
              }}
              formatter={(value: number, name: string) => {
                const dataset = datasets.find(d => d.id === name);
                return [`${value.toFixed(1)} / 5`, dataset?.label || name];
              }}
            />

          </RechartsRadarChart>
        </ResponsiveContainer>
      </div>

      {/* Custom legend for better visibility */}
      {datasets.length > 1 && (
        <div className="flex flex-wrap justify-center gap-4 mt-4 pt-4 border-t border-border">
          {datasets.map((dataset) => (
            <div key={dataset.id} className="flex items-center gap-2">
              <div
                className="w-4 h-1 rounded-full"
                style={{
                  backgroundColor: dataset.color,
                  borderStyle: dataset.isCurrent ? "solid" : "dashed",
                }}
              />
              <span className="text-xs text-muted-foreground">
                {dataset.label}
                <span className="ml-1 text-muted-foreground/60">
                  ({new Date(dataset.date).toLocaleDateString("fr-FR", { 
                    day: "numeric", 
                    month: "short",
                    year: "2-digit"
                  })})
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
