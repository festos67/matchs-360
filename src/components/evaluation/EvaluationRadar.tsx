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
  primaryColor = "hsl(226, 72%, 48%)",
  animated = true,
  showTooltip = true,
}: EvaluationRadarProps) => {
  return (
    <div className="w-full h-[350px] relative">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          <PolarGrid
            stroke="#DDE2ED"
            gridType="polygon"
          />
          <PolarAngleAxis
            dataKey="theme"
            tick={{
              fill: "#7889A8",
              fontSize: 11,
              fontWeight: 500,
            }}
            tickLine={{ stroke: "#DDE2ED" }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 5]}
            tick={{
              fill: "#7889A8",
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
            fillOpacity={0.12}
            strokeWidth={1.5}
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
                backgroundColor: "hsl(0, 0%, 100%)",
                border: "1px solid #DDE2ED",
                borderRadius: "8px",
                boxShadow: "0 4px 16px -4px rgba(34, 51, 84, 0.1)",
              }}
              labelStyle={{
                color: "hsl(224, 55%, 17%)",
                fontWeight: 600,
                marginBottom: "4px",
              }}
              itemStyle={{
                color: "#7889A8",
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