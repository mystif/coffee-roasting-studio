// Loads the reference curve whenever the roast's chosen reference changes.
import { startSettings, type ReferenceCurve } from '../domain/reference'
import type { RefChoice } from '../storage/db'
import { loadReference } from '../storage/profiles'
import { createStore } from '../storage/store'
import { roast } from './runtime'

export const referenceState = createStore({ choice: null as RefChoice | null, curve: null as ReferenceCurve | null, missing: false })

const key = (c: RefChoice | null) => (c ? `${c.kind}:${c.id}` : '')
let loading = ''

async function sync() {
  const choice = roast.getSnapshot().reference
  const k = key(choice)
  if (k === loading || k === key(referenceState.get().choice)) return
  loading = k
  const curve = await loadReference(choice).catch(() => null)
  if (loading !== k) return // a newer choice arrived meanwhile
  referenceState.set({ choice, curve, missing: !!choice && !curve })
  loading = ''
  // before the roast: pre-select the reference's starting gas/air/drum in the control bar
  if (curve && roast.getSnapshot().status === 'ready') {
    for (const [kind, v] of Object.entries(startSettings(curve))) roast.setControl(kind as 'gas' | 'air' | 'drum', v)
  }
}

roast.subscribe(() => void sync())
void sync()
