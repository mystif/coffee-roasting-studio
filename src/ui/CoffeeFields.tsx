import { ALTITUDES, COUNTRIES, CROPS, MOISTURES, PROCESSES, SCREENS, VARIETIES, type Choice } from '../domain/coffeeCatalog'
import type { CoffeeInput } from '../storage/coffees'
import { inputCls } from './nav'

type Props = { v: CoffeeInput; set: (patch: Partial<CoffeeInput>) => void }

/** Coffee description with dropdowns (no typos) – everything the profile suggestion uses. */
export function CoffeeFields({ v, set }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Field label="Název">
        <input autoFocus value={v.name} placeholder="např. Kolumbie Huila" onChange={(e) => set({ name: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Země původu">
        <Select value={v.country} onChange={(country) => set({ country })} options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))} empty="vyber zemi" />
      </Field>
      <Field label="Zpracování">
        <Select value={v.process} onChange={(process) => set({ process })} options={labels(PROCESSES)} empty="vyber zpracování" />
      </Field>
      <Field label="Odrůda">
        <Select value={v.variety} onChange={(variety) => set({ variety })} options={labels(VARIETIES)} empty="vyber odrůdu" />
      </Field>
      <Field label="Nadmořská výška">
        <Select value={v.altitude ?? ''} onChange={(altitude) => set({ altitude })} options={ids(ALTITUDES)} />
      </Field>
      <Field label="Velikost zrna">
        <Select value={v.screen ?? ''} onChange={(screen) => set({ screen })} options={ids(SCREENS)} />
      </Field>
      <Field label="Vlhkost zelené kávy">
        <Select value={v.moisture ?? ''} onChange={(moisture) => set({ moisture })} options={ids(MOISTURES)} />
      </Field>
      <Field label="Stáří sklizně">
        <Select value={v.crop ?? ''} onChange={(crop) => set({ crop })} options={ids(CROPS)} />
      </Field>
      <Field label="Region · farma">
        <div className="flex gap-2">
          <input value={v.region} placeholder="region" onChange={(e) => set({ region: e.target.value })} className={`${inputCls} min-w-0 flex-1`} />
          <input value={v.farm} placeholder="farma" onChange={(e) => set({ farm: e.target.value })} className={`${inputCls} min-w-0 flex-1`} />
        </div>
      </Field>
    </div>
  )
}

const labels = (list: Choice[]) => list.filter((c) => c.id !== 'unknown').map((c) => ({ value: c.label, label: c.label }))
const ids = (list: Choice[]) => list.map((c) => ({ value: c.id === 'unknown' ? '' : c.id, label: c.label }))

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-zinc-400">
      {label}
      {children}
    </label>
  )
}

/** Dropdown that also keeps an older free-text value (from before the dropdowns) as an option. */
function Select(props: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; empty?: string }) {
  const known = props.options.some((o) => o.value === props.value)
  return (
    <select value={props.value} onChange={(e) => props.onChange(e.target.value)} className={inputCls}>
      {props.empty !== undefined && <option value="">{props.empty}</option>}
      {!known && props.value && <option value={props.value}>{props.value} (vlastní)</option>}
      {props.options.map((o) => (
        <option key={o.value + o.label} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
