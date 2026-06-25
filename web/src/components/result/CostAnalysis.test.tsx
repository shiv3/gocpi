import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CostAnalysis } from './CostAnalysis'
import type { Money, Report } from '@/model/dto'

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

describe('CostAnalysis', () => {
  it('renders chart sections after opening', () => {
    render(
      <CostAnalysis
        report={report}
        series={[{ t: '2026-06-24T09:10:00Z', label: '09:10', cost: 1.25 }]}
        unitMinutes={10}
        onUnitChange={() => {}}
        currency="EUR"
      />,
    )

    expect(screen.queryByText('Cost charts')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cost analysis' }))

    expect(screen.getByText('Cost charts')).toBeInTheDocument()
    expect(screen.getByText('Cumulative cost over time')).toBeInTheDocument()
  })
})
