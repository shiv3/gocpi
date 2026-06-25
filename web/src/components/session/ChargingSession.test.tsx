import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ChargingSession } from './ChargingSession'
import { Toaster } from '@/components/ui/sonner'
import { serialize } from '@/lib/serialize'
import { presets } from '@/presets'
import type { PeriodForm, SimForm } from '@/model/forms'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('ChargingSession', () => {
  it('renders usage rows with units and hides tariff selection for a single tariff', () => {
    const form = clone(presets['mixed-step'])

    render(
      <ChargingSession
        value={form.periods}
        calculationStart={form.start}
        tariffIds={['steps']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Charging session')).toBeInTheDocument()
    expect(screen.getByLabelText('Start time')).toHaveValue('2026-06-24T09:00')
    expect(screen.queryByLabelText('Tariff')).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('Usage amount')[0]).toHaveValue('1.4')
    expect(screen.getByText('kWh')).toBeInTheDocument()
    expect(screen.getByText('hours')).toBeInTheDocument()
  })

  it('shows tariff selection when embedded mode has multiple tariffs', () => {
    const form = clone(presets['multi-tariff'])

    render(
      <ChargingSession
        value={form.periods}
        calculationStart={form.start}
        tariffIds={['peak', 'offpeak']}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getAllByLabelText('Tariff')[0]).toHaveValue('peak')
  })

  it('emits immutable usage edits that serialize to the same CDR path', () => {
    const form = clone(presets['single-energy'])
    const onChange = vi.fn()

    render(
      <ChargingSession
        value={form.periods}
        calculationStart={form.start}
        tariffIds={['energy']}
        onChange={onChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Usage amount'), { target: { value: '12' } })

    const periods = onChange.mock.calls[0][0] as PeriodForm[]
    expect(periods).not.toBe(form.periods)
    expect(form.periods[0].dimensions[0].volume).toBe('10')

    const nextForm: SimForm = { ...form, periods }
    expect(serialize(nextForm, '2.2.1')).toMatchObject({
      charging_periods: [{ dimensions: [{ type: 'ENERGY', volume: '12' }] }],
    })
  })

  it('adds and removes usage items and confirms charging-period deletes with undo', async () => {
    const form = clone(presets['single-energy'])
    let latest = form.periods

    function Harness() {
      const [periods, setPeriods] = useState<PeriodForm[]>(latest)
      return (
        <>
        <ChargingSession
          value={periods}
          calculationStart="2026-06-24T09:00:00Z"
          tariffIds={['energy']}
          onChange={(next) => {
            latest = next
            setPeriods(next)
          }}
        />
        <Toaster />
        </>
      )
    }

    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Add usage item' }))
    expect(latest[0].dimensions).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: 'Delete usage item 2' }))
    expect(latest[0].dimensions).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Add charging period' }))
    expect(latest).toHaveLength(2)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Charging period 2 actions' }), { key: 'Enter' })
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete charging period' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Delete charging period?')

    fireEvent.click(screen.getByRole('button', { name: 'Delete charging period' }))
    expect(latest).toHaveLength(1)

    expect((serialize({ ...form, periods: latest }, '2.2.1') as { charging_periods: unknown[] }).charging_periods).toHaveLength(1)

    const periodToast = (await screen.findByText('Charging period deleted')).closest('[data-sonner-toast]')
    if (!periodToast) throw new Error('Charging period toast was not rendered')
    fireEvent.click(within(periodToast as HTMLElement).getByRole('button', { name: 'Undo' }))
    expect(latest).toHaveLength(2)
    expect((serialize({ ...form, periods: latest }, '2.2.1') as { charging_periods: unknown[] }).charging_periods).toHaveLength(2)
  })
})
