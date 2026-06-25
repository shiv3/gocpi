import type { SimForm } from '../model/forms'
import { calculate, calculateWithTariff } from '../wasm/api'
import type { EngineOptions, Version } from '../wasm/api'

export interface CostSeriesPoint {
  t: string
  label: string
  cost: number
}

function timestamp(value: string): number {
  return new Date(value).getTime()
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function trimFixed(value: string): string {
  return value.replace(/\.?0+$/, '') || '0'
}

function scaleVolume(volume: string, fraction: number): string {
  if (fraction >= 1) return volume

  const scaled = Number(volume) * fraction
  if (!Number.isFinite(scaled)) return volume

  return trimFixed((Object.is(scaled, -0) ? 0 : scaled).toFixed(6))
}

function scaleCdrVolume(volume: unknown, fraction: number): unknown {
  if (fraction >= 1) return volume
  if (typeof volume !== 'string' && typeof volume !== 'number') return volume

  return scaleVolume(String(volume), fraction)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function valueString(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function comparePeriodStart(a: Record<string, unknown>, b: Record<string, unknown>): number {
  const aMs = timestamp(valueString(a.start_date_time) ?? '')
  const bMs = timestamp(valueString(b.start_date_time) ?? '')

  if (Number.isFinite(aMs) && Number.isFinite(bMs)) return aMs - bMs
  if (Number.isFinite(aMs)) return -1
  if (Number.isFinite(bMs)) return 1
  return 0
}

function toUtcIso(ms: number): string {
  return new Date(ms).toISOString().replace('.000Z', 'Z')
}

function tickLabel(tickISO: string): string {
  const date = new Date(tickISO)
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  return `${hour}:${minute}`
}

export function truncateForm(form: SimForm, tickISO: string): SimForm {
  const tickMs = timestamp(tickISO)
  const sortedPeriods = [...form.periods].sort((a, b) => timestamp(a.start) - timestamp(b.start))

  const periods = sortedPeriods.flatMap((period, index) => {
    const periodStartMs = timestamp(period.start)
    if (!Number.isFinite(periodStartMs) || !Number.isFinite(tickMs) || periodStartMs > tickMs) {
      return []
    }

    const periodEnd = sortedPeriods[index + 1]?.start ?? form.end
    const periodEndMs = timestamp(periodEnd)
    const durationMs = periodEndMs - periodStartMs
    const fraction =
      durationMs === 0
        ? 1
        : clamp((Math.min(tickMs, periodEndMs) - periodStartMs) / durationMs, 0, 1)

    return [
      {
        ...period,
        dimensions: period.dimensions.map((dimension) => ({
          ...dimension,
          volume: scaleVolume(dimension.volume, fraction),
        })),
      },
    ]
  })

  return {
    ...form,
    end: tickISO,
    tariffs: form.tariffs.map((tariff) => ({
      ...tariff,
      elements: tariff.elements.map((element) =>
        element.restriction
          ? {
              ...element,
              restriction: { ...element.restriction },
              components: element.components.map((component) => ({ ...component })),
            }
          : {
              ...element,
              components: element.components.map((component) => ({ ...component })),
            },
      ),
    })),
    periods,
    embedded: { ...form.embedded },
  }
}

export function truncateCdr(
  cdr: Record<string, unknown>,
  startISO: string,
  endISO: string,
  tickISO: string,
): Record<string, unknown> {
  const tickMs = timestamp(tickISO)
  const rawPeriods = Array.isArray(cdr.charging_periods) ? cdr.charging_periods.filter(isRecord) : []
  const sortedPeriods = [...rawPeriods].sort(comparePeriodStart)

  const chargingPeriods = sortedPeriods.flatMap((period, index) => {
    const periodStart = valueString(period.start_date_time) ?? startISO
    const periodStartMs = timestamp(periodStart)
    if (!Number.isFinite(periodStartMs) || !Number.isFinite(tickMs) || periodStartMs > tickMs) {
      return []
    }

    const periodEnd = valueString(sortedPeriods[index + 1]?.start_date_time) ?? endISO
    const periodEndMs = timestamp(periodEnd)
    const durationMs = periodEndMs - periodStartMs
    const fraction =
      durationMs === 0
        ? 1
        : clamp((Math.min(tickMs, periodEndMs) - periodStartMs) / durationMs, 0, 1)
    const nextPeriod: Record<string, unknown> = { ...period }

    if (Array.isArray(period.dimensions)) {
      nextPeriod.dimensions = period.dimensions.map((dimension) =>
        isRecord(dimension)
          ? {
              ...dimension,
              volume: scaleCdrVolume(dimension.volume, fraction),
            }
          : dimension,
      )
    }

    return [nextPeriod]
  })

  return {
    ...cdr,
    end_date_time: tickISO,
    charging_periods: chargingPeriods,
  }
}

export function buildTicks(startISO: string, endISO: string, unitMinutes: number, maxTicks = 240): string[] {
  const startMs = timestamp(startISO)
  const endMs = timestamp(endISO)
  const unitMs = Math.max(1, unitMinutes) * 60 * 1000
  const safeMaxTicks = Math.max(1, Math.floor(maxTicks))

  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs || safeMaxTicks === 1) {
    return [endISO]
  }

  const durationMs = endMs - startMs
  const rawTickCount = Math.ceil(durationMs / unitMs)
  const stepMultiplier = rawTickCount > safeMaxTicks ? Math.ceil(rawTickCount / safeMaxTicks) : 1
  const stepMs = unitMs * stepMultiplier
  const ticks: string[] = []

  for (let tickMs = startMs + stepMs; tickMs < endMs && ticks.length < safeMaxTicks - 1; tickMs += stepMs) {
    ticks.push(toUtcIso(tickMs))
  }

  ticks.push(endISO)
  return ticks
}

export async function computeCostSeries(opts: {
  cdr: Record<string, unknown>
  version: Version
  unitMinutes: number
  maxTicks?: number
  engineOptions: EngineOptions
  mode: 'embedded' | 'override'
  overrideTariff?: unknown | null
}): Promise<CostSeriesPoint[]> {
  if (opts.mode === 'override' && opts.overrideTariff == null) return []

  const startISO = valueString(opts.cdr.start_date_time)
  const endISO = valueString(opts.cdr.end_date_time)
  if (startISO == null || endISO == null) return []

  const ticks = buildTicks(startISO, endISO, opts.unitMinutes, opts.maxTicks)
  const overrideTariff = opts.mode === 'override' ? opts.overrideTariff : null
  const series: CostSeriesPoint[] = []

  for (const tick of ticks) {
    const cdr = truncateCdr(opts.cdr, startISO, endISO, tick)
    const response =
      opts.mode === 'override' && overrideTariff != null
        ? await calculateWithTariff(opts.version, cdr, overrideTariff, opts.engineOptions)
        : await calculate(opts.version, cdr, opts.engineOptions)

    if (!response.ok || !response.report) continue

    const cost = Number(response.report.totalCost.beforeTaxes)
    if (!Number.isFinite(cost)) continue

    series.push({ t: tick, label: tickLabel(tick), cost })
  }

  return series
}
