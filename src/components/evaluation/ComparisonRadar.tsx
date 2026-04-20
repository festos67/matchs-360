import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  
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

// Predefined colors for comparison datasets — brightened for dark mode contrast
const COMPARISON_COLORS = [
  "#9CA3AF", // Gray-400 (lighter than 500)
  "#FB923C", // Orange-400
  "#22D3EE", // Cyan-400
  "#A78BFA", // Violet-400
  "#F87171", // Red-400
];

export const ComparisonRadar = ({
  datasets,
  primaryColor = "hsl(226, 72%, 48%)",
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
      <div className="h-[350px] relative radar-themed">
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={mergedData}>
            <PolarGrid
              stroke="hsl(var(--border))"
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="theme"
              tick={{
                fill: "hsl(var(--foreground))",
                fontSize: 11,
                fontWeight: 600,
              }}
              tickLine={{ stroke: "hsl(var(--border))" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{
                fill: "hsl(var(--muted-foreground))",
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
                  r: 3.5,
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
                fillOpacity={0.25}
                strokeWidth={2.5}
                dot={{
                  r: 4,
                  fill: currentDataset.color || primaryColor,
                  strokeWidth: 0,
                }}
                activeDot={{
                  r: 6,
                  fill: currentDataset.color || primaryColor,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2,
                }}
                isAnimationActive={animated}
                animationDuration={500}
                animationEasing="ease-out"
              />
            )}
            
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.4)",
              }}
              labelStyle={{
                color: "hsl(var(--popover-foreground))",
                fontWeight: 600,
                marginBottom: "4px",
              }}
              itemStyle={{
                color: "hsl(var(--muted-foreground))",
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
