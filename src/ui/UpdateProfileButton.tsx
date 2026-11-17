import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { refreshReference } from '../live/referenceState'
import type { RefChoice } from '../storage/db'
import { db } from '../storage/db'
import { updateProfileFromRoast } from '../storage/profiles'
import { ClayButton } from './clay'
import { askConfirm, showAlert } from './dialog'

/** "Roasted along a profile and liked it" → overwrite that profile with this roast (no new profile). */
export function UpdateProfileButton({ reference, roastId, className }: { reference: RefChoice | null | undefined; roastId: string | null; className?: string }) {
  const [done, setDone] = useState(false)
  const isSuggestion = useLiveQuery(async () => (reference?.kind === 'profile' ? !!(await db.profiles.get(reference.id))?.suggestion : false), [reference?.id])
  if (reference?.kind !== 'profile' || !roastId || isSuggestion) return null
  const run = async () => {
    const ok = await askConfirm(`Aktualizovat profil „${reference.label}“?`, {
      message: 'Křivka, události a plán plynu/vzduchu profilu se nahradí tímto pražením. Název a poznámky profilu zůstanou. Nevytvoří se nový profil.',
      okLabel: 'Aktualizovat profil',
    })
    if (!ok) return
    const r = await db.roasts.get(roastId)
    if (!r || !(await updateProfileFromRoast(reference.id, r))) return void showAlert('Profil nejde aktualizovat', 'Profil už neexistuje, nebo pražení nemá Charge.')
    refreshReference()
    setDone(true)
  }
  return (
    <ClayButton onClick={() => void run()} disabled={done} className={className} title="Přepíše referenční profil tímto pražením">
      {done ? '✓ Profil aktualizován' : 'Aktualizovat profil'}
    </ClayButton>
  )
}

/** Save the finished roast as a brand-new profile (the reference, if any, stays untouched). */
export function SaveNewProfileButton({ roastId, coffee, className }: { roastId: string | null; coffee: string; className?: string }) {
  const [done, setDone] = useState<string | null>(null)
  if (!roastId) return null
  const run = async () => {
    const r = await db.roasts.get(roastId)
    if (!r) return
    const { createProfileFromRoast } = await import('../storage/profiles')
    const { fmtDate } = await import('../storage/roastQueries')
    const { findEvent } = await import('../domain/events')
    if (!findEvent(r.events, 'CHARGE')) return void showAlert('Nelze uložit jako profil', 'Pražení nemá Charge, křivky se nedají zarovnat.')
    const { askText } = await import('./dialog')
    const name = await askText('Uložit jako nový profil', `${coffee || r.coffee || 'Profil'} · ${fmtDate(r.roastDate)}`, {
      message: 'Vznikne nový referenční profil z tohoto pražení. Stávající profily zůstanou beze změny.',
    })
    if (name === null) return
    const p = await createProfileFromRoast(r, name)
    setDone(p.name)
  }
  return (
    <ClayButton onClick={() => void run()} disabled={!!done} className={className} title="Vytvoří nový profil z tohoto pražení">
      {done ? '✓ Uloženo jako nový profil' : 'Uložit jako nový profil'}
    </ClayButton>
  )
}
