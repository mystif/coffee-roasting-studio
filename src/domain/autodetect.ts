// Automatic event suggestions on live data (all can be overridden by the user).
// Each function looks only at data up to the last sample, so it works live.

type Num = number | null

export interface DetectOptions {
  /** TP is confirmed once BT is this much above its minimum… */
  tpRise: number
  /** …and this many seconds have passed since the minimum */
  tpConfirmSec: number
  /** Dry End suggestion temperature (user's Artisan phase setting: 130 °C) */
  dryTemp: number
}

export const DEFAULT_DETECT: DetectOptions = {
  tpRise: 2,
  tpConfirmSec: 15,
  dryTemp: 130,
}

// Artisan's BTbreak (artisanlib/main.py, "Standard" mode, sampling ≥ 1 s): a top in BT where the
// trend before is flat/rising and the two following legs fall clearly faster.
const BREAK = { f: 2.5, maxdpre: 6.4, fTwice: 1.5 }
const CHARGE_P = { d: -0.67, offset: 0.5, dpreDpostDiff: 0.78 }
const DROP_P = { d: -0.34, offset: 0.2, dpreDpostDiff: 0.78 }

function checkTop(p: { d: number; offset: number; dpreDpostDiff: number }, v: number[], twice: boolean): boolean {
  const [p0, p1, p2, p3, p4, p5] = v
  const dpre = (p0 - p1 + (p1 - p2)) / 2
  const d3 = p4 - p3
  const d4 = p5 - p4
  const dpost = (d3 + d4) / 2
  const d = twice ? p.d * BREAK.fTwice : p.d
  return (
    d3 < d &&
    d4 < d &&
    (Math.abs(dpost) > Math.min(BREAK.maxdpre, p.offset + BREAK.f * Math.abs(dpre)) ||
      (dpost < 0 && dpre < 0 && -dpre - dpost > p.dpreDpostDiff))
  )
}

/** Index of the BT break seen at the last sample, or null. */
function btBreak(bt: Num[], fromIdx: number, p: typeof CHARGE_P): number | null {
  const i = bt.length - 1
  const pick = (idx: number[]) => (idx.every((k) => k >= fromIdx && bt[k] !== null) ? idx.map((k) => bt[k] as number) : null)
  const tight = pick([i - 5, i - 4, i - 3, i - 2, i - 1, i])
  if (tight && checkTop(p, tight, false)) return i - 2
  const loose = pick([i - 10, i - 8, i - 6, i - 4, i - 2, i])
  if (loose && checkTop(p, loose, true)) return i - 4
  return null
}

/** CHARGE: beans entering make BT break downwards (only above 77 °C, like Artisan). */
export function detectCharge(_t: number[], bt: Num[], fromIdx = 0): number | null {
  const cur = bt[bt.length - 1]
  if (cur === null || cur <= 77) return null
  return btBreak(bt, fromIdx, CHARGE_P)
}

/** DROP: BT breaks downwards after FCs (only above 160 °C and 7 min into the roast, like Artisan). */
export function detectDrop(t: number[], bt: Num[], fcsIdx: number, chargeT = -Infinity): number | null {
  const cur = bt[bt.length - 1]
  if (cur === null || cur <= 160 || t[t.length - 1] - chargeT <= 7 * 60) return null
  return btBreak(bt, fcsIdx, DROP_P)
}

/** Turning Point: minimum BT after CHARGE, confirmed once BT has clearly turned up. */
export function detectTP(t: number[], bt: Num[], chargeIdx: number, o = DEFAULT_DETECT): number | null {
  let min = -1
  for (let i = chargeIdx; i < bt.length; i++) {
    const v = bt[i]
    if (v !== null && (min < 0 || v <= (bt[min] as number))) min = i // ties → latest, like Artisan
  }
  const last = bt.length - 1
  const cur = bt[last]
  if (min < 0 || cur === null) return null
  // like Artisan: at least 8 samples after CHARGE and a plausible TP temperature (50–150 °C)
  if (last < chargeIdx + 8 || (bt[min] as number) <= 50 || (bt[min] as number) >= 150) return null
  if (t[last] - t[min] >= o.tpConfirmSec && cur - (bt[min] as number) >= o.tpRise) return min
  return null
}

/** Dry End suggestion: first sample after TP with BT ≥ dryTemp. */
export function detectDry(bt: Num[], tpIdx: number, o = DEFAULT_DETECT): number | null {
  for (let i = tpIdx; i < bt.length; i++) {
    const v = bt[i]
    if (v !== null && v >= o.dryTemp) return i
  }
  return null
}
