import type {
  ComponentForm,
  DimensionForm,
  EmbeddedTotalsForm,
  RestrictionForm,
  SimForm,
  TariffForm,
  TaxIncluded,
} from '../model/forms'
import type { Version } from '../wasm/api'

const money = (v: string, version: Version) => (version === '2.2.1' ? { excl_vat: v } : { before_taxes: v })

function negate(v: string): string {
  return v.startsWith('-') ? v.slice(1) : `-${v}`
}

// sumDecimals adds decimal strings exactly (scaled-integer/BigInt) to avoid float drift.
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

export function reportMoneyToCdr(m: { beforeTaxes: string; afterTaxes: string | null }, version: Version): object {
  if (version === '2.2.1') {
    return m.afterTaxes != null ? { excl_vat: m.beforeTaxes, incl_vat: m.afterTaxes } : { excl_vat: m.beforeTaxes }
  }

  if (m.afterTaxes == null) {
    return { before_taxes: m.beforeTaxes }
  }

  const taxAmount = sumDecimals([m.afterTaxes, negate(m.beforeTaxes)])
  return decimalIsZero(taxAmount)
    ? { before_taxes: m.beforeTaxes }
    : { before_taxes: m.beforeTaxes, taxes: [{ name: 'VAT', amount: taxAmount }] }
}

function countryAlpha3(countryCode: string): string {
  const upper = countryCode.toUpperCase()
  const known: Record<string, string> = {
    BE: 'BEL',
    DE: 'DEU',
    ES: 'ESP',
    FR: 'FRA',
    GB: 'GBR',
    IT: 'ITA',
    JP: 'JPN',
    NL: 'NLD',
    US: 'USA',
  }
  return known[upper] ?? 'NLD'
}

function defaultCdrToken(countryCode: string) {
  return {
    country_code: countryCode,
    party_id: 'EXA',
    uid: 'sim-token',
    type: 'OTHER',
    contract_id: 'sim-contract',
  }
}

function defaultCdrLocation(countryCode: string) {
  return {
    id: 'sim-location',
    address: 'Simulator Street 1',
    city: 'Simulator',
    country: countryAlpha3(countryCode),
    coordinates: { latitude: '52.36760', longitude: '4.90410' },
    evse_uid: 'sim-evse',
    evse_id: `${countryCode.toUpperCase()}*EXA*E1234567`,
    connector_id: '1',
    connector_standard: 'IEC_62196_T2',
    connector_format: 'SOCKET',
    connector_power_type: 'AC_3_PHASE',
  }
}

function restriction(restrictionForm: RestrictionForm | undefined) {
  if (!restrictionForm) return undefined

  const r: Record<string, string> = {}
  if (restrictionForm.startTime) r.start_time = restrictionForm.startTime
  if (restrictionForm.endTime) r.end_time = restrictionForm.endTime
  if (restrictionForm.minKwh) r.min_kwh = restrictionForm.minKwh
  if (restrictionForm.maxKwh) r.max_kwh = restrictionForm.maxKwh
  return Object.keys(r).length ? r : undefined
}

function tariff(t: TariffForm, version: Version, start: string, countryCode: string) {
  const out: any = {
    country_code: countryCode,
    party_id: 'EXA',
    id: t.id,
    currency: t.currency,
    last_updated: start,
    elements: t.elements.map((el) => {
      const e: any = {
        price_components: el.components.map((c) => {
          const o: any = { type: c.type, price: c.price, step_size: c.stepSize }
          if (c.vat) o.vat = c.vat
          return o
        }),
      }
      const r = restriction(el.restriction)
      if (r) e.restrictions = r
      return e
    }),
  }
  if (t.minPrice) out.min_price = money(t.minPrice, version)
  if (t.maxPrice) out.max_price = money(t.maxPrice, version)
  if (version === '2.3.0') out.tax_included = t.taxIncluded
  return out
}

export function serialize(form: SimForm, version: Version): object {
  const cdr: any = {
    country_code: form.countryCode,
    party_id: 'EXA',
    id: 'sim-cdr',
    start_date_time: form.start,
    end_date_time: form.end,
    cdr_token: defaultCdrToken(form.countryCode),
    auth_method: 'WHITELIST',
    cdr_location: defaultCdrLocation(form.countryCode),
    currency: form.currency,
    tariffs: form.tariffs.map((t) => tariff(t, version, form.start, form.countryCode)),
    charging_periods: form.periods.map((p) => {
      const o: any = {
        start_date_time: p.start,
        dimensions: p.dimensions.map((d) => ({ type: d.type, volume: d.volume })),
      }
      if (p.tariffId) o.tariff_id = p.tariffId
      return o
    }),
    last_updated: form.start,
  }
  const e = form.embedded

  const energyVols = form.periods.flatMap((p) => p.dimensions.filter((d) => d.type === 'ENERGY').map((d) => d.volume))
  const timeVols = form.periods.flatMap((p) => p.dimensions.filter((d) => d.type === 'TIME').map((d) => d.volume))
  cdr.total_cost = money(e.totalCost ?? '0', version)
  cdr.total_energy = e.totalEnergy ?? sumDecimals(energyVols)
  cdr.total_time = e.totalTime ?? sumDecimals(timeVols)
  if (e.totalEnergyCost) cdr.total_energy_cost = money(e.totalEnergyCost, version)
  if (e.totalTimeCost) cdr.total_time_cost = money(e.totalTimeCost, version)
  if (e.totalParkingCost) cdr.total_parking_cost = money(e.totalParkingCost, version)
  if (e.totalFixedCost) cdr.total_fixed_cost = money(e.totalFixedCost, version)
  return cdr
}

