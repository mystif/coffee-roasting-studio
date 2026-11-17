// Pure helpers for drawing the manual control log as bars in the chart.
import type { ControlChange, ControlKind } from '../domain/events'

export interface Segment {
  kind: ControlKind
  from: number
  to: number
  value: number
}

/** Turns the change log into continuous segments per control, each lasting until the next change (or `end`). */
export function controlSegments(controls: ControlChange[], end: number): Segment[] {
  const out: Segment[] = []
  for (const kind of ['gas', 'air', 'drum'] as ControlKind[]) {
    const list = controls.filter((c) => c.kind === kind).sort((a, b) => a.t - b.t)
    list.forEach((c, i) => {
      const to = Math.max(c.t, i + 1 < list.length ? list[i + 1].t : end)
      out.push({ kind, from: c.t, to, value: c.value })
    })
  }
  return out
}

/**
 * Which value badges to show when badges would overlap: a badge is hidden if the next one
 * starts closer than `minGap` px, so after quick clicking only the value you settled on is shown.
 */
export function visibleBadges(xs: number[], minGap: number): boolean[] {
  return xs.map((x, i) => i === xs.length - 1 || xs[i + 1] - x >= minGap)
}

const RANGE: Record<ControlKind, [number, number]> = { gas: [2, 6], air: [25, 75], drum: [0, 100] }
const HUE: Record<ControlKind, number> = { gas: 24, air: 200, drum: 265 }

/** One hue per control, darker/more saturated for higher values. */
export function shade(kind: ControlKind, value: number, alpha = 1): string {
  const [lo, hi] = RANGE[kind]
  const f = Math.min(1, Math.max(0, (value - lo) / (hi - lo)))
  const light = 78 - f * 38 // 78 % (low) → 40 % (high)
  const sat = 70 + f * 25
  return `hsla(${HUE[kind]}, ${sat}%, ${light}%, ${alpha})`
}

/** Text colour that stays readable on the shade of a value: white on the dark (high) ones. */
export function textOn(kind: ControlKind, value: number): string {
  const [lo, hi] = RANGE[kind]
  const f = Math.min(1, Math.max(0, (value - lo) / (hi - lo)))
  return 78 - f * 38 < 58 ? '#ffffff' : '#111318'
}

export const formatControl = (kind: ControlKind, v: number) => (kind === 'gas' ? String(v).replace('.', ',') : String(Math.round(v)))
