import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WarningsList } from './WarningsList'
import type { Warning } from '../../model/dto'

const warnings: Warning[] = [
  {
    code: 'STEP_ROUNDED',
    kind: 'warning',
    message: 'Energy was rounded to the tariff step size.',
    dimension: 'ENERGY',
    periodIndex: 1,
    tariffIndex: 2,
  },
]

describe('WarningsList', () => {
  it('renders warning code, message, and context', () => {
    render(<WarningsList warnings={warnings} />)

    expect(screen.getByText('STEP_ROUNDED')).toBeInTheDocument()
    expect(screen.getByText('Energy was rounded to the tariff step size.')).toBeInTheDocument()
    expect(screen.getByText('warning - dimension ENERGY / period 1 / tariff 2')).toBeInTheDocument()
  })

  it('renders an empty state when there are no warnings', () => {
    render(<WarningsList warnings={[]} />)

    expect(screen.getByText(/no warnings/i)).toBeInTheDocument()
  })
})
