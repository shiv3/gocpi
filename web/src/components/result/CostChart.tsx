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
} from 'recharts'
import type { Report } from '../../model/dto'

const DIMENSIONS = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT'] as const
const COLORS = ['#175cd3', '#12b76a', '#f79009', '#7a5af8']
const CHART_SIZE = { width: 420, height: 260 }

export interface CostChartProps {
  report: Report
}

interface ChartRow {
  name: string
  beforeTaxes: number
  afterTaxes?: number
}

function toChartNumber(value: string | null): number | undefined {
  if (value == null) return undefined
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

export function CostChart({ report }: CostChartProps) {
  const rows: ChartRow[] = DIMENSIONS.flatMap((name) => {
    const dimension = report.dimensions[name]
    if (!dimension) return []

    return [
      {
        name,
        beforeTaxes: toChartNumber(dimension.cost.beforeTaxes) ?? 0,
        afterTaxes: toChartNumber(dimension.cost.afterTaxes),
      },
    ]
  })

  const pieRows = rows.filter((row) => row.beforeTaxes > 0)
  const hasAfterTaxes = rows.some((row) => row.afterTaxes != null)
  const formatMoney = (value: unknown) => [`${Number(value).toLocaleString()} ${report.currency}`, 'cost']
  const formatBar = (value: unknown, name: unknown) => [
    `${Number(value).toLocaleString()} ${report.currency}`,
    name === 'beforeTaxes' || name === 'before taxes' ? 'before taxes' : 'after taxes',
  ]

  return (
    <section className="result-section cost-chart" aria-labelledby="cost-chart-heading">
      <div className="section-heading">
        <h2 id="cost-chart-heading">Cost charts</h2>
        <span className="currency-badge">{report.currency}</span>
      </div>
      {rows.length === 0 ? (
        <p className="empty-state">No dimension costs to chart</p>
      ) : (
        <div className="cost-chart__grid">
          <div className="cost-chart__panel">
            <h3>Share by dimension</h3>
            {pieRows.length === 0 ? (
              <p className="empty-state">No positive costs to chart</p>
            ) : (
              <div className="cost-chart__canvas">
                <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
                  <PieChart>
                    <Pie
                      data={pieRows}
                      dataKey="beforeTaxes"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="78%"
                      paddingAngle={2}
                    >
                      {pieRows.map((row, index) => (
                        <Cell key={row.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={formatMoney} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
          <div className="cost-chart__panel">
            <h3>Before vs after taxes</h3>
            <div className="cost-chart__canvas">
              <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
                <BarChart data={rows} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} width={48} />
                  <Tooltip formatter={formatBar} />
                  <Legend />
                  <Bar dataKey="beforeTaxes" name="before taxes" fill="#175cd3" />
                  {hasAfterTaxes && <Bar dataKey="afterTaxes" name="after taxes" fill="#12b76a" />}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
