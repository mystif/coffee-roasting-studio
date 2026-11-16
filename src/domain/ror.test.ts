import { loadRealRoast, realRoastNames } from '../testing/realRoasts'
import { describe, expect, it } from 'vitest'
import { computeRoR, lastRoR } from './ror'

function ramp(intervalSec: number, ratePerMin: number, seconds = 300) {
  const t: number[] = []
  const v: number[] = []
  for (let s = 0; s <= seconds; s += intervalSec) {
    t.push(s)
    v.push(100 + (ratePerMin * s) / 60)
  }
  return { t, v }
}

describe('RoR', () => {
  it.each([1, 2])('returns the slope of a linear ramp at %i s sampling', (dt) => {
    const { t, v } = ramp(dt, 10)
    const r = computeRoR(t, v)
    expect(r[r.length - 1]).toBeCloseTo(10, 5)
    expect(r[0]).toBeNull() // not enough history yet
  })

  it('lastRoR equals the full computation at the end', () => {
    const { t, v } = ramp(2, 7.5)
    const full = computeRoR(t, v)
    expect(lastRoR(t, v)).toBeCloseTo(full[full.length - 1]!, 9)
  })

  it('drops glitches above the limit instead of plotting them', () => {
    const { t, v } = ramp(1, 10)
    v[200] = 600 // probe glitch
    const r = computeRoR(t, v)
    expect(r.every((x) => x === null || Math.abs(x) < 36)).toBe(true)
  })

  it('handles missing readings (connection gap)', () => {
    const { t, v } = ramp(1, 12)
    const withGap = v.map((x, i) => (i > 100 && i < 120 ? null : x))
    const r = computeRoR(t, withGap)
    expect(r[119]).toBeNull()
    expect(r[r.length - 1]).toBeCloseTo(12, 5)
  })
})

const alogs = realRoastNames

describe.skipIf(alogs.length === 0)('RoR vs Artisan on real roasts', () => {
  it.each(alogs)('%s: RoR at FCs within 1.5 °C/min of Artisan', (file) => {
    const a = loadRealRoast(file)
    const fcs = a.timeindex[2]
    const expected = a.computed.fcs_ror
    if (!fcs || expected == null) return
    const charge = a.timeindex[0]
    const t = a.t.slice(charge)
    const r = computeRoR(t, a.bt.slice(charge))
    const got = r[fcs - charge]!
    console.log(`${file}: Artisan ${expected}, app ${got.toFixed(2)}`)
    expect(Math.abs(got - expected)).toBeLessThan(1.5)
  })
})
