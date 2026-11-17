import { describe, expect, it } from 'vitest'
import { controlSegments, formatControl, shade, visibleBadges } from './chartMarks'

describe('chart marks', () => {
  it('builds one segment per change, lasting until the next change of the same control', () => {
    const seg = controlSegments(
      [
        { t: 0, kind: 'gas', value: 4.5 },
        { t: 30, kind: 'air', value: 35 },
        { t: 120, kind: 'gas', value: 5.5 },
      ],
      600,
    )
    expect(seg).toEqual([
      { kind: 'gas', from: 0, to: 120, value: 4.5 },
      { kind: 'gas', from: 120, to: 600, value: 5.5 },
      { kind: 'air', from: 30, to: 600, value: 35 },
    ])
  })

  it('hides badges that would overlap the next one, always keeps the last', () => {
    expect(visibleBadges([0, 10, 15, 60, 100], 22)).toEqual([false, false, true, true, true])
  })

  it('gives each value its own shade of the control colour', () => {
    expect(shade('gas', 2)).not.toBe(shade('gas', 6))
    expect(shade('gas', 2)).toMatch(/^hsla\(24,/)
    expect(shade('gas', 1)).toBe(shade('gas', 2)) // clamped to the range
    expect(formatControl('gas', 4.5)).toBe('4,5')
    expect(formatControl('air', 65)).toBe('65')
  })
})
