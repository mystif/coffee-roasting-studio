import { useLiveQuery } from 'dexie-react-hooks'
import { askConfirm } from '../ui/dialog'
import { useState } from 'react'
import { addCoffee, deleteCoffee, emptyCoffee, updateCoffee, type CoffeeInput } from '../storage/coffees'
import { db } from '../storage/db'
import { ClayButton, Panel } from '../ui/clay'
import { Page, inputCls } from '../ui/nav'
import { SuggestPanel } from '../ui/SuggestPanel'

const FIELDS: [keyof CoffeeInput, string, string][] = [
  ['name', 'Název', 'např. Colombia Huila'],
  ['country', 'Země', 'Kolumbie'],
  ['region', 'Region', 'Huila'],
  ['farm', 'Farma', ''],
  ['process', 'Zpracování', 'washed / natural / honey'],
  ['variety', 'Odrůda', 'Caturra'],
]

export function CoffeesScreen() {
  const coffees = useLiveQuery(() => db.coffees.orderBy('name').toArray(), [])
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>()
    await db.roasts.each((r) => r.coffeeId && m.set(r.coffeeId, (m.get(r.coffeeId) ?? 0) + 1))
    return m
  }, [])
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [suggest, setSuggest] = useState<string | null>(null)

  return (
    <Page
      title="Kávy"
      actions={
        <ClayButton variant="primary" onClick={() => setEditing('new')} disabled={editing === 'new'}>
          + Přidat kávu
        </ClayButton>
      }
    >
      <div className="grid max-w-5xl gap-3">
        {editing === 'new' && (
          <CoffeeForm
            initial={emptyCoffee()}
            onDone={() => setEditing(null)}
            onSave={async (c) => setSuggest((await addCoffee(c)).id)}
          />
        )}
        {coffees?.length === 0 && editing !== 'new' && (
          <p className="text-zinc-400">Zatím žádné kávy. Přidej první – pak ji vybereš jedním kliknutím při Start Roasting.</p>
        )}
        {coffees?.map((c) =>
          editing === c.id ? (
            <CoffeeForm
              key={c.id}
              initial={c}
              onDone={() => setEditing(null)}
              onSave={(v) => updateCoffee(c.id, v)}
              onDelete={async () => {
                const n = counts?.get(c.id) ?? 0
                if (!(await askConfirm(`Smazat kávu „${c.name}“?`, { message: n ? `Její pražení (${n}) zůstanou v historii.` : undefined, okLabel: 'Smazat', danger: true }))) return
                await deleteCoffee(c.id)
                setEditing(null)
              }}
            />
          ) : (
            <Panel key={c.id} className="grid gap-3 !py-3">
              <div className="flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{c.name}</p>
                <p className="truncate text-sm text-zinc-400">
                  {[c.country, c.region, c.farm, c.process, c.variety].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <a href={`#/historie?kava=${c.id}`} className="text-sm text-zinc-400 hover:text-zinc-100">
                {counts?.get(c.id) ?? 0} pražení
              </a>
              <ClayButton onClick={() => setSuggest(suggest === c.id ? null : c.id)} title="Návrh profilu pro první pražení (espresso i filtr, 3 kg)">
                {suggest === c.id ? 'Skrýt návrh' : 'Navrhnout profil'}
              </ClayButton>
              <ClayButton onClick={() => setEditing(c.id)}>Upravit</ClayButton>
              </div>
              {suggest === c.id && <SuggestPanel coffee={c} />}
            </Panel>
          ),
        )}
      </div>
    </Page>
  )
}

function CoffeeForm(props: {
  initial: CoffeeInput
  onSave: (c: CoffeeInput) => Promise<unknown>
  onDone: () => void
  onDelete?: () => void
}) {
  const [v, setV] = useState<CoffeeInput>({ ...emptyCoffee(), ...props.initial })
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!v.name.trim()) return
    setBusy(true)
    await props.onSave(v)
    props.onDone()
  }
  return (
    <Panel className="grid gap-3">
      <div className="grid grid-cols-3 gap-3">
        {FIELDS.map(([k, label, ph]) => (
          <label key={k} className="flex flex-col gap-1 text-xs text-zinc-400">
            {label}
            <input
              autoFocus={k === 'name'}
              value={v[k]}
              placeholder={ph}
              onChange={(e) => setV({ ...v, [k]: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && void save()}
              className={inputCls}
            />
          </label>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs text-zinc-400">
        Poznámky
        <textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} className={inputCls} />
      </label>
      <div className="flex gap-2">
        <ClayButton variant="primary" onClick={() => void save()} disabled={busy || !v.name.trim()}>
          Uložit
        </ClayButton>
        <ClayButton onClick={props.onDone}>Zrušit</ClayButton>
        {props.onDelete && (
          <ClayButton variant="danger" className="ml-auto" onClick={props.onDelete}>
            Smazat
          </ClayButton>
        )}
      </div>
    </Panel>
  )
}
