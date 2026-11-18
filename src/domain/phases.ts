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
/** Text colour of phase names in the UI (theme-aware CSS variables). */
export const PHASE_TEXT = { drying: 'var(--phase-drying)', maillard: 'var(--phase-maillard)', development: 'var(--phase-development)' }

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

/** Default DTR target when there is no reference (a common filter / light-medium roast value). */
export const DEFAULT_DTR_TARGET = 20

/** DTR target: the reference roast's DTR, otherwise the default. */
export function dtrTarget(refEvents: RoastEvent[] | null | undefined): { target: number; fromReference: boolean } {
  const drop = refEvents ? findEvent(refEvents, 'DROP') : undefined
  const dtr = refEvents && drop ? phaseStats(refEvents, drop.t)?.dtr : null
  return dtr != null && dtr > 0 ? { target: dtr, fromReference: true } : { target: DEFAULT_DTR_TARGET, fromReference: false }
}

/**
 * How far the running phase is (0–1): Drying and Maillard from the estimated time to the next
 * event (Dry End / First Crack), Development towards the DROP that gives the target DTR.
 * null when it cannot be estimated.
 */
export function phaseProgress(
  events: RoastEvent[],
  now: number,
  next: { DRY?: number; FCs?: number },
  dtrTargetPct: number,
): { phase: 'drying' | 'maillard' | 'development'; progress: number } | null {
  const phase = currentPhase(events)
  const stats = phaseStats(events, now)
  if (!stats || phase === 'pre' || phase === 'done') return null
  const clamp = (x: number) => Math.min(1, Math.max(0, x))
  if (phase === 'drying') return next.DRY == null || stats.drying == null ? null : { phase, progress: clamp(stats.drying / (stats.drying + next.DRY)) }
  if (phase === 'maillard') return next.FCs == null || stats.maillard == null ? null : { phase, progress: clamp(stats.maillard / (stats.maillard + next.FCs)) }
  const charge = findEvent(events, 'CHARGE')!
  const fcs = findEvent(events, 'FCs')!
  const planned = ((fcs.t - charge.t) * dtrTargetPct) / (100 - dtrTargetPct) // development time for the target DTR
  return planned > 0 && stats.development != null ? { phase, progress: clamp(stats.development / planned) } : null
}
