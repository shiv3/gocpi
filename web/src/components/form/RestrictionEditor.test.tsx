import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RestrictionEditor } from './RestrictionEditor'
import type { RestrictionForm } from '../../model/forms'

const restriction: RestrictionForm = {
  startTime: '09:00',
  endTime: '18:00',
  minKwh: '1',
  maxKwh: '20',
}

describe('RestrictionEditor', () => {
  it('turns restrictions on from the no-restriction checkbox', () => {
    const onChange = vi.fn()
    render(<RestrictionEditor value={undefined} onChange={onChange} />)

    const checkbox = screen.getByLabelText(/no restriction/i)
    expect(checkbox).toBeChecked()

    fireEvent.click(checkbox)

    expect(onChange).toHaveBeenCalledWith({})
  })

  it('turns restrictions off from the no-restriction checkbox', () => {
    const onChange = vi.fn()
    render(<RestrictionEditor value={restriction} onChange={onChange} />)

    const checkbox = screen.getByLabelText(/no restriction/i)
    expect(checkbox).not.toBeChecked()

    fireEvent.click(checkbox)

    expect(onChange).toHaveBeenCalledWith(undefined)
  })

  it('uses time inputs for start_time and end_time', () => {
    render(<RestrictionEditor value={restriction} onChange={vi.fn()} />)

    expect(screen.getByLabelText(/start_time/i)).toHaveAttribute('type', 'time')
    expect(screen.getByLabelText(/end_time/i)).toHaveAttribute('type', 'time')
    expect(screen.getByLabelText(/start_time/i)).toHaveValue('09:00')
    expect(screen.getByLabelText(/end_time/i)).toHaveValue('18:00')
    expect(screen.getByLabelText(/min_kwh/i)).toHaveValue('1')
    expect(screen.getByLabelText(/max_kwh/i)).toHaveValue('20')
  })

  it('emits min_kwh and max_kwh edits', () => {
    const onChange = vi.fn()
    render(<RestrictionEditor value={restriction} onChange={onChange} />)

    fireEvent.change(screen.getByLabelText(/min_kwh/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/max_kwh/i), { target: { value: '25' } })

    expect(onChange).toHaveBeenNthCalledWith(1, { ...restriction, minKwh: '2' })
    expect(onChange).toHaveBeenNthCalledWith(2, { ...restriction, maxKwh: '25' })
  })
})
