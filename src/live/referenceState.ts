// Loads the reference curve whenever the roast's chosen reference changes.
import { startSettings, type ReferenceCurve } from '../domain/reference'
import type { RefChoice } from '../storage/db'
import { loadReference } from '../storage/profiles'
import { createStore } from '../storage/store'
import { roast } from './runtime'

export const referenceState = createStore({ choice: null as RefChoice | null, curve: null as ReferenceCurve | null, missing: false })

const key = (c: RefChoice | null) => (c ? `${c.kind}:${c.id}` : '')
/** key of the reference being loaded right now (null = nothing in flight) */
let loading: string | null = null

async function sync() {
  const choice = roast.getSnapshot().reference
  const k = key(choice)
  if (k === loading) return // already loading exactly this
  if (loading === null && k === key(referenceState.get().choice)) return // already shown
  if (!choice) {
    // "bez reference" → clear the chart immediately (also cancels a load in flight)
    loading = null
    referenceState.set({ choice: null, curve: null, missing: false })
    return
  }
  loading = k
  const curve = await loadReference(choice).catch(() => null)
  if (loading !== k) return // a newer choice arrived meanwhile
  loading = null
  referenceState.set({ choice, curve, missing: !curve })
  // before the roast: pre-select the reference's starting gas/air/drum in the control bar
  if (curve && roast.getSnapshot().status === 'ready') {
    for (const [kind, v] of Object.entries(startSettings(curve))) roast.setControl(kind as 'gas' | 'air' | 'drum', v)
  }
}

roast.subscribe(() => void sync())
void sync()

/** Reloads the current reference (e.g. after its profile was updated). */
export function refreshReference() {
  loading = null
  referenceState.set({ choice: null, curve: null, missing: false })
  void sync()
}
