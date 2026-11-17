import { describe, expect, it } from 'vitest'
import type { EventType } from './events'
import { deviation, referenceFrom, timeAtTemp, upcoming, valueAt } from './reference'

const ev = (type: EventType, t: number) => ({ id: type, type, t, bt: null, et: null })

/** Simple roast: CHARGE at 30 s, BT falls to TP at 90 s, then rises 0.2 °C/s. */
function roast(shiftSec = 0) {
  const t: number[] = []
  const bt: number[] = []
  for (let s = 0; s <= 900; s++) {
    t.push(s)
    const r = s - 30 - shiftSec
    bt.push(r < 0 ? 200 : r < 60 ? 200 - r * 1.8 : 92 + (r - 60) * 0.2)
  }
  return {
    samples: { t, bt, et: bt.map((x) => x + 30) },
    events: [ev('CHARGE', 30 + shiftSec), ev('TP', 90 + shiftSec), ev('FCs', 530 + shiftSec)],
    controls: [{ t: 30 + shiftSec, kind: 'gas' as const, value: 5 }, { t: 330 + shiftSec, kind: 'gas' as const, value: 4 }],
  }
}

describe('reference', () => {
  it('aligns at CHARGE and interpolates', () => {
    const ref = referenceFrom(roast(), 'ref')!
    expect(ref.t[30]).toBe(0)
    expect(ref.events.find((e) => e.type === 'FCs')!.t).toBe(500)
    expect(valueAt(ref.t, ref.bt, 160.5)).toBeCloseTo(92 + 100.5 * 0.2, 6)
    expect(valueAt(ref.t, ref.bt, -100)).toBeNull()
    expect(referenceFrom({ ...roast(), events: [] }, 'x')).toBeNull()
  })

  it('reports a roast running 10 s behind the reference', () => {
    const ref = referenceFrom(roast(), 'ref')!
    // live roast is the same curve but 10 s slower after TP; at roast time 300 s:
    const liveBT = 92 + (300 - 60 - 10) * 0.2
    const d = deviation(ref, 300, liveBT, 12, true)
    expect(d.dTime).toBeCloseTo(10, 6)
    expect(d.dBT).toBeCloseTo(-2, 6)
    expect(timeAtTemp(ref, 150)).toBeCloseTo(60 + 58 / 0.2, 6)
  })

  it('tells what comes next in the plan', () => {
    const ref = referenceFrom(roast(), 'ref')!
    const u = upcoming(ref, 200)
    expect(u.event?.type).toBe('FCs')
    expect(u.control).toMatchObject({ t: 300, value: 4 })
    // FC already marked live (earlier than in the reference) → no longer announced
    expect(upcoming(ref, 450, ['FCs']).event).toBeNull()
  })
})
