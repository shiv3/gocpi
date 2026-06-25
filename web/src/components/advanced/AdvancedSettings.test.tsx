import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { AdvancedSettings } from './AdvancedSettings'
import type { AdvancedSection, TariffSourceMode } from './AdvancedSettings'
import { serialize } from '@/lib/serialize'
import { presets } from '@/presets'
import type { SimForm } from '@/model/forms'

function clone(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

describe('AdvancedSettings', () => {
  it('renders controlled sections and toggles tariff source mode', () => {
    const onModeChange = vi.fn()

    render(
      <AdvancedSettings
        value={clone(presets['single-energy'])}
        version="2.2.1"
        mode="embedded"
        currencyPrecision={2}
        openValue="tariff-source"
        onOpenChange={vi.fn()}
        onChange={vi.fn()}
        onModeChange={onModeChange}
        onCurrencyPrecisionChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Advanced settings')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Tariff source' }), { target: { value: 'override' } })
    expect(onModeChange).toHaveBeenCalledWith('override')
  })

  it('updates calculation precision from the accordion', () => {
    const onCurrencyPrecisionChange = vi.fn()

    render(
      <AdvancedSettings
        value={clone(presets['single-energy'])}
        version="2.2.1"
        mode="embedded"
        currencyPrecision={2}
        openValue="calculation-precision"
        onOpenChange={vi.fn()}
        onChange={vi.fn()}
        onModeChange={vi.fn()}
        onCurrencyPrecisionChange={onCurrencyPrecisionChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Money decimals'), { target: { value: '4' } })
    expect(onCurrencyPrecisionChange).toHaveBeenCalledWith(4)
  })

  it('keeps min/max prices and applicability conditions editable and serializable', () => {
    let latest = clone(presets['single-energy'])

    function Harness() {
      const [form, setForm] = useState<SimForm>(latest)
      const [openValue, setOpenValue] = useState<AdvancedSection | undefined>('tariffs-rules')
      const [mode, setMode] = useState<TariffSourceMode>('embedded')
      return (
        <AdvancedSettings
          value={form}
          version="2.2.1"
          mode={mode}
          currencyPrecision={2}
          openValue={openValue}
          onOpenChange={setOpenValue}
          onChange={(next) => {
            latest = next
            setForm(next)
          }}
          onModeChange={setMode}
          onCurrencyPrecisionChange={vi.fn()}
        />
      )
    }

    render(<Harness />)

    fireEvent.change(screen.getByLabelText('Minimum price'), { target: { value: '1.50' } })
    fireEvent.change(screen.getByLabelText('Maximum price'), { target: { value: '9.90' } })
    fireEvent.click(screen.getByLabelText('No applicability conditions'))
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '09:00' } })
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '18:00' } })
    fireEvent.change(screen.getByLabelText('Minimum kWh'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Maximum kWh'), { target: { value: '20' } })

    expect(latest).not.toBe(presets['single-energy'])
    expect(serialize(latest, '2.2.1')).toMatchObject({
      tariffs: [
        {
          min_price: { excl_vat: '1.50' },
          max_price: { excl_vat: '9.90' },
          elements: [
            {
              restrictions: {
                start_time: '09:00',
                end_time: '18:00',
                min_kwh: '2',
                max_kwh: '20',
              },
            },
          ],
        },
      ],
    })
  })

  it('adds and removes tariffs, tariff rules, price components, and embedded totals immutably', () => {
    let latest = clone(presets['single-energy'])

    function Harness() {
      const [form, setForm] = useState<SimForm>(latest)
      const [openValue, setOpenValue] = useState<AdvancedSection | undefined>('tariffs-rules')
      return (
        <AdvancedSettings
          value={form}
          version="2.3.0"
          mode="embedded"
          currencyPrecision={2}
          openValue={openValue}
          onOpenChange={setOpenValue}
          onChange={(next) => {
            latest = next
            setForm(next)
          }}
          onModeChange={vi.fn()}
          onCurrencyPrecisionChange={vi.fn()}
        />
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add tariff' }))
    expect(latest.tariffs).toHaveLength(2)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Tariff 2 actions' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete tariff' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete tariff?')
    fireEvent.click(screen.getByRole('button', { name: 'Delete tariff' }))
    expect(latest.tariffs).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Add tariff rule' }))
    expect(latest.tariffs[0].elements).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete tariff rule 2' }))
    expect(latest.tariffs[0].elements).toHaveLength(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Add price component' })[0])
    expect(latest.tariffs[0].elements[0].components).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /embedded totals/i }))
    fireEvent.change(screen.getByLabelText('Total cost'), { target: { value: '4.20' } })
    expect(latest.embedded.totalCost).toBe('4.20')
  })
})
