import { loadRealRoast, realRoastNames } from '../testing/realRoasts'
import { describe, expect, it } from 'vitest'
import type { AlogRoast } from '../io/alog'
import { detectCharge, detectDrop, detectDry, detectTP } from './autodetect'
import { nextExpected, type EventType, type RoastEvent } from './events'
import { phaseStats } from './phases'

const ev = (type: EventType, t: number): RoastEvent => ({ id: type, type, t, bt: null, et: null })

describe('phases', () => {
  it('computes Artisan-style phases and DTR', () => {
    // BRA roast from Artisan: DRY 328 s, FCs 590 s, DROP 786 s (relative to CHARGE)
    const s = phaseStats([ev('CHARGE', 10), ev('DRY', 338), ev('FCs', 600), ev('DROP', 796)], 999)!
    expect(s.total).toBe(786)
    expect([s.drying, s.maillard, s.development]).toEqual([328, 262, 196])
    expect(s.dtr).toBeCloseTo(24.94, 2)
  })

  it('runs the open phase to "now" while roasting', () => {
    const s = phaseStats([ev('CHARGE', 0), ev('DRY', 300)], 420)!
    expect(s.maillard).toBe(120)
    expect(s.development).toBeNull()
    expect(s.total).toBe(420)
  })

  it('walks the main sequence for the space bar', () => {
    expect(nextExpected([])).toBe('CHARGE')
    expect(nextExpected([ev('CHARGE', 0), ev('DRY', 1)])).toBe('FCs')
    expect(nextExpected([ev('CHARGE', 0), ev('DROP', 1)])).toBeNull()
  })
})

const alogs = realRoastNames
const load = loadRealRoast

/** Feeds samples one by one like the live app and returns the first detection index. */
function live(a: AlogRoast, detect: (t: number[], bt: (number | null)[]) => number | null, from = 0) {
  for (let n = from + 2; n <= a.t.length; n++) {
    const r = detect(a.t.slice(0, n), a.bt.slice(0, n))
    if (r !== null) return { idx: r, detectedAt: n - 1 }
  }
  return null
}

describe.skipIf(alogs.length === 0)('auto detection vs Artisan on real roasts', () => {
  it.each(alogs)('%s', (file) => {
    const a = load(file)
    const [charge, , fcs, , , , drop] = a.timeindex

    // CHARGE (Artisan BTbreak): at the BT top after the manual press, noticed within 20 s
    // With preheat data before CHARGE it must equal Artisan's (auto) CHARGE; recordings that
    // start right at CHARGE have no top to find, there it only has to be noticed quickly.
    const c = live(a, (t, bt) => detectCharge(t, bt))!
    if (charge >= 3) expect(Math.abs(c.idx - charge)).toBeLessThanOrEqual(1)
    expect(a.t[c.detectedAt] - a.t[c.idx]).toBeLessThanOrEqual(10) // noticed within 10 s of the BT break

    // TP from Artisan's CHARGE must be Artisan's TP
    const tp = live(a, (t, bt) => detectTP(t, bt, charge), charge)!
    if (a.computed.TP_idx != null) expect(Math.abs(tp.idx - a.computed.TP_idx)).toBeLessThanOrEqual(1)

    const dry = detectDry(a.bt, tp.idx)!
    if (!a.timeindex[1] && a.computed.dryphasetime != null) {
      // Artisan derived Dry End from the 130 °C phase setting → must match
      expect(Math.abs(a.t[dry] - a.t[charge] - a.computed.dryphasetime)).toBeLessThanOrEqual(4)
    }

    // DROP: recordings that stop right at DROP have nothing to detect – and no false DROP before it
    const hasAfterDrop = a.t.length - 1 - drop >= 6
    const d = live(a, (t, bt) => detectDrop(t, bt, fcs, a.t[charge]), fcs)
    if (d) expect(Math.abs(d.idx - drop)).toBeLessThanOrEqual(2) // never a false DROP
    else expect(hasAfterDrop).toBe(false)
    console.log(`${file}: charge ${c.idx}/${charge} (+${(a.t[c.idx] - a.t[charge]).toFixed(0)} s), TP ${tp.idx}/${a.computed.TP_idx}, drop ${d?.idx}/${drop}`)
  })
})
