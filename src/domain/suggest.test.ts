import { describe, expect, it } from 'vitest'
import { findEvent } from './events'
import { phaseStats } from './phases'
import { computeRoR } from './ror'
import { suggestProfile, type CoffeeInfo } from './suggest'

const coffee = (country: string, process: string, variety = ''): CoffeeInfo => ({ name: '', country, process, variety })

describe('profile suggestion', () => {
  it('reproduces the user base for a neutral coffee', () => {
    const e = suggestProfile(coffee('', 'washed'), 'espresso')
    expect(e.chargeBT).toBe(202)
    expect(e.drop.bt).toBe(205)
    expect(e.dtr).toBeCloseTo(24.9, 0)
    const f = suggestProfile(coffee('', 'washed'), 'filter')
    expect(f.drop.bt).toBe(200)
    expect(f.dtr).toBeLessThan(e.dtr)
    expect(f.drop.t).toBeLessThan(e.drop.t)
  })

  it('adjusts for density and processing in the expected direction', () => {
    const kenya = suggestProfile(coffee('Keňa', 'washed'), 'filter')
    const brazil = suggestProfile(coffee('Brazílie', 'natural'), 'filter')
    expect(kenya.chargeBT).toBeGreaterThan(brazil.chargeBT)
    expect(kenya.plan.find((p) => p.kind === 'gas')!.value).toBeGreaterThanOrEqual(brazil.plan.find((p) => p.kind === 'gas')!.value)
    const anaerobic = suggestProfile(coffee('Kolumbie', 'Anaerobic natural'), 'espresso')
    expect(anaerobic.drop.bt).toBeLessThan(suggestProfile(coffee('Kolumbie', 'washed'), 'espresso').drop.bt)
    expect(anaerobic.reasons.join(' ')).toMatch(/anaerob/i)
    expect(suggestProfile(coffee('Panama', 'washed', 'Geisha'), 'filter').drop.bt).toBe(198.5 + 0) // 200 − 1.5
  })

  it('builds a smooth, plausible reference curve and a valid plan', () => {
    for (const style of ['espresso', 'filter'] as const) {
      for (const c of [coffee('Etiopie', 'natural'), coffee('Brazílie', 'pulped natural'), coffee('Guatemala', 'washed', 'Pacamara')]) {
        const s = suggestProfile(c, style)
        const { t, bt } = s.samples
        // BT falls to TP, then rises monotonically until DROP
        const iTP = t.findIndex((x) => x >= s.tp.t)
        const iDrop = t.findIndex((x) => x >= s.drop.t)
        for (let i = iTP + 1; i <= iDrop; i++) expect(bt[i]).toBeGreaterThanOrEqual(bt[i - 1] - 0.05)
        expect(Math.min(...bt.slice(0, iDrop))).toBeCloseTo(s.tp.bt, 0)
        // RoR stays in a realistic range and declines towards the end
        const ror = computeRoR(t, bt)
        const afterTP = ror.slice(iTP + 30, iDrop).filter((x): x is number => x !== null)
        expect(Math.max(...afterTP)).toBeLessThan(25)
        expect(afterTP[afterTP.length - 1]).toBeLessThan(afterTP[Math.floor(afterTP.length / 3)])
        // events and phases match the suggestion
        const ph = phaseStats(s.events, s.drop.t)!
        expect(ph.dtr).toBeCloseTo(s.dtr, 0)
        expect(findEvent(s.events, 'FCs')!.t).toBe(s.fcs.t)
        // never more gas than the user ever uses (5.5 kPa)
        expect(Math.max(...s.plan.filter((p) => p.kind === 'gas').map((p) => p.value))).toBeLessThanOrEqual(5.5)
        // plan uses the fixed gas/air values of the app
        for (const p of s.plan) {
          if (p.kind === 'gas') expect([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6]).toContain(p.value)
          if (p.kind === 'air') expect([25, 35, 50, 65, 75]).toContain(p.value)
        }
      }
    }
  })
})
