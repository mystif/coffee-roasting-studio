import { describe, expect, it } from 'vitest'
import { LiveSession } from '../live/LiveSession'
import { RoastStore } from '../live/roastStore'
import { backupFileName, buildRecord } from './roastRecord'

describe('buildRecord', () => {
  it('keeps 30 s before Start, re-bases time and computes phases and loss', () => {
    const session = new LiveSession()
    session.reset('roaster', 'test', 1000)
    const store = new RoastStore(session)
    const t0 = Date.UTC(2026, 10, 16, 9, 0, 0)
    let sec = 0
    const feed = (bt: number, n = 1) => {
      for (let k = 0; k < n; k++) session.add(t0 + sec++ * 1000, bt, bt + 20)
    }
    feed(200, 100) // preheat 0–99 s
    store.start({ coffee: 'Brazil Cerrado', greenWeightG: 3000 }) // startT = 99
    store.mark('CHARGE')
    feed(150, 60)
    store.mark('DRY')
    feed(180, 60)
    store.mark('FCs')
    feed(205, 30)
    store.finish()
    store.update({ roastedWeightG: 2550 })

    const r = buildRecord(session.getSnapshot(), store.getSnapshot(), 'id-1', new Date(t0))
    expect(r.samples.t[0]).toBe(0)
    expect(r.roastDate).toBe(new Date(t0 + 69_000).toISOString()) // 99 − 30 s
    const charge = r.events.find((e) => e.type === 'CHARGE')!
    expect(charge.t).toBe(30)
    expect(r.controls.every((c) => c.t >= 0)).toBe(true)
    expect(r.lossPct).toBe(15)
    expect(r.phases).toMatchObject({ drying: 60, maillard: 60, development: 30 })
    expect(r.samples.bt).toHaveLength(r.samples.t.length)
  })

  it('makes a safe, sortable backup file name', () => {
    const name = backupFileName({ roastDate: '2026-11-16T08:05:00.000Z', coffee: 'Kolumbie – Huila 3,5 kg' } as never)
    expect(name).toMatch(/^2026-11-16_\d{4}_Kolumbie-Huila-3-5-kg\.json$/)
  })
})
