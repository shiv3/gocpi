import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { JsonPanel } from './JsonPanel'

describe('JsonPanel', () => {
  it('renders the given text in a textarea', () => {
    render(<JsonPanel text={'{"currency":"EUR"}'} onChange={vi.fn()} />)

    expect(screen.getByLabelText('JSON')).toHaveValue('{"currency":"EUR"}')
    expect(screen.getByText('Developer mode')).toBeInTheDocument()
    expect(screen.getByText('Synced')).toBeInTheDocument()
  })

  it('emits textarea edits', () => {
    const onChange = vi.fn()
    render(<JsonPanel text="{}" onChange={onChange} />)

    fireEvent.change(screen.getByLabelText('JSON'), { target: { value: '{"currency":"USD"}' } })

    expect(onChange).toHaveBeenCalledWith('{"currency":"USD"}')
  })

  it('displays a parse error', () => {
    render(<JsonPanel text="{" onChange={vi.fn()} parseError="Unexpected end of JSON input" />)

    expect(screen.getAllByText('Invalid JSON').length).toBeGreaterThan(0)
    expect(screen.getByRole('alert')).toHaveTextContent('Unexpected end of JSON input')
  })

  it('shows unsaved JSON sync status', () => {
    render(<JsonPanel text="{}" onChange={vi.fn()} syncStatus="unsaved" />)

    expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  })
})
