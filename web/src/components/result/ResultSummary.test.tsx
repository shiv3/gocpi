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
    const { rerender } = render(<ResultSummary report={report} currency="EUR" />)

    const total = screen.getByLabelText('Total after tax')
    expect(total).toHaveTextContent('5.45 EUR')
    expect(total).toHaveClass('text-4xl')
    expect(total).toHaveClass('animate-value-flash')
    expect(total).toHaveAttribute('data-value-key', '5.45 EUR')
    expect(screen.getByLabelText('Before tax')).toHaveTextContent('4.50 EUR')
    expect(screen.getByLabelText('VAT')).toHaveTextContent('0.95 EUR')

    rerender(<ResultSummary report={{ ...report, totalCost: m('5.00', '6.05') }} currency="EUR" />)

    const changedTotal = screen.getByLabelText('Total after tax')
    expect(changedTotal).not.toBe(total)
    expect(changedTotal).toHaveClass('animate-value-flash')
    expect(changedTotal).toHaveAttribute('data-value-key', '6.05 EUR')
  })
})
