import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SimForm } from '../model/forms'
import { calculate, calculateWithTariff } from '../wasm/api'
import { buildTicks, computeCostSeries, truncateCdr, truncateForm } from './timeseries'

vi.mock('../wasm/api', () => ({
  calculate: vi.fn(),
  calculateWithTariff: vi.fn(),
}))

const calculateMock = vi.mocked(calculate)
const calculateWithTariffMock = vi.mocked(calculateWithTariff)

function formWithPeriods(periods: SimForm['periods'], end = '2026-06-24T11:00:00Z'): SimForm {
  return {
    currency: 'EUR',
    countryCode: 'NL',
    start: '2026-06-24T09:00:00Z',
    end,
    tariffs: [
      {
        id: 'energy',
        currency: 'EUR',
        taxIncluded: 'NO',
        elements: [{ components: [{ type: 'ENERGY', price: '0.30', stepSize: 1 }] }],
      },
    ],
    periods,
    embedded: { totalEnergy: '10' },
  }
}

function cdrWithPeriods(chargingPeriods: Record<string, unknown>[], end = '2026-06-24T11:00:00Z') {
  return {
    country_code: 'NL',
    party_id: 'EXA',
    id: 'cdr',
    start_date_time: '2026-06-24T09:00:00Z',
    end_date_time: end,
    currency: 'EUR',
    tariffs: [
      {
        id: 'energy',
        currency: 'EUR',
        elements: [{ price_components: [{ type: 'ENERGY', price: '1', step_size: 1 }] }],
      },
    ],
    charging_periods: chargingPeriods,
    total_cost: { excl_vat: '0' },
    total_energy: '0',
    total_time: '0',
    last_updated: '2026-06-24T09:00:00Z',
  }
}

function reportForCost(beforeTaxes: string) {
  const zero = { beforeTaxes: '0', afterTaxes: null, taxes: [] }

  return {
    currency: 'EUR',
    totalCost: { beforeTaxes, afterTaxes: null, taxes: [] },
    totalEnergyCost: zero,
    totalTimeCost: zero,
    totalParkingCost: zero,
    totalFixedCost: zero,
    totalReservationCost: null,
    dimensions: {},
    warnings: [],
  }
}

function sumEnergy(cdr: unknown): string {
  const periods = (cdr as { charging_periods?: { dimensions?: { type?: string; volume?: unknown }[] }[] })
    .charging_periods
  const total = periods
    ?.flatMap((period) => period.dimensions ?? [])
    .filter((dimension) => dimension.type === 'ENERGY')
    .reduce((sum, dimension) => sum + Number(dimension.volume ?? 0), 0)

  return String(total ?? 0)
}

beforeEach(() => {
  calculateMock.mockReset()
  calculateWithTariffMock.mockReset()
})

describe('truncateForm', () => {
  it('scales the in-progress period volume linearly and sets end to the tick', () => {
    const form = formWithPeriods([
      {
        start: '2026-06-24T09:00:00Z',
        tariffId: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '10' }],
      },
    ], '2026-06-24T10:00:00Z')

    const truncated = truncateForm(form, '2026-06-24T09:30:00Z')

    expect(truncated.end).toBe('2026-06-24T09:30:00Z')
    expect(truncated.periods).toHaveLength(1)
    expect(truncated.periods[0].dimensions[0].volume).toBe('5')
    expect(form.periods[0].dimensions[0].volume).toBe('10')
  })

  it('keeps elapsed periods at full volume, scales the current period, and drops future periods', () => {
    const form = formWithPeriods([
      {
        start: '2026-06-24T11:00:00Z',
        tariffId: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '30' }],
      },
      {
        start: '2026-06-24T09:00:00Z',
        tariffId: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '10' }],
      },
      {
        start: '2026-06-24T10:00:00Z',
        tariffId: 'energy',
        dimensions: [
          { type: 'ENERGY', volume: '20' },
          { type: 'TIME', volume: '2' },
        ],
      },
    ], '2026-06-24T12:00:00Z')

    const truncated = truncateForm(form, '2026-06-24T10:30:00Z')

    expect(truncated.periods.map((period) => period.start)).toEqual([
      '2026-06-24T09:00:00Z',
      '2026-06-24T10:00:00Z',
    ])
    expect(truncated.periods[0].dimensions[0].volume).toBe('10')
    expect(truncated.periods[1].dimensions).toEqual([
      { type: 'ENERGY', volume: '10' },
      { type: 'TIME', volume: '1' },
    ])
  })

  it('preserves fully elapsed high-precision volume strings exactly', () => {
    const form = formWithPeriods([
      {
        start: '2026-06-24T09:00:00Z',
        tariffId: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '0.123456789' }],
      },
    ], '2026-06-24T10:00:00Z')

    const truncated = truncateForm(form, '2026-06-24T10:00:00Z')

    expect(truncated.periods[0].dimensions[0].volume).toBe('0.123456789')
  })
})

