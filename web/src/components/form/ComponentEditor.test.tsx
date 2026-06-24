import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComponentEditor } from './ComponentEditor'

describe('ComponentEditor', () => {
  it('emits onChange with edited price', () => {
    const onChange = vi.fn()
    render(<ComponentEditor value={{ type: 'ENERGY', price: '0.30', stepSize: 1 }} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/price/i), { target: { value: '0.40' } })

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ price: '0.40' }))
  })
})
