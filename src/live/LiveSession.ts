// Live measurement buffer shared by the chart and the readouts.
// `source` makes it impossible to confuse a replayed file with real roaster data.

import { DEFAULT_ROR, lastRoR, type RorOptions } from '../domain/ror'

export type DataSource = 'roaster' | 'replay'

export interface LiveSnapshot {
  source: DataSource | null
  sourceLabel: string
  t: number[]
  bt: (number | null)[]
  et: (number | null)[]
  ror: (number | null)[]
  version: number
}

/** A reading more than this many expected intervals late is recorded as a gap. */
const GAP_FACTOR = 2.5

export class LiveSession {
  private startAt: number | null = null
  private lastAt: number | null = null
  private intervalMs = 1000
  private listeners = new Set<() => void>()
  private snap: LiveSnapshot = empty()

  constructor(private rorOpts: RorOptions = DEFAULT_ROR) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.snap

  /** Starts a fresh buffer for a given source. */
  reset(source: DataSource, label: string, intervalMs: number) {
    this.startAt = null
    this.lastAt = null
    this.intervalMs = intervalMs
    this.snap = { ...empty(), source, sourceLabel: label }
    this.emit()
  }

  clear() {
    this.startAt = null
    this.lastAt = null
    this.snap = empty()
    this.emit()
  }

  /** `at` in ms (epoch for live data, virtual clock for replay). */
  add(at: number, bt: number | null, et: number | null) {
    if (this.startAt === null) this.startAt = at
    const s = this.snap
    const t = [...s.t]
    const btA = [...s.bt]
    const etA = [...s.et]
    const rorA = [...s.ror]
    if (this.lastAt !== null && at - this.lastAt > this.intervalMs * GAP_FACTOR) {
      // explicit gap: the chart breaks the line, nothing is interpolated
      t.push((this.lastAt - this.startAt) / 1000 + this.intervalMs / 1000)
      btA.push(null)
      etA.push(null)
      rorA.push(null)
    }
    this.lastAt = at
    t.push((at - this.startAt) / 1000)
    btA.push(bt)
    etA.push(et)
    rorA.push(lastRoR(t, btA, this.rorOpts))
    this.snap = { ...s, t, bt: btA, et: etA, ror: rorA, version: s.version + 1 }
    this.emit()
  }

  private emit() {
    for (const l of this.listeners) l()
  }
}

function empty(): LiveSnapshot {
  return { source: null, sourceLabel: '', t: [], bt: [], et: [], ror: [], version: 0 }
}
