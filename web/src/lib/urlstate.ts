import type { SimForm } from '../model/forms'
import type { Version } from '../wasm/api'

export interface PersistedState {
  v: 1
  version: Version
  mode: 'embedded' | 'override'
  timeZone: string
  currencyPrecision: number
  view: 'form' | 'json'
  form: SimForm
  rawJson: string | null
  presetKey: string
  timeSeriesUnit?: number
}

const versions = new Set<Version>(['2.2.1', '2.3.0'])
const modes = new Set<PersistedState['mode']>(['embedded', 'override'])
const views = new Set<PersistedState['view']>(['form', 'json'])
const currencyPrecisions = new Set([2, 3, 4])
const componentTypes = new Set(['ENERGY', 'TIME', 'PARKING_TIME', 'FLAT'])
const dimensionTypes = new Set(['ENERGY', 'TIME', 'PARKING_TIME'])
const taxIncludedValues = new Set(['YES', 'NO', 'N/A'])
const embeddedFields = [
  'totalCost',
  'totalEnergy',
  'totalTime',
  'totalEnergyCost',
  'totalTimeCost',
  'totalParkingCost',
  'totalFixedCost',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isRestriction(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    isOptionalString(value.startTime) &&
    isOptionalString(value.endTime) &&
    isOptionalString(value.minKwh) &&
    isOptionalString(value.maxKwh)
  )
}

function isComponent(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    componentTypes.has(value.type) &&
    typeof value.price === 'string' &&
    typeof value.stepSize === 'number' &&
    Number.isFinite(value.stepSize) &&
    isOptionalString(value.vat)
  )
}

function isElement(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.restriction === undefined || isRestriction(value.restriction)) &&
    Array.isArray(value.components) &&
    value.components.every(isComponent)
  )
}

function isTariff(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.currency === 'string' &&
    typeof value.taxIncluded === 'string' &&
    taxIncludedValues.has(value.taxIncluded) &&
    isOptionalString(value.minPrice) &&
    isOptionalString(value.maxPrice) &&
    Array.isArray(value.elements) &&
    value.elements.every(isElement)
  )
}

function isDimension(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    dimensionTypes.has(value.type) &&
    typeof value.volume === 'string'
  )
}

function isPeriod(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.start === 'string' &&
    isOptionalString(value.tariffId) &&
    Array.isArray(value.dimensions) &&
    value.dimensions.every(isDimension)
  )
}

function isEmbedded(value: unknown): boolean {
  return isRecord(value) && embeddedFields.every((field) => isOptionalString(value[field]))
}

function isSimForm(value: unknown): value is SimForm {
  return (
    isRecord(value) &&
    typeof value.currency === 'string' &&
    typeof value.countryCode === 'string' &&
    typeof value.start === 'string' &&
    typeof value.end === 'string' &&
    Array.isArray(value.tariffs) &&
    value.tariffs.every(isTariff) &&
    Array.isArray(value.periods) &&
    value.periods.every(isPeriod) &&
    isEmbedded(value.embedded)
  )
}

function isPersistedState(value: unknown): value is PersistedState {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.version === 'string' &&
    versions.has(value.version as Version) &&
    typeof value.mode === 'string' &&
    modes.has(value.mode as PersistedState['mode']) &&
    typeof value.timeZone === 'string' &&
    typeof value.currencyPrecision === 'number' &&
    currencyPrecisions.has(value.currencyPrecision) &&
    typeof value.view === 'string' &&
    views.has(value.view as PersistedState['view']) &&
    isSimForm(value.form) &&
    (value.rawJson === null || typeof value.rawJson === 'string') &&
    typeof value.presetKey === 'string' &&
    (value.timeSeriesUnit === undefined ||
      (typeof value.timeSeriesUnit === 'number' && Number.isFinite(value.timeSeriesUnit)))
  )
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

export function encodeState(state: PersistedState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)))
}

export function decodeState(hash: string): PersistedState | null {
  try {
    let encoded = hash.startsWith('#') ? hash.slice(1) : hash
    if (encoded.startsWith('state=')) {
      encoded = encoded.slice('state='.length)
    }
    if (!encoded) return null

    const json = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(encoded))
    const parsed = JSON.parse(json)
    return isPersistedState(parsed) ? parsed : null
  } catch {
    return null
  }
}
