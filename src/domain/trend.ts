// Direction of a live value over the last seconds – for the small ↑ ↓ → next to the big numbers.

type Num = number | null

export type Trend = 'up' | 'down' | 'flat'

/** Change of `v` over the trailing `windowSec` compared with `threshold`; null without enough data. */
export function trendOf(t: number[], v: Num[], windowSec: number, threshold: number): Trend | null {
  let i = v.length - 1
  while (i >= 0 && v[i] === null) i--
  if (i < 0) return null
  let j = i
  while (j > 0 && t[i] - t[j - 1] <= windowSec) j--
  while (j < i && v[j] === null) j++
  if (j >= i || t[i] - t[j] < windowSec / 2) return null
  const d = (v[i] as number) - (v[j] as number)
  return d > threshold ? 'up' : d < -threshold ? 'down' : 'flat'
}

export const TREND_ARROW: Record<Trend, string> = { up: '↑', down: '↓', flat: '→' }
