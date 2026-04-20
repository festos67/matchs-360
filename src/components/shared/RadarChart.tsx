import {
  Radar,
  RadarChart as RechartsRadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
  Tooltip,
} from "recharts";
import { useEffect, useState } from "react";

interface RadarDataPoint {
  skill: string;
  score: number;
  fullMark: number;
  previousScore?: number;
}

interface RadarChartProps {
  data: RadarDataPoint[];
  showComparison?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
}

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

export const RadarChart = ({
  data,
  showComparison = false,
  primaryColor,
  secondaryColor,
}: RadarChartProps) => {
  const isDark = useIsDarkMode();
  // En mode sombre, palette vive et lumineuse, éloignée du fond slate
  // En mode clair, palette saturée et plus sombre, éloignée du fond blanc
  const effectivePrimary =
    primaryColor || (isDark ? "#60A5FA" : "hsl(217, 91%, 50%)");
  const effectiveSecondary =
    secondaryColor || (isDark ? "#FB923C" : "hsl(24, 95%, 50%)");
  return (
    <div className="radar-container w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid
            stroke="hsl(var(--muted-foreground) / 0.5)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="skill"
            tick={{
              fill: "hsl(var(--foreground))",
              fontSize: 13,
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
          
          {/* Previous evaluation (if comparing) */}
          {showComparison && (
            <Radar
              name="Évaluation précédente"
              dataKey="previousScore"
              stroke={effectiveSecondary}
              fill={effectiveSecondary}
              fillOpacity={0.3}
              strokeWidth={3}
              strokeDasharray="5 5"
            />
          )}
          
          {/* Current evaluation */}
          <Radar
            name="Évaluation actuelle"
            dataKey="score"
            stroke={effectivePrimary}
            fill={effectivePrimary}
            fillOpacity={0.55}
            strokeWidth={3.25}
            dot={{
              r: 5,
              fill: effectivePrimary,
              stroke: "hsl(var(--background))",
              strokeWidth: 1.5,
            }}
            activeDot={{
              r: 7,
              fill: effectivePrimary,
              stroke: "hsl(var(--background))",
              strokeWidth: 2.5,
            }}
          />
          
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              boxShadow: "0 4px 24px -4px rgba(0,0,0,0.4)",
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
          />
          
          {showComparison && (
            <Legend
              wrapperStyle={{
                paddingTop: "20px",
              }}
              formatter={(value) => (
                <span className="text-muted-foreground text-sm">{value}</span>
              )}
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
};
