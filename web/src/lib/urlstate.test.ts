import { describe, expect, it } from 'vitest'
import { decodeState, encodeState } from './urlstate'
import type { PersistedState } from './urlstate'

const state: PersistedState = {
  v: 1,
  version: '2.3.0',
  mode: 'override',
  timeZone: 'Asia/Tokyo',
  currencyPrecision: 4,
  view: 'json',
  presetKey: 'shared-case',
  timeSeriesUnit: 60,
  rawJson:
    '{"country_code":"JP","currency":"JPY","tariffs":[{"id":"深夜-料金","currency":"JPY","elements":[]}]}',
  form: {
    currency: 'JPY',
    countryCode: 'JP',
    start: '2026-06-24T09:00:00Z',
    end: '2026-06-24T11:00:00Z',
    tariffs: [
      {
        id: '深夜-料金',
        currency: 'JPY',
        taxIncluded: 'YES',
        minPrice: '1.00',
        maxPrice: '20.00',
        elements: [
          {
            restriction: { startTime: '22:00', endTime: '06:00', minKwh: '1.5' },
            components: [
              { type: 'ENERGY', price: '33.3', stepSize: 1000, vat: '10' },
              { type: 'TIME', price: '2.5', stepSize: 900 },
            ],
          },
        ],
      },
    ],
    periods: [
      {
        start: '2026-06-24T09:00:00Z',
        tariffId: '深夜-料金',
        dimensions: [
          { type: 'ENERGY', volume: '12.5' },
          { type: 'TIME', volume: '1.25' },
        ],
      },
    ],
    embedded: {
      totalCost: '44.25',
      totalEnergy: '12.5',
      totalTime: '1.25',
      totalEnergyCost: '41.63',
      totalTimeCost: '3.13',
    },
  },
}

describe('urlstate', () => {
  it('round-trips a persisted simulator state with Unicode content', () => {
    const encoded = encodeState(state)

    expect(encoded).not.toContain('#')
    expect(decodeState(`#${encoded}`)).toEqual(state)
    expect(decodeState(encoded)).toEqual(state)
  })

  it('decodes legacy hashes without a time-series unit', () => {
    const { timeSeriesUnit: _timeSeriesUnit, ...legacyState } = state
    const encoded = encodeState(legacyState)

    expect(decodeState(`#${encoded}`)).toEqual(legacyState)
  })

  it('round-trips a hash with a time-series unit', () => {
    const encoded = encodeState({ ...state, timeSeriesUnit: 1 })

    expect(decodeState(`#${encoded}`)?.timeSeriesUnit).toBe(1)
  })

  it('returns null for an empty hash', () => {
    expect(decodeState('')).toBeNull()
  })

  it('returns null for malformed base64/json', () => {
    expect(decodeState('#garbage')).toBeNull()
  })

  it('returns null for a wrong-version envelope', () => {
    const encoded = encodeState({ ...state, v: 2 } as unknown as PersistedState)

    expect(decodeState(`#${encoded}`)).toBeNull()
  })
})
