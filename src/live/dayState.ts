// The roasting day: starts automatically when ET starts rising (or manually), runs across
// all batches and reloads, ends with STOP. Persisted in IndexedDB.
import { DEFAULT_HEAT, detectHeatStart, gasKg } from '../domain/daySession'
import { db, getSetting, setSetting } from '../storage/db'
import { createStore } from '../storage/store'
import { session } from './runtime'

export type DayReason = 'et' | 'hot' | 'manual'

interface Persisted {
  startedAt: number | null
  stoppedAt: number | null
  reason: DayReason | null
  /** automatic start allowed (false right after STOP until the roaster cools down or a new day) */
  armed: boolean
}

export interface DayRecord {
  startedAt: number
  stoppedAt: number
  gasKg: number
  roasts: number
}

export const dayState = createStore<Persisted & { loaded: boolean }>({ startedAt: null, stoppedAt: null, reason: null, armed: true, loaded: false })

const KEY = 'daySession'
const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

function save() {
  const { startedAt, stoppedAt, reason, armed } = dayState.get()
  void setSetting(KEY, { startedAt, stoppedAt, reason, armed })
}

export const isRunning = () => {
  const d = dayState.get()
  return d.startedAt !== null && d.stoppedAt === null
}

export function startDay(at: number, reason: DayReason) {
  if (isRunning()) return
  dayState.set({ startedAt: at, stoppedAt: null, reason, armed: false })
  save()
}

export async function stopDay(now = Date.now()) {
  const d = dayState.get()
  if (d.startedAt === null || d.stoppedAt !== null) return
  dayState.set({ stoppedAt: now, armed: false })
  save()
  const roasts = await db.roasts.where('roastDate').aboveOrEqual(new Date(d.startedAt).toISOString()).count()
  const history = (await getSetting<DayRecord[]>('dayHistory')) ?? []
  await setSetting('dayHistory', [...history, { startedAt: d.startedAt, stoppedAt: now, gasKg: gasKg(now - d.startedAt), roasts }])
}

/** Watches the live ET for the start of heating. */
function onSample() {
  const snap = session.getSnapshot()
  if (snap.source !== 'roaster' || snap.startAt === null || snap.t.length < 3 || !dayState.get().loaded) return
  if (isRunning()) return
  const lastEt = snap.et[snap.et.length - 1]
  if (lastEt !== null && lastEt < DEFAULT_HEAT.coldEt && !dayState.get().armed) {
    dayState.set({ armed: true }) // roaster cooled down → next heating starts a new day
    save()
  }
  if (!dayState.get().armed) return
  const d = detectHeatStart(snap.t, snap.et)
  if (d) startDay(snap.startAt + d.t * 1000, d.hot ? 'hot' : 'et')
}

export async function initDay() {
  const p = await getSetting<Persisted>(KEY)
  if (p) {
    // a day stopped earlier (another date) allows the automatic start again
    const armed = p.armed || (p.stoppedAt !== null && !sameDay(p.stoppedAt, Date.now()))
    dayState.set({ ...p, armed })
  }
  dayState.set({ loaded: true })
  session.subscribe(onSample)
}
