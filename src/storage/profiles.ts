import { findEvent } from '../domain/events'
import { referenceFrom, type ReferenceCurve } from '../domain/reference'
import { db, type Profile, type RefChoice } from './db'
import { fmtDate } from './roastQueries'
import type { RoastRecord } from './roastRecord'

/** One click: a stored roast becomes a profile (its own copy – deleting the roast keeps it). */
export async function createProfileFromRoast(r: RoastRecord, name?: string): Promise<Profile> {
  const charge = findEvent(r.events, 'CHARGE')
  const drop = findEvent(r.events, 'DROP')
  const p: Profile = {
    id: crypto.randomUUID(),
    name: (name ?? '').trim() || `${r.coffee || 'Profil'} · ${fmtDate(r.roastDate)}`,
    coffee: r.coffee,
    coffeeId: r.coffeeId,
    fromRoastId: r.id,
    createdAt: new Date().toISOString(),
    notes: '',
    targetDropBT: drop?.bt ?? null,
    targetTime: charge && drop ? Math.round(drop.t - charge.t) : null,
    samples: r.samples,
    events: r.events,
    controls: r.controls,
  }
  await db.profiles.add(p)
  return p
}

export async function updateProfile(id: string, patch: Partial<Pick<Profile, 'name' | 'notes' | 'targetDropBT' | 'targetTime' | 'coffee' | 'coffeeId'>>) {
  await db.profiles.update(id, patch)
}

export async function deleteProfile(id: string) {
  await db.profiles.delete(id)
}

/** Loads the reference curve for a choice; null when it no longer exists or has no CHARGE. */
export async function loadReference(choice: RefChoice | null): Promise<ReferenceCurve | null> {
  if (!choice) return null
  const src = choice.kind === 'profile' ? await db.profiles.get(choice.id) : await db.roasts.get(choice.id)
  return src ? referenceFrom(src, choice.label) : null
}

export const profileChoice = (p: Profile): RefChoice => ({ kind: 'profile', id: p.id, label: p.name })
export const roastChoice = (r: RoastRecord): RefChoice => ({ kind: 'roast', id: r.id, label: `${r.coffee || 'Pražení'} · ${fmtDate(r.roastDate)}` })

/** Saves a suggested starting profile (synthetic curve + gas/air plan) for a coffee. */
export async function createProfileFromSuggestion(
  coffee: { id: string; name: string },
  s: import('../domain/suggest').Suggestion,
): Promise<Profile> {
  const p: Profile = {
    id: crypto.randomUUID(),
    name: `Návrh · ${coffee.name} · ${{ filter: 'filtr', medium: 'střední', dark: 'tmavé' }[s.style]}`,
    coffee: coffee.name,
    coffeeId: coffee.id,
    fromRoastId: null,
    createdAt: new Date().toISOString(),
    notes: ['Navržený výchozí profil pro první pražení (3 kg).', ...s.reasons].join('\n'),
    targetDropBT: s.drop.bt,
    targetTime: s.drop.t,
    samples: s.samples,
    events: s.events,
    controls: s.plan,
  }
  await db.profiles.add(p)
  return p
}

/**
 * Overwrites a profile with a roast (curve, events, gas/air plan, targets) – used when roasting
 * along a profile and the result is the new reference. Name, coffee and notes are kept;
 * a line about the update is appended to the notes.
 */
export async function updateProfileFromRoast(profileId: string, r: RoastRecord): Promise<boolean> {
  const p = await db.profiles.get(profileId)
  if (!p || !findEvent(r.events, 'CHARGE')) return false
  const charge = findEvent(r.events, 'CHARGE')!
  const drop = findEvent(r.events, 'DROP')
  const line = `Aktualizováno pražením z ${fmtDate(r.roastDate)}.`
  await db.profiles.update(profileId, {
    samples: r.samples,
    events: r.events,
    controls: r.controls,
    fromRoastId: r.id,
    targetDropBT: drop?.bt ?? p.targetDropBT,
    targetTime: drop ? Math.round(drop.t - charge.t) : p.targetTime,
    notes: [p.notes, line].filter(Boolean).join('\n'),
  })
  return true
}
