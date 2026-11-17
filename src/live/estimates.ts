// Live estimates of Maillard start (Dry End) and First Crack.
import { useLiveQuery } from 'dexie-react-hooks'
import { DEFAULT_DETECT } from '../domain/autodetect'
import { findEvent } from '../domain/events'
import { secondsToTemp } from '../domain/predict'
import type { ReferenceCurve } from '../domain/reference'
import { db } from '../storage/db'
import type { LiveSnapshot } from './LiveSession'
import type { RoastState } from './roastStore'

export interface Estimate {
  type: 'DRY' | 'FCs'
  /** session time of the expected event */
  t: number
  /** seconds from now */
  inSec: number
  target: number
  /** where the target temperature comes from */
  basis: string
}

/** Fallback FC temperature: the user's Artisan phase setting (Phases = 100, 130, 180, 205). */
export const DEFAULT_FC_TEMP = 180

/** FC target: reference profile → mean FC BT of this coffee's last roasts → Artisan default. */
export function useFcTarget(state: RoastState, reference: ReferenceCurve | null): { target: number; basis: string } {
  const history = useLiveQuery(async () => {
    if (!state.coffeeId) return null
    const roasts = await db.roasts.where('coffeeId').equals(state.coffeeId).toArray()
    const bts = roasts
      .sort((a, b) => b.roastDate.localeCompare(a.roastDate))
      .slice(0, 10)
      .map((r) => findEvent(r.events, 'FCs')?.bt)
      .filter((x): x is number => x != null)
    return bts.length ? { mean: bts.reduce((a, b) => a + b, 0) / bts.length, n: bts.length } : null
  }, [state.coffeeId])
  const refFc = reference ? findEvent(reference.events, 'FCs')?.bt : null
  if (refFc != null) return { target: refFc, basis: 'podle reference' }
  if (history) return { target: history.mean, basis: `průměr ${history.n} pražení této kávy` }
  return { target: DEFAULT_FC_TEMP, basis: 'výchozí 180 °C' }
}

/** Estimates are made only while roasting, after the Turning Point, for events not yet marked. */
export function estimates(snap: LiveSnapshot, state: RoastState, fc: { target: number; basis: string }): Estimate[] {
  if (state.status !== 'roasting' || !findEvent(state.events, 'TP') || findEvent(state.events, 'DROP')) return []
  const now = snap.t[snap.t.length - 1]
  const out: Estimate[] = []
  const add = (type: Estimate['type'], target: number, basis: string) => {
    const s = secondsToTemp(snap.t, snap.bt, snap.ror, target)
    if (s !== null && s > 0) out.push({ type, t: now + s, inSec: s, target, basis })
  }
  if (!findEvent(state.events, 'DRY')) add('DRY', DEFAULT_DETECT.dryTemp, `${DEFAULT_DETECT.dryTemp} °C`)
  if (!findEvent(state.events, 'FCs')) add('FCs', fc.target, fc.basis)
  return out
}
