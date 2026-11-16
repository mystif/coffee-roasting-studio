import Dexie, { type EntityTable } from 'dexie'
import type { LiveSnapshot } from '../live/LiveSession'
import type { RoastState } from '../live/roastStore'
import type { RoastRecord } from './roastRecord'

export interface Coffee {
  id: string
  name: string
  country: string
  region: string
  farm: string
  process: string
  variety: string
  notes: string
  createdAt: string
}

/** What the next roast is compared against. */
export interface RefChoice {
  kind: 'profile' | 'roast'
  id: string
  label: string
}

export interface Profile {
  id: string
  name: string
  coffee: string
  coffeeId: string | null
  fromRoastId: string | null
  createdAt: string
  notes: string
  targetDropBT: number | null
  /** seconds from CHARGE to DROP */
  targetTime: number | null
  samples: { t: number[]; bt: (number | null)[]; et: (number | null)[] }
  events: import('../domain/events').RoastEvent[]
  controls: import('../domain/events').ControlChange[]
}

/** Roast in progress, written every few seconds so a reload or crash loses nothing. */
export interface Draft {
  key: 'current'
  savedAt: string
  session: LiveSnapshot
  roast: RoastState
}

export interface Setting {
  key: string
  value: unknown
}

export const db = new Dexie('coffee-roasting-studio') as Dexie & {
  roasts: EntityTable<RoastRecord, 'id'>
  drafts: EntityTable<Draft, 'key'>
  settings: EntityTable<Setting, 'key'>
  coffees: EntityTable<Coffee, 'id'>
  profiles: EntityTable<Profile, 'id'>
}

db.version(1).stores({
  roasts: '&id, roastDate, coffee, backedUp',
  drafts: '&key',
  settings: '&key',
})
db.version(2).stores({
  roasts: '&id, roastDate, coffee, coffeeId, backedUp',
  coffees: '&id, name',
})
db.version(3).stores({
  profiles: '&id, name, coffeeId',
})

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await db.settings.get(key))?.value as T | undefined
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value })
}
