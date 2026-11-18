// Estimated time until BT reaches a target temperature (Maillard start, First Crack).
// BT is extrapolated with the current RoR plus a damped share of its recent decline.
// A rising RoR trend is not extrapolated.

type Num = number | null

export interface PredictOptions {
  /** window for the RoR trend, seconds */
  trendSec: number
  /** share of the recent RoR decline that is extrapolated (0 = constant RoR) */
  trendFactor: number
  /** no estimate below this RoR (°C/min) */
  minRoR: number
}

// trendFactor 0.25 had the lowest error on the user's 35 roasts (FC from 150 °C: 11.8 s, 2 min before: 5 s, Dry End: 9 s)
export const DEFAULT_PREDICT: PredictOptions = { trendSec: 90, trendFactor: 0.25, minRoR: 1 }

const lastIndex = (v: Num[]) => {
  for (let i = v.length - 1; i >= 0; i--) if (v[i] !== null) return i
  return -1
}

/** Least-squares slope of RoR over the trailing window, in °C/min per second. */
function rorSlope(t: number[], ror: Num[], end: number, windowSec: number): number | null {
  let n = 0
  let sx = 0
  let sy = 0
  let sxx = 0
  let sxy = 0
  for (let i = end; i >= 0 && t[end] - t[i] <= windowSec; i--) {
    const y = ror[i]
    if (y === null) continue
    const x = t[i] - t[end]
    n++
    sx += x
    sy += y
    sxx += x * x
    sxy += x * y
  }
  const d = n * sxx - sx * sx
  if (n < 5 || d === 0) return null
  return (n * sxy - sx * sy) / d
}

/**
 * Seconds from the last reading until BT reaches `target`; 0 if already there,
 * null when it cannot be estimated (RoR too low or falling to zero before the target).
 */
export function secondsToTemp(t: number[], bt: Num[], ror: Num[], target: number, o: PredictOptions = DEFAULT_PREDICT): number | null {
  const i = Math.min(lastIndex(bt), lastIndex(ror))
  if (i < 0) return null
  const B = bt[i] as number
  const R = ror[i] as number
  if (B >= target) return 0
  if (R < o.minRoR) return null
  const dT = target - B
  let k = o.trendFactor ? (rorSlope(t, ror, i, o.trendSec) ?? 0) * o.trendFactor : 0
  if (k > 0) k = 0 // don't extrapolate a rising RoR
  if (Math.abs(k) < 1e-6) return (60 * dT) / R
  // BT(τ) = B + (R·τ + k·τ²/2) / 60  →  k/2·τ² + R·τ − 60·dT = 0
  const disc = R * R + 2 * k * 60 * dT
  if (disc < 0) return null // RoR would reach zero before the target
  return (-R + Math.sqrt(disc)) / k
}

export interface RorProjection {
  t0: number
  r0: number
  t1: number
  r1: number
}

/**
 * Where RoR is heading `horizonSec` ahead: from the last RoR value with `trendFactor` × the slope of
 * the trailing `windowSec` (0 = stays flat), never below 0. A projection, not a measured value.
 * On the user's 35 roasts (error 60 s ahead): Maillard 0.79 °C/min with 60 s × 0.5 vs 1.01 flat;
 * before Dry End and after FC the flat line was best (1.79 / 2.01) – the trend made it worse.
 */
export function rorProjection(t: number[], ror: Num[], trendFactor = 0.5, windowSec = 60, horizonSec = 60): RorProjection | null {
  const i = lastIndex(ror)
  if (i < 0) return null
  const slope = trendFactor ? rorSlope(t, ror, i, windowSec) : 0
  if (slope === null) return null
  const k = slope * trendFactor
  const r0 = ror[i] as number
  let dt = horizonSec
  if (k < 0 && r0 + k * dt < 0) dt = Math.max(0, -r0 / k) // stop where it reaches 0
  return { t0: t[i], r0, t1: t[i] + dt, r1: Math.max(0, r0 + k * dt) }
}
