import { describe, it, expect } from 'vitest'
import { deserialize, reportMoneyToCdr, serialize } from './serialize'
import { COMMON_COUNTRY_CODES } from './options'
import { presets } from '../presets'
import type { SimForm } from '../model/forms'
import type { Version } from '../wasm/api'

const versions: Version[] = ['2.2.1', '2.3.0']

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

const featureForm: SimForm = {
  currency: 'EUR',
  countryCode: 'NL',
  start: '2026-06-24T09:00:00Z',
  end: '2026-06-24T11:00:00Z',
  tariffs: [
    {
      id: 'full',
      currency: 'EUR',
      taxIncluded: 'YES',
      minPrice: '1.00',
      maxPrice: '9.00',
      elements: [
        {
          restriction: { startTime: '09:00', endTime: '18:00', minKwh: '1.5', maxKwh: '25' },
          components: [
            { type: 'ENERGY', price: '0.30', stepSize: 1000, vat: '21' },
            { type: 'TIME', price: '2.00', stepSize: 900 },
          ],
        },
        {
          components: [
            { type: 'PARKING_TIME', price: '1.50', stepSize: 300, vat: '10' },
            { type: 'FLAT', price: '0.75', stepSize: 1 },
          ],
        },
      ],
    },
    {
      id: 'secondary',
      currency: 'EUR',
      taxIncluded: 'N/A',
      elements: [{ components: [{ type: 'ENERGY', price: '0.10', stepSize: 1 }] }],
    },
  ],
  periods: [
    {
      start: '2026-06-24T09:00:00Z',
      tariffId: 'full',
      dimensions: [
        { type: 'ENERGY', volume: '2' },
        { type: 'TIME', volume: '0.5' },
      ],
    },
    {
      start: '2026-06-24T10:00:00Z',
      dimensions: [{ type: 'PARKING_TIME', volume: '0.25' }],
    },
  ],
  embedded: {
    totalCost: '7.25',
    totalEnergy: '2',
    totalTime: '0.5',
    totalEnergyCost: '0.60',
    totalTimeCost: '1.00',
    totalParkingCost: '0.38',
    totalFixedCost: '0.75',
  },
}

const expectedAlpha3ByCountry = {
  BE: 'BEL',
  DE: 'DEU',
  ES: 'ESP',
  FR: 'FRA',
  GB: 'GBR',
  IT: 'ITA',
  JP: 'JPN',
  NL: 'NLD',
  US: 'USA',
} satisfies Record<(typeof COMMON_COUNTRY_CODES)[number], string>

const versionMoney = (version: Version, value: string) =>
  version === '2.2.1' ? { excl_vat: value } : { before_taxes: value }

function cloneForm(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

function sumDecimals(values: string[]): string {
  if (values.length === 0) return '0'
  const frac = Math.max(0, ...values.map((v) => (v.split('.')[1] ?? '').length))
  let total = 0n
  for (const v of values) {
    const neg = v.startsWith('-')
    const [i, f = ''] = v.replace('-', '').split('.')
    const scaled = BigInt(i || '0') * 10n ** BigInt(frac) + BigInt((f + '0'.repeat(frac)).slice(0, frac) || '0')
    total += neg ? -scaled : scaled
  }
  const sign = total < 0n ? '-' : ''
  const digits = (total < 0n ? -total : total).toString().padStart(frac + 1, '0')
  const intPart = digits.slice(0, digits.length - frac) || '0'
  return sign + intPart + (frac ? `.${digits.slice(digits.length - frac)}` : '')
}

function decimalIsZero(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value)
}

