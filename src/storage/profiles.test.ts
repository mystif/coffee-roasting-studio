import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from './db'
import { createProfileFromRoast, loadReference, updateProfileFromRoast } from './profiles'
import type { RoastRecord } from './roastRecord'

const ev = (type: 'CHARGE' | 'FCs' | 'DROP', t: number, bt: number) => ({ id: type + t, type, t, bt, et: null })
const roastRec = (id: string, shift: number, dropBT: number): RoastRecord =>
  ({
    id,
    coffee: 'Kenya',
    coffeeId: null,
    roastDate: '2026-11-17T08:00:00.000Z',
    samples: { t: [0, 10, 20], bt: [200, 150, 160], et: [230, 220, 225] },
    events: [ev('CHARGE', 5, 200), ev('FCs', 500 + shift, 180), ev('DROP', 700 + shift, dropBT)],
    controls: [{ t: 5, kind: 'gas', value: 5 }],
    phases: null,
  }) as unknown as RoastRecord

describe('updating a profile from a roast', () => {
  it('overwrites curve, events, plan and targets but keeps the name and notes', async () => {
    const p = await createProfileFromRoast(roastRec('r1', 0, 205), 'Kenya espresso')
    await db.profiles.update(p.id, { notes: 'moje poznámka' })
    expect(await updateProfileFromRoast(p.id, roastRec('r2', 20, 207))).toBe(true)
    const q = (await db.profiles.get(p.id))!
    expect(q).toMatchObject({ name: 'Kenya espresso', fromRoastId: 'r2', targetDropBT: 207, targetTime: 715 })
    expect(q.notes).toMatch(/^moje poznámka\nAktualizováno pražením z /)
    expect(q.events.find((e) => e.type === 'FCs')!.t).toBe(520)
    const curve = (await loadReference({ kind: 'profile', id: p.id, label: q.name }))!
    expect(curve.events.find((e) => e.type === 'DROP')!.t).toBe(715) // relative to CHARGE
    expect(await db.profiles.count()).toBe(1) // not a new profile
  })
})
