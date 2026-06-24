import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VerdictView } from './VerdictView'

describe('VerdictView', () => {
  it('renders mismatch status and delta', () => {
    render(
      <VerdictView
        verdict={{
          status: 'Mismatch',
          mismatches: [{ field: 'total_cost', computed: '0.80', embedded: '5.00', delta: '-4.20' }],
          warnings: [],
        }}
      />,
    )

    expect(screen.getByText('Mismatch')).toBeInTheDocument()
    expect(screen.getByText('-4.20')).toBeInTheDocument()
  })
})
