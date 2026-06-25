import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TariffEditor } from './TariffEditor'
import type { TariffForm, TaxIncluded } from '../../model/forms'

const tariff: TariffForm = {
  id: 'fast',
  currency: 'EUR',
  taxIncluded: 'NO',
  minPrice: '1.00',
  maxPrice: '9.00',
  elements: [
    { components: [{ type: 'ENERGY', price: '0.30', stepSize: 1 }] },
    { components: [{ type: 'TIME', price: '2.00', stepSize: 900 }] },
  ],
}

describe('TariffEditor', () => {
  it('renders the current tariff fields', () => {
    render(<TariffEditor value={tariff} version="2.3.0" onChange={vi.fn()} />)

    expect(screen.getByLabelText(/tariff id/i)).toHaveValue('fast')
    expect(screen.getByLabelText(/^currency$/i)).toHaveValue('EUR')
    expect(screen.getByLabelText(/min price/i)).toHaveValue('1.00')
    expect(screen.getByLabelText(/max price/i)).toHaveValue('9.00')
  })

  it('emits an immutable tariff object when the id changes', () => {
    const onChange = vi.fn()
    render(<TariffEditor value={tariff} version="2.3.0" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/tariff id/i), { target: { value: 'slow' } })

    const next = onChange.mock.calls[0][0] as TariffForm
    expect(next).toEqual({ ...tariff, id: 'slow' })
    expect(next).not.toBe(tariff)
    expect(tariff.id).toBe('fast')
  })

  it('shows tax_included for OCPI 2.3.0 and hides it for 2.2.1', () => {
    const { rerender } = render(<TariffEditor value={tariff} version="2.3.0" onChange={vi.fn()} />)

    expect(screen.getByLabelText(/tax included/i)).toHaveValue('NO')

    rerender(<TariffEditor value={tariff} version="2.2.1" onChange={vi.fn()} />)

    expect(screen.queryByLabelText(/tax included/i)).not.toBeInTheDocument()
  })

  it.each<TaxIncluded>(['YES', 'NO', 'N/A'])('emits tax_included %s for OCPI 2.3.0', (taxIncluded) => {
    const onChange = vi.fn()
    const value: TariffForm = { ...tariff, taxIncluded: taxIncluded === 'NO' ? 'YES' : 'NO' }
    render(<TariffEditor value={value} version="2.3.0" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/tax included/i), { target: { value: taxIncluded } })

    expect(onChange).toHaveBeenCalledWith({ ...value, taxIncluded })
  })

  it('adds a default element', () => {
    const onChange = vi.fn()
    render(<TariffEditor value={tariff} version="2.3.0" onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add element/i }))

    expect(onChange).toHaveBeenCalledWith({
      ...tariff,
      elements: [
        ...tariff.elements,
        { components: [{ type: 'ENERGY', price: '0', stepSize: 1 }] },
      ],
    })
  })

  it('removes an element', () => {
    const onChange = vi.fn()
    render(<TariffEditor value={tariff} version="2.3.0" onChange={onChange} />)

    fireEvent.click(screen.getAllByRole('button', { name: /remove element/i })[0])

    expect(onChange).toHaveBeenCalledWith({
      ...tariff,
      elements: [tariff.elements[1]],
    })
  })
})
