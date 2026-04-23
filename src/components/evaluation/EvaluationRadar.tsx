/**
 * @component EvaluationRadar
 * @description Diagramme radar simple (recharts) affichant les moyennes par thème
 *              d'un débrief unique. Mis à jour en live pendant la saisie du formulaire.
 * @props
 *  - data: RadarDataPoint[] — moyennes par thème (theme, score, color)
 *  - maxScore?: number — échelle max (défaut 5)
 * @features
 *  - Animation fluide à chaque changement de score
 *  - Couleurs par thème (HSL semantic tokens)
 *  - ResponsiveContainer pour adaptation viewport
 * @maintenance
 *  - Calculs alimentation via calculateRadarData (lib/evaluation-utils)
 *  - Stabilité visuelle : mem://technical/radar-chart-visual-stability
 */
import { useEffect, useState, type ComponentType } from "react";
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

interface EvaluationRadarProps {
  data: RadarDataPoint[];
  primaryColor?: string;
  animated?: boolean;
  showTooltip?: boolean;
  className?: string;
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
  className,
}: EvaluationRadarProps) => {
  const isDark = useIsDarkMode();
  // Mode clair: bleu primary saturé. Mode sombre: jaune lumineux (max contraste vs fond slate)
  const effectivePrimaryColor = isDark
    ? "#FACC15" // Yellow-400 — très distinct du fond bleu/slate
    : (primaryColor || "hsl(226, 72%, 48%)");

  return (
    <div className={className ?? "w-full h-[350px] relative"}>
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
            fillOpacity={isDark ? 0.25 : 0.12}
            strokeWidth={1.5}
            dot={{
              r: 4,
              fill: effectivePrimaryColor,
              strokeWidth: 0,
            }}
            activeDot={{
              r: 6,
              fill: effectivePrimaryColor,
              stroke: isDark ? "hsl(var(--background))" : "white",
              strokeWidth: 2,
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