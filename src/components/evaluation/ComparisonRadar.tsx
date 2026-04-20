import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
  
} from "recharts";
import { useEffect, useState } from "react";

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

// Palettes éloignées colorimétriquement du fond pour ressortir
// Light mode (fond clair ~ blanc) → couleurs saturées et sombres
const COMPARISON_COLORS_LIGHT = [
  "#1F2937", // Gray-800
  "#EA580C", // Orange-600
  "#0891B2", // Cyan-600
  "#7C3AED", // Violet-600
  "#DC2626", // Red-600
];
// Dark mode (fond sombre ~ slate-950) → couleurs vives, lumineuses, hautement saturées
const COMPARISON_COLORS_DARK = [
  "#F8FAFC", // Slate-50 (presque blanc)
  "#FB923C", // Orange-400 vif
  "#22D3EE", // Cyan-400 lumineux
  "#A78BFA", // Violet-400 lumineux
  "#F472B6", // Pink-400 (au lieu de rouge, plus distinct du fond)
];

const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return isDark;
};

// Convertit une couleur sombre fournie par dataset en variante lumineuse en mode sombre
const adaptColorForDark = (hex: string): string => {
  // Couleurs MATCHS360 / app — on remappe les sombres vers des variantes vives
  const map: Record<string, string> = {
    "#3B82F6": "#60A5FA", // primary blue → blue-400
    "#1E40AF": "#93C5FD", // dark blue
    "#226FCC": "#7DD3FC", // approx primary
    "#1F2937": "#F8FAFC",
    "#0F172A": "#F8FAFC",
    "#000000": "#F8FAFC",
  };
  return map[hex.toUpperCase()] || hex;
};

export const ComparisonRadar = ({
  datasets,
  primaryColor,
  animated = true,
}: ComparisonRadarProps) => {
  if (datasets.length === 0) return null;
  const isDark = useIsDarkMode();
  const COMPARISON_COLORS = isDark ? COMPARISON_COLORS_DARK : COMPARISON_COLORS_LIGHT;
  const effectivePrimary = primaryColor || (isDark ? "#60A5FA" : "hsl(226, 72%, 48%)");
  const adapt = (c: string | undefined) => (isDark && c ? adaptColorForDark(c) : c);

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
              stroke="hsl(var(--muted-foreground) / 0.5)"
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="theme"
              tick={{
                fill: "hsl(var(--foreground))",
                fontSize: 12,
                fontWeight: 700,
              }}
              tickLine={{ stroke: "hsl(var(--muted-foreground) / 0.5)" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{
                fill: "hsl(var(--foreground))",
                fontSize: 11,
                fontWeight: 600,
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
                stroke={adapt(dataset.color) || COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                fill={adapt(dataset.color) || COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                fillOpacity={0.08}
                strokeWidth={2.75}
                strokeDasharray="5 5"
                dot={{
                  r: 4,
                  fill: adapt(dataset.color) || COMPARISON_COLORS[index % COMPARISON_COLORS.length],
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
                stroke={adapt(currentDataset.color) || effectivePrimary}
                fill={adapt(currentDataset.color) || effectivePrimary}
                fillOpacity={0.4}
                strokeWidth={3.25}
                dot={{
                  r: 5,
                  fill: adapt(currentDataset.color) || effectivePrimary,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 1.5,
                }}
                activeDot={{
                  r: 7,
                  fill: adapt(currentDataset.color) || effectivePrimary,
                  stroke: "hsl(var(--background))",
                  strokeWidth: 2.5,
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
