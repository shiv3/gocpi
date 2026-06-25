import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComponentEditor } from './ComponentEditor'

describe('ComponentEditor', () => {
  it('emits an immutable full object with edited type and preserved fields', () => {
    const onChange = vi.fn()
    const value = { type: 'ENERGY' as const, price: '0.30', stepSize: 1, vat: undefined }
    render(<ComponentEditor value={value} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/type/i), { target: { value: 'TIME' } })

    const next = onChange.mock.calls[0][0]
    expect(next).toStrictEqual({ type: 'TIME', price: '0.30', stepSize: 1, vat: undefined })
    expect(next).not.toBe(value)
    expect(value).toStrictEqual({ type: 'ENERGY', price: '0.30', stepSize: 1, vat: undefined })
  })

  it('emits an immutable full object with edited price and preserved fields', () => {
    const onChange = vi.fn()
    const value = { type: 'ENERGY' as const, price: '0.30', stepSize: 1, vat: '21' }
    render(<ComponentEditor value={value} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '0.40' } })

    const next = onChange.mock.calls[0][0]
    expect(next).toStrictEqual({ type: 'ENERGY', price: '0.40', stepSize: 1, vat: '21' })
    expect(next).not.toBe(value)
    expect(value.price).toBe('0.30')
  })

  it('emits an immutable full object with edited vat and preserved fields', () => {
    const onChange = vi.fn()
    const value = { type: 'TIME' as const, price: '0.30', stepSize: 900, vat: '21' }
    render(<ComponentEditor value={value} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/vat/i), { target: { value: '10' } })

    const next = onChange.mock.calls[0][0]
    expect(next).toStrictEqual({ type: 'TIME', price: '0.30', stepSize: 900, vat: '10' })
    expect(next).not.toBe(value)
    expect(value.vat).toBe('21')
  })
})
