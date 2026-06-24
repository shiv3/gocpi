import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CostBreakdown } from './CostBreakdown'
import type { Money, Report } from '../../model/dto'

const m = (beforeTaxes: string, afterTaxes: string | null = null): Money => ({ beforeTaxes, afterTaxes, taxes: [] })

const report: Report = {
  currency: 'EUR',
  totalCost: m('3.00'),
  totalEnergyCost: m('3.00'),
  totalTimeCost: m('0'),
  totalParkingCost: m('0'),
  totalFixedCost: m('0'),
  totalReservationCost: null,
  dimensions: { ENERGY: { volume: '10', cost: m('3.00') } },
  warnings: [],
}

describe('CostBreakdown', () => {
  it('shows total and energy cost', () => {
    render(<CostBreakdown report={report} />)

    expect(screen.getByText('EUR')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /total .* 3\.00/i })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /energy 10 3\.00/i })).toBeInTheDocument()
  })
})
