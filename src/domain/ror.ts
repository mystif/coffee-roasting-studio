// Rate of Rise (°C/min). Time-based windows so it behaves the same at 1 s and 2 s sampling.
// Modelled on Artisan's live algorithm: lightly smoothed temperature, delta over a span
// with an averaged left point, then a linear-decay smoothing of the RoR itself.
// Defaults reproduce the user's Artisan settings (DeltaSpan 20 s, curvefilter 3,
// deltafilter 7 at 2 s sampling, RoR limit 35).

export interface RorOptions {
  spanSec: number
  tempSmoothSec: number
  rorSmoothSec: number
  /** |RoR| above this is treated as a glitch and dropped */
  limit: number
}

export const DEFAULT_ROR: RorOptions = { spanSec: 20, tempSmoothSec: 6, rorSmoothSec: 14, limit: 35 }

type Num = number | null

/** Linear-decay weighted average of v over (t[i] - windowSec, t[i]]; newest sample weighs most. */
function decayAverage(t: number[], v: Num[], i: number, windowSec: number): Num {
  let sum = 0
  let wsum = 0
  let w = 1
  // walk backwards; weight decreases linearly with index distance
  const items: number[] = []
  for (let k = i; k >= 0 && t[i] - t[k] < windowSec; k--) {
    const x = v[k]
    if (x !== null && Number.isFinite(x)) items.push(x)
  }
  if (items.length === 0) return null
  for (let k = items.length - 1; k >= 0; k--) {
    sum += items[k] * w
    wsum += w
    w++
  }
  return sum / wsum
}

export function computeRoR(t: number[], temp: Num[], opts: RorOptions = DEFAULT_ROR): Num[] {
  const n = t.length
  const sm: Num[] = new Array(n)
  for (let i = 0; i < n; i++) sm[i] = temp[i] === null ? null : decayAverage(t, temp, i, opts.tempSmoothSec)

  const raw: Num[] = new Array(n).fill(null)
  let j = 0
  for (let i = 0; i < n; i++) {
    if (sm[i] === null) continue
    const target = t[i] - opts.spanSec
    if (target < t[0]) continue
    while (j + 1 < i && t[j + 1] <= target) j++
    // average left point over j-2..j+2 (without looking past i)
    let s = 0
    let c = 0
    for (let k = Math.max(0, j - 2); k <= Math.min(i - 1, j + 2); k++) {
      const x = sm[k]
      if (x !== null) {
        s += x
        c++
      }
    }
    const dt = t[i] - t[j]
    if (c === 0 || dt <= 0) continue
    const r = ((sm[i]! - s / c) / dt) * 60
    raw[i] = Math.abs(r) > opts.limit ? null : r
  }

  const out: Num[] = new Array(n)
  for (let i = 0; i < n; i++) out[i] = raw[i] === null ? null : decayAverage(t, raw, i, opts.rorSmoothSec)
  return out
}

/** RoR at the last sample only – cheap enough to call on every live reading. */
export function lastRoR(t: number[], temp: Num[], opts: RorOptions = DEFAULT_ROR): Num {
  // only the tail matters: span + both smoothing windows + left-point margin
  const need = opts.spanSec + opts.tempSmoothSec + opts.rorSmoothSec + 10
  let start = t.length - 1
  while (start > 0 && t[t.length - 1] - t[start - 1] <= need) start--
  const r = computeRoR(t.slice(start), temp.slice(start), opts)
  return r[r.length - 1] ?? null
}
