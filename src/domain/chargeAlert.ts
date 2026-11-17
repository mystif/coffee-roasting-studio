// Charge temperature alert while preheating: tells when BT reaches the charge temperature.

export type ChargeAlertLevel = 'idle' | 'heating' | 'near' | 'ready' | 'over'

export interface ChargeAlertOptions {
  /** "near" from this many °C below the target */
  nearBelow: number
  /** "ready" within this many °C below the target… */
  readyBelow: number
  /** …up to this many °C above it; more is "over" */
  readyAbove: number
}

export const DEFAULT_CHARGE_ALERT: ChargeAlertOptions = { nearBelow: 5, readyBelow: 1, readyAbove: 3 }

export function chargeAlertLevel(bt: number | null, target: number | null, o = DEFAULT_CHARGE_ALERT): ChargeAlertLevel {
  if (bt === null || target === null) return 'idle'
  const d = bt - target
  if (d > o.readyAbove) return 'over'
  if (d >= -o.readyBelow) return 'ready'
  if (d >= -o.nearBelow) return 'near'
  return 'heating'
}

/**
 * Beep once when BT enters "ready". It re-arms only after BT clearly left the window
 * (fell into "heating" or overshot into "over"), so small wobbles around the edge stay quiet.
 */
export function beepStep(armed: boolean, level: ChargeAlertLevel): { beep: boolean; armed: boolean } {
  if (level === 'ready') return { beep: armed, armed: false }
  if (level === 'heating' || level === 'over' || level === 'idle') return { beep: false, armed: true }
  return { beep: false, armed } // "near" keeps the current state
}
