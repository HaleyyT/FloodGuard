import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RainfallChartVisual({ peakRainfall, rainfallTrend, yAxisMax, yAxisTicks }) {
  return (
    <ResponsiveContainer width="100%" height={255}>
      <LineChart data={rainfallTrend} margin={{ top: 12, right: 16, left: 6, bottom: 18 }}>
        <defs>
          <linearGradient id="rainfallLineGlow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2d8cf0" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#2d8cf0" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#dbe7f5" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="time"
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
          tickMargin={12}
          minTickGap={28}
          padding={{ left: 10, right: 10 }}
          tick={{ fontSize: 11, fill: "#5b6c84" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          domain={[-0.2, yAxisMax]}
          ticks={yAxisTicks}
          width={44}
          tickFormatter={(value) => (value < 0 ? "" : `${value} mm`)}
          tick={{ fontSize: 11, fill: "#5b6c84" }}
        />
        <Tooltip
          cursor={{ fill: "rgba(45, 140, 240, 0.08)" }}
          formatter={(value) => [`${value} mm`, "Rainfall"]}
          labelFormatter={(_, payload) =>
            payload?.[0]?.payload?.timestamp ?? "Rainfall reading"
          }
        />
        <ReferenceLine y={0} stroke="#b8cde5" />
        <ReferenceLine
          y={peakRainfall}
          stroke="#0f6dcb"
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
        />
        <Line
          dataKey="rainfall"
          type="monotone"
          stroke="#2d8cf0"
          strokeWidth={3}
          connectNulls
          dot={{ r: 4, strokeWidth: 2, stroke: "#ffffff", fill: "#2d8cf0" }}
          activeDot={{ r: 5, strokeWidth: 2, stroke: "#ffffff", fill: "#0f6dcb" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function SignalBreakdownVisual({ riskSignals }) {
  const chartLabelMap = {
    Rainfall: "Rainfall",
    Weather: "Weather",
    River: "River",
    Wetness: "Wetness",
    Public: "Public",
    Confidence: "Confidence",
    "Input Coverage": "Coverage",
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={riskSignals}
        barCategoryGap="18%"
        margin={{ top: 8, right: 10, left: 6, bottom: 14 }}
      >
        <CartesianGrid stroke="#dbe7f5" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="name"
          axisLine={false}
          tickLine={false}
          height={42}
          tickMargin={10}
          interval={0}
          padding={{ left: 8, right: 8 }}
          tickFormatter={(value) => chartLabelMap[value] ?? value}
          tick={{ fontSize: 11, fill: "#5b6c84" }}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          width={36}
          tick={{ fontSize: 11, fill: "#5b6c84" }}
        />
        <Tooltip />
        <Bar dataKey="value" fill="var(--signal-chart)" radius={[8, 8, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
