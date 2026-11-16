import { findEvent } from '../domain/events'
import type { RoastRecord } from './roastRecord'

/** Key numbers of a stored roast, relative to CHARGE. */
export function roastSummary(r: RoastRecord) {
  const charge = findEvent(r.events, 'CHARGE')
  const fcs = findEvent(r.events, 'FCs')
  const drop = findEvent(r.events, 'DROP')
  const rel = (t?: number) => (t !== undefined && charge ? t - charge.t : null)
  return {
    chargeBT: charge?.bt ?? null,
    fcsTime: rel(fcs?.t),
    fcsBT: fcs?.bt ?? null,
    dropTime: rel(drop?.t),
    dropBT: drop?.bt ?? null,
    total: r.phases?.total ?? null,
    dtr: r.phases?.dtr ?? null,
  }
}

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export const fmtKg = (g: number | null) => (g == null ? '—' : `${(g / 1000).toLocaleString('cs-CZ', { maximumFractionDigits: 3 })} kg`)
