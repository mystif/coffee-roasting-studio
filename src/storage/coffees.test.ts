import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { addCoffee, deleteCoffee, emptyCoffee, updateCoffee } from './coffees'
import { db } from './db'
import type { RoastRecord } from './roastRecord'

const roastOf = (id: string, coffeeId: string | null) =>
  ({ id, coffee: 'Old', coffeeId, roastDate: new Date().toISOString(), backedUp: true }) as unknown as RoastRecord

describe('coffees', () => {
  it('renaming a coffee renames its roasts; deleting keeps the roasts', async () => {
    const c = await addCoffee({ ...emptyCoffee(), name: '  Brazil Cerrado ' })
    expect(c.name).toBe('Brazil Cerrado')
    await db.roasts.bulkPut([roastOf('r1', c.id), roastOf('r2', null)])

    await updateCoffee(c.id, { ...c, name: 'Brazil Cerrado Mineiro' })
    expect((await db.roasts.get('r1'))).toMatchObject({ coffee: 'Brazil Cerrado Mineiro', backedUp: false })
    expect((await db.roasts.get('r2'))?.coffee).toBe('Old')

    await deleteCoffee(c.id)
    expect(await db.coffees.count()).toBe(0)
    expect(await db.roasts.get('r1')).toMatchObject({ coffeeId: null, coffee: 'Brazil Cerrado Mineiro' })
  })
})
