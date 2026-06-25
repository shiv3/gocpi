import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CostChart } from './CostChart'
import type { Money, Report } from '../../model/dto'

const m = (beforeTaxes: string, afterTaxes: string | null = null): Money => ({ beforeTaxes, afterTaxes, taxes: [] })

const report: Report = {
  currency: 'EUR',
  totalCost: m('4.50', '5.45'),
  totalEnergyCost: m('3.00', '3.63'),
  totalTimeCost: m('1.50', '1.82'),
  totalParkingCost: m('0'),
  totalFixedCost: m('0'),
  totalReservationCost: null,
  dimensions: {
    ENERGY: { volume: '10', cost: m('3.00', '3.63') },
    TIME: { volume: '0.5', cost: m('1.50', '1.82') },
  },
  warnings: [],
}

describe('CostChart', () => {
  it('renders chart labels for dimension costs', () => {
    render(<CostChart report={report} />)

    expect(screen.getByText('Cost charts')).toBeInTheDocument()
    expect(screen.getAllByText('ENERGY').length).toBeGreaterThan(0)
  })
})
