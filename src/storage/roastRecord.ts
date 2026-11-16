// The stored form of one roast. Plain JSON – also used for backups/exports.
import type { ControlChange, RoastEvent } from '../domain/events'
import { findEvent } from '../domain/events'
import { phaseStats, type PhaseStats } from '../domain/phases'
import type { LiveSnapshot } from '../live/LiveSession'
import type { RoastState } from '../live/roastStore'

export const RECORD_SCHEMA = 1

export interface RoastRecord {
  schema: number
  id: string
  /** ISO time of t = 0 of the stored curve */
  roastDate: string
  savedAt: string
  coffee: string
  coffeeId: string | null
  greenWeightG: number | null
  roastedWeightG: number | null
  lossPct: number | null
  notes: string
  rating: number | null
  source: 'live' | 'import'
  /** seconds; events and controls use the same timeline */
  samples: { t: number[]; bt: (number | null)[]; et: (number | null)[] }
  sampleIntervalMs: number
  events: RoastEvent[]
  controls: ControlChange[]
  phases: PhaseStats | null
  backedUp: boolean
}

/** Seconds of data kept before Start (preheat context). */
const LEAD_SEC = 30

export const lossPct = (green: number | null, roasted: number | null) =>
  green && roasted ? Math.round(((green - roasted) / green) * 1000) / 10 : null

/** Builds a record from the live buffer and the finished roast. Re-bases time to the stored slice. */
export function buildRecord(snap: LiveSnapshot, roast: RoastState, id: string, now = new Date()): RoastRecord {
  if (snap.startAt === null) throw new Error('Chybí časová značka měření')
  const from = Math.max(0, (roast.startT ?? 0) - LEAD_SEC)
  const i0 = Math.max(0, snap.t.findIndex((t) => t >= from))
  const base = snap.t[i0] ?? 0
  const shift = <T extends { t: number }>(x: T): T => ({ ...x, t: round2(x.t - base) })
  const events = roast.events.map(shift)
  const drop = findEvent(events, 'DROP')
  const t = snap.t.slice(i0).map((x) => round2(x - base))
  return {
    schema: RECORD_SCHEMA,
    id,
    roastDate: new Date(snap.startAt + base * 1000).toISOString(),
    savedAt: now.toISOString(),
    coffee: roast.coffee,
    coffeeId: roast.coffeeId,
    greenWeightG: roast.greenWeightG,
    roastedWeightG: roast.roastedWeightG,
    lossPct: lossPct(roast.greenWeightG, roast.roastedWeightG),
    notes: roast.notes,
    rating: null,
    source: 'live',
    samples: { t, bt: snap.bt.slice(i0), et: snap.et.slice(i0) },
    sampleIntervalMs: snap.intervalMs,
    events,
    controls: roast.controls.map(shift),
    phases: phaseStats(events, drop?.t ?? t[t.length - 1] ?? 0),
    backedUp: false,
  }
}

const round2 = (x: number) => Math.round(x * 100) / 100

export function backupFileName(r: RoastRecord): string {
  const d = new Date(r.roastDate)
  const p = (n: number) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
  const name = (r.coffee || 'prazeni')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return `${stamp}_${name || 'prazeni'}.json`
}
