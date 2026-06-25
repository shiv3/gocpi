import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EmbeddedTotalsEditor } from './EmbeddedTotalsEditor'
import type { EmbeddedTotalsForm } from '../../model/forms'

const embedded: EmbeddedTotalsForm = {
  totalCost: '3.00',
  totalEnergy: '10',
  totalTime: '0.5',
}

describe('EmbeddedTotalsEditor', () => {
  it('renders as a collapsible details section with current totals', () => {
    const { container } = render(<EmbeddedTotalsEditor value={embedded} onChange={vi.fn()} />)

    const details = container.querySelector('details')
    expect(details).toBeInTheDocument()
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText(/embedded totals/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^total_cost$/i)).toHaveValue('3.00')
    expect(screen.getByLabelText(/^total_energy$/i)).toHaveValue('10')
  })

  it('emits a total field edit immutably', () => {
    const onChange = vi.fn()
    render(<EmbeddedTotalsEditor value={embedded} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/^total_cost$/i), { target: { value: '4.20' } })

    const next = onChange.mock.calls[0][0] as EmbeddedTotalsForm
    expect(next).toEqual({ ...embedded, totalCost: '4.20' })
    expect(next).not.toBe(embedded)
    expect(embedded.totalCost).toBe('3.00')
  })
})
