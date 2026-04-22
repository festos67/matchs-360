/**
 * @component ComparisonRadar
 * @description Diagramme radar comparatif multi-débriefs (recharts). Superpose
 *              jusqu'à 3 datasets (Coach officiel, Auto-débrief joueur, Supporter)
 *              sur le même graphe avec légende externe pour stabilité visuelle.
 * @props
 *  - datasets: ComparisonDataset[] — datasets à comparer (label, data, color)
 *  - maxScore?: number — échelle max (défaut 5)
 * @features
 *  - Légende externe pour éviter resize au toggle des couches
 *  - Tooltip personnalisé avec scores formatés
 *  - Couleurs configurables par dataset (HSL design tokens)
 * @maintenance
 *  - Stabilité visuelle : mem://technical/radar-chart-visual-stability
 *  - Capacités god view (Admin/Club Admin) : mem://features/admin/god-view-capabilities
 */
import { useEffect, useRef, useState, type ComponentType } from "react";
import * as RechartsPrimitive from "recharts";

const Radar = RechartsPrimitive.Radar as unknown as ComponentType<any>;
const RechartsRadarChart = RechartsPrimitive.RadarChart as unknown as ComponentType<any>;
const PolarGrid = RechartsPrimitive.PolarGrid as unknown as ComponentType<any>;
const PolarAngleAxis = RechartsPrimitive.PolarAngleAxis as unknown as ComponentType<any>;
const PolarRadiusAxis = RechartsPrimitive.PolarRadiusAxis as unknown as ComponentType<any>;
const ResponsiveContainer = RechartsPrimitive.ResponsiveContainer as unknown as ComponentType<any>;
const Tooltip = RechartsPrimitive.Tooltip as unknown as ComponentType<any>;

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

// Light mode: couleurs saturées et sombres (contrastent avec fond blanc)
const COMPARISON_COLORS_LIGHT = [
  "#1F2937", // Gray-800
  "#EA580C", // Orange-600
  "#0891B2", // Cyan-600
  "#7C3AED", // Violet-600
  "#DC2626", // Red-600
];
// Dark mode: palette néon hautement saturée (max distance colorimétrique du fond slate-950)
const COMPARISON_COLORS_DARK = [
  "#FACC15", // Yellow-400 (jaune vif)
  "#22D3EE", // Cyan-400
  "#F472B6", // Pink-400
  "#4ADE80", // Green-400
  "#A78BFA", // Violet-400
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

// En mode sombre, on ignore les couleurs custom (souvent bleues/sombres comme le fond)
// et on force la palette néon haute-visibilité
const adaptColorForDark = (_hex: string | undefined): string | undefined => undefined;

// Hook: observe container width for responsive radar sizing
const useContainerWidth = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
};

// Render multi-line theme labels (wraps long names on small screens)
const renderAngleTick = (fontSize: number, fontWeight: number, fill: string, maxCharsPerLine: number) => (props: any) => {
  const { x, y, payload, textAnchor } = props;
  const text = String(payload.value || "");
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  words.forEach((w) => {
    const candidate = current ? `${current} ${w}` : w;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  const lineHeight = fontSize + 2;
  return (
    <text x={x} y={y} textAnchor={textAnchor} fill={fill} fontSize={fontSize} fontWeight={fontWeight}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : lineHeight}>{line}</tspan>
      ))}
    </text>
  );
};

export const ComparisonRadar = ({
  datasets,
  primaryColor,
  animated = true,
}: ComparisonRadarProps) => {
  if (datasets.length === 0) return null;
  const isDark = useIsDarkMode();
  const [containerRef, containerWidth] = useContainerWidth();
  // Responsive breakpoints
  const isXs = containerWidth > 0 && containerWidth < 380;
  const isSm = containerWidth >= 380 && containerWidth < 560;
  const chartHeight = isXs ? 300 : isSm ? 350 : 403;
  const outerRadius = isXs ? "65%" : isSm ? "72%" : "80%";
  const themeFontSize = isXs ? 10 : isSm ? 11 : (isDark ? 14 : 13);
  const radiusFontSize = isXs ? 9 : isSm ? 10 : (isDark ? 13 : 12);
  const themeFontWeight = isDark ? 700 : 500;
  const themeFill = isDark ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))";
  const maxCharsPerLine = isXs ? 10 : isSm ? 14 : 18;
  const COMPARISON_COLORS = isDark ? COMPARISON_COLORS_DARK : COMPARISON_COLORS_LIGHT;
  // Mode sombre: jaune vif pour le dataset courant, indépendant de la couleur club
  const effectivePrimary = isDark
    ? "#FACC15"
    : (primaryColor || "hsl(226, 72%, 48%)");
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
    <div className="w-full" ref={containerRef}>
      <div className="relative radar-themed" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <RechartsRadarChart cx="50%" cy="50%" outerRadius={outerRadius} data={mergedData}>
            <PolarGrid
              stroke="hsl(var(--muted-foreground) / 0.5)"
              gridType="polygon"
            />
            <PolarAngleAxis
              dataKey="theme"
              tick={renderAngleTick(themeFontSize, themeFontWeight, themeFill, maxCharsPerLine)}
              tickLine={{ stroke: isDark ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--border))" }}
            />
            <PolarRadiusAxis
              angle={90}
              domain={[0, 5]}
              tick={{
                fill: isDark ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
                fontSize: radiusFontSize,
                fontWeight: isDark ? 600 : 400,
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
                strokeWidth={1.5}
                strokeDasharray="5 5"
                dot={{
                  r: 3,
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
                fillOpacity={0.12}
                strokeWidth={1.5}
                dot={{
                  r: 4,
                  fill: adapt(currentDataset.color) || effectivePrimary,
                  strokeWidth: 0,
                }}
                activeDot={{
                  r: 6,
                  fill: adapt(currentDataset.color) || effectivePrimary,
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

      {/* Custom legend for better visibility — reserved space to prevent chart resize */}
      <div className="flex flex-wrap content-start justify-center gap-x-4 gap-y-2 mt-4 pt-4 border-t border-border min-h-[3.75rem]">
        {datasets.length > 1 &&
          datasets.map((dataset) => (
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
                    year: "2-digit",
                  })})
                </span>
              </span>
            </div>
          ))}
      </div>
    </div>
  );
};
