import type { DimType } from '../model/forms'

function compactNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
}

export function priceUnitLabel(type: DimType | string, currency: string): string {
  switch (type) {
    case 'ENERGY':
      return `${currency} / kWh`
    case 'TIME':
    case 'PARKING_TIME':
      return `${currency} / hour`
    case 'FLAT':
      return currency
    default:
      return currency
  }
}

export function usageUnitLabel(type: Exclude<DimType, 'FLAT'> | string): string {
  switch (type) {
    case 'ENERGY':
      return 'kWh'
    case 'TIME':
    case 'PARKING_TIME':
      return 'hours'
    default:
      return ''
  }
}

export function billingUnitHuman(type: DimType | string, step: number): string {
  if (!Number.isFinite(step)) return ''

  switch (type) {
    case 'ENERGY':
      return `${compactNumber(step)} Wh = ${compactNumber(step / 1000)} kWh`
    case 'TIME':
    case 'PARKING_TIME': {
      if (step % 3600 === 0) {
        return `${compactNumber(step)} sec = ${compactNumber(step / 3600)} hour${step === 3600 ? '' : 's'}`
      }
      if (step % 60 === 0) {
        return `${compactNumber(step)} sec = ${compactNumber(step / 60)} min`
      }
      return `${compactNumber(step)} sec`
    }
    case 'FLAT':
      return `${compactNumber(step)} charge${step === 1 ? '' : 's'}`
    default:
      return compactNumber(step)
  }
}

export function money(value: string | number | null | undefined, currency: string): string {
  if (value === null || value === undefined || value === '') return 'Not used'
  return `${value} ${currency}`
}
