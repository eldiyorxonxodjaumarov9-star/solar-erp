import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = [
  "#0ea5e9",
  "#0284c7",
  "#0369a1",
  "#14b8a6",
  "#0d9488",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
];

/**
 * @param {{
 *   monthly: Array<{ label: string; count: number; totalKw: number }>;
 *   systemTypes: Array<{ systemType: string; count: number }>;
 *   powerRanges: Array<{ label: string; count: number }>;
 * }} props
 */
export default function MonthlyProjectsChart({
  monthly,
  systemTypes,
  powerRanges,
}) {
  const monthCount = (monthly || []).map((m) => ({
    name: String(m.label).slice(0, 3),
    full: m.label,
    count: m.count,
  }));
  const monthKw = (monthly || []).map((m) => ({
    name: String(m.label).slice(0, 3),
    kw: Number(Number(m.totalKw).toFixed(2)),
  }));
  const pieData = (systemTypes || [])
    .filter((s) => s.count > 0)
    .map((s) => ({ name: s.systemType, value: s.count }));
  const rangeData = (powerRanges || []).map((r) => ({
    name: r.label.replace(" kW", ""),
    count: r.count,
  }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Oylar bo‘yicha loyiha soni">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthCount}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name="Loyihalar" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Oylar bo‘yicha jami kW">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={monthKw}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="kw" name="kW" fill="#14b8a6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Sistema turi bo‘yicha ulush">
        {pieData.length === 0 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="kW diapazoni bo‘yicha soni">
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={rangeData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="name" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={60} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" name="Loyihalar" fill="#0369a1" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-sm font-semibold text-slate-800">{title}</h3>
      {children}
    </div>
  );
}

function EmptyChart() {
  return (
    <p className="flex h-[240px] items-center justify-center text-sm text-slate-500">
      Ma’lumot yo‘q
    </p>
  );
}
