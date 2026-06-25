// End-to-end feature coverage for the gocpi wasm boundary.
// Usage: node scripts/wasm-features.mjs  (requires web/public/main.wasm + wasm_exec.js built first)
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const dir = path.dirname(fileURLToPath(import.meta.url))
const pub = path.join(dir, '..', 'web', 'public')

await import(path.join(pub, 'wasm_exec.js')) // defines globalThis.Go
const go = new globalThis.Go()
const bytes = await readFile(path.join(pub, 'main.wasm'))
const { instance } = await WebAssembly.instantiate(bytes, go.importObject)
go.run(instance) // registers globals; returns when main exits (it blocks on select{})

function assert(cond, label) {
  if (!cond) {
    console.error('FAIL:', label)
    process.exit(1)
  }
}

function assertEq(actual, expected, label) {
  assert(actual === expected, `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
}

function assertIncludes(actual, expected, label) {
  assert(String(actual).includes(expected), `${label}: expected ${JSON.stringify(actual)} to include ${JSON.stringify(expected)}`)
}

const versions = ['2.2.1', '2.3.0']
const start = '2026-06-24T09:00:00Z'
const end = '2026-06-24T10:00:00Z'

function money(version, value) {
  return version === '2.2.1' ? { excl_vat: value } : { before_taxes: value }
}

function component(type, price, stepSize = 1, vat) {
  const out = { type, price, step_size: stepSize }
  if (vat !== undefined) out.vat = vat
  return out
}

function tariff(version, {
  id = 'a',
  currency = 'EUR',
  taxIncluded = 'NO',
  minPrice,
  maxPrice,
  elements = [{ price_components: [component('ENERGY', '0.30')] }],
} = {}) {
  const out = {
    country_code: 'NL',
    party_id: 'EXA',
    id,
    currency,
    elements,
    last_updated: start,
  }
  if (minPrice !== undefined) out.min_price = money(version, minPrice)
  if (maxPrice !== undefined) out.max_price = money(version, maxPrice)
  if (version === '2.3.0') out.tax_included = taxIncluded
  return out
}

function period(periodStart, dimensions, tariffId) {
  const out = { start_date_time: periodStart, dimensions }
  if (tariffId !== undefined) out.tariff_id = tariffId
  return out
}

function dim(type, volume) {
  return { type, volume }
}

function baseCdr(version, {
  cdrStart = start,
  cdrEnd = end,
  currency = 'EUR',
  tariffs,
  periods,
  totalCost = '0',
  totalEnergy = '0',
  totalTime = '0',
  totalEnergyCost,
  totalTimeCost,
  totalParkingCost,
  totalFixedCost,
} = {}) {
  const cdr = {
    country_code: 'NL',
    party_id: 'EXA',
    id: 'feature-cdr',
    start_date_time: cdrStart,
    end_date_time: cdrEnd,
    cdr_token: {
      country_code: 'NL',
      party_id: 'EXA',
      uid: 'token1',
      type: 'RFID',
      contract_id: 'NL-EXA-C123',
    },
    auth_method: 'WHITELIST',
    cdr_location: {
      id: 'loc1',
      address: 'Main St 1',
      city: 'Amsterdam',
      country: 'NLD',
      coordinates: { latitude: '52.36760', longitude: '4.90410' },
      evse_uid: 'evse1',
      evse_id: 'NL*EXA*E1',
      connector_id: '1',
      connector_standard: 'IEC_62196_T2',
      connector_format: 'SOCKET',
      connector_power_type: 'AC_3_PHASE',
    },
    currency,
    tariffs: tariffs ?? [tariff(version)],
    charging_periods: periods ?? [period(start, [dim('ENERGY', '10')], 'a')],
    total_cost: money(version, totalCost),
    total_energy: totalEnergy,
    total_time: totalTime,
    last_updated: cdrStart,
  }
  if (totalEnergyCost !== undefined) cdr.total_energy_cost = money(version, totalEnergyCost)
  if (totalTimeCost !== undefined) cdr.total_time_cost = money(version, totalTimeCost)
  if (totalParkingCost !== undefined) cdr.total_parking_cost = money(version, totalParkingCost)
  if (totalFixedCost !== undefined) cdr.total_fixed_cost = money(version, totalFixedCost)
  return cdr
}

function callCalculate(version, cdr, opts = { currencyPrecision: 2 }) {
  return JSON.parse(globalThis.gocpiCalculate(version, JSON.stringify(cdr), JSON.stringify(opts)))
}

function calculate(label, version, cdr, opts = { currencyPrecision: 2 }) {
  const out = callCalculate(version, cdr, opts)
  assert(out.ok, `${label} calculate ${version}: ${JSON.stringify(out)}`)
  return out.report
}

function callVerify(version, cdr, opts = { currencyPrecision: 2 }) {
  return JSON.parse(globalThis.gocpiVerify(version, JSON.stringify(cdr), JSON.stringify(opts)))
}

function verify(label, version, cdr, opts = { currencyPrecision: 2 }) {
  const out = callVerify(version, cdr, opts)
  assert(out.ok, `${label} verify ${version}: ${JSON.stringify(out)}`)
  return out.verdict
}

function warning(warnings, code, predicate = () => true) {
  return warnings.find((w) => w.code === code && predicate(w))
}

function assertWarning(warnings, code, label, predicate) {
  assert(warning(warnings, code, predicate), `${label}: missing ${code} in ${JSON.stringify(warnings)}`)
}

function singleEnergy(version) {
  const cdr = baseCdr(version, {
    totalCost: '3.00',
    totalEnergy: '10',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
  })
  const rep = calculate('single ENERGY tariff', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '3.00', `single ENERGY tariff energy cost ${version}`)
  assertEq(rep.totalCost.beforeTaxes, '3.00', `single ENERGY tariff total ${version}`)
}

function timeParkingFlat(version) {
  const cdr = baseCdr(version, {
    totalCost: '3.50',
    totalTime: '0.5',
    tariffs: [
      tariff(version, {
        elements: [{
          price_components: [
            component('TIME', '2.00'),
            component('PARKING_TIME', '4.00'),
            component('FLAT', '1.50'),
          ],
        }],
      }),
    ],
    periods: [period(start, [dim('TIME', '0.5'), dim('PARKING_TIME', '0.25')], 'a')],
  })
  const rep = calculate('TIME PARKING_TIME FLAT components', version, cdr)
  assertEq(rep.totalTimeCost.beforeTaxes, '1.00', `TIME cost ${version}`)
  assertEq(rep.totalParkingCost.beforeTaxes, '1.00', `PARKING_TIME cost ${version}`)
  assertEq(rep.totalFixedCost.beforeTaxes, '1.50', `FLAT cost ${version}`)
  assertEq(rep.totalCost.beforeTaxes, '3.50', `TIME/PARKING/FLAT total ${version}`)
}

function stepRounding(version) {
  const cdr = baseCdr(version, {
    totalCost: '0.30',
    totalEnergy: '0.4',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '0.30', 1000)] }] })],
    periods: [period(start, [dim('ENERGY', '0.4')], 'a')],
  })
  const rep = calculate('ENERGY step_size rounding', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '0.30', `ENERGY step_size rounded cost ${version}`)
  assertEq(rep.dimensions.ENERGY.volume, '0.4', `ENERGY step_size raw volume ${version}`)
}

function multiTariff(version) {
  const cdr = baseCdr(version, {
    cdrEnd: '2026-06-24T11:00:00Z',
    totalCost: '3.00',
    totalEnergy: '10',
    tariffs: [
      tariff(version, { id: 'peak', elements: [{ price_components: [component('ENERGY', '0.40')] }] }),
      tariff(version, { id: 'offpeak', elements: [{ price_components: [component('ENERGY', '0.20')] }] }),
    ],
    periods: [
      period(start, [dim('ENERGY', '5')], 'peak'),
      period('2026-06-24T10:00:00Z', [dim('ENERGY', '5')], 'offpeak'),
    ],
  })
  const rep = calculate('multi-tariff periods', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '3.00', `multi-tariff energy cost ${version}`)
  assertEq(rep.totalCost.beforeTaxes, '3.00', `multi-tariff total ${version}`)
}

function noTariffPeriod(version) {
  const cdr = baseCdr(version, {
    cdrEnd: '2026-06-24T11:00:00Z',
    totalCost: '0.80',
    totalEnergy: '7',
    tariffs: [
      tariff(version, { id: 'a', elements: [{ price_components: [component('ENERGY', '0.30')] }] }),
      tariff(version, { id: 'b', elements: [{ price_components: [component('ENERGY', '0.50')] }] }),
    ],
    periods: [
      period(start, [dim('ENERGY', '1')], 'a'),
      period('2026-06-24T09:30:00Z', [dim('ENERGY', '5')]),
      period('2026-06-24T10:00:00Z', [dim('ENERGY', '1')], 'b'),
    ],
  })
  const rep = calculate('no-tariff period', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '0.80', `no-tariff period contributes zero ${version}`)
  assertEq(rep.dimensions.ENERGY.volume, '2', `no-tariff period excluded from priced volume ${version}`)
  assertWarning(rep.warnings, 'WarnPeriodNoTariff', `no-tariff warning ${version}`, (w) => w.periodIndex === 1)
}

function minClamp(version) {
  const cdr = baseCdr(version, {
    totalCost: '2.00',
    totalEnergy: '1',
    tariffs: [tariff(version, { minPrice: '2.00', elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
    periods: [period(start, [dim('ENERGY', '1')], 'a')],
  })
  const rep = calculate('min_price clamp', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '0.30', `min_price unclamped energy ${version}`)
  assertEq(rep.totalCost.beforeTaxes, '2.00', `min_price clamps total ${version}`)
}

function maxClamp(version) {
  const cdr = baseCdr(version, {
    totalCost: '2.00',
    totalEnergy: '10',
    tariffs: [tariff(version, { maxPrice: '2.00', elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
    periods: [period(start, [dim('ENERGY', '10')], 'a')],
  })
  const rep = calculate('max_price clamp', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '3.00', `max_price unclamped energy ${version}`)
  assertEq(rep.totalCost.beforeTaxes, '2.00', `max_price clamps total ${version}`)
}

function multiTariffMinMax(version) {
  const cdr = baseCdr(version, {
    totalCost: '5.00',
    totalEnergy: '2',
    tariffs: [
      tariff(version, { id: 'a', minPrice: '5.00', elements: [{ price_components: [component('ENERGY', '0.30')] }] }),
      tariff(version, { id: 'b', elements: [{ price_components: [component('ENERGY', '0.50')] }] }),
    ],
    periods: [
      period(start, [dim('ENERGY', '1')], 'a'),
      period('2026-06-24T09:30:00Z', [dim('ENERGY', '1')], 'b'),
    ],
  })
  const rep = calculate('multi-tariff min/max undefined', version, cdr)
  assertEq(rep.totalCost.beforeTaxes, '0.80', `multi-tariff min/max does not clamp ${version}`)
  assertWarning(rep.warnings, 'WarnMinMaxUndefinedMultiTariff', `multi-tariff min/max warning ${version}`)

  const verdict = verify('multi-tariff min/max undefined', version, cdr)
  assertEq(verdict.status, 'NotVerifiable', `multi-tariff min/max verify status ${version}`)
  assertEq(verdict.mismatches.length, 0, `multi-tariff min/max no mismatches ${version}`)
  assertWarning(verdict.warnings, 'WarnMinMaxUndefinedMultiTariff', `multi-tariff min/max verify warning ${version}`)
}

function timeWindowTimezone(version) {
  const cdr = baseCdr(version, {
    cdrStart: '2026-06-24T08:00:00Z',
    cdrEnd: '2026-06-24T11:00:00Z',
    totalEnergy: '10',
    tariffs: [
      tariff(version, {
        id: 'tod',
        elements: [
          {
            restrictions: { start_time: '09:00', end_time: '18:00' },
            price_components: [component('ENERGY', '0.40')],
          },
          { price_components: [component('ENERGY', '0.20')] },
        ],
      }),
    ],
    periods: [period('2026-06-24T08:30:00Z', [dim('ENERGY', '10')], 'tod')],
  })
  const utc = calculate('time-window UTC', version, cdr, { currencyPrecision: 2, timeZone: 'UTC' })
  assertEq(utc.totalEnergyCost.beforeTaxes, '2.00', `time-window UTC fallback ${version}`)
  const amsterdam = calculate('time-window Europe/Amsterdam', version, cdr, {
    currencyPrecision: 2,
    timeZone: 'Europe/Amsterdam',
  })
  assertEq(amsterdam.totalEnergyCost.beforeTaxes, '4.00', `time-window Amsterdam restricted element ${version}`)
}

function kwhRestriction(version) {
  const cdr = baseCdr(version, {
    cdrEnd: '2026-06-24T11:00:00Z',
    totalCost: '3.50',
    totalEnergy: '15',
    tariffs: [
      tariff(version, {
        elements: [
          {
            restrictions: { min_kwh: '5', max_kwh: '10' },
            price_components: [component('ENERGY', '0.50')],
          },
          { price_components: [component('ENERGY', '0.10')] },
        ],
      }),
    ],
    periods: [
      period(start, [dim('ENERGY', '5')], 'a'),
      period('2026-06-24T09:30:00Z', [dim('ENERGY', '5')], 'a'),
      period('2026-06-24T10:00:00Z', [dim('ENERGY', '5')], 'a'),
    ],
  })
  const rep = calculate('min_kwh/max_kwh restriction', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '3.50', `min_kwh/max_kwh cumulative selection ${version}`)
}

function verifyOK(version) {
  const cdr = baseCdr(version, {
    totalCost: '3.00',
    totalEnergy: '10',
    totalEnergyCost: '3.00',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
  })
  const verdict = verify('verify OK', version, cdr)
  assertEq(verdict.status, 'OK', `verify OK status ${version}`)
  assertEq(verdict.mismatches.length, 0, `verify OK mismatches ${version}`)
}

function verifyMismatch(version) {
  const cdr = baseCdr(version, {
    totalCost: '4.00',
    totalEnergy: '10',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
  })
  const verdict = verify('verify mismatch', version, cdr)
  assertEq(verdict.status, 'Mismatch', `verify mismatch status ${version}`)
  assert(verdict.mismatches.some((m) => m.field === 'total_cost'), `verify mismatch total_cost entry ${version}`)
}

function vatTotalCost(version) {
  return version === '2.2.1'
    ? { excl_vat: '10.00', incl_vat: '12.00' }
    : { before_taxes: '10.00', taxes: [{ name: 'VAT', amount: '2.00' }] }
}

function verifyVatOK(version) {
  const cdr = baseCdr(version, {
    totalCost: '10.00',
    totalEnergy: '10',
    tariffs: [
      tariff(version, {
        taxIncluded: 'NO',
        elements: [{ price_components: [component('ENERGY', '1.00', 1, '20')] }],
      }),
    ],
    periods: [period(start, [dim('ENERGY', '10')], 'a')],
  })
  cdr.total_cost = vatTotalCost(version)

  const rep = calculate('verify VAT after-tax embedded total', version, cdr)
  assertEq(rep.totalCost.beforeTaxes, '10.00', `verify VAT before tax ${version}`)
  assertEq(rep.totalCost.afterTaxes, '12.00', `verify VAT after tax ${version}`)

  const verdict = verify('verify VAT after-tax embedded total', version, cdr)
  assertEq(verdict.status, 'OK', `verify VAT after-tax status ${version}`)
  assertEq(verdict.mismatches.length, 0, `verify VAT after-tax mismatches ${version}`)

  const beforeOnly = JSON.parse(JSON.stringify(cdr))
  beforeOnly.total_cost = money(version, '10.00')
  const beforeOnlyVerdict = verify('verify VAT before-tax-only embedded total', version, beforeOnly)
  assertEq(beforeOnlyVerdict.status, 'NotVerifiable', `verify VAT before-tax-only status ${version}`)
  assertEq(beforeOnlyVerdict.mismatches.length, 0, `verify VAT before-tax-only mismatches ${version}`)
  assertWarning(
    beforeOnlyVerdict.warnings,
    'WarnAfterTaxNotDerivable',
    `verify VAT before-tax-only warning ${version}`,
    (w) => w.message.includes('total_cost after-tax total is not derivable'),
  )
  assert(
    !warning(beforeOnlyVerdict.warnings, 'WarnUnsupportedRestriction'),
    `verify VAT before-tax-only warning code ${version}: ${JSON.stringify(beforeOnlyVerdict.warnings)}`,
  )
}

function verifyReservationNotVerifiable(version) {
  const cdr = baseCdr(version, {
    totalCost: '3.00',
    totalEnergy: '10',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
  })
  cdr.total_reservation_cost = money(version, '1.00')

  const verdict = verify('verify reservation not computed', version, cdr)
  assertEq(verdict.status, 'NotVerifiable', `verify reservation status ${version}`)
  assertEq(verdict.mismatches.length, 0, `verify reservation mismatches ${version}`)
  assertWarning(
    verdict.warnings,
    'WarnReservationNotComputed',
    `verify reservation warning ${version}`,
    (w) => w.message.includes('total_reservation_cost'),
  )
}

function mixedStepSize(version) {
  const cdr = baseCdr(version, {
    totalCost: '0.42',
    totalEnergy: '0.8',
    tariffs: [
      tariff(version, { id: 'a', elements: [{ price_components: [component('ENERGY', '0.30', 1000)] }] }),
      tariff(version, { id: 'b', elements: [{ price_components: [component('ENERGY', '0.50', 500)] }] }),
    ],
    periods: [
      period(start, [dim('ENERGY', '0.4')], 'a'),
      period('2026-06-24T09:30:00Z', [dim('ENERGY', '0.4')], 'b'),
    ],
  })
  const rep = calculate('mixed step_size warning', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '0.42', `mixed step_size energy cost ${version}`)
  assertWarning(rep.warnings, 'WarnMixedStepSize', `mixed step_size warning ${version}`, (w) => w.dimension === 'ENERGY')
}

function unusedTariff(version) {
  const cdr = baseCdr(version, {
    totalCost: '0.30',
    totalEnergy: '1',
    tariffs: [
      tariff(version, { id: 'a', elements: [{ price_components: [component('ENERGY', '0.30')] }] }),
      tariff(version, { id: 'unused', elements: [{ price_components: [component('ENERGY', '0.20')] }] }),
    ],
    periods: [period(start, [dim('ENERGY', '1')], 'a')],
  })
  const rep = calculate('unused embedded tariff warning', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '0.30', `unused tariff priced cost ${version}`)
  assertWarning(rep.warnings, 'WarnUnusedTariff', `unused tariff warning ${version}`, (w) => w.tariffIndex === 1)
}

function currencyPrecision(version) {
  const cdr = baseCdr(version, {
    totalCost: '3.00',
    totalEnergy: '10',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
  })
  const p2 = calculate('currencyPrecision 2', version, cdr, { currencyPrecision: 2 })
  const p4 = calculate('currencyPrecision 4', version, cdr, { currencyPrecision: 4 })
  assertEq(p2.totalEnergyCost.beforeTaxes, '3.00', `currencyPrecision 2 ${version}`)
  assertEq(p4.totalEnergyCost.beforeTaxes, '3.0000', `currencyPrecision 4 ${version}`)
}

function v221Vat() {
  const version = '2.2.1'
  const cdr = baseCdr(version, {
    totalCost: '10.00',
    totalEnergy: '10',
    tariffs: [tariff(version, { elements: [{ price_components: [component('ENERGY', '1.00', 1, '20')] }] })],
    periods: [period(start, [dim('ENERGY', '10')], 'a')],
  })
  const rep = calculate('v2.2.1 component vat', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '10.00', 'v2.2.1 VAT before tax')
  assertEq(rep.totalEnergyCost.afterTaxes, '12', 'v2.2.1 VAT after tax')
  assertEq(rep.totalEnergyCost.taxes[0].percent, '20', 'v2.2.1 VAT tax percent')
}

function v230TaxIncludedYes() {
  const version = '2.3.0'
  const cdr = baseCdr(version, {
    totalCost: '10.00',
    totalEnergy: '10',
    tariffs: [
      tariff(version, {
        taxIncluded: 'YES',
        elements: [{ price_components: [component('ENERGY', '1.20', 1, '20')] }],
      }),
    ],
    periods: [period(start, [dim('ENERGY', '10')], 'a')],
  })
  const rep = calculate('v2.3.0 tax_included YES', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '10.00', 'v2.3.0 tax_included YES backs out before tax')
  assertEq(rep.totalEnergyCost.afterTaxes, '12', 'v2.3.0 tax_included YES after tax')
  assertEq(rep.totalEnergyCost.taxes[0].percent, '20', 'v2.3.0 tax_included YES tax percent')
}

function v230TaxIncludedNo() {
  const version = '2.3.0'
  const cdr = baseCdr(version, {
    totalCost: '10.00',
    totalEnergy: '10',
    tariffs: [
      tariff(version, {
        taxIncluded: 'NO',
        elements: [{ price_components: [component('ENERGY', '1.00', 1, '20')] }],
      }),
    ],
    periods: [period(start, [dim('ENERGY', '10')], 'a')],
  })
  const rep = calculate('v2.3.0 tax_included NO', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '10.00', 'v2.3.0 tax_included NO before tax')
  assertEq(rep.totalEnergyCost.afterTaxes, '12', 'v2.3.0 tax_included NO after tax')
  assertEq(rep.totalEnergyCost.taxes[0].percent, '20', 'v2.3.0 tax_included NO tax percent')
}

function v230TaxIncludedNA() {
  const version = '2.3.0'
  const cdr = baseCdr(version, {
    totalCost: '10.00',
    totalEnergy: '10',
    tariffs: [
      tariff(version, {
        taxIncluded: 'N/A',
        elements: [{ price_components: [component('ENERGY', '1.00', 1, '20')] }],
      }),
    ],
    periods: [period(start, [dim('ENERGY', '10')], 'a')],
  })
  const rep = calculate('v2.3.0 tax_included N/A', version, cdr)
  assertEq(rep.totalEnergyCost.beforeTaxes, '10.00', 'v2.3.0 tax_included N/A before tax')
  assertEq(rep.totalEnergyCost.afterTaxes, null, 'v2.3.0 tax_included N/A ignores VAT after tax')
  assertEq(rep.totalEnergyCost.taxes.length, 0, 'v2.3.0 tax_included N/A ignores VAT taxes')
}

function assertError(label, version, cdr, substring) {
  const out = callCalculate(version, cdr)
  assert(out.ok === false, `${label} expected ok:false ${version}: ${JSON.stringify(out)}`)
  assertIncludes(out.error, substring, `${label} error substring ${version}`)
}

function errorCases(version) {
  assertError(
    'currency mismatch',
    version,
    baseCdr(version, {
      totalEnergy: '1',
      tariffs: [tariff(version, { currency: 'USD', elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
      periods: [period(start, [dim('ENERGY', '1')], 'a')],
    }),
    'currency mismatch',
  )

  assertError(
    'unknown tariff_id',
    version,
    baseCdr(version, {
      totalEnergy: '1',
      tariffs: [tariff(version, { id: 'a', elements: [{ price_components: [component('ENERGY', '0.30')] }] })],
      periods: [period(start, [dim('ENERGY', '1')], 'missing')],
    }),
    'unknown tariff_id',
  )

  assertError(
    'CDR has no embedded tariffs (InvalidInput)',
    version,
    baseCdr(version, {
      tariffs: [],
      periods: [period(start, [dim('ENERGY', '1')])],
    }),
    'CDR has no embedded tariffs',
  )

  assertError(
    'duplicate embedded tariff id',
    version,
    baseCdr(version, {
      totalEnergy: '1',
      tariffs: [
        tariff(version, { id: 'dup', elements: [{ price_components: [component('ENERGY', '0.30')] }] }),
        tariff(version, { id: 'dup', elements: [{ price_components: [component('ENERGY', '0.20')] }] }),
      ],
      periods: [period(start, [dim('ENERGY', '1')], 'dup')],
    }),
    'duplicate embedded tariff id',
  )

  assertError(
    'multi-tariff empty id',
    version,
    baseCdr(version, {
      totalEnergy: '1',
      tariffs: [
        tariff(version, { id: '', elements: [{ price_components: [component('ENERGY', '0.30')] }] }),
        tariff(version, { id: 'b', elements: [{ price_components: [component('ENERGY', '0.20')] }] }),
      ],
      periods: [period(start, [dim('ENERGY', '1')], 'b')],
    }),
    'has empty id',
  )
}

for (const version of versions) {
  singleEnergy(version)
  timeParkingFlat(version)
  stepRounding(version)
  multiTariff(version)
  noTariffPeriod(version)
  minClamp(version)
  maxClamp(version)
  multiTariffMinMax(version)
  timeWindowTimezone(version)
  kwhRestriction(version)
  verifyOK(version)
  verifyMismatch(version)
  verifyVatOK(version)
  verifyReservationNotVerifiable(version)
  mixedStepSize(version)
  unusedTariff(version)
  currencyPrecision(version)
  errorCases(version)
}

v221Vat()
v230TaxIncludedYes()
v230TaxIncludedNo()
v230TaxIncludedNA()

const unknownVersion = callCalculate('9.9.9', baseCdr('2.2.1'), {})
assert(unknownVersion.ok === false, `unknown version expected ok:false: ${JSON.stringify(unknownVersion)}`)
assertIncludes(unknownVersion.error, 'unknown version', 'unknown version error substring')

console.log('wasm features OK')
process.exit(0)
