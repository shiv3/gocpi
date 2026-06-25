import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { calculate, verify } from './wasm/api'
import type { CalculateResponse, Money, Report, Verdict, VerifyResponse } from './model/dto'

vi.mock('./wasm/api', () => ({
  calculate: vi.fn(),
  verify: vi.fn(),
}))

const calculateMock = vi.mocked(calculate)
const verifyMock = vi.mocked(verify)

const m = (beforeTaxes: string, afterTaxes: string | null = null): Money => ({ beforeTaxes, afterTaxes, taxes: [] })

const report = (currency = 'EUR'): Report => ({
  currency,
  totalCost: m('4.50', '5.45'),
  totalEnergyCost: m('3.00', '3.63'),
  totalTimeCost: m('1.50', '1.82'),
  totalParkingCost: m('0'),
  totalFixedCost: m('0'),
  totalReservationCost: null,
  dimensions: {
    ENERGY: { volume: '10', cost: m('3.00', '3.63') },
    TIME: { volume: '0.5', cost: m('1.50', '1.82') },
  },
  warnings: [],
})

const verdict = (): Verdict => ({
  status: 'OK',
  mismatches: [],
  warnings: [],
})

async function advanceDebounce(ms = 300) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

function mockSuccess(currency = 'EUR') {
  calculateMock.mockResolvedValue({ ok: true, error: null, report: report(currency) })
  verifyMock.mockResolvedValue({ ok: true, error: null, verdict: verdict() })
}

function latestCalculateCall() {
  const call = calculateMock.mock.calls[calculateMock.mock.calls.length - 1]
  if (!call) throw new Error('calculate was not called')
  return call
}

function renderApp() {
  render(<App />)
}

