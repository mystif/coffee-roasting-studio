import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { db } from './db'
import { createProfileFromRoast, createProfileFromSuggestion, loadReference, saveRoastAsCoffeeProfile, updateProfileFromRoast } from './profiles'
import { suggestProfile } from '../domain/suggest'
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

describe('roasting along a suggested profile', () => {
  it('replaces the suggestion with the real roast, or keeps it and adds a new profile', async () => {
    await db.profiles.clear()
    const coffee = { id: 'c1', name: 'Kenya AA' }
    const sug = await createProfileFromSuggestion(coffee, suggestProfile({ name: 'Kenya AA', country: 'Keňa', process: 'Washed (mytá)', variety: '' }, 'filter'))
    expect(sug.suggestion).toEqual({ style: 'filter' })

    const replaced = (await saveRoastAsCoffeeProfile(roastRec('r9', 0, 201), { name: 'Kenya AA · filtr', notes: 'citrus, čajové', replaceId: sug.id }))!
    expect(replaced.id).toBe(sug.id)
    expect(replaced).toMatchObject({ name: 'Kenya AA · filtr', fromRoastId: 'r9', targetDropBT: 201 })
    expect(replaced.suggestion).toBeUndefined()
    expect(replaced.notes.split('\n')[0]).toBe('citrus, čajové')
    expect(await db.profiles.count()).toBe(1)

    const added = (await saveRoastAsCoffeeProfile(roastRec('r10', 0, 203), { name: 'Kenya AA · v2', notes: '', replaceId: null }))!
    expect(added.id).not.toBe(sug.id)
    expect(await db.profiles.count()).toBe(2)
  })
})
