import { describe, expect, it } from 'vitest'
import { beepStep, chargeAlertLevel, secondsToCharge } from './chargeAlert'

describe('charge alert', () => {
  it('classifies BT against the charge temperature', () => {
    expect(chargeAlertLevel(180, 205)).toBe('heating')
    expect(chargeAlertLevel(200, 205)).toBe('near')
    expect(chargeAlertLevel(204.2, 205)).toBe('ready')
    expect(chargeAlertLevel(207.5, 205)).toBe('ready')
    expect(chargeAlertLevel(208.5, 205)).toBe('over')
    expect(chargeAlertLevel(null, 205)).toBe('idle')
    expect(chargeAlertLevel(200, null)).toBe('idle')
  })

  it('beeps once on entering the window, ignores wobbles at the edge', () => {
    const run = (bts: number[]) => {
      let armed = true
      return bts.flatMap((bt, i) => {
        const r = beepStep(armed, chargeAlertLevel(bt, 205))
        armed = r.armed
        return r.beep ? [i] : []
      })
    }
    // reaches 204.1 → beep; wobbles 203 ↔ 204.5 → quiet
    expect(run([190, 201, 204.1, 204.6, 203, 204.5, 203.8, 204.2])).toEqual([2])
    // overshoot to 209 re-arms; back to 206 → beep again
    expect(run([190, 204.5, 209, 206])).toEqual([1, 3])
    // cooled far below (heating) re-arms too
    expect(run([204.5, 195, 204.5])).toEqual([0, 2])
  })
})

describe('time to charge', () => {
  it('estimates from the preheat rate of rise', () => {
    expect(secondsToCharge(195, 205, 6)).toBe(100) // 10 °C at 6 °C/min → 1:40
    expect(secondsToCharge(205, 205, 6)).toBeNull()
    expect(secondsToCharge(195, 205, 0.1)).toBeNull() // not really heating
  })
})
