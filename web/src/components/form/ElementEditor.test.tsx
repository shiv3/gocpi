import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ElementEditor } from './ElementEditor'
import type { ElementForm } from '../../model/forms'

const element: ElementForm = {
  restriction: { startTime: '09:00', endTime: '18:00', minKwh: '1', maxKwh: '20' },
  components: [
    { type: 'ENERGY', price: '0.30', stepSize: 1, vat: '21' },
    { type: 'TIME', price: '2.00', stepSize: 900 },
  ],
}

describe('ElementEditor', () => {
  it('renders the restriction editor and component editors', () => {
    render(<ElementEditor value={element} onChange={vi.fn()} />)

    expect(screen.getByText('restriction')).toBeInTheDocument()
    expect(screen.getByLabelText(/start_time/i)).toHaveValue('09:00')
    expect(screen.getAllByLabelText(/^type$/i)).toHaveLength(2)
    expect(screen.getAllByLabelText(/^price$/i)[0]).toHaveValue('0.30')
    expect(screen.getAllByLabelText(/^price$/i)[1]).toHaveValue('2.00')
  })

  it('adds a default component', () => {
    const onChange = vi.fn()
    render(<ElementEditor value={element} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add component/i }))

    expect(onChange).toHaveBeenCalledWith({
      ...element,
      components: [...element.components, { type: 'ENERGY', price: '0', stepSize: 1 }],
    })
  })

  it('removes a component', () => {
    const onChange = vi.fn()
    render(<ElementEditor value={element} onChange={onChange} />)

    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0])

    expect(onChange).toHaveBeenCalledWith({
      ...element,
      components: [element.components[1]],
    })
  })

  it('bubbles component edits into the element value immutably', () => {
    const onChange = vi.fn()
    render(<ElementEditor value={element} onChange={onChange} />)

    fireEvent.change(screen.getAllByLabelText(/^price$/i)[1], { target: { value: '2.50' } })

    const next = onChange.mock.calls[0][0] as ElementForm
    expect(next).toEqual({
      ...element,
      components: [element.components[0], { ...element.components[1], price: '2.50' }],
    })
    expect(next).not.toBe(element)
    expect(next.components).not.toBe(element.components)
    expect(element.components[1].price).toBe('2.00')
  })
})
