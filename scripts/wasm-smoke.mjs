// Node-hosted smoke test for the gocpi wasm boundary.
// Usage: node scripts/wasm-smoke.mjs  (requires web/public/main.wasm + wasm_exec.js built first)
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

function assert(cond, msg) { if (!cond) { console.error('FAIL:', msg); process.exit(1) } }

const baseCdr = {
  country_code: 'NL',
  party_id: 'EXA',
  id: 'cdr1',
  start_date_time: '2026-06-24T09:00:00Z',
  end_date_time: '2026-06-24T10:00:00Z',
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
  currency: 'EUR',
  charging_periods: [
    {
      start_date_time: '2026-06-24T09:00:00Z',
      tariff_id: 'a',
      dimensions: [{ type: 'ENERGY', volume: '10' }],
    },
  ],
  total_energy: '10',
  total_time: '1',
  last_updated: '2026-06-24T09:00:00Z',
}

const v221obj = {
  ...baseCdr,
  tariffs: [
    {
      country_code: 'NL',
      party_id: 'EXA',
      id: 'a',
      currency: 'EUR',
      elements: [{ price_components: [{ type: 'ENERGY', price: '0.30', step_size: 1 }] }],
      last_updated: '2026-06-24T09:00:00Z',
    },
  ],
  total_cost: { excl_vat: '3.00' },
}
const v221cdr = JSON.stringify(v221obj)
const r1 = JSON.parse(globalThis.gocpiCalculate('2.2.1', v221cdr, JSON.stringify({ currencyPrecision: 2 })))
assert(r1.ok, 'v221 calculate ok: ' + JSON.stringify(r1))
assert(r1.report.totalEnergyCost.beforeTaxes === '3.00', 'v221 energy 3.00, got ' + r1.report.totalEnergyCost.beforeTaxes)

// timezone path must load (tzdata embedded)
const rTz = JSON.parse(globalThis.gocpiCalculate('2.2.1', v221cdr, JSON.stringify({ currencyPrecision: 2, timeZone: 'Europe/Berlin' })))
assert(rTz.ok, 'tz calculate ok (tzdata embedded): ' + JSON.stringify(rTz))

const v230obj = {
  ...baseCdr,
  tariffs: [
    {
      country_code: 'NL',
      party_id: 'EXA',
      id: 'a',
      currency: 'EUR',
      tax_included: 'NO',
      elements: [{ price_components: [{ type: 'ENERGY', price: '0.30', step_size: 1 }] }],
      last_updated: '2026-06-24T09:00:00Z',
    },
  ],
  total_cost: { before_taxes: '3.00' },
}
const r2 = JSON.parse(globalThis.gocpiCalculate('2.3.0', JSON.stringify(v230obj), JSON.stringify({ currencyPrecision: 2 })))
assert(r2.ok, 'v230 calculate ok: ' + JSON.stringify(r2))
assert(r2.report.totalEnergyCost.beforeTaxes === '3.00', 'v230 energy 3.00, got ' + r2.report.totalEnergyCost.beforeTaxes)

// verify path returns a verdict (v2.2.1)
const verCdr = JSON.parse(v221cdr)
verCdr.total_energy_cost = { excl_vat: '3.00' }
const ver = JSON.parse(globalThis.gocpiVerify('2.2.1', JSON.stringify(verCdr), JSON.stringify({ currencyPrecision: 2 })))
assert(ver.ok && ['OK', 'Mismatch', 'NotVerifiable'].includes(ver.verdict.status), 'v221 verify verdict: ' + JSON.stringify(ver))

// verify path returns a verdict (v2.3.0 - separate entrypoint, must be covered too)
const verCdr230 = JSON.parse(JSON.stringify(v230obj))
verCdr230.total_energy_cost = { before_taxes: '3.00' }
const ver230 = JSON.parse(globalThis.gocpiVerify('2.3.0', JSON.stringify(verCdr230), JSON.stringify({ currencyPrecision: 2 })))
assert(ver230.ok && ['OK', 'Mismatch', 'NotVerifiable'].includes(ver230.verdict.status), 'v230 verify verdict: ' + JSON.stringify(ver230))

// error path
const bad = JSON.parse(globalThis.gocpiCalculate('9.9.9', v221cdr, '{}'))
assert(bad.ok === false && bad.error.includes('unknown version'), 'unknown version error: ' + JSON.stringify(bad))

console.log('wasm smoke OK')
process.exit(0)
