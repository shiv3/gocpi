import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from './datetime'

describe('datetime helpers', () => {
  it('round-trips an RFC3339 UTC timestamp through datetime-local format', () => {
    expect(fromLocalInput(toLocalInput('2026-06-24T09:00:00Z'))).toBe('2026-06-24T09:00:00Z')
  })

  it('converts non-UTC offsets to the equivalent UTC datetime-local value', () => {
    const localInput = toLocalInput('2026-06-24T09:00:00+02:00')

    expect(localInput).toBe('2026-06-24T07:00')
    expect(fromLocalInput(localInput)).toBe('2026-06-24T07:00:00Z')
  })

  it('keeps an empty datetime empty', () => {
    expect(toLocalInput('')).toBe('')
    expect(fromLocalInput('')).toBe('')
  })
})
