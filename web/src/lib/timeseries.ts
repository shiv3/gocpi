import type { SimForm } from '../model/forms'
import { serialize, serializeTariff } from './serialize'
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
  const scaled = Number(volume) * fraction
  if (!Number.isFinite(scaled)) return volume

  return trimFixed((Object.is(scaled, -0) ? 0 : scaled).toFixed(6))
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
  form: SimForm
  version: Version
  unitMinutes: number
  maxTicks?: number
  engineOptions: EngineOptions
  mode: 'embedded' | 'override'
}): Promise<CostSeriesPoint[]> {
  if (opts.mode === 'override' && opts.form.tariffs.length === 0) return []

  const ticks = buildTicks(opts.form.start, opts.form.end, opts.unitMinutes, opts.maxTicks)
  const overrideTariff =
    opts.mode === 'override'
      ? serializeTariff(opts.form.tariffs[0], opts.version, opts.form.countryCode, opts.form.start)
      : null
  const series: CostSeriesPoint[] = []

  for (const tick of ticks) {
    const truncated = truncateForm(opts.form, tick)
    const cdr = serialize(truncated, opts.version)
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
