import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChargingPeriodEditor } from './ChargingPeriodEditor'
import type { PeriodForm } from '../../model/forms'

const period: PeriodForm = {
  start: '2026-06-24T09:00:00Z',
  tariffId: 'energy',
  dimensions: [
    { type: 'ENERGY', volume: '10' },
    { type: 'TIME', volume: '0.5' },
  ],
}

describe('ChargingPeriodEditor', () => {
  it('renders the period start as a datetime-local input and emits RFC3339 UTC edits', () => {
    const onChange = vi.fn()
    render(<ChargingPeriodEditor value={period} tariffIds={['energy']} onChange={onChange} />)

    const startInput = screen.getByLabelText(/start \(UTC\)/i)
    expect(startInput).toHaveAttribute('type', 'datetime-local')
    expect(startInput).toHaveValue('2026-06-24T09:00')

    fireEvent.change(startInput, { target: { value: '2026-06-24T10:30' } })

    expect(onChange).toHaveBeenCalledWith({ ...period, start: '2026-06-24T10:30:00Z' })
  })

  it('lists a none option and every provided tariff id', () => {
    render(<ChargingPeriodEditor value={period} tariffIds={['energy', 'time']} onChange={vi.fn()} />)

    const tariffSelect = screen.getByLabelText(/tariff_id/i)
    expect(tariffSelect).toHaveValue('energy')

    const options = Array.from(tariffSelect.querySelectorAll('option')).map((option) => ({
      value: option.value,
      text: option.textContent,
    }))
    expect(options).toEqual([
      { value: '', text: '(none)' },
      { value: 'energy', text: 'energy' },
      { value: 'time', text: 'time' },
    ])
  })

  it('does not render tariff_id when hidden', () => {
    render(<ChargingPeriodEditor value={period} tariffIds={['energy', 'time']} hideTariffId onChange={vi.fn()} />)

    expect(screen.queryByLabelText(/tariff_id/i)).not.toBeInTheDocument()
  })

  it('adds a default dimension', () => {
    const onChange = vi.fn()
    render(<ChargingPeriodEditor value={period} tariffIds={['energy']} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: /add dimension/i }))

    expect(onChange).toHaveBeenCalledWith({
      ...period,
      dimensions: [...period.dimensions, { type: 'ENERGY', volume: '0' }],
    })
  })

  it('removes a dimension', () => {
    const onChange = vi.fn()
    render(<ChargingPeriodEditor value={period} tariffIds={['energy']} onChange={onChange} />)

    fireEvent.click(screen.getAllByRole('button', { name: /^remove$/i })[0])

    expect(onChange).toHaveBeenCalledWith({
      ...period,
      dimensions: [period.dimensions[1]],
    })
  })

  it('uses a select for dimension type with ENERGY, TIME, and PARKING_TIME', () => {
    const onChange = vi.fn()
    render(<ChargingPeriodEditor value={period} tariffIds={['energy']} onChange={onChange} />)

    const typeSelect = screen.getAllByLabelText(/^type$/i)[0]
    expect(typeSelect.tagName).toBe('SELECT')
    expect(typeSelect).toHaveValue('ENERGY')
    expect(screen.getAllByLabelText(/volume/i)[0]).toHaveValue('10')
    expect(Array.from(typeSelect.querySelectorAll('option')).map((option) => option.value)).toEqual([
      'ENERGY',
      'TIME',
      'PARKING_TIME',
    ])

    fireEvent.change(typeSelect, { target: { value: 'PARKING_TIME' } })

    expect(onChange).toHaveBeenCalledWith({
      ...period,
      dimensions: [{ ...period.dimensions[0], type: 'PARKING_TIME' }, period.dimensions[1]],
    })
  })
})