function valueString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined
  return String(value)
}

function moneyValue(value: any, version: Version): string | undefined {
  if (!value || typeof value !== 'object') return undefined
  const preferred = version === '2.2.1' ? value.excl_vat : value.before_taxes
  return valueString(preferred ?? value.excl_vat ?? value.before_taxes)
}

function decimalIsZero(value: string): boolean {
  return /^-?0+(?:\.0+)?$/.test(value)
}

function deserializeComponent(c: any): ComponentForm {
  const out: ComponentForm = {
    type: c?.type ?? 'ENERGY',
    price: valueString(c?.price) ?? '0',
    stepSize: Number(c?.step_size ?? 1),
  }
  const vat = valueString(c?.vat)
  if (vat !== undefined) out.vat = vat
  return out
}

function deserializeRestriction(r: any): RestrictionForm | undefined {
  if (!r || typeof r !== 'object') return undefined
  const out: RestrictionForm = {}
  const startTime = valueString(r.start_time)
  const endTime = valueString(r.end_time)
  const minKwh = valueString(r.min_kwh)
  const maxKwh = valueString(r.max_kwh)
  if (startTime !== undefined) out.startTime = startTime
  if (endTime !== undefined) out.endTime = endTime
  if (minKwh !== undefined) out.minKwh = minKwh
  if (maxKwh !== undefined) out.maxKwh = maxKwh
  return Object.keys(out).length ? out : undefined
}

function deserializeTariff(t: any, version: Version, fallbackCurrency: string): TariffForm {
  const out: TariffForm = {
    id: valueString(t?.id) ?? '',
    currency: valueString(t?.currency) ?? fallbackCurrency,
    taxIncluded: (valueString(t?.tax_included) as TaxIncluded | undefined) ?? 'NO',
    elements: Array.isArray(t?.elements)
      ? t.elements.map((el: any) => {
          const element: TariffForm['elements'][number] = {
            components: Array.isArray(el?.price_components) ? el.price_components.map(deserializeComponent) : [],
          }
          const r = deserializeRestriction(el?.restrictions)
          if (r) element.restriction = r
          return element
        })
      : [],
  }
  const minPrice = moneyValue(t?.min_price, version)
  const maxPrice = moneyValue(t?.max_price, version)
  if (minPrice !== undefined) out.minPrice = minPrice
  if (maxPrice !== undefined) out.maxPrice = maxPrice
  return out
}

function deserializeDimension(d: any): DimensionForm | null {
  if (d?.type !== 'ENERGY' && d?.type !== 'TIME' && d?.type !== 'PARKING_TIME') return null
  return { type: d.type, volume: valueString(d.volume) ?? '0' }
}

function isDimensionForm(d: DimensionForm | null): d is DimensionForm {
  return d !== null
}

function addEmbeddedMoney(
  embedded: EmbeddedTotalsForm,
  formKey: keyof EmbeddedTotalsForm,
  cdr: any,
  jsonKey: string,
  version: Version,
  omitZero = false,
) {
  const value = moneyValue(cdr?.[jsonKey], version)
  if (value === undefined || (omitZero && decimalIsZero(value))) return
  embedded[formKey] = value
}

export function deserialize(cdr: any, version: Version): SimForm {
  const currency = valueString(cdr?.currency) ?? valueString(cdr?.tariffs?.[0]?.currency) ?? 'EUR'
  const countryCode = valueString(cdr?.country_code) ?? 'NL'
  const periods = Array.isArray(cdr?.charging_periods)
    ? cdr.charging_periods.map((p: any) => {
        const out: SimForm['periods'][number] = {
          start: valueString(p?.start_date_time) ?? valueString(cdr?.start_date_time) ?? '',
          dimensions: Array.isArray(p?.dimensions) ? p.dimensions.map(deserializeDimension).filter(isDimensionForm) : [],
        }
        const tariffId = valueString(p?.tariff_id)
        if (tariffId !== undefined) out.tariffId = tariffId
        return out
      })
    : []

  const embedded: EmbeddedTotalsForm = {}
  addEmbeddedMoney(embedded, 'totalCost', cdr, 'total_cost', version, true)
  addEmbeddedMoney(embedded, 'totalEnergyCost', cdr, 'total_energy_cost', version)
  addEmbeddedMoney(embedded, 'totalTimeCost', cdr, 'total_time_cost', version)
  addEmbeddedMoney(embedded, 'totalParkingCost', cdr, 'total_parking_cost', version)
  addEmbeddedMoney(embedded, 'totalFixedCost', cdr, 'total_fixed_cost', version)

  const totalEnergy = valueString(cdr?.total_energy)
  const totalTime = valueString(cdr?.total_time)
  if (totalEnergy !== undefined && !decimalIsZero(totalEnergy)) embedded.totalEnergy = totalEnergy
  if (totalTime !== undefined && !decimalIsZero(totalTime)) embedded.totalTime = totalTime

  return {
    currency,
    countryCode,
    start: valueString(cdr?.start_date_time) ?? '',
    end: valueString(cdr?.end_date_time) ?? '',
    tariffs: Array.isArray(cdr?.tariffs) ? cdr.tariffs.map((t: any) => deserializeTariff(t, version, currency)) : [],
    periods,
    embedded,
  }
}
