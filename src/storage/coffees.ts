import { db, type Coffee } from './db'
import { flushBackups } from './backup'

export type CoffeeInput = Omit<Coffee, 'id' | 'createdAt'>

export const emptyCoffee = (): CoffeeInput => ({ name: '', country: '', region: '', farm: '', process: '', variety: '', notes: '' })

export async function addCoffee(c: CoffeeInput): Promise<Coffee> {
  const coffee: Coffee = { ...c, name: c.name.trim(), id: crypto.randomUUID(), createdAt: new Date().toISOString() }
  await db.coffees.add(coffee)
  return coffee
}

/** Renaming a coffee also updates the name stored in its roasts (and re-backs them up). */
export async function updateCoffee(id: string, c: CoffeeInput) {
  const name = c.name.trim()
  await db.transaction('rw', db.coffees, db.roasts, async () => {
    await db.coffees.update(id, { ...c, name })
    await db.roasts.where('coffeeId').equals(id).modify({ coffee: name, backedUp: false })
  })
  await flushBackups()
}

/** Roasts keep their coffee name; only the link is removed. */
export async function deleteCoffee(id: string) {
  await db.transaction('rw', db.coffees, db.roasts, async () => {
    await db.coffees.delete(id)
    await db.roasts.where('coffeeId').equals(id).modify({ coffeeId: null })
  })
}

export const coffeeLabel = (c: Pick<Coffee, 'name' | 'country' | 'process'>) =>
  [c.name, [c.country, c.process].filter(Boolean).join(', ')].filter(Boolean).join(' · ')