function expectedRoundTrip(form: SimForm): SimForm {
  const expected = cloneForm(form)
  // serialize always emits required total_energy/total_time. deserialize keeps
  // those derived totals only when they are meaningful non-zero values.
  if (expected.embedded.totalEnergy === undefined) {
    const derived = sumDecimals(
      expected.periods.flatMap((p) => p.dimensions.filter((d) => d.type === 'ENERGY').map((d) => d.volume)),
    )
    if (!decimalIsZero(derived)) expected.embedded.totalEnergy = derived
  }
  if (expected.embedded.totalTime === undefined) {
    const derived = sumDecimals(
      expected.periods.flatMap((p) => p.dimensions.filter((d) => d.type === 'TIME').map((d) => d.volume)),
    )
    if (!decimalIsZero(derived)) expected.embedded.totalTime = derived
  }
  return expected
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

  it('maps every common country code to its own alpha-3 CDR location country', () => {
    for (const countryCode of COMMON_COUNTRY_CODES) {
      const cdr: any = serialize({ ...base, countryCode }, '2.2.1')
      expect(cdr.cdr_location.country).toMatch(/^[A-Z]{3}$/)
      expect(cdr.cdr_location.country).toBe(expectedAlpha3ByCountry[countryCode])
      if (countryCode !== 'NL') {
        expect(cdr.cdr_location.country).not.toBe('NLD')
      }
    }
  })

  it.each<Version>(['2.2.1', '2.3.0'])('deserialize(serialize(base, %s)) round-trips the base form', (version) => {
    expect(deserialize(serialize(base, version), version)).toEqual(base)
  })

  it.each(versions)('emits component types, step_size, and optional vat for %s', (version) => {
    const cdr: any = serialize(featureForm, version)

    expect(cdr.tariffs[0].elements[0].price_components).toEqual([
      { type: 'ENERGY', price: '0.30', step_size: 1000, vat: '21' },
      { type: 'TIME', price: '2.00', step_size: 900 },
    ])
    expect(cdr.tariffs[0].elements[1].price_components).toEqual([
      { type: 'PARKING_TIME', price: '1.50', step_size: 300, vat: '10' },
      { type: 'FLAT', price: '0.75', step_size: 1 },
    ])
    expect(cdr.tariffs[0].elements[0].price_components[1]).not.toHaveProperty('vat')
    expect(cdr.tariffs[0].elements[1].price_components[1]).not.toHaveProperty('vat')
  })

  it.each(versions)('emits element restrictions only when present for %s', (version) => {
    const cdr: any = serialize(featureForm, version)

    expect(cdr.tariffs[0].elements[0].restrictions).toEqual({
      start_time: '09:00',
      end_time: '18:00',
      min_kwh: '1.5',
      max_kwh: '25',
    })
    expect(cdr.tariffs[0].elements[1]).not.toHaveProperty('restrictions')
    expect(cdr.tariffs[1].elements[0]).not.toHaveProperty('restrictions')
  })

  it.each(versions)('emits tariff min_price/max_price with version money for %s', (version) => {
    const cdr: any = serialize(featureForm, version)

    expect(cdr.tariffs[0].min_price).toEqual(versionMoney(version, '1.00'))
    expect(cdr.tariffs[0].max_price).toEqual(versionMoney(version, '9.00'))
    expect(cdr.tariffs[1]).not.toHaveProperty('min_price')
    expect(cdr.tariffs[1]).not.toHaveProperty('max_price')
  })

  it('emits tax_included only for v2.3.0 tariffs', () => {
    const v221: any = serialize(featureForm, '2.2.1')
    const v230: any = serialize(featureForm, '2.3.0')

    expect(v221.tariffs[0]).not.toHaveProperty('tax_included')
    expect(v221.tariffs[1]).not.toHaveProperty('tax_included')
    expect(v230.tariffs[0].tax_included).toBe('YES')
    expect(v230.tariffs[1].tax_included).toBe('N/A')
  })

  it.each(versions)('serializes multiple tariffs and optional period tariff_id for %s', (version) => {
    const cdr: any = serialize(featureForm, version)

    expect(cdr.tariffs.map((t: any) => t.id)).toEqual(['full', 'secondary'])
    expect(cdr.charging_periods[0].tariff_id).toBe('full')
    expect(cdr.charging_periods[1]).not.toHaveProperty('tariff_id')
  })

  it.each(versions)('serializes multiple dimensions per period for %s', (version) => {
    const cdr: any = serialize(featureForm, version)

    expect(cdr.charging_periods[0].dimensions).toEqual([
      { type: 'ENERGY', volume: '2' },
      { type: 'TIME', volume: '0.5' },
    ])
    expect(cdr.charging_periods[1].dimensions).toEqual([{ type: 'PARKING_TIME', volume: '0.25' }])
  })

  it.each(versions)('emits optional embedded subtotals only when set for %s', (version) => {
    const full: any = serialize(featureForm, version)
    expect(full.total_cost).toEqual(versionMoney(version, '7.25'))
    expect(full.total_energy).toBe('2')
    expect(full.total_time).toBe('0.5')
    expect(full.total_energy_cost).toEqual(versionMoney(version, '0.60'))
    expect(full.total_time_cost).toEqual(versionMoney(version, '1.00'))
    expect(full.total_parking_cost).toEqual(versionMoney(version, '0.38'))
    expect(full.total_fixed_cost).toEqual(versionMoney(version, '0.75'))

    const derived: any = serialize({ ...featureForm, embedded: {} }, version)
    expect(derived.total_cost).toEqual(versionMoney(version, '0'))
    expect(derived.total_energy).toBe('2')
    expect(derived.total_time).toBe('0.5')
    expect(derived).not.toHaveProperty('total_energy_cost')
    expect(derived).not.toHaveProperty('total_time_cost')
    expect(derived).not.toHaveProperty('total_parking_cost')
    expect(derived).not.toHaveProperty('total_fixed_cost')
  })

  it.each(versions)('omits absent tariff min/max and element restrictions in a minimal form for %s', (version) => {
    const cdr: any = serialize(base, version)

    expect(cdr.tariffs[0]).not.toHaveProperty('min_price')
    expect(cdr.tariffs[0]).not.toHaveProperty('max_price')
    expect(cdr.tariffs[0].elements[0]).not.toHaveProperty('restrictions')
  })

  it.each(
    Object.entries(presets).flatMap(([name, preset]) => versions.map((version) => [name, preset, version] as const)),
  )('deserialize(serialize(%s, %s)) round-trips meaningful fields', (_name, preset, version) => {
    expect(deserialize(serialize(preset, version), version)).toEqual(expectedRoundTrip(preset))
  })
})

describe('reportMoneyToCdr', () => {
  it('emits v2.2.1 money with after-tax total when available', () => {
    expect(reportMoneyToCdr({ beforeTaxes: '3.00', afterTaxes: '3.63' }, '2.2.1')).toEqual({
      excl_vat: '3.00',
      incl_vat: '3.63',
    })
  })

  it('emits v2.3.0 money with a derivable VAT amount', () => {
    expect(reportMoneyToCdr({ beforeTaxes: '3.00', afterTaxes: '3.63' }, '2.3.0')).toEqual({
      before_taxes: '3.00',
      taxes: [{ name: 'VAT', amount: '0.63' }],
    })
  })

  it.each<Version>(['2.2.1', '2.3.0'])('emits before-tax-only money when afterTaxes is null for %s', (version) => {
    expect(reportMoneyToCdr({ beforeTaxes: '3.00', afterTaxes: null }, version)).toEqual(
      version === '2.2.1' ? { excl_vat: '3.00' } : { before_taxes: '3.00' },
    )
  })
})
