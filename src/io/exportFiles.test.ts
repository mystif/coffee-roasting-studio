import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from '../storage/db'
import type { RoastRecord } from '../storage/roastRecord'
import { exportAll, importAll, recordToCsv } from './exportFiles'

const rec = {
  id: 'r1',
  coffee: 'Test',
  samples: { t: [0, 1, 2, 3], bt: [200, 190.25, null, 180], et: [230, 229, 228, 227] },
  events: [
    { id: 'c', type: 'CHARGE', t: 1, bt: 190.25, et: 229 },
    { id: 'x', type: 'CUSTOM', t: 2.5, bt: null, et: null, note: 'kouř' },
  ],
  controls: [
    { t: 0, kind: 'gas', value: 4.5 },
    { t: 2, kind: 'air', value: 50 },
  ],
} as unknown as RoastRecord

describe('CSV export', () => {
  it('writes Czech-friendly rows relative to CHARGE with events and control state', () => {
    const lines = recordToCsv(rec).replace('﻿', '').trim().split('\r\n')
    expect(lines[0]).toBe('cas_s;cas;BT;ET;RoR;udalost;plyn_kPa;vzduch_pct;buben_pct')
    expect(lines[1]).toBe('-1,00;-0:01;200,0;230,0;;;4,5;;')
    expect(lines[2]).toBe('0,00;0:00;190,3;229,0;;Charge;4,5;;')
    expect(lines[3]).toBe('1,00;0:01;;228,0;;;4,5;50;')
    expect(lines[4]).toContain(';kouř;')
  })
})

describe('full backup', () => {
  it('round-trips roasts, coffees and profiles and rejects foreign files', async () => {
    await db.roasts.put({ ...rec, roastDate: '2026-01-01T00:00:00Z', backedUp: true } as RoastRecord)
    await db.coffees.put({ id: 'k', name: 'Kenya', country: '', region: '', farm: '', process: '', variety: '', notes: '', createdAt: '' })
    const json = await exportAll()
    await db.roasts.clear()
    await db.coffees.clear()
    expect(await importAll(json)).toEqual({ roasts: 1, coffees: 1, profiles: 0 })
    expect((await db.roasts.get('r1'))?.coffee).toBe('Test')
    await expect(importAll('{"foo":1}')).rejects.toThrow(/není záloha/)
  })
})
