import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TariffSetup } from './TariffSetup'
import { serialize } from '@/lib/serialize'
import { presets } from '@/presets'
import type { SimForm } from '@/model/forms'

function clone(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

describe('TariffSetup', () => {
  it('renders the primary tariff name and default element price components', () => {
    const form = clone(presets['single-energy'])

    render(<TariffSetup value={form} onChange={vi.fn()} onOpenAdvancedTariffs={vi.fn()} />)

    expect(screen.getByText('Tariff setup')).toBeInTheDocument()
    expect(screen.getByLabelText('Tariff name')).toHaveValue('energy')
    expect(screen.getByRole('columnheader', { name: 'Price type' })).toBeInTheDocument()
    expect(screen.getByLabelText('Unit price')).toHaveValue('0.30')
    expect(screen.getByText('EUR / kWh')).toBeInTheDocument()
    expect(screen.getByText('1 Wh = 0.001 kWh')).toBeInTheDocument()
  })

  it('emits immutable component edits that serialize to the same CDR path', () => {
    const form = clone(presets['single-energy'])
    const onChange = vi.fn()

    render(<TariffSetup value={form} onChange={onChange} onOpenAdvancedTariffs={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Unit price'), { target: { value: '0.42' } })

    const next = onChange.mock.calls[0][0] as SimForm
    expect(next).not.toBe(form)
    expect(form.tariffs[0].elements[0].components[0].price).toBe('0.30')
    expect(serialize(next, '2.2.1')).toMatchObject({
      tariffs: [
        {
          id: 'energy',
          elements: [{ price_components: [{ type: 'ENERGY', price: '0.42', step_size: 1, vat: '21' }] }],
        },
      ],
    })
  })

  it('adds and removes price components without mutating the original form', () => {
    const form = clone(presets['single-energy'])
    const onChange = vi.fn()

    render(<TariffSetup value={form} onChange={onChange} onOpenAdvancedTariffs={vi.fn()} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add price component' }))
    expect((onChange.mock.calls[0][0] as SimForm).tariffs[0].elements[0].components).toHaveLength(2)

    const deleteButton = screen.getByRole('button', { name: 'Delete price component 1' })
    expect(deleteButton).toHaveClass('bg-destructive')
    fireEvent.click(deleteButton)
    expect((onChange.mock.calls[1][0] as SimForm).tariffs[0].elements[0].components).toHaveLength(0)
    expect(form.tariffs[0].elements[0].components).toHaveLength(1)
  })

  it('surfaces additional tariffs and restricted rules through Advanced', () => {
    const openAdvanced = vi.fn()
    const multiTariff = clone(presets['multi-tariff'])
    const { rerender } = render(
      <TariffSetup value={multiTariff} onChange={vi.fn()} onOpenAdvancedTariffs={openAdvanced} />,
    )

    fireEvent.click(screen.getByRole('button', { name: /edit additional tariffs & rules in advanced/i }))
    expect(openAdvanced).toHaveBeenCalledTimes(1)
    expect(multiTariff.tariffs).toHaveLength(2)

    const timeOfDay = clone(presets['time-of-day'])
    rerender(<TariffSetup value={timeOfDay} onChange={vi.fn()} onOpenAdvancedTariffs={openAdvanced} />)

    expect(screen.getByRole('button', { name: /edit additional tariffs & rules in advanced/i })).toBeInTheDocument()
    expect(timeOfDay.tariffs[0].elements).toHaveLength(2)
    expect(timeOfDay.tariffs[0].elements[0].restriction).toEqual({ startTime: '09:00', endTime: '18:00' })
  })
})
