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
