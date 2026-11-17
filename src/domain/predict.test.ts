import { describe, expect, it } from 'vitest'
import { loadRealRoast, realRoastNames } from '../testing/realRoasts'
import { findEvent } from './events'
import { DEFAULT_PREDICT, secondsToTemp } from './predict'
import { computeRoR } from './ror'
import { alogToRecord } from '../io/alogImport'

describe('secondsToTemp', () => {
  it('is exact for a constant RoR', () => {
    const t = Array.from({ length: 200 }, (_, i) => i)
    const bt = t.map((x) => 100 + x / 6) // 10 °C/min
    const ror = t.map(() => 10)
    expect(secondsToTemp(t, bt, ror, 150)).toBeCloseTo((150 - bt[199]) * 6, 6)
    expect(secondsToTemp(t, bt, ror, 120)).toBe(0)
  })

  it('accounts for a declining RoR and gives up when it would hit zero', () => {
    const t = Array.from({ length: 200 }, (_, i) => i)
    const ror = t.map((x) => 20 - x * 0.05) // −0.05 °C/min per s
    const bt = t.map(() => 150)
    const s = secondsToTemp(t, bt, ror, 160, { ...DEFAULT_PREDICT, trendFactor: 1 })!
    // integrate the same model numerically
    let b = 150
    let r = ror[199]
    let n = 0
    while (b < 160) {
      b += r / 60
      r -= 0.05
      n++
    }
    expect(Math.abs(s - n)).toBeLessThan(2)
    expect(secondsToTemp(t, bt, ror, 300, { ...DEFAULT_PREDICT, trendFactor: 1 })).toBeNull()
  })
})

// ── accuracy on the user's own roasts (local only) ──
describe.skipIf(realRoastNames.length === 0)('prediction accuracy on real roasts', () => {
  const run = (trendFactor: number) => {
    const err = { de: [] as number[], fc150: [] as number[], fc2: [] as number[], none: 0 }
    for (const f of realRoastNames) {
      const r = alogToRecord(loadRealRoast(f), { fileName: f })
      const { t, bt } = r.samples
      const ror = computeRoR(t, bt)
      const tp = findEvent(r.events, 'TP')
      const de = findEvent(r.events, 'DRY')
      const fcs = findEvent(r.events, 'FCs')
      if (!tp || !de || !fcs || fcs.bt == null || de.bt == null) continue
      const predictAt = (when: number, target: number, actual: number, out: number[]) => {
        const n = t.findIndex((x) => x >= when)
        const s = secondsToTemp(t.slice(0, n + 1), bt.slice(0, n + 1), ror.slice(0, n + 1), target, { ...DEFAULT_PREDICT, trendFactor })
        if (s === null) err.none++
        else out.push(Math.abs(t[n] + s - actual))
      }
      predictAt(tp.t + 60, de.bt, de.t, err.de) // Dry End, 60 s after TP
      const at150 = t[bt.findIndex((x, i) => t[i] > tp.t && x !== null && x >= 150)]
      predictAt(at150, fcs.bt, fcs.t, err.fc150) // First Crack when BT passes 150 °C
      predictAt(fcs.t - 120, fcs.bt, fcs.t, err.fc2) // First Crack 2 min before it
    }
    const mae = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length
    return { de: mae(err.de), fc150: mae(err.fc150), fc2: mae(err.fc2), none: err.none }
  }

  it('the default trend share is the most accurate on these roasts', () => {
    const results = [0, 0.25, 0.5, 1].map((f) => ({ f, ...run(f) }))
    console.table(results.map((r) => ({ trend: r.f, 'DE (s)': r.de.toFixed(1), 'FC od 150 °C (s)': r.fc150.toFixed(1), 'FC 2 min před (s)': r.fc2.toFixed(1), 'bez odhadu': r.none })))
    const best = results.reduce((a, b) => (a.fc150 + a.fc2 + a.de <= b.fc150 + b.fc2 + b.de ? a : b))
    expect(best.f).toBe(DEFAULT_PREDICT.trendFactor)
    expect(best.de).toBeLessThan(15)
    expect(best.fc150).toBeLessThan(20)
    expect(best.fc2).toBeLessThan(10)
    expect(best.none).toBe(0)
  })
})
