import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { STYLE_LABEL } from '../domain/suggest'
import { roast } from '../live/runtime'
import { refreshReference } from '../live/referenceState'
import type { RoastState } from '../live/roastStore'
import { db } from '../storage/db'
import { profileChoice, saveRoastAsCoffeeProfile } from '../storage/profiles'
import { ClayButton } from './clay'
import { showAlert } from './dialog'
import { inputCls } from './nav'

/**
 * Shown after Finish when the roast followed a *suggested* profile: keep the real roast as the
 * coffee's profile (replace the suggestion or add a new one), with a name and tasting notes.
 */
export function SuggestedProfileSave({ state }: { state: RoastState }) {
  const ref = state.reference
  const profile = useLiveQuery(() => (ref?.kind === 'profile' ? db.profiles.get(ref.id) : undefined), [ref?.id])
  const coffee = useLiveQuery(() => (state.coffeeId ? db.coffees.get(state.coffeeId) : undefined), [state.coffeeId])
  const style = profile?.suggestion?.style
  const [name, setName] = useState('')
  const [mode, setMode] = useState<'replace' | 'new'>('replace')
  const [notes, setNotes] = useState('')
  const [done, setDone] = useState<string | null>(null)

  if (!profile?.suggestion && !done) return null
  if (done)
    return <p className="rounded-xl bg-emerald-400/10 px-3 py-2 text-sm text-emerald-200 ring-1 ring-emerald-400/30">✓ Uloženo jako profil „{done}“ – najdeš ho v Profilech.</p>

  const defaultName = `${state.coffee || profile!.coffee} · ${style ? STYLE_LABEL[style].split(' · ')[0].toLowerCase() : 'profil'}`
  const missing = coffee && (!coffee.country || !coffee.process)

  const save = async () => {
    if (!state.savedId) return void showAlert('Pražení se ještě ukládá', 'Zkus to za okamžik znovu.')
    const r = await db.roasts.get(state.savedId)
    if (!r) return
    const p = await saveRoastAsCoffeeProfile(r, { name: name || defaultName, notes: notes || state.notes, replaceId: mode === 'replace' ? profile!.id : null })
    if (!p) return
    roast.update({ reference: profileChoice(p) }) // next batch follows the real roast
    refreshReference()
    setDone(p.name)
  }

  return (
    <div className="grid gap-2 rounded-2xl bg-[var(--c-bg)] p-3 text-sm">
      <p className="font-semibold">Pražil jsi podle navrženého profilu</p>
      <p className="text-xs text-zinc-400">Ulož toto skutečné pražení jako profil kávy – příště podle něj budeš pražit místo odhadu.</p>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Název profilu
        <input value={name} placeholder={defaultName} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Návrh
        <select value={mode} onChange={(e) => setMode(e.target.value as 'replace' | 'new')} className={inputCls}>
          <option value="replace">nahradit tímto pražením (doporučeno)</option>
          <option value="new">ponechat a uložit jako nový profil</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Poznámky k profilu (chuť, co příště změnit)
        <textarea rows={2} value={notes} placeholder={state.notes || 'např. sladké, trochu podvyvinuté – příště FC o 10 s později'} onChange={(e) => setNotes(e.target.value)} className={inputCls} />
      </label>
      {missing && (
        <p className="text-xs text-amber-300">
          U kávy chybí země nebo zpracování –{' '}
          <a href="#/kavy" className="underline">
            doplnit v Kávách
          </a>{' '}
          (zpřesní další návrhy).
        </p>
      )}
      <ClayButton variant="primary" onClick={() => void save()}>
        Uložit profil kávy
      </ClayButton>
    </div>
  )
}
