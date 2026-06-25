import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { App } from './App'
import { serializeTariff } from './lib/serialize'
import { decodeState, encodeState } from './lib/urlstate'
import type { PersistedState } from './lib/urlstate'
import { defaultPreset, presets } from './presets'
import { calculate, calculateWithTariff, verify, verifyWithTariff } from './wasm/api'
import type { CalculateResponse, Money, Report, Verdict, VerifyResponse } from './model/dto'

vi.mock('./wasm/api', () => ({
  calculate: vi.fn(),
  calculateWithTariff: vi.fn(),
  verify: vi.fn(),
  verifyWithTariff: vi.fn(),
}))

const calculateMock = vi.mocked(calculate)
const calculateWithTariffMock = vi.mocked(calculateWithTariff)
const verifyMock = vi.mocked(verify)
const verifyWithTariffMock = vi.mocked(verifyWithTariff)

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
  calculateWithTariffMock.mockResolvedValue({ ok: true, error: null, report: report(currency) })
  verifyMock.mockResolvedValue({ ok: true, error: null, verdict: verdict() })
  verifyWithTariffMock.mockResolvedValue({ ok: true, error: null, verdict: verdict() })
}

function latestCalculateCall() {
  const call = calculateMock.mock.calls[calculateMock.mock.calls.length - 1]
  if (!call) throw new Error('calculate was not called')
  return call
}

function latestCalculateWithTariffCall() {
  const call = calculateWithTariffMock.mock.calls[calculateWithTariffMock.mock.calls.length - 1]
  if (!call) throw new Error('calculateWithTariff was not called')
  return call
}

function renderApp() {
  render(<App />)
}

