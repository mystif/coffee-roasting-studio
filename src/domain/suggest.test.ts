import { describe, expect, it } from 'vitest'
import { COUNTRIES, PROCESSES, VARIETIES } from './coffeeCatalog'
import { findEvent } from './events'
import { phaseStats } from './phases'
import { computeRoR } from './ror'
import { suggestProfile, type CoffeeInfo, type RoastStyle } from './suggest'

const coffee = (country: string, process: string, variety = '', extra: Partial<CoffeeInfo> = {}): CoffeeInfo => ({ name: '', country, process, variety, ...extra })
const STYLES: RoastStyle[] = ['filter', 'medium', 'dark']

describe('profile suggestion', () => {
  it('reproduces the user base for a neutral coffee and orders the roast styles', () => {
    const neutral = coffee('Salvador', 'Washed (mytá)', 'Bourbon') // medium density, washed, no-effect variety
    const [f, m, d] = STYLES.map((s) => suggestProfile(neutral, s))
    expect([f.chargeBT, m.chargeBT, d.chargeBT]).toEqual([192, 202, 208])
    expect([f.drop.bt, m.drop.bt, d.drop.bt]).toEqual([200, 205, 213])
    expect(f.dtr).toBeLessThan(m.dtr)
    expect(m.dtr).toBeLessThan(d.dtr)
    expect(d.drop.t).toBeGreaterThan(m.drop.t)
  })

  it('adjusts for density, processing, altitude and other inputs in the expected direction', () => {
    const kenya = suggestProfile(coffee('Keňa', 'Washed (mytá)'), 'filter')
    const brazil = suggestProfile(coffee('Brazílie', 'Natural (sušená v plodu)'), 'filter')
    expect(kenya.chargeBT).toBeGreaterThan(brazil.chargeBT)
    const washed = suggestProfile(coffee('Kolumbie', 'Washed (mytá)'), 'medium')
    const anaerobic = suggestProfile(coffee('Kolumbie', 'Anaerobní fermentace'), 'medium')
    expect(anaerobic.drop.bt).toBeLessThan(washed.drop.bt)
    expect(anaerobic.reasons.join(' ')).toMatch(/anaerob/i)
    expect(suggestProfile(coffee('Panama', 'Washed (mytá)', 'Gesha / Geisha'), 'filter').drop.bt).toBe(198.5)
    // altitude overrides the country's typical density
    const high = suggestProfile(coffee('Brazílie', 'Washed (mytá)', '', { altitude: 'gt2100' }), 'medium')
    expect(high.chargeBT).toBeGreaterThan(washed.chargeBT)
    // wetter beans → longer drying, drier → shorter
    const wet = suggestProfile(coffee('Kolumbie', 'Washed (mytá)', '', { moisture: 'wet' }), 'medium')
    const dry = suggestProfile(coffee('Kolumbie', 'Washed (mytá)', '', { moisture: 'dry' }), 'medium')
    expect(wet.dryEnd.t).toBeGreaterThan(dry.dryEnd.t)
  })

  it('lists what is missing and still understands old free-text coffees', () => {
    expect(suggestProfile(coffee('', ''), 'medium').missing).toEqual(
      expect.arrayContaining(['zemi původu', 'zpracování', 'odrůdu', 'velikost zrna', 'vlhkost', 'stáří sklizně']),
    )
    const old = suggestProfile({ name: 'Etiopie Guji', country: 'Etiopie', process: 'natural', variety: 'heirloom' }, 'filter')
    expect(old.reasons.join(' ')).toMatch(/natural/i)
    expect(old.reasons.join(' ')).toMatch(/hust/i)
  })

  it('builds a smooth, plausible curve and a valid plan for every combination', () => {
    for (const style of STYLES) {
      for (const country of COUNTRIES.map((x) => x.name)) {
        for (const process of PROCESSES.map((x) => x.label)) {
          const s = suggestProfile(coffee(country, process, VARIETIES[(country.length + process.length) % VARIETIES.length].label), style)
          const { t, bt } = s.samples
          const iTP = t.findIndex((x) => x >= s.tp.t)
          const iDrop = t.findIndex((x) => x >= s.drop.t)
          for (let i = iTP + 1; i < iDrop; i++) expect(bt[i]).toBeGreaterThanOrEqual(bt[i - 1] - 0.05) // after DROP the probe cools
          const ror = computeRoR(t, bt)
          const after = ror.slice(iTP + 30, iDrop).filter((x): x is number => x !== null)
          expect(Math.max(...after)).toBeLessThan(26)
          expect(Math.min(...after)).toBeGreaterThan(0)
          const ph = phaseStats(s.events, s.drop.t)!
          expect(ph.dtr).toBeCloseTo(s.dtr, 0)
          expect(findEvent(s.events, 'DRY')!.t).toBeLessThan(findEvent(s.events, 'FCs')!.t)
          expect(s.chargeBT).toBeGreaterThan(170)
          expect(s.chargeBT).toBeLessThan(220)
          for (const p of s.plan) {
            if (p.kind === 'gas') expect([2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5]).toContain(p.value)
            if (p.kind === 'air') expect([25, 35, 50, 65, 75]).toContain(p.value)
          }
        }
      }
    }
  })
})
