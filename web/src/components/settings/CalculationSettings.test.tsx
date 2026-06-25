import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CalculationSettings } from './CalculationSettings'
import { serialize } from '@/lib/serialize'
import { presets } from '@/presets'
import type { SimForm } from '@/model/forms'

function clone(form: SimForm): SimForm {
  return JSON.parse(JSON.stringify(form)) as SimForm
}

describe('CalculationSettings', () => {
  it('renders currency, country, time zone, and UTC datetime fields', () => {
    const form = clone(presets['single-energy'])

    render(
      <CalculationSettings
        value={form}
        timeZone="Europe/Amsterdam"
        onCurrencyChange={vi.fn()}
        onCountryChange={vi.fn()}
        onTimeZoneChange={vi.fn()}
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Calculation settings')).toBeInTheDocument()
    expect(screen.getByLabelText('Currency')).toHaveValue('EUR')
    expect(screen.getByLabelText('Country')).toHaveValue('NL')
    expect(screen.getByLabelText('Time zone')).toHaveValue('Europe/Amsterdam')
    expect(screen.getByLabelText('Start time')).toHaveValue('2026-06-24T09:00')
    expect(screen.getByLabelText('End time')).toHaveValue('2026-06-24T10:00')
  })

  it('emits immutable edits and keeps the serialized CDR shape intact', () => {
    const form = clone(presets['multi-tariff'])
    let nextForm = form

    render(
      <CalculationSettings
        value={form}
        timeZone=""
        onCurrencyChange={(currency) => {
          nextForm = { ...form, currency, tariffs: form.tariffs.map((tariff) => ({ ...tariff, currency })) }
        }}
        onCountryChange={(countryCode) => {
          nextForm = { ...form, countryCode }
        }}
        onTimeZoneChange={vi.fn()}
        onStartChange={(start) => {
          nextForm = { ...form, start }
        }}
        onEndChange={(end) => {
          nextForm = { ...form, end }
        }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Currency'), { target: { value: 'USD' } })

    expect(nextForm).not.toBe(form)
    expect(form.currency).toBe('EUR')
    const cdr = serialize(nextForm, '2.2.1') as { currency: string; tariffs: { currency: string }[] }
    expect(cdr.currency).toBe('USD')
    expect(cdr.tariffs.every((tariff) => tariff.currency === 'USD')).toBe(true)
  })
})
