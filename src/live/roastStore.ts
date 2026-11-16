// State of the roast being recorded: metadata, events, manual control log, auto detection.
import { useSyncExternalStore } from 'react'
import { detectCharge, detectDrop, detectDry, detectTP } from '../domain/autodetect'
import { findEvent, type ControlChange, type ControlKind, type EventType, type RoastEvent } from '../domain/events'
import type { DataSource, LiveSession, LiveSnapshot } from './LiveSession'

export type RoastStatus = 'ready' | 'roasting' | 'finished'

export interface RoastState {
  status: RoastStatus
  source: DataSource | null
  coffee: string
  greenWeightG: number | null
  roastedWeightG: number | null
  notes: string
  /** session time when Start was pressed */
  startT: number | null
  events: RoastEvent[]
  controls: ControlChange[]
  current: Record<ControlKind, number>
  /** event types the user removed – auto detection must not add them back */
  suppressed: EventType[]
  canUndo: boolean
  /** id of the stored roast record once saved (after Finish) */
  savedId: string | null
}

export const CONTROL_LIMITS: Record<ControlKind, { min: number; max: number; step: number }> = {
  gas: { min: 0, max: 6, step: 0.5 }, // propane 2–6 kPa per rating plate
  air: { min: 0, max: 100, step: 5 },
  drum: { min: 0, max: 100, step: 5 },
}
export const AIR_PRESETS = [25, 35, 50, 65, 75] // labels around the Hot Air knob

/** Changes of the same control within this window are merged into one record. */
const MERGE_SEC = 3

const initial = (): RoastState => ({
  status: 'ready',
  source: null,
  coffee: '',
  greenWeightG: null,
  roastedWeightG: null,
  notes: '',
  startT: null,
  events: [],
  controls: [],
  current: { gas: 4.5, air: 35, drum: 50 },
  suppressed: [],
  canUndo: false,
  savedId: null,
})

export class RoastStore {
  private state: RoastState = initial()
  private undoStack: Pick<RoastState, 'events' | 'controls' | 'current' | 'suppressed'>[] = []
  private listeners = new Set<() => void>()

  constructor(private session: LiveSession) {
    session.subscribe(() => this.autoDetect(session.getSnapshot()))
  }

  subscribe = (fn: () => void) => (this.listeners.add(fn), () => this.listeners.delete(fn))
  getSnapshot = () => this.state

  start(meta: { coffee: string; greenWeightG: number | null }) {
    const snap = this.session.getSnapshot()
    const now = lastT(snap)
    this.undoStack = []
    this.set({
      ...initial(),
      status: 'roasting',
      source: snap.source,
      coffee: meta.coffee,
      greenWeightG: meta.greenWeightG,
      current: this.state.current,
      startT: now,
      // starting values of the manual controls
      controls: (['gas', 'air', 'drum'] as ControlKind[]).map((kind) => ({ t: now ?? 0, kind, value: this.state.current[kind] })),
    })
    this.autoDetect(snap)
  }

  /** Manual event at the latest sample (replaces an existing one of the same type). */
  mark(type: EventType, note?: string) {
    if (this.state.status !== 'roasting') return
    const snap = this.session.getSnapshot()
    const i = lastIdx(snap)
    if (i < 0) return
    this.pushUndo()
    const e = makeEvent(type, snap, i, false, note)
    const events = type === 'CUSTOM' ? [...this.state.events, e] : [...this.state.events.filter((x) => x.type !== type), e]
    this.set({ events: sortEvents(events), suppressed: this.state.suppressed.filter((s) => s !== type) })
  }

  removeEvent(id: string) {
    const e = this.state.events.find((x) => x.id === id)
    if (!e) return
    this.pushUndo()
    this.set({
      events: this.state.events.filter((x) => x.id !== id),
      suppressed: e.type === 'CUSTOM' ? this.state.suppressed : [...this.state.suppressed, e.type],
    })
  }