beforeEach(() => {
  vi.useFakeTimers()
  mockSuccess()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('App orchestration', () => {
  it('runs calculate and verify on mount and renders report and verdict results', async () => {
    renderApp()

    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(verifyMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Cost charts')).toBeInTheDocument()
    expect(screen.getByText('Cost breakdown')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /total - 4\.50 5\.45/i })).toBeInTheDocument()
    expect(screen.getByText('Verify verdict')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('cascades CDR currency changes to every tariff and sends the updated object to calculate', async () => {
    renderApp()
    await advanceDebounce()
    calculateMock.mockClear()
    verifyMock.mockClear()

    fireEvent.change(screen.getAllByLabelText(/^currency$/i)[0], { target: { value: 'USD' } })

    const currencySelects = screen.getAllByLabelText(/^currency$/i) as HTMLSelectElement[]
    expect(currencySelects.every((select) => select.value === 'USD')).toBe(true)

    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    const [, cdr] = latestCalculateCall()
    expect(cdr).toMatchObject({
      currency: 'USD',
      tariffs: [expect.objectContaining({ currency: 'USD' })],
    })
    expect((cdr as { tariffs: { currency: string }[] }).tariffs.every((tariff) => tariff.currency === 'USD')).toBe(true)
  })

  it('passes time-zone and money-decimal options to reruns', async () => {
    renderApp()
    await advanceDebounce()
    calculateMock.mockClear()
    verifyMock.mockClear()

    fireEvent.change(screen.getByLabelText(/time zone/i), { target: { value: 'Asia/Tokyo' } })
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(latestCalculateCall()[2]).toEqual({ currencyPrecision: 2, timeZone: 'Asia/Tokyo' })

    calculateMock.mockClear()
    verifyMock.mockClear()
    fireEvent.change(screen.getByLabelText(/time zone/i), { target: { value: '' } })
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(latestCalculateCall()[2]).toEqual({ currencyPrecision: 2 })

    calculateMock.mockClear()
    verifyMock.mockClear()
    fireEvent.change(screen.getByLabelText(/money decimals/i), { target: { value: '3' } })
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(latestCalculateCall()[2]).toEqual({ currencyPrecision: 3 })
  })

  it('reruns for version changes and loads presets from the preset selector', async () => {
    renderApp()
    await advanceDebounce()
    calculateMock.mockClear()
    verifyMock.mockClear()

    fireEvent.change(screen.getByLabelText(/version/i), { target: { value: '2.3.0' } })
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(latestCalculateCall()[0]).toBe('2.3.0')
    expect(screen.getByLabelText(/tax included/i)).toBeInTheDocument()

    calculateMock.mockClear()
    verifyMock.mockClear()
    fireEvent.change(screen.getByLabelText(/preset/i), { target: { value: 'time-of-day' } })

    expect(screen.getByLabelText(/tariff id/i)).toHaveValue('tod')
    expect(screen.getByLabelText(/start_time/i)).toHaveValue('09:00')

    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    const [version, cdr] = latestCalculateCall()
    expect(version).toBe('2.3.0')
    expect(cdr).toMatchObject({
      tariffs: [expect.objectContaining({ id: 'tod' })],
      charging_periods: [expect.objectContaining({ tariff_id: 'tod' })],
    })
  })

  it('shows calculate errors and clears prior report and verdict UI', async () => {
    renderApp()
    await advanceDebounce()
    expect(screen.getByText('Cost breakdown')).toBeInTheDocument()
    expect(screen.getByText('Verify verdict')).toBeInTheDocument()

    calculateMock.mockResolvedValue({ ok: false, error: 'currency mismatch between CDR and tariff' })
    calculateMock.mockClear()
    verifyMock.mockClear()

    fireEvent.change(screen.getByLabelText(/country_code/i), { target: { value: 'DE' } })
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(verifyMock).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('currency mismatch between CDR and tariff')
    expect(screen.queryByText('Cost charts')).not.toBeInTheDocument()
    expect(screen.queryByText('Cost breakdown')).not.toBeInTheDocument()
    expect(screen.queryByText('Verify verdict')).not.toBeInTheDocument()
    expect(screen.getByText(/no calculation yet/i)).toBeInTheDocument()
    expect(screen.getByText(/no verification yet/i)).toBeInTheDocument()
  })

  it('passes raw JSON textarea content verbatim to calculate', async () => {
    renderApp()
    await advanceDebounce()
    calculateMock.mockClear()
    verifyMock.mockClear()

    const rawJson =
      '{"country_code":"NL","party_id":"EXA","id":"raw-cdr","start_date_time":"2026-06-24T09:00:00Z","end_date_time":"2026-06-24T10:00:00Z","currency":"JPY","tariffs":[{"id":"raw","currency":"JPY","elements":[{"price_components":[{"type":"ENERGY","price":"11","step_size":1}]}]}],"charging_periods":[{"start_date_time":"2026-06-24T09:00:00Z","tariff_id":"raw","dimensions":[{"type":"ENERGY","volume":"1"}]}],"total_cost":{"excl_vat":"11"},"total_energy":"1","total_time":"0","last_updated":"2026-06-24T09:00:00Z"}'

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: rawJson } })
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(latestCalculateCall()[1]).toBe(rawJson)
    expect(verifyMock.mock.calls[0][1]).toBe(rawJson)
  })

  it('prefills missing form-mode total_cost from the calculated rich money before verify', async () => {
    calculateMock.mockResolvedValue({
      ok: true,
      error: null,
      report: {
        ...report(),
        totalCost: { beforeTaxes: '3.00', afterTaxes: '3.63', taxes: [] },
      },
    })

    renderApp()
    await advanceDebounce()
    calculateMock.mockClear()
    verifyMock.mockClear()

    fireEvent.change(screen.getByLabelText(/^total_cost$/i), { target: { value: '' } })
    await advanceDebounce()

    expect(verifyMock).toHaveBeenCalledTimes(1)
    expect(verifyMock.mock.calls[0][0]).toBe('2.2.1')
    expect(verifyMock.mock.calls[0][1]).toMatchObject({
      total_cost: { excl_vat: '3.00', incl_vat: '3.63' },
    })
  })

  it('syncs valid JSON edits back into the form and keeps invalid JSON as a parse error', async () => {
    renderApp()
    await advanceDebounce()

    const rawJson =
      '{"country_code":"NL","party_id":"EXA","id":"raw-cdr","start_date_time":"2026-06-24T09:00:00Z","end_date_time":"2026-06-24T10:00:00Z","currency":"USD","tariffs":[{"id":"raw","currency":"USD","elements":[{"price_components":[{"type":"ENERGY","price":"11","step_size":1}]}]}],"charging_periods":[{"start_date_time":"2026-06-24T09:00:00Z","tariff_id":"raw","dimensions":[{"type":"ENERGY","volume":"1"}]}],"total_cost":{"excl_vat":"11"},"total_energy":"1","total_time":"0","last_updated":"2026-06-24T09:00:00Z"}'

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: rawJson } })
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))

    expect(screen.getAllByLabelText(/^currency$/i)[0]).toHaveValue('USD')

    fireEvent.click(screen.getByRole('button', { name: 'JSON' }))
    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '[' } })

    expect(screen.getByRole('alert')).toHaveTextContent(/unexpected end of json input/i)

    fireEvent.click(screen.getByRole('button', { name: 'Form' }))

    expect(screen.getAllByLabelText(/^currency$/i)[0]).toHaveValue('USD')
  })

  it('shows the computing indicator while a run is in flight and clears it after completion', async () => {
    let resolveCalculation: (response: CalculateResponse) => void = () => {}
    const pendingCalculation = new Promise<CalculateResponse>((resolve) => {
      resolveCalculation = resolve
    })
    calculateMock.mockReturnValue(pendingCalculation)
    verifyMock.mockResolvedValue({ ok: true, error: null, verdict: verdict() } satisfies VerifyResponse)

    renderApp()

    await advanceDebounce(250)

    expect(screen.getByRole('status')).toHaveTextContent(/computing/i)

    await act(async () => {
      resolveCalculation({ ok: true, error: null, report: report() })
      await pendingCalculation
    })

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
