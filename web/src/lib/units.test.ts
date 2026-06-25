import { describe, expect, it } from 'vitest'
import { billingUnitHuman, money, priceUnitLabel, usageUnitLabel } from './units'

describe('unit label formatters', () => {
  it('formats price units with the current currency', () => {
    expect(priceUnitLabel('ENERGY', 'USD')).toBe('USD / kWh')
    expect(priceUnitLabel('TIME', 'JPY')).toBe('JPY / hour')
    expect(priceUnitLabel('PARKING_TIME', 'EUR')).toBe('EUR / hour')
    expect(priceUnitLabel('FLAT', 'CHF')).toBe('CHF')
  })

  it('formats usage units', () => {
    expect(usageUnitLabel('ENERGY')).toBe('kWh')
    expect(usageUnitLabel('TIME')).toBe('hours')
    expect(usageUnitLabel('PARKING_TIME')).toBe('hours')
  })

  it('formats billing unit hints from the entered step', () => {
    expect(billingUnitHuman('ENERGY', 1000)).toBe('1000 Wh = 1 kWh')
    expect(billingUnitHuman('ENERGY', 1)).toBe('1 Wh = 0.001 kWh')
    expect(billingUnitHuman('TIME', 900)).toBe('900 sec = 15 min')
    expect(billingUnitHuman('PARKING_TIME', 3600)).toBe('3600 sec = 1 hour')
  })

  it('formats money without changing decimal text', () => {
    expect(money('3.00', 'EUR')).toBe('3.00 EUR')
    expect(money(4.5, 'USD')).toBe('4.5 USD')
    expect(money(null, 'JPY')).toBe('Not used')
  })
})
