import { describe, expect, it } from 'vitest'
import type { EventType, RoastEvent } from './events'
import { DEFAULT_DTR_TARGET, dtrTarget, phaseProgress } from './phases'

const ev = (type: EventType, t: number): RoastEvent => ({ id: type, type, t, bt: 100, et: null })

describe('dtrTarget', () => {
  it('uses the reference DTR, else the default', () => {
    // FC at 480 s, DROP at 600 s → development 120 / total 600 = 20 % … here 150/600 = 25 %
    expect(dtrTarget([ev('CHARGE', 0), ev('DRY', 240), ev('FCs', 450), ev('DROP', 600)]).target).toBeCloseTo(25, 6)
    expect(dtrTarget(null)).toEqual({ target: DEFAULT_DTR_TARGET, fromReference: false })
    expect(dtrTarget([ev('CHARGE', 0)]).fromReference).toBe(false)
  })
})

describe('phaseProgress', () => {
  it('drying and Maillard from the estimated next event', () => {
    expect(phaseProgress([ev('CHARGE', 0)], 120, { DRY: 120 }, 20)).toEqual({ phase: 'drying', progress: 0.5 })
    expect(phaseProgress([ev('CHARGE', 0), ev('DRY', 200)], 300, { FCs: 300 }, 20)).toEqual({ phase: 'maillard', progress: 0.25 })
    expect(phaseProgress([ev('CHARGE', 0)], 120, {}, 20)).toBeNull()
  })
  it('development towards the DROP of the target DTR', () => {
    // FC at 480 s from CHARGE, 20 % DTR → 120 s of development planned
    expect(phaseProgress([ev('CHARGE', 0), ev('DRY', 200), ev('FCs', 480)], 540, {}, 20)).toEqual({ phase: 'development', progress: 0.5 })
    expect(phaseProgress([ev('CHARGE', 0), ev('DRY', 200), ev('FCs', 480)], 700, {}, 20)!.progress).toBe(1)
    expect(phaseProgress([ev('CHARGE', 0), ev('FCs', 480), ev('DROP', 600)], 600, {}, 20)).toBeNull()
  })
})
