// Comparing roasts: curves on a common CHARGE-aligned time grid and repeatability statistics.
import { findEvent, type RoastEvent } from './events'
import type { PhaseStats } from './phases'
import { valueAt } from './reference'
import { computeRoR } from './ror'

type Num = number | null

export interface Comparable {
  samples: { t: number[]; bt: Num[]; et: Num[] }
  events: RoastEvent[]
}

/** Resamples roasts onto one grid (seconds from CHARGE). Roasts without CHARGE are skipped (null rows). */
export function alignCurves(roasts: Comparable[], stepSec = 2, leadSec = 30) {
  const rel = roasts.map((r) => {
    const c = findEvent(r.events, 'CHARGE')
    if (!c) return null
    const t = r.samples.t.map((x) => x - c.t)
    const end = (findEvent(r.events, 'DROP')?.t ?? r.samples.t[r.samples.t.length - 1]) - c.t
    return { t, bt: r.samples.bt, et: r.samples.et, ror: computeRoR(r.samples.t, r.samples.bt), end }
  })
  const maxEnd = Math.max(60, ...rel.map((x) => (x ? x.end : 0)))
  const grid: number[] = []
  for (let s = -leadSec; s <= maxEnd + 30; s += stepSec) grid.push(s)
  const series = rel.map((x) => {
    if (!x) return null
    const at = (v: Num[]) => grid.map((g) => (g > x.end + 30 ? null : valueAt(x.t, v, g)))
    return { bt: at(x.bt), et: at(x.et), ror: at(x.ror) }
  })
  return { grid, series }
}

export function mean(xs: number[]): number | null {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null
}

/** Sample standard deviation (n − 1); null for fewer than two values. */
export function sd(xs: number[]): number | null {
  if (xs.length < 2) return null
  const m = mean(xs)!
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1))
}

export interface RoastMetrics {
  total: number | null
  fcsTime: number | null
  fcsBT: number | null
  dropBT: number | null
  chargeBT: number | null
  tpTime: number | null
  tpBT: number | null
  dtr: number | null
  lossPct: number | null
}

export function metrics(r: Comparable & { phases: PhaseStats | null; lossPct: number | null }): RoastMetrics {
  const c = findEvent(r.events, 'CHARGE')
  const fcs = findEvent(r.events, 'FCs')
  const tp = findEvent(r.events, 'TP')
  const drop = findEvent(r.events, 'DROP')
  const rel = (e?: RoastEvent) => (e && c ? e.t - c.t : null)
  return {
    total: r.phases?.total ?? null,
    fcsTime: rel(fcs),
    fcsBT: fcs?.bt ?? null,
    dropBT: drop?.bt ?? null,
    chargeBT: c?.bt ?? null,
    tpTime: rel(tp),
    tpBT: tp?.bt ?? null,
    dtr: r.phases?.dtr ?? null,
    lossPct: r.lossPct,
  }
}

/** Mean and spread of each metric over a set of roasts (values that are missing are ignored). */
export function summarize(list: RoastMetrics[]) {
  const keys: (keyof RoastMetrics)[] = ['total', 'fcsTime', 'fcsBT', 'dropBT', 'chargeBT', 'tpTime', 'tpBT', 'dtr', 'lossPct']
  return Object.fromEntries(
    keys.map((k) => {
      const xs = list.map((m) => m[k]).filter((x): x is number => x !== null)
      return [k, { mean: mean(xs), sd: sd(xs), n: xs.length }]
    }),
  ) as Record<keyof RoastMetrics, { mean: number | null; sd: number | null; n: number }>
}
