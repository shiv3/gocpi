import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { ChargingSession } from './ChargingSession'
import { serialize } from '@/lib/serialize'
import { applyUpdater } from '@/lib/updater'
import type { Updater } from '@/lib/updater'
import { presets } from '@/presets'
import type { DimensionForm, PeriodForm, SimForm } from '@/model/forms'
import { toast } from 'sonner'

vi.mock('sonner', () => ({
  toast: vi.fn(),
  Toaster: () => null,
}))

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

    const periods = applyUpdater(onChange.mock.calls[0][0] as Updater<PeriodForm[]>, form.periods)
    expect(periods).not.toBe(form.periods)
    expect(form.periods[0].dimensions[0].volume).toBe('10')

    const nextForm: SimForm = { ...form, periods }
    expect(serialize(nextForm, '2.2.1')).toMatchObject({
      charging_periods: [{ dimensions: [{ type: 'ENERGY', volume: '12' }] }],
    })
  })

  it('adds and removes usage items and confirms charging-period deletes with undo', () => {
    const form = clone(presets['single-energy'])
    let latest = form.periods

    function Harness() {
      const [periods, setPeriods] = useState<PeriodForm[]>(latest)
      const handleChange = (next: Updater<PeriodForm[]>) => {
        setPeriods((prev) => {
          latest = applyUpdater(next, prev)
          return latest
        })
      }
      return (
        <ChargingSession
          value={periods}
          calculationStart="2026-06-24T09:00:00Z"
          tariffIds={['energy']}
          onChange={handleChange}
        />
      )
    }

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
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

    const toastIndex = toastMock.mock.calls.findIndex(([message]) => message === 'Charging period deleted')
    act(() => getToastUndo(toastIndex)())
    expect(latest).toHaveLength(2)
    expect((serialize({ ...form, periods: latest }, '2.2.1') as { charging_periods: unknown[] }).charging_periods).toHaveLength(2)
  })

  it('undoes a period delete into current state without restoring later deleted periods', () => {
    const form = clone(presets['single-energy'])
    const removedA: PeriodForm = {
      start: '2026-06-24T09:00:00Z',
      tariffId: 'energy',
      dimensions: [{ type: 'ENERGY', volume: '1' }],
    }
    const removedB: PeriodForm = {
      start: '2026-06-24T10:00:00Z',
      tariffId: 'energy',
      dimensions: [{ type: 'ENERGY', volume: '2' }],
    }
    const keptC: PeriodForm = {
      start: '2026-06-24T11:00:00Z',
      tariffId: 'energy',
      dimensions: [{ type: 'ENERGY', volume: '3' }],
    }
    let latest = [removedA, removedB, keptC]

    function Harness() {
      const [periods, setPeriods] = useState<PeriodForm[]>(latest)
      return (
        <ChargingSession
          value={periods}
          calculationStart={form.start}
          tariffIds={['energy']}
          onChange={(next) =>
            setPeriods((prev) => {
              latest = applyUpdater(next, prev)
              return latest
            })
          }
        />
      )
    }

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    render(<Harness />)

    deleteChargingPeriod(1)
    deleteChargingPeriod(1)

    expect(latest).toEqual([keptC])
    act(() => getToastUndo(0)())
    expect(latest).toEqual([removedA, keptC])
    expect(latest[0]).toEqual(removedA)
  })

  it('preserves sibling period edits when undoing a delete', () => {
    const form = clone(presets['single-energy'])
    const removed: PeriodForm = {
      start: '2026-06-24T09:00:00Z',
      tariffId: 'energy',
      dimensions: [{ type: 'ENERGY', volume: '1' }],
    }
    const sibling: PeriodForm = {
      start: '2026-06-24T10:00:00Z',
      tariffId: 'energy',
      dimensions: [{ type: 'ENERGY', volume: '2' }],
    }
    let latest = [removed, sibling]

    function Harness() {
      const [periods, setPeriods] = useState<PeriodForm[]>(latest)
      return (
        <ChargingSession
          value={periods}
          calculationStart={form.start}
          tariffIds={['energy']}
          onChange={(next) =>
            setPeriods((prev) => {
              latest = applyUpdater(next, prev)
              return latest
            })
          }
        />
      )
    }

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    render(<Harness />)

    deleteChargingPeriod(1)
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '2026-06-24T12:30' } })
    act(() => getToastUndo(0)())

    expect(latest).toEqual([
      removed,
      {
        ...sibling,
        start: '2026-06-24T12:30:00Z',
      },
    ])
    expect(latest[0]).toEqual(removed)
  })

  it('undoes a usage-item delete into current state without restoring a later deleted usage item', () => {
    const removedA: DimensionForm = { type: 'ENERGY', volume: '1' }
    const removedB: DimensionForm = { type: 'TIME', volume: '2' }
    const keptC: DimensionForm = { type: 'PARKING_TIME', volume: '3' }
    let latest: PeriodForm[] = [
      {
        start: '2026-06-24T09:00:00Z',
        tariffId: 'energy',
        dimensions: [removedA, removedB, keptC],
      },
    ]

    function Harness() {
      const [periods, setPeriods] = useState<PeriodForm[]>(latest)
      return (
        <ChargingSession
          value={periods}
          calculationStart="2026-06-24T09:00:00Z"
          tariffIds={['energy']}
          onChange={(next) =>
            setPeriods((prev) => {
              latest = applyUpdater(next, prev)
              return latest
            })
          }
        />
      )
    }

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete usage item 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete usage item 1' }))

    expect(latest[0].dimensions).toEqual([keptC])
    act(() => getToastUndo(0)())
    expect(latest[0].dimensions).toEqual([removedA, keptC])
    expect(latest[0].dimensions[0]).toEqual(removedA)
  })

  it('preserves sibling usage-item edits when undoing a delete', () => {
    const removed: DimensionForm = { type: 'ENERGY', volume: '1' }
    const sibling: DimensionForm = { type: 'TIME', volume: '2' }
    let latest: PeriodForm[] = [
      {
        start: '2026-06-24T09:00:00Z',
        tariffId: 'energy',
        dimensions: [removed, sibling],
      },
    ]

    function Harness() {
      const [periods, setPeriods] = useState<PeriodForm[]>(latest)
      return (
        <ChargingSession
          value={periods}
          calculationStart="2026-06-24T09:00:00Z"
          tariffIds={['energy']}
          onChange={(next) =>
            setPeriods((prev) => {
              latest = applyUpdater(next, prev)
              return latest
            })
          }
        />
      )
    }

    const toastMock = vi.mocked(toast)
    toastMock.mockClear()
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: 'Delete usage item 1' }))
    fireEvent.change(screen.getByLabelText('Usage amount'), { target: { value: '9' } })
    act(() => getToastUndo(0)())

    expect(latest[0].dimensions).toEqual([removed, { ...sibling, volume: '9' }])
    expect(latest[0].dimensions[0]).toEqual(removed)
  })
})

function deleteChargingPeriod(displayIndex: number) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Charging period ${displayIndex} actions` }), { key: 'Enter' })
  fireEvent.click(screen.getByRole('menuitem', { name: 'Delete charging period' }))
  fireEvent.click(screen.getByRole('button', { name: 'Delete charging period' }))
}

function getToastUndo(callIndex: number): () => void {
  const options = vi.mocked(toast).mock.calls[callIndex]?.[1] as
    | { action?: { onClick?: () => void } }
    | undefined
  const undo = options?.action?.onClick
  if (!undo) throw new Error('Undo toast was not rendered')
  return undo
}
