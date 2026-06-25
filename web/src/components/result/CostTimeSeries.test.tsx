import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CostTimeSeries } from './CostTimeSeries'

const series = [
  { t: '2026-06-24T09:10:00Z', label: '09:10', cost: 1.25 },
  { t: '2026-06-24T09:20:00Z', label: '09:20', cost: 2.5 },
]

describe('CostTimeSeries', () => {
  it('renders a time-series chart with labels', () => {
    render(<CostTimeSeries series={series} unitMinutes={10} onUnitChange={() => {}} currency="EUR" />)

    expect(screen.getByText('Cumulative cost over time')).toBeInTheDocument()
    expect(screen.getByText('09:10')).toBeInTheDocument()
    expect(screen.getByText('EUR')).toBeInTheDocument()
  })

  it('calls onUnitChange with the selected resolution', () => {
    const onUnitChange = vi.fn()
    render(<CostTimeSeries series={series} unitMinutes={10} onUnitChange={onUnitChange} currency="EUR" />)

    fireEvent.change(screen.getByLabelText(/resolution/i), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText(/resolution/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/resolution/i), { target: { value: '60' } })

    expect(onUnitChange).toHaveBeenNthCalledWith(1, 1)
    expect(onUnitChange).toHaveBeenNthCalledWith(2, 10)
    expect(onUnitChange).toHaveBeenNthCalledWith(3, 60)
  })

  it('renders an empty placeholder', () => {
    render(<CostTimeSeries series={[]} unitMinutes={10} onUnitChange={() => {}} currency="EUR" />)

    expect(screen.getByText('no time-series')).toBeInTheDocument()
  })
})
