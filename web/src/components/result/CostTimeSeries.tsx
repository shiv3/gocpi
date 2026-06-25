import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

const CHART_SIZE = { width: 360, height: 200 }

export interface CostTimeSeriesProps {
  series: { t: string; label: string; cost: number }[]
  unitMinutes: number
  onUnitChange(u: number): void
  currency: string
}

export function CostTimeSeries({ series, unitMinutes, onUnitChange, currency }: CostTimeSeriesProps) {
  const formatMoney = (value: unknown) => [`${Number(value).toLocaleString()} ${currency}`, 'cumulative cost']

  return (
    <section aria-labelledby="cost-time-series-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h3 id="cost-time-series-heading" className="text-sm font-medium">
          Cumulative cost over time
        </h3>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          resolution
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={unitMinutes}
            onChange={(event) => onUnitChange(Number(event.currentTarget.value))}
          >
            <option value={1}>1 min</option>
            <option value={10}>10 min</option>
            <option value={60}>1 hour</option>
          </select>
        </label>
      </div>
      {series.length === 0 ? (
        <p className="text-sm text-muted-foreground">no time-series</p>
      ) : (
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_SIZE}>
            <LineChart data={series} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis
                tick={{ fontSize: 12 }}
                width={56}
                label={{ value: currency, angle: -90, position: 'insideLeft', offset: 8 }}
              />
              <Tooltip formatter={formatMoney} labelFormatter={(label) => `time ${label}`} />
              <Line
                type="monotone"
                dataKey="cost"
                name="cumulative cost"
                stroke="#175cd3"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
