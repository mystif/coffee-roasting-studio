// Artisan .alog → app roast record. Keeps Artisan's own event marks; only fills gaps
// the way Artisan does (TP from its computed index, Dry End from the 130 °C phase rule).
import { detectDry } from '../domain/autodetect'
import type { ControlChange, EventType, RoastEvent } from '../domain/events'
import { findEvent } from '../domain/events'
import { phaseStats } from '../domain/phases'
import { RECORD_SCHEMA, lossPct, type RoastRecord } from '../storage/roastRecord'
import type { AlogRoast } from './alog'

/** Artisan timeindex slots → app event types (SCe and COOL are not used). */
const SLOTS: [number, EventType][] = [
  [0, 'CHARGE'],
  [1, 'DRY'],
  [2, 'FCs'],
  [3, 'FCe'],
  [4, 'SC'],
  [6, 'DROP'],
]

/** Artisan stores slider events as internal value v; shown value is (v − 1) × 10. */
const shown = (v: number) => Math.round((v - 1) * 10)

/** Gas in kPa from the user's own event label, e.g. "5,5kpi 100" or "4 kPa". */
export function kpaFromLabel(label: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*kp[ai]/i.exec(label)
  return m ? Number(m[1].replace(',', '.')) : null
}

export function alogToRecord(a: AlogRoast, opts: { fileName: string; coffee?: string; coffeeId?: string | null }): RoastRecord {
  const at = (i: number) => ({ t: a.t[i], bt: a.bt[i], et: a.et[i] })
  const events: RoastEvent[] = []
  for (const [slot, type] of SLOTS) {
    const i = a.timeindex[slot]
    const valid = slot === 0 ? i >= 0 : i > 0 // CHARGE may legitimately be sample 0
    if (valid && i < a.t.length) events.push({ id: `${type}-${i}`, type, ...at(i) })
  }
  const tpIdx = a.computed.TP_idx
  if (tpIdx != null && tpIdx < a.t.length) events.push({ id: `TP-${tpIdx}`, type: 'TP', auto: true, ...at(tpIdx) })
  if (!findEvent(events, 'DRY') && tpIdx != null) {
    const d = detectDry(a.bt, tpIdx)
    const fcs = a.timeindex[2]
    if (d !== null && (!fcs || d < fcs)) events.push({ id: `DRY-${d}`, type: 'DRY', auto: true, ...at(d) })
  }
  events.sort((x, y) => x.t - y.t)

  const controls: ControlChange[] = []
  for (const ev of a.specialEvents) {
    const t = a.t[ev.idx]
    if (t === undefined) continue
    const kind = a.eventTypes[ev.type]?.toLowerCase()
    if (kind === 'air') controls.push({ t, kind: 'air', value: shown(ev.value) })
    else if (kind === 'drum') controls.push({ t, kind: 'drum', value: shown(ev.value) })
    else if (kind === 'power' || kind === 'burner' || kind === 'gas') {
      const kpa = kpaFromLabel(ev.label)
      if (kpa !== null) controls.push({ t, kind: 'gas', value: kpa })
    }
  }
  controls.sort((x, y) => x.t - y.t)

  const toG = (w: number | null) => (w == null ? null : Math.round(a.weightUnit.toLowerCase().startsWith('k') ? w * 1000 : w))
  const green = toG(a.greenWeight)
  const roasted = toG(a.roastedWeight)
  const drop = findEvent(events, 'DROP')
  const date = a.roastEpoch ? new Date(a.roastEpoch * 1000) : new Date(a.roastDate || Date.now())
  const notes = [a.roastingNotes, a.cuppingNotes && `Cupping: ${a.cuppingNotes}`].filter(Boolean).join('\n\n')
  const interval = a.samplingInterval || (a.t.length > 1 ? a.t[1] - a.t[0] : 2)

  return {
    schema: RECORD_SCHEMA,
    // stable id → importing the same file again replaces it instead of duplicating
    id: a.uuid ? `artisan-${a.uuid}` : `artisan-${opts.fileName}-${date.getTime()}`,
    roastDate: date.toISOString(),
    savedAt: new Date().toISOString(),
    coffee: (opts.coffee ?? a.beans).trim() || opts.fileName.replace(/\.alog$/i, ''),
    coffeeId: opts.coffeeId ?? null,
    greenWeightG: green,
    roastedWeightG: roasted,
    lossPct: lossPct(green, roasted),
    notes,
    rating: null,
    source: 'import',
    samples: { t: a.t, bt: a.bt, et: a.et },
    sampleIntervalMs: Math.round(interval * 1000),
    events,
    controls,
    phases: phaseStats(events, drop?.t ?? a.t[a.t.length - 1] ?? 0),
    backedUp: false,
  }
}
