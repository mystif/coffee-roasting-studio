// Reference (background) curve: a previous roast or profile aligned at CHARGE,
// plus the live deviation from it.
import { computeRoR } from './ror'
import { findEvent, type ControlChange, type RoastEvent } from './events'

type Num = number | null

export interface ReferenceCurve {
  label: string
  /** seconds relative to the reference's CHARGE */
  t: number[]
  bt: Num[]
  et: Num[]
  ror: Num[]
  events: RoastEvent[]
  controls: ControlChange[]
}

interface CurveSource {
  samples: { t: number[]; bt: Num[]; et: Num[] }
  events: RoastEvent[]
  controls: ControlChange[]
}

/** Builds a CHARGE-aligned reference; returns null when the source has no CHARGE. */
export function referenceFrom(src: CurveSource, label: string): ReferenceCurve | null {
  const charge = findEvent(src.events, 'CHARGE')
  if (!charge) return null
  const c = charge.t
  const { t, bt, et } = src.samples
  return {
    label,
    t: t.map((x) => round2(x - c)),
    bt,
    et,
    ror: computeRoR(t, bt),
    events: src.events.map((e) => ({ ...e, t: round2(e.t - c) })),
    controls: src.controls.map((x) => ({ ...x, t: round2(x.t - c) })),
  }
}

/** Linear interpolation of `v` at time `x` (null outside the curve or across gaps). */
export function valueAt(t: number[], v: Num[], x: number): number | null {
  if (t.length === 0 || x < t[0] || x > t[t.length - 1]) return null
  let lo = 0
  let hi = t.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (t[mid] <= x) lo = mid
    else hi = mid
  }
  const a = v[lo]
  const b = v[hi]
  if (a === null || b === null) return null
  if (t[hi] === t[lo]) return a
  return a + ((b - a) * (x - t[lo])) / (t[hi] - t[lo])
}

/** First time after TP at which the reference BT reaches `temp` (interpolated). */
export function timeAtTemp(ref: ReferenceCurve, temp: number): number | null {
  const tp = findEvent(ref.events, 'TP')
  let i = Math.max(1, tp ? ref.t.findIndex((x) => x >= tp.t) : ref.t.findIndex((x) => x >= 0))
  const drop = findEvent(ref.events, 'DROP')
  for (; i < ref.t.length; i++) {
    if (drop && ref.t[i] > drop.t) break
    const a = ref.bt[i - 1]
    const b = ref.bt[i]
    if (a === null || b === null) continue
    if (a < temp && b >= temp) return ref.t[i - 1] + ((temp - a) / (b - a)) * (ref.t[i] - ref.t[i - 1])
  }
  return null
}

export interface Deviation {
  /** live BT − reference BT at the same roast time */
  dBT: number | null
  dRoR: number | null
  /** live roast time − time the reference needed to reach the same BT (+ = slower than reference) */
  dTime: number | null
}

export function deviation(ref: ReferenceCurve, roastTime: number, bt: number | null, ror: number | null, afterTP: boolean): Deviation {
  const rBT = valueAt(ref.t, ref.bt, roastTime)
  const rRoR = valueAt(ref.t, ref.ror, roastTime)
  const tAt = bt !== null && afterTP ? timeAtTemp(ref, bt) : null
  return {
    dBT: bt !== null && rBT !== null ? bt - rBT : null,
    dRoR: ror !== null && rRoR !== null ? ror - rRoR : null,
    dTime: tAt !== null ? roastTime - tAt : null,
  }
}

/** Next reference event / control change after `roastTime` – the plan to follow. */
export function upcoming(ref: ReferenceCurve, roastTime: number) {
  return {
    event: ref.events.find((e) => e.t > roastTime && e.type !== 'TP' && e.type !== 'CHARGE') ?? null,
    control: ref.controls.find((c) => c.t > roastTime) ?? null,
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100
