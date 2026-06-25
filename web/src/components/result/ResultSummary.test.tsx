import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ResultSummary } from './ResultSummary'
import type { Money, Report } from '@/model/dto'

const m = (beforeTaxes: string, afterTaxes: string | null = null): Money => ({ beforeTaxes, afterTaxes, taxes: [] })

const report: Report = {
  currency: 'EUR',
  totalCost: m('4.50', '5.45'),
  totalEnergyCost: m('4.50', '5.45'),
  totalTimeCost: m('0'),
  totalParkingCost: m('0'),
  totalFixedCost: m('0'),
  totalReservationCost: null,
  dimensions: {},
  warnings: [],
}

describe('ResultSummary', () => {
  it('shows the after-tax total as the largest value', () => {
    render(<ResultSummary report={report} currency="EUR" />)

    expect(screen.getByLabelText('Total after tax')).toHaveTextContent('5.45 EUR')
    expect(screen.getByLabelText('Total after tax')).toHaveClass('text-4xl')
    expect(screen.getByLabelText('Before tax')).toHaveTextContent('4.50 EUR')
    expect(screen.getByLabelText('VAT')).toHaveTextContent('0.95 EUR')
  })
})
