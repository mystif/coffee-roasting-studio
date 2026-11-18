import { describe, expect, it } from 'vitest'
import { trendOf } from './trend'

describe('trendOf', () => {
  const t = Array.from({ length: 61 }, (_, i) => i)
  it('compares the last value with the one a window earlier', () => {
    expect(trendOf(t, t.map((x) => 100 + x * 0.1), 30, 0.3)).toBe('up') // +3 over 30 s
    expect(trendOf(t, t.map((x) => 100 - x * 0.1), 30, 0.3)).toBe('down')
    expect(trendOf(t, t.map(() => 100), 30, 0.3)).toBe('flat')
  })
  it('needs enough data', () => {
    expect(trendOf([0, 1, 2], [1, 2, 3], 30, 0.3)).toBeNull()
    expect(trendOf(t, t.map(() => null), 30, 0.3)).toBeNull()
  })
})
