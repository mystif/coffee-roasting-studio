import { describe, expect, it } from 'vitest'
import { detectHeatStart, fmtDuration, gasKg } from './daySession'

const series = (vals: number[]) => ({ t: vals.map((_, i) => i * 2), et: vals })

describe('day session', () => {
  it('starts when ET begins to rise and dates the start back to the lowest point', () => {
    const cold = series([22, 22, 21.8, 22, 22.1, 22])
    expect(detectHeatStart(cold.t, cold.et)).toBeNull()
    const lit = series([22, 22, 21.8, 23, 25, 27, 29, 31])
    expect(detectHeatStart(lit.t, lit.et)).toEqual({ t: 4, hot: false }) // 21.8 °C at 4 s
    const flat = series([22, 22, 22, 22, 24, 26, 28, 31])
    expect(detectHeatStart(flat.t, flat.et)).toEqual({ t: 6, hot: false }) // last flat reading before the rise
  })

  it('treats a roaster that is already hot as running since the data started', () => {
    const hot = series([180, 181, 180.5, 181])
    expect(detectHeatStart(hot.t, hot.et)).toEqual({ t: 0, hot: true })
  })

  it('computes gas at 0.5 kg/h and formats the duration', () => {
    expect(gasKg(2 * 3_600_000)).toBe(1)
    expect(gasKg(30 * 60_000)).toBe(0.25)
    expect(fmtDuration(3_723_000)).toBe('1:02:03')
  })
})
