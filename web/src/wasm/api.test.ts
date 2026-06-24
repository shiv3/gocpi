import { describe, expect, it } from 'vitest'
import { toCdrJson } from './api'

describe('toCdrJson', () => {
  it('passes serialized JSON through unchanged', () => {
    expect(toCdrJson('{"a":0.30}')).toBe('{"a":0.30}')
  })

  it('serializes object CDR input', () => {
    expect(toCdrJson({ a: 1 })).toBe('{"a":1}')
  })
})