describe('truncateCdr', () => {
  it('scales the current CDR period, keeps past periods exact, and drops future periods', () => {
    const cdr = cdrWithPeriods([
      {
        start_date_time: '2026-06-24T11:00:00Z',
        tariff_id: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '30' }],
      },
      {
        start_date_time: '2026-06-24T09:00:00Z',
        tariff_id: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '0.123456789' }],
      },
      {
        start_date_time: '2026-06-24T10:00:00Z',
        tariff_id: 'energy',
        dimensions: [
          { type: 'ENERGY', volume: '20' },
          { type: 'TIME', volume: '2' },
        ],
      },
    ], '2026-06-24T12:00:00Z')

    const truncated = truncateCdr(cdr, '2026-06-24T09:00:00Z', '2026-06-24T12:00:00Z', '2026-06-24T10:30:00Z')
    const periods = truncated.charging_periods as { start_date_time: string; dimensions: { volume: string }[] }[]

    expect(truncated.end_date_time).toBe('2026-06-24T10:30:00Z')
    expect(periods.map((period) => period.start_date_time)).toEqual([
      '2026-06-24T09:00:00Z',
      '2026-06-24T10:00:00Z',
    ])
    expect(periods[0].dimensions[0].volume).toBe('0.123456789')
    expect(periods[1].dimensions).toEqual([
      { type: 'ENERGY', volume: '10' },
      { type: 'TIME', volume: '1' },
    ])
    expect(cdr.charging_periods[1]).toMatchObject({
      dimensions: [{ type: 'ENERGY', volume: '0.123456789' }],
    })
  })

  it('preserves all volume strings byte-for-byte at the final tick', () => {
    const cdr = cdrWithPeriods([
      {
        start_date_time: '2026-06-24T09:00:00Z',
        tariff_id: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '0.123456789' }],
      },
      {
        start_date_time: '2026-06-24T10:00:00Z',
        tariff_id: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '1.987654321' }],
      },
    ], '2026-06-24T11:00:00Z')

    const truncated = truncateCdr(cdr, '2026-06-24T09:00:00Z', '2026-06-24T11:00:00Z', '2026-06-24T11:00:00Z')
    const periods = truncated.charging_periods as { dimensions: { volume: string }[] }[]

    expect(periods[0].dimensions[0].volume).toBe('0.123456789')
    expect(periods[1].dimensions[0].volume).toBe('1.987654321')
  })
})

describe('buildTicks', () => {
  it('returns unit-spaced ascending ticks through the end', () => {
    expect(buildTicks('2026-06-24T09:00:00Z', '2026-06-24T09:30:00Z', 10)).toEqual([
      '2026-06-24T09:10:00Z',
      '2026-06-24T09:20:00Z',
      '2026-06-24T09:30:00Z',
    ])
  })

  it('caps ticks and always ends at the final end time', () => {
    const ticks = buildTicks('2026-06-24T09:00:00Z', '2026-06-24T10:00:00Z', 1, 4)

    expect(ticks).toHaveLength(4)
    expect(ticks).toEqual([
      '2026-06-24T09:15:00Z',
      '2026-06-24T09:30:00Z',
      '2026-06-24T09:45:00Z',
      '2026-06-24T10:00:00Z',
    ])
  })

  it('returns the end when the session does not advance', () => {
    expect(buildTicks('2026-06-24T09:00:00Z', '2026-06-24T09:00:00Z', 10)).toEqual([
      '2026-06-24T09:00:00Z',
    ])
  })
})

describe('computeCostSeries', () => {
  it('uses the same engine path as the main run and makes the final tick equal the full CDR cost', async () => {
    const cdr = cdrWithPeriods([
      {
        start_date_time: '2026-06-24T09:00:00Z',
        tariff_id: 'energy',
        dimensions: [{ type: 'ENERGY', volume: '0.123456789' }],
      },
    ], '2026-06-24T10:00:00Z')
    calculateMock.mockImplementation(async (_version, input) => ({
      ok: true,
      error: null,
      report: reportForCost(sumEnergy(input)),
    }))

    const full = await calculate('2.2.1', cdr, { currencyPrecision: 2 })
    const series = await computeCostSeries({
      cdr,
      version: '2.2.1',
      mode: 'embedded',
      unitMinutes: 30,
      engineOptions: { currencyPrecision: 2 },
    })

    const finalCdr = calculateMock.mock.calls[calculateMock.mock.calls.length - 1]?.[1] as {
      charging_periods: { dimensions: { volume: string }[] }[]
    }
    expect(calculateWithTariffMock).not.toHaveBeenCalled()
    expect(finalCdr.charging_periods[0].dimensions[0].volume).toBe('0.123456789')
    expect(series[series.length - 1]).toMatchObject({
      t: '2026-06-24T10:00:00Z',
      cost: Number(full.report?.totalCost.beforeTaxes),
    })
  })

  it('uses calculateWithTariff when an override tariff is provided', async () => {
    const cdr = cdrWithPeriods([
      {
        start_date_time: '2026-06-24T09:00:00Z',
        dimensions: [{ type: 'ENERGY', volume: '1' }],
      },
    ], '2026-06-24T09:30:00Z')
    const overrideTariff = { id: 'override' }
    calculateWithTariffMock.mockResolvedValue({
      ok: true,
      error: null,
      report: reportForCost('1'),
    })

    await computeCostSeries({
      cdr,
      version: '2.2.1',
      mode: 'override',
      overrideTariff,
      unitMinutes: 30,
      engineOptions: { currencyPrecision: 2 },
    })

    expect(calculateMock).not.toHaveBeenCalled()
    expect(calculateWithTariffMock).toHaveBeenCalledWith(
      '2.2.1',
      expect.objectContaining({ end_date_time: '2026-06-24T09:30:00Z' }),
      overrideTariff,
      { currencyPrecision: 2 },
    )
  })
})
