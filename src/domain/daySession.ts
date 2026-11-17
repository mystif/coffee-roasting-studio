// Roasting day: from the moment the roaster starts heating (ET rises) until the user presses STOP.

type Num = number | null

/** Gas consumption of the Dongyi BR-3.5 as given by the user (propane, kg per hour of operation). */
export const GAS_KG_PER_HOUR = 0.5

export const gasKg = (ms: number, kgPerHour = GAS_KG_PER_HOUR) => (Math.max(0, ms) / 3_600_000) * kgPerHour

export interface HeatDetectOptions {
  /** ET rise that means the burner is on (°C)… */
  riseDelta: number
  /** …within this window (s) */
  windowSec: number
  /** ET at or above this is already a heating roaster (app opened during preheat) */
  hotEt: number
  /** below this ET the roaster counts as cold again (re-arms the automatic start after STOP) */
  coldEt: number
}

export const DEFAULT_HEAT: HeatDetectOptions = { riseDelta: 8, windowSec: 180, hotEt: 100, coldEt: 60 }

/**
 * Detects the start of heating on the live ET curve.
 * Returns the time (s, on the curve's timeline) when the rise began, or null.
 * `hot: true` means the roaster was already hot when the data started.
 */
export function detectHeatStart(t: number[], et: Num[], o: HeatDetectOptions = DEFAULT_HEAT): { t: number; hot: boolean } | null {
  let last = et.length - 1
  while (last >= 0 && et[last] === null) last--
  if (last < 0) return null
  const cur = et[last] as number
  // lowest ET in the trailing window = where the rise started
  let minI = -1
  for (let i = last; i >= 0 && t[last] - t[i] <= o.windowSec; i--) {
    const v = et[i]
    if (v !== null && (minI < 0 || v < (et[minI] as number))) minI = i // ties → latest: the rise starts after a flat period
  }
  if (minI >= 0 && cur - (et[minI] as number) >= o.riseDelta) return { t: t[minI], hot: false }
  if (cur >= o.hotEt) return { t: t[firstIndex(et)], hot: true }
  return null
}

function firstIndex(v: Num[]) {
  const i = v.findIndex((x) => x !== null)
  return i < 0 ? 0 : i
}

export const fmtDuration = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
