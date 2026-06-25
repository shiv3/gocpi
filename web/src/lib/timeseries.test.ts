import { describe, expect, it } from 'vitest'
import type { SimForm } from '../model/forms'
import { buildTicks, truncateForm } from './timeseries'

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
