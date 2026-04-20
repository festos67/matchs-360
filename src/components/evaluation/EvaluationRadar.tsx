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

interface EvaluationRadarProps {
  data: RadarDataPoint[];
  primaryColor?: string;
  animated?: boolean;
  showTooltip?: boolean;
}

const useIsDarkMode = () => {
  const [isDark, setIsDark] = useState(
    typeof document !== "undefined" && document.documentElement.classList.contains("dark")
  );

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return isDark;
};

export const EvaluationRadar = ({
  data,
  primaryColor,
  animated = true,
  showTooltip = true,
}: EvaluationRadarProps) => {
  const isDark = useIsDarkMode();
  // Mode clair: bleu primary saturé. Mode sombre: jaune lumineux (max contraste vs fond slate)
  const effectivePrimaryColor = isDark
    ? "#FACC15" // Yellow-400 — très distinct du fond bleu/slate
    : (primaryColor || "hsl(226, 72%, 48%)");

  return (
    <div className="w-full h-[350px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid
            stroke={isDark ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--border))"}
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="theme"
            tick={{
              fill: isDark ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              fontSize: isDark ? 12 : 11,
              fontWeight: isDark ? 700 : 500,
            }}
            tickLine={{ stroke: isDark ? "hsl(var(--muted-foreground) / 0.5)" : "hsl(var(--border))" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tick={{
              fill: isDark ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
              fontSize: isDark ? 11 : 10,
              fontWeight: isDark ? 600 : 400,
            }}
            tickCount={6}
            axisLine={false}
          />
          
          <Radar
            name="Évaluation"
            dataKey="score"
            stroke={effectivePrimaryColor}
            fill={effectivePrimaryColor}
            fillOpacity={isDark ? 0.55 : 0.12}
            strokeWidth={isDark ? 3.25 : 1.5}
            dot={{
              r: isDark ? 5 : 4,
              fill: effectivePrimaryColor,
              stroke: isDark ? "hsl(var(--background))" : "transparent",
              strokeWidth: isDark ? 1.5 : 0,
            }}
            activeDot={{
              r: isDark ? 7 : 6,
              fill: effectivePrimaryColor,
              stroke: isDark ? "hsl(var(--background))" : "white",
              strokeWidth: isDark ? 2.5 : 2,
            }}
            isAnimationActive={animated}
            animationDuration={500}
            animationEasing="ease-out"
          />
          
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
                boxShadow: "0 4px 16px -4px rgba(0, 0, 0, 0.35)",
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
              formatter={(value: number) => [`${value.toFixed(1)} / 5`, "Score"]}
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
};