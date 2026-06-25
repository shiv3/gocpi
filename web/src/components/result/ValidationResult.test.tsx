import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { ValidationResult } from './ValidationResult'
import type { Verdict } from '@/model/dto'

describe('ValidationResult', () => {
  it('humanizes not-verifiable warnings, hides codes in details, and calls warning actions', () => {
    const onOpenAdvanced = vi.fn()
    const verdict: Verdict = {
      status: 'NotVerifiable',
      mismatches: [],
      warnings: [
        {
          code: 'WarnAfterTaxNotDerivable',
          kind: 'warning',
          message: 'raw engine warning',
          periodIndex: null,
          tariffIndex: null,
          dimension: null,
        },
      ],
    }

    render(<ValidationResult verdict={verdict} onOpenAdvanced={onOpenAdvanced} />)

    expect(screen.getAllByText('Not verifiable').length).toBeGreaterThan(0)
    expect(screen.getByText('Warning')).toBeInTheDocument()
    expect(
      screen.getByText('The after-tax total could not be verified from the embedded data. Check the VAT rate or embedded totals.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('WarnAfterTaxNotDerivable')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Check tax settings' }))
    expect(onOpenAdvanced).toHaveBeenCalledWith('tariffs-rules')

    fireEvent.click(screen.getByRole('button', { name: 'Open embedded totals' }))
    expect(onOpenAdvanced).toHaveBeenCalledWith('embedded-totals')

    fireEvent.click(screen.getByRole('button', { name: 'Show technical details' }))
    expect(screen.getByText('WarnAfterTaxNotDerivable')).toBeInTheDocument()
    expect(screen.getByText(/raw engine warning/i)).toBeInTheDocument()
  })

  it('renders mismatch validation rows', () => {
    render(
      <ValidationResult
        verdict={{
          status: 'Mismatch',
          mismatches: [{ field: 'total_cost', computed: '0.80', embedded: '5.00', delta: '-4.20' }],
          warnings: [],
        }}
        onOpenAdvanced={vi.fn()}
      />,
    )

    const validation = screen.getByRole('heading', { name: 'Validation' }).closest('section')
    expect(validation).not.toBeNull()
    expect(within(validation as HTMLElement).getByRole('row', { name: /total_cost 0\.80 5\.00 -4\.20/i })).toBeInTheDocument()
  })
})
