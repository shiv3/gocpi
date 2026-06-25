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
import { Badge } from '@/components/ui/badge'
import type { Report } from '../../model/dto'

const DIMENSIONS = ['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT'] as const
const COLORS = ['#175cd3', '#12b76a', '#f79009', '#7a5af8']
const CHART_SIZE = { width: 360, height: 180 }

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
    <section aria-labelledby="cost-chart-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 id="cost-chart-heading" className="text-sm font-medium">
          Cost charts
        </h3>
        <Badge variant="secondary">{report.currency}</Badge>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dimension costs to chart</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">Share by dimension</h4>
            {pieRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No positive costs to chart</p>
            ) : (
              <div className="h-44 w-full">
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
          <div className="space-y-1">
            <h4 className="text-xs font-medium text-muted-foreground">Before vs after taxes</h4>
            <div className="h-44 w-full">
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
