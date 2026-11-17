// Keeps the roast safe: draft every few seconds while roasting, full record on Finish,
// edits from the summary written back, automatic restore after a reload or crash.
// Replayed files are never stored.
import { roast, session } from '../live/runtime'
import type { RoastState } from '../live/roastStore'
import { flushBackups, initBackup } from './backup'
import { db, getSetting, setSetting } from './db'
import { buildRecord, lossPct } from './roastRecord'
import { createStore } from './store'

const DRAFT_EVERY_MS = 5000

export const persistState = createStore({
  /** set when a roast in progress was restored after a reload */
  restoredFrom: null as string | null,
  lastDraftAt: null as number | null,
  savedId: null as string | null,
  error: '',
})

let draftTimer: ReturnType<typeof setTimeout> | null = null
let editTimer: ReturnType<typeof setTimeout> | null = null
let prev: RoastState = roast.getSnapshot()

const isLiveRoasting = () => roast.getSnapshot().status === 'roasting' && session.getSnapshot().source === 'roaster'

export async function initPersistence() {
  void navigator.storage?.persist?.() // ask Chrome not to evict our data
  try {
    await restoreDraft()
  } catch (e) {
    report(e)
  }
  prev = roast.getSnapshot()
  roast.subscribe(onRoastChange)
  session.subscribe(() => {
    if (isLiveRoasting() && !draftTimer) draftTimer = setTimeout(writeDraft, DRAFT_EVERY_MS)
  })
  globalThis.addEventListener?.('pagehide', () => void (isLiveRoasting() && writeDraft()))
  await initBackup().catch(report)
}

/** Coffee, weight, reference and control positions chosen for the next roast survive a reload. */
type Prep = Pick<RoastState, 'coffee' | 'coffeeId' | 'greenWeightG' | 'reference' | 'current' | 'chargeTarget'>
let prepTimer: ReturnType<typeof setTimeout> | null = null
function savePrep() {
  if (prepTimer) clearTimeout(prepTimer)
  prepTimer = setTimeout(() => {
    const { coffee, coffeeId, greenWeightG, reference, current, chargeTarget } = roast.getSnapshot()
    void setSetting('prep', { coffee, coffeeId, greenWeightG, reference, current, chargeTarget } satisfies Prep)
  }, 500)
}

async function restoreDraft() {
  const d = await db.drafts.get('current')
  if (!d) {
    const prep = await getSetting<Prep>('prep')
    if (prep && roast.getSnapshot().status === 'ready') roast.prepare(prep)
    return
  }
  if (d.roast.status === 'roasting' && d.session.source === 'roaster') {
    session.restore(d.session)
    roast.restore(d.roast)
    persistState.set({ restoredFrom: d.savedAt })
  } else {
    await db.drafts.delete('current')
  }
}

async function writeDraft() {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = null
  if (!isLiveRoasting()) return
  try {
    await db.drafts.put({ key: 'current', savedAt: new Date().toISOString(), session: session.getSnapshot(), roast: roast.getSnapshot() })
    persistState.set({ lastDraftAt: Date.now(), error: '' })
  } catch (e) {
    report(e)
  }
}

function onRoastChange() {
  const cur = roast.getSnapshot()
  const before = prev
  prev = cur
  if (cur.status === 'ready') savePrep()
  const live = session.getSnapshot().source === 'roaster' || cur.source === 'roaster'
  if (!live) return

  if (cur.status === 'roasting' && (cur.events !== before.events || cur.controls !== before.controls || before.status !== 'roasting')) {
    void writeDraft() // events matter most – write right away
  }
  if (before.status === 'roasting' && cur.status === 'finished') void saveFinished()
  if (cur.status === 'finished' && cur.savedId && before.savedId === cur.savedId && editedFields(before, cur)) {
    if (editTimer) clearTimeout(editTimer)
    editTimer = setTimeout(() => void saveEdits(), 800)
  }
  if (cur.status === 'ready' && before.status !== 'ready') {
    void db.drafts.delete('current')
    persistState.set({ restoredFrom: null })
  }
}

const editedFields = (a: RoastState, b: RoastState) =>
  a.roastedWeightG !== b.roastedWeightG || a.notes !== b.notes || a.rating !== b.rating || a.coffee !== b.coffee || a.coffeeId !== b.coffeeId || a.greenWeightG !== b.greenWeightG

async function saveFinished() {
  try {
    const id = crypto.randomUUID()
    const record = buildRecord(session.getSnapshot(), roast.getSnapshot(), id)
    await db.roasts.put(record)
    await db.drafts.delete('current')
    roast.update({ savedId: id })
    persistState.set({ savedId: id, restoredFrom: null, error: '' })
    await flushBackups()
  } catch (e) {
    report(e)
  }
}

async function saveEdits() {
  const s = roast.getSnapshot()
  if (!s.savedId) return
  try {
    await db.roasts.update(s.savedId, {
      coffee: s.coffee,
      coffeeId: s.coffeeId,
      greenWeightG: s.greenWeightG,
      roastedWeightG: s.roastedWeightG,
      lossPct: lossPct(s.greenWeightG, s.roastedWeightG),
      notes: s.notes,
      rating: s.rating,
      backedUp: false,
    })
    await flushBackups()
  } catch (e) {
    report(e)
  }
}

function report(e: unknown) {
  persistState.set({ error: e instanceof Error ? e.message : String(e) })
}