function persistedState(): PersistedState {
  return {
    v: 1,
    version: '2.3.0',
    mode: 'override',
    timeZone: 'Asia/Tokyo',
    currencyPrecision: 3,
    timeSeriesUnit: 60,
    view: 'json',
    presetKey: 'time-of-day',
    rawJson:
      '{"country_code":"JP","party_id":"EXA","id":"shared-cdr","start_date_time":"2026-06-24T09:00:00Z","end_date_time":"2026-06-24T10:00:00Z","currency":"JPY","tariffs":[{"id":"共有","currency":"JPY","tax_included":"YES","elements":[{"price_components":[{"type":"ENERGY","price":"30","step_size":1}]}]}],"charging_periods":[{"start_date_time":"2026-06-24T09:00:00Z","tariff_id":"共有","dimensions":[{"type":"ENERGY","volume":"1"}]}],"total_cost":{"before_taxes":"30"},"total_energy":"1","total_time":"0","last_updated":"2026-06-24T09:00:00Z"}',
    form: {
      currency: 'JPY',
      countryCode: 'JP',
      start: '2026-06-24T09:00:00Z',
      end: '2026-06-24T10:00:00Z',
      tariffs: [
        {
          id: '共有',
          currency: 'JPY',
          taxIncluded: 'YES',
          elements: [{ components: [{ type: 'ENERGY', price: '30', stepSize: 1, vat: '10' }] }],
        },
      ],
      periods: [
        { start: '2026-06-24T09:00:00Z', tariffId: '共有', dimensions: [{ type: 'ENERGY', volume: '1' }] },
      ],
      embedded: { totalCost: '30', totalEnergy: '1' },
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  mockSuccess()
})

afterEach(() => {
  window.location.hash = ''
  vi.restoreAllMocks()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.resetAllMocks()
})

describe('App orchestration', () => {
  it('restores simulator controls, JSON view, and raw JSON from the URL hash', () => {
    const state = persistedState()
    window.location.hash = `#${encodeState(state)}`

    renderApp()

    expect(screen.getByLabelText(/version/i)).toHaveValue('2.3.0')
    expect(screen.getByLabelText(/tariff source/i)).toHaveValue('override')
    expect(screen.getByLabelText(/time zone/i)).toHaveValue('Asia/Tokyo')
    expect(screen.getByLabelText(/money decimals/i)).toHaveValue('3')
    expect(screen.getByLabelText('JSON')).toHaveValue(state.rawJson)
  })

  it('persists simulator state changes into a replaceState hash', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')

    renderApp()
    fireEvent.change(screen.getByLabelText(/version/i), { target: { value: '2.3.0' } })

    await advanceDebounce()

    expect(replaceStateSpy).toHaveBeenCalled()
    const url = replaceStateSpy.mock.calls[replaceStateSpy.mock.calls.length - 1]?.[2]
    expect(typeof url).toBe('string')

    const decoded = decodeState(url as string)
    expect(decoded).toMatchObject({
      v: 1,
      version: '2.3.0',
      mode: 'embedded',
      timeZone: '',
      currencyPrecision: 2,
      timeSeriesUnit: 10,
      view: 'form',
      rawJson: null,
      presetKey: defaultPreset,
    })
    expect(decoded?.form).toEqual(presets[defaultPreset])
  })

  it('runs calculate and verify on mount and renders report and verdict results', async () => {
    renderApp()

    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(calculateWithTariffMock).not.toHaveBeenCalled()
    expect(verifyMock).toHaveBeenCalledTimes(1)
    expect(verifyWithTariffMock).not.toHaveBeenCalled()
    expect(screen.getByText('Cost charts')).toBeInTheDocument()
    expect(screen.getByText('Cost breakdown')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /total - 4\.50 5\.45/i })).toBeInTheDocument()
    expect(screen.getByText('Verify verdict')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
  })

  it('computes a cumulative cost series for multiple ticks and recomputes when the unit changes', async () => {
    renderApp()

    await advanceDebounce(450)

    expect(screen.getByRole('heading', { name: /cumulative cost over time/i })).toBeInTheDocument()
    expect(screen.queryByText('no time-series')).not.toBeInTheDocument()

    const cdrEndTimes = calculateMock.mock.calls
      .map((call) => call[1])
      .filter((cdr): cdr is Record<string, unknown> => typeof cdr === 'object' && cdr !== null)
      .map((cdr) => cdr.end_date_time)

    expect(calculateMock.mock.calls.length).toBeGreaterThanOrEqual(7)
    expect(new Set(cdrEndTimes).size).toBeGreaterThan(1)
    expect(cdrEndTimes).toEqual(expect.arrayContaining(['2026-06-24T09:10:00Z', '2026-06-24T10:00:00Z']))

    calculateMock.mockClear()
    fireEvent.change(screen.getByLabelText(/resolution/i), { target: { value: '60' } })
    await advanceDebounce(450)

    expect(calculateMock.mock.calls.length).toBeGreaterThanOrEqual(1)
    expect(calculateMock.mock.calls[0][1]).toMatchObject({ end_date_time: '2026-06-24T10:00:00Z' })
  })

  it('switches to override mode and calls the explicit-tariff engine path with the first tariff', async () => {
    renderApp()
    await advanceDebounce()

    expect(calculateMock).toHaveBeenCalledTimes(1)
    expect(calculateWithTariffMock).not.toHaveBeenCalled()

    calculateMock.mockClear()
    verifyMock.mockClear()
    calculateWithTariffMock.mockClear()
    verifyWithTariffMock.mockClear()

    fireEvent.change(screen.getByLabelText(/tariff source/i), { target: { value: 'override' } })

    expect(screen.getByRole('heading', { name: /override tariff/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add tariff/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /remove tariff/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/tariff_id/i)).not.toBeInTheDocument()

    await advanceDebounce()

    expect(calculateMock).not.toHaveBeenCalled()
    expect(verifyMock).not.toHaveBeenCalled()
    expect(calculateWithTariffMock).toHaveBeenCalledTimes(1)
    expect(verifyWithTariffMock).toHaveBeenCalledTimes(1)

    const preset = presets[defaultPreset]
    const [version, cdr, overrideTariff, opts] = latestCalculateWithTariffCall()
    expect(version).toBe('2.2.1')
    expect(cdr).toMatchObject({
      charging_periods: [expect.objectContaining({ tariff_id: 'energy' })],
    })
    expect(overrideTariff).toEqual(serializeTariff(preset.tariffs[0], '2.2.1', preset.countryCode, preset.start))
    expect(opts).toEqual({ currencyPrecision: 2 })
    expect(verifyWithTariffMock.mock.calls[0][2]).toEqual(overrideTariff)
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
