import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { AdvancedSettings } from './AdvancedSettings'
import type { AdvancedSection, TariffSourceMode } from './AdvancedSettings'
import { serialize } from '@/lib/serialize'
import { applyUpdater } from '@/lib/updater'
import type { Updater } from '@/lib/updater'
import { presets } from '@/presets'
import type { ComponentForm, ElementForm, SimForm, TariffForm } from '@/model/forms'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: vi.fn(),
  Toaster: () => null,
}))

function clone(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

function testTariff(id: string, price: string): TariffForm {
  return {
    id,
    currency: 'EUR',
    taxIncluded: 'NO',
    elements: [{ components: [{ type: 'ENERGY', price, stepSize: 1 }] }],
  }
}

function testElement(price: string, startTime?: string): ElementForm {
  return {
    restriction: startTime ? { startTime } : undefined,
    components: [{ type: 'ENERGY', price, stepSize: 1 }],
  }
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
          onChange={(next) =>
            setForm((prev) => {
              latest = applyUpdater(next, prev)
              return latest
            })
          }
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
          onChange={(next) =>
            setForm((prev) => {
              latest = applyUpdater(next, prev)
              return latest
            })
          }
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

    const deleteRuleButton = screen.getByRole('button', { name: 'Delete tariff rule 2' })
    expect(deleteRuleButton).toHaveClass('bg-destructive')
    fireEvent.click(deleteRuleButton)
    expect(latest.tariffs[0].elements).toHaveLength(1)

    fireEvent.click(screen.getAllByRole('button', { name: 'Add price component' })[0])
    expect(latest.tariffs[0].elements[0].components).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: /embedded totals/i }))
    fireEvent.change(screen.getByLabelText('Total cost'), { target: { value: '4.20' } })
    expect(latest.embedded.totalCost).toBe('4.20')
  })

  it('undoes a tariff delete into current state without restoring a later deleted tariff', () => {
    const removedA = testTariff('a', '0.10')
    const removedB = testTariff('b', '0.20')
    const keptC = testTariff('c', '0.30')
    let latest = { ...clone(presets['single-energy']), tariffs: [removedA, removedB, keptC] }

    renderAdvancedHarness(() => latest, (next) => {
      latest = next
    })

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    deleteTariff(1)
    deleteTariff(1)

    expect(latest.tariffs).toEqual([keptC])
    act(() => getToastUndo(0)())
    expect(latest.tariffs).toEqual([removedA, keptC])
    expect(latest.tariffs[0]).toEqual(removedA)
  })

  it('preserves sibling tariff edits when undoing a delete', () => {
    const keptA = testTariff('a', '0.10')
    const removedB = testTariff('b', '0.20')
    const siblingC = testTariff('c', '0.30')
    let latest = { ...clone(presets['single-energy']), tariffs: [keptA, removedB, siblingC] }

    renderAdvancedHarness(() => latest, (next) => {
      latest = next
    })

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    deleteTariff(2)
    fireEvent.change(screen.getAllByLabelText('Tariff name')[1], { target: { value: 'c-edited' } })
    act(() => getToastUndo(0)())

    expect(latest.tariffs.map((tariff) => tariff.id)).toEqual(['a', 'b', 'c-edited'])
    expect(latest.tariffs[1]).toEqual(removedB)
  })

  it('undoes a tariff-rule delete into current state without restoring a later deleted rule', () => {
    const removedA = testElement('0.10', '08:00')
    const removedB = testElement('0.20', '09:00')
    const keptC = testElement('0.30', '10:00')
    let latest = clone(presets['single-energy'])
    latest.tariffs[0].elements = [removedA, removedB, keptC]

    renderAdvancedHarness(() => latest, (next) => {
      latest = next
    })

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Delete tariff rule 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete tariff rule 1' }))

    expect(latest.tariffs[0].elements).toEqual([keptC])
    act(() => getToastUndo(0)())
    expect(latest.tariffs[0].elements).toEqual([removedA, keptC])
    expect(latest.tariffs[0].elements[0]).toEqual(removedA)
  })

  it('preserves sibling tariff-rule edits when undoing a delete', () => {
    const keptA = testElement('0.10', '08:00')
    const removedB = testElement('0.20', '09:00')
    const siblingC = testElement('0.30', '10:00')
    let latest = clone(presets['single-energy'])
    latest.tariffs[0].elements = [keptA, removedB, siblingC]

    renderAdvancedHarness(() => latest, (next) => {
      latest = next
    })

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Delete tariff rule 2' }))
    fireEvent.change(screen.getAllByLabelText('Unit price')[1], { target: { value: '0.99' } })
    act(() => getToastUndo(0)())

    const editedC: ElementForm = {
      ...siblingC,
      components: [{ ...(siblingC.components[0] as ComponentForm), price: '0.99' }],
    }
    expect(latest.tariffs[0].elements).toEqual([keptA, removedB, editedC])
    expect(latest.tariffs[0].elements[1]).toEqual(removedB)
  })
})

function renderAdvancedHarness(getLatest: () => SimForm, setLatest: (next: SimForm) => void) {
  function Harness() {
    const [form, setForm] = useState<SimForm>(getLatest())
    const [openValue, setOpenValue] = useState<AdvancedSection | undefined>('tariffs-rules')
    return (
      <AdvancedSettings
        value={form}
        version="2.2.1"
        mode="embedded"
        currencyPrecision={2}
        openValue={openValue}
        onOpenChange={setOpenValue}
        onChange={(next: Updater<SimForm>) =>
          setForm((prev) => {
            const resolved = applyUpdater(next, prev)
            setLatest(resolved)
            return resolved
          })
        }
        onModeChange={vi.fn()}
        onCurrencyPrecisionChange={vi.fn()}
      />
    )
  }

  render(<Harness />)
}

function deleteTariff(displayIndex: number) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Tariff ${displayIndex} actions` }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete tariff' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete tariff' }))
}

function getToastUndo(callIndex: number): () => void {
  const options = vi.mocked(toast).mock.calls[callIndex]?.[1] as
    | { action?: { onClick?: () => void } }
    | undefined
  const undo = options?.action?.onClick
  if (!undo) throw new Error('Undo toast was not rendered')
  return undo
}
