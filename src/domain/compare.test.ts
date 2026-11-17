import { describe, expect, it } from 'vitest'
import { alignCurves, mean, sd, summarize } from './compare'

const ev = (type: 'CHARGE' | 'DROP', t: number) => ({ id: type, type, t, bt: null, et: null })
const roast = (charge: number) => {
  const t = Array.from({ length: 701 }, (_, i) => i)
  return { samples: { t, bt: t.map((x) => 100 + x), et: t.map((x) => 200 + x) }, events: [ev('CHARGE', charge), ev('DROP', charge + 600)] }
}

describe('compare', () => {
  it('aligns roasts at CHARGE on a common grid', () => {
    const { grid, series } = alignCurves([roast(10), roast(40)], 2)
    const i0 = grid.indexOf(0)
    expect(series[0]!.bt[i0]).toBe(110)
    expect(series[1]!.bt[i0]).toBe(140)
    expect(series[0]!.bt[grid.indexOf(100)]).toBe(210)
    expect(alignCurves([{ samples: roast(0).samples, events: [] }]).series[0]).toBeNull()
  })

  it('computes mean and sample standard deviation', () => {
    expect(mean([1, 2, 3])).toBe(2)
    expect(sd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3)
    expect(sd([5])).toBeNull()
    const s = summarize([
      { total: 600, fcsTime: 480, fcsBT: 182, dropBT: 205, chargeBT: 200, tpTime: 80, tpBT: 90, dtr: 20, lossPct: 15 },
      { total: 620, fcsTime: 500, fcsBT: 183, dropBT: 207, chargeBT: 200, tpTime: 82, tpBT: 91, dtr: null, lossPct: null },
    ])
    expect(s.total).toMatchObject({ mean: 610, n: 2 })
    expect(s.dtr).toMatchObject({ mean: 20, sd: null, n: 1 })
    expect(summarize([]).total).toEqual({ mean: null, sd: null, n: 0 })
  })
})
