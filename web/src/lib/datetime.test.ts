import { describe, expect, it } from 'vitest'
import { fromLocalInput, toLocalInput } from './datetime'

describe('datetime helpers', () => {
  it('round-trips an RFC3339 UTC timestamp through datetime-local format', () => {
    expect(fromLocalInput(toLocalInput('2026-06-24T09:00:00Z'))).toBe('2026-06-24T09:00:00Z')
  })
})
