import { describe, it, expect } from 'vitest'
import { deserialize, serialize } from './serialize'
import type { SimForm } from '../model/forms'
import type { Version } from '../wasm/api'

const base: SimForm = {
  currency: 'EUR',
  countryCode: 'NL',
  start: '2026-06-24T09:00:00Z',
  end: '2026-06-24T10:00:00Z',
  tariffs: [
    {
      id: 'a',
      currency: 'EUR',
      taxIncluded: 'NO',
      elements: [{ components: [{ type: 'ENERGY', price: '0.30', stepSize: 1, vat: '21' }] }],
    },
  ],
  periods: [
    { start: '2026-06-24T09:00:00Z', tariffId: 'a', dimensions: [{ type: 'ENERGY', volume: '10' }] },
  ],
  embedded: { totalCost: '3.00', totalEnergy: '10' },
}

describe('serialize', () => {
  it('emits v2.2.1 money as excl_vat and component vat', () => {
    const cdr: any = serialize(base, '2.2.1')
    expect(cdr.currency).toBe('EUR')
    expect(cdr.total_cost).toEqual({ excl_vat: '3.00' })
    expect(cdr.tariffs[0].elements[0].price_components[0]).toMatchObject({
      type: 'ENERGY',
      price: '0.30',
      step_size: 1,
      vat: '21',
    })
    expect(cdr.charging_periods[0]).toMatchObject({ tariff_id: 'a' })
    expect(cdr.tariffs[0].tax_included).toBeUndefined()
  })

  it('emits v2.3.0 money as before_taxes and tariff tax_included', () => {
    const cdr: any = serialize(base, '2.3.0')
    expect(cdr.total_cost).toEqual({ before_taxes: '3.00' })
    expect(cdr.tariffs[0].tax_included).toBe('NO')
    expect(cdr.tariffs[0].elements[0].price_components[0]).toMatchObject({
      type: 'ENERGY',
      price: '0.30',
      step_size: 1,
      vat: '21',
    })
  })

  it('omits optional embedded cost totals but always emits required totals', () => {
    const cdr: any = serialize({ ...base, embedded: {} }, '2.2.1')
    expect(cdr.total_energy_cost).toBeUndefined()
    expect(cdr.total_cost).toEqual({ excl_vat: '0' })
    expect(cdr.total_energy).toBe('10')
    expect(cdr.total_time).toBe('0')
  })

  it('embedded override wins over derived totals', () => {
    const cdr: any = serialize({ ...base, embedded: { totalEnergy: '99' } }, '2.2.1')
    expect(cdr.total_energy).toBe('99')
  })

  it('sumDecimals avoids float drift', () => {
    const f = {
      ...base,
      periods: [
        { start: base.start, tariffId: 'a', dimensions: [{ type: 'ENERGY' as const, volume: '0.1' }] },
        { start: base.start, tariffId: 'a', dimensions: [{ type: 'ENERGY' as const, volume: '0.2' }] },
      ],
      embedded: {},
    }
    const cdr: any = serialize(f, '2.2.1')
    expect(cdr.total_energy).toBe('0.3')
  })

  it('uses the form country code for CDR and tariff country_code', () => {
    const cdr: any = serialize({ ...base, countryCode: 'DE' }, '2.3.0')
    expect(cdr.country_code).toBe('DE')
    expect(cdr.tariffs[0].country_code).toBe('DE')
  })

  it.each<Version>(['2.2.1', '2.3.0'])('deserialize(serialize(base, %s)) round-trips the base form', (version) => {
    expect(deserialize(serialize(base, version), version)).toEqual(base)
  })
})
