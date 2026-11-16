import { findEvent, type RoastEvent } from './events'

export type Phase = 'pre' | 'drying' | 'maillard' | 'development' | 'done'

export const PHASE_LABEL: Record<Phase, string> = {
  pre: 'Před Charge',
  drying: 'Drying',
  maillard: 'Maillard',
  development: 'Development',
  done: 'Hotovo',
}

export const PHASE_COLOR = { drying: '#4ade80', maillard: '#f59e0b', development: '#ef6f6c' }

export interface PhaseStats {
  /** seconds from CHARGE to DROP (or to `now` while roasting) */
  total: number
  drying: number | null
  maillard: number | null
  development: number | null
  dryingPct: number | null
  maillardPct: number | null
  developmentPct: number | null
  /** Development Time Ratio in % */
  dtr: number | null
}

/**
 * Durations like Artisan computes them: Drying = CHARGE→Dry End, Maillard = Dry End→FCs,
 * Development = FCs→DROP. While roasting, the running phase ends at `now`.
 */
export function phaseStats(events: RoastEvent[], now: number): PhaseStats | null {
  const charge = findEvent(events, 'CHARGE')
  if (!charge) return null
  const dry = findEvent(events, 'DRY')
  const fcs = findEvent(events, 'FCs')
  const drop = findEvent(events, 'DROP')
  const end = drop ? drop.t : now
  const total = Math.max(0, end - charge.t)

  const drying = dry ? dry.t - charge.t : fcs ? null : end - charge.t
  const maillard = dry ? (fcs ? fcs.t - dry.t : end - dry.t) : null
  const development = fcs ? end - fcs.t : null
  const pct = (x: number | null) => (x === null || total <= 0 ? null : (x / total) * 100)
  return {
    total,
    drying,
    maillard,
    development,
    dryingPct: pct(drying),
    maillardPct: pct(maillard),
    developmentPct: pct(development),
    dtr: pct(development),
  }
}

export function currentPhase(events: RoastEvent[]): Phase {
  if (findEvent(events, 'DROP')) return 'done'
  if (findEvent(events, 'FCs')) return 'development'
  if (findEvent(events, 'DRY')) return 'maillard'
  if (findEvent(events, 'CHARGE')) return 'drying'
  return 'pre'
}
