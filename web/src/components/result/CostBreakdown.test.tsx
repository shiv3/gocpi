import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CostBreakdown } from './CostBreakdown'
import type { Money, Report } from '@/model/dto'

const m = (beforeTaxes: string, afterTaxes: string | null = null): Money => ({ beforeTaxes, afterTaxes, taxes: [] })

const report: Report = {
  currency: 'EUR',
  totalCost: m('4.00', '4.63'),
  totalEnergyCost: m('3.00'),
  totalTimeCost: m('0', '0'),
  totalParkingCost: m('0'),
  totalFixedCost: m('1.00'),
  totalReservationCost: null,
  dimensions: {
    ENERGY: { volume: '10', cost: m('3.00', '3.63') },
    TIME: { volume: '0', cost: m('0', '0') },
  },
  warnings: [],
}

describe('CostBreakdown', () => {
  it('renders one row per used dimension and never renders n/a', () => {
    render(<CostBreakdown report={report} currency="EUR" />)

    expect(screen.getByRole('row', { name: /energy 10 kwh 3\.00 eur 3\.63 eur/i })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /flat fee not used 1\.00 eur not used/i })).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /charging time/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/n\/a/i)).not.toBeInTheDocument()
  })
})
