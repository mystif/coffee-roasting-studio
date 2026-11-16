// Automatic event suggestions on live data (all can be overridden by the user).
// Each function looks only at data up to the last sample, so it works live.

type Num = number | null

export interface DetectOptions {
  /** BT drop that signals CHARGE / DROP (°C within `dropWindowSec`) */
  dropDelta: number
  dropWindowSec: number
  /** TP is confirmed once BT is this much above its minimum… */
  tpRise: number
  /** …and this many seconds have passed since the minimum */
  tpConfirmSec: number
  /** Dry End suggestion temperature (user's Artisan phase setting: 130 °C) */
  dryTemp: number
}

export const DEFAULT_DETECT: DetectOptions = {
  dropDelta: 5,
  dropWindowSec: 20,
  tpRise: 2,
  tpConfirmSec: 15,
  dryTemp: 130,
}

/** Index of the peak right before a sharp BT drop within the trailing window, or null. */
function sharpDropPeak(t: number[], bt: Num[], fromIdx: number, o: DetectOptions): number | null {
  const last = bt.length - 1
  const cur = bt[last]
  if (cur === null || last <= fromIdx) return null
  let peak = -1
  for (let i = last - 1; i >= fromIdx && t[last] - t[i] <= o.dropWindowSec; i--) {
    const v = bt[i]
    if (v !== null && (peak < 0 || v > (bt[peak] as number))) peak = i
  }
  if (peak < 0) return null
  return (bt[peak] as number) - cur >= o.dropDelta ? peak : null
}

/** CHARGE: beans entering make BT fall sharply. */
export function detectCharge(t: number[], bt: Num[], fromIdx = 0, o = DEFAULT_DETECT): number | null {
  return sharpDropPeak(t, bt, fromIdx, o)
}

/** DROP: probe loses the bean mass after FCs, BT falls sharply. */
export function detectDrop(t: number[], bt: Num[], fcsIdx: number, o = DEFAULT_DETECT): number | null {
  return sharpDropPeak(t, bt, fcsIdx, o)
}

/** Turning Point: minimum BT after CHARGE, confirmed once BT has clearly turned up. */
export function detectTP(t: number[], bt: Num[], chargeIdx: number, o = DEFAULT_DETECT): number | null {
  let min = -1
  for (let i = chargeIdx; i < bt.length; i++) {
    const v = bt[i]
    if (v !== null && (min < 0 || v < (bt[min] as number))) min = i
  }
  const last = bt.length - 1
  const cur = bt[last]
  if (min < 0 || cur === null) return null
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
