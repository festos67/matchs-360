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

interface EvaluationRadarProps {
  data: RadarDataPoint[];
  primaryColor?: string;
  animated?: boolean;
  showTooltip?: boolean;
}

export const EvaluationRadar = ({
  data,
  primaryColor = "hsl(217, 91%, 60%)",
  animated = true,
  showTooltip = true,
}: EvaluationRadarProps) => {
  return (
    <div className="w-full h-[350px] relative">
      {/* Glow effect behind radar */}
      <div 
        className="absolute inset-0 opacity-20 blur-3xl"
        style={{
          background: `radial-gradient(ellipse at center, ${primaryColor} 0%, transparent 70%)`,
        }}
      />
      
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
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
          
          <Radar
            name="Évaluation"
            dataKey="score"
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.5}
            strokeWidth={2}
            dot={{
              r: 4,
              fill: primaryColor,
              strokeWidth: 0,
            }}
            activeDot={{
              r: 6,
              fill: primaryColor,
              stroke: "white",
              strokeWidth: 2,
            }}
            isAnimationActive={animated}
            animationDuration={500}
            animationEasing="ease-out"
          />
          
          {showTooltip && (
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
              formatter={(value: number) => [`${value.toFixed(1)} / 5`, "Score"]}
            />
          )}
        </RechartsRadarChart>
      </ResponsiveContainer>
    </div>
  );
};