  setControl(kind: ControlKind, value: number) {
    const lim = CONTROL_LIMITS[kind]
    const v = Math.round(Math.min(lim.max, Math.max(lim.min, value)) * 10) / 10
    if (v === this.state.current[kind]) return
    const current = { ...this.state.current, [kind]: v }
    if (this.state.status !== 'roasting') return this.set({ current })
    this.pushUndo()
    const now = lastT(this.session.getSnapshot()) ?? 0
    const controls = [...this.state.controls]
    const prev = [...controls].reverse().find((c) => c.kind === kind)
    if (prev && now - prev.t < MERGE_SEC && controls.filter((c) => c.kind === kind).length > 1) {
      controls[controls.lastIndexOf(prev)] = { ...prev, value: v }
    } else controls.push({ t: now, kind, value: v })
    this.set({ current, controls })
  }

  undo() {
    const prev = this.undoStack.pop()
    if (!prev) return
    this.set({ ...prev })
  }

  finish() {
    if (this.state.status !== 'roasting') return
    if (!findEvent(this.state.events, 'DROP')) this.mark('DROP')
    this.set({ status: 'finished' })
  }

  update(patch: Partial<Pick<RoastState, 'roastedWeightG' | 'notes' | 'coffee' | 'greenWeightG' | 'savedId'>>) {
    this.set(patch)
  }

  /** Restores a roast in progress after a reload (undo history is not kept). */
  restore(saved: RoastState) {
    this.undoStack = []
    this.set({ ...initial(), ...saved })
  }

  /** Back to "ready", keeping coffee, weight and control positions as defaults. */
  newRoast() {
    const { coffee, greenWeightG, current } = this.state
    this.undoStack = []
    this.set({ ...initial(), coffee, greenWeightG, current })
  }

  // ── automatic detection ──
  private autoDetect(snap: LiveSnapshot) {
    const s = this.state
    if (s.status !== 'roasting' || snap.t.length < 3) return
    const has = (t: EventType) => !!findEvent(s.events, t) || s.suppressed.includes(t)
    const idxOf = (e?: RoastEvent) => (e ? snap.t.findIndex((t) => t >= e.t) : -1)
    // look a minute back so a CHARGE just before Start is still found
    const from = Math.max(0, snap.t.findIndex((t) => t >= (s.startT ?? 0) - 60))
    const add: RoastEvent[] = []

    let chargeIdx = idxOf(findEvent(s.events, 'CHARGE'))
    if (!has('CHARGE')) {
      const i = detectCharge(snap.t, snap.bt, from)
      if (i !== null) {
        add.push(makeEvent('CHARGE', snap, i, true))
        chargeIdx = i
      }
    }
    let tpIdx = idxOf(findEvent(s.events, 'TP'))
    if (chargeIdx >= 0 && !has('TP')) {
      const i = detectTP(snap.t, snap.bt, chargeIdx)
      if (i !== null) {
        add.push(makeEvent('TP', snap, i, true))
        tpIdx = i
      }
    }
    if (tpIdx >= 0 && !has('DRY')) {
      const i = detectDry(snap.bt, tpIdx)
      if (i !== null) add.push(makeEvent('DRY', snap, i, true))
    }
    const fcsIdx = idxOf(findEvent(s.events, 'FCs'))
    if (fcsIdx >= 0 && !has('DROP')) {
      const i = detectDrop(snap.t, snap.bt, fcsIdx)
      if (i !== null) add.push(makeEvent('DROP', snap, i, true))
    }
    if (add.length) this.set({ events: sortEvents([...s.events, ...add]) })
  }

  private pushUndo() {
    const { events, controls, current, suppressed } = this.state
    this.undoStack.push({ events, controls, current, suppressed })
    if (this.undoStack.length > 50) this.undoStack.shift()
  }

  private set(patch: Partial<RoastState>) {
    this.state = { ...this.state, ...patch, canUndo: this.undoStack.length > 0 }
    this.listeners.forEach((l) => l())
  }
}

function makeEvent(type: EventType, snap: LiveSnapshot, i: number, auto: boolean, note?: string): RoastEvent {
  return { id: crypto.randomUUID(), type, t: snap.t[i], bt: snap.bt[i], et: snap.et[i], auto, note }
}

const sortEvents = (e: RoastEvent[]) => [...e].sort((a, b) => a.t - b.t)

function lastIdx(snap: LiveSnapshot) {
  for (let i = snap.t.length - 1; i >= 0; i--) if (snap.bt[i] !== null) return i
  return -1
}

function lastT(snap: LiveSnapshot): number | null {
  return snap.t.length ? snap.t[snap.t.length - 1] : null
}

export function useRoast(store: RoastStore) {
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
