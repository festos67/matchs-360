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

export const RadarChart = ({
  data,
  showComparison = false,
  primaryColor = "hsl(217, 91%, 60%)",
  secondaryColor = "hsl(142, 76%, 45%)",
}: RadarChartProps) => {
  return (
    <div className="radar-container w-full h-[400px]">
      <ResponsiveContainer width="100%" height="100%">
        <RechartsRadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
          <PolarGrid
            stroke="hsl(220, 20%, 25%)"
            strokeDasharray="3 3"
          />
          <PolarAngleAxis
            dataKey="skill"
            tick={{
              fill: "hsl(215, 20%, 65%)",
              fontSize: 12,
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
          
          {/* Previous evaluation (if comparing) */}
          {showComparison && (
            <Radar
              name="Évaluation précédente"
              dataKey="previousScore"
              stroke={secondaryColor}
              fill={secondaryColor}
              fillOpacity={0.15}
              strokeWidth={2}
              strokeDasharray="5 5"
            />
          )}
          
          {/* Current evaluation */}
          <Radar
            name="Évaluation actuelle"
            dataKey="score"
            stroke={primaryColor}
            fill={primaryColor}
            fillOpacity={0.3}
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
          />
          
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